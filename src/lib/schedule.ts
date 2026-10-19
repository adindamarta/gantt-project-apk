import type {
  CalendarConfig,
  Dependency,
  DependencyType,
  ProjectState,
  Task,
} from '../types';
import { firstWorkingDayOnOrAfter, workingDaysInclusive } from './calendar';
import { addDays, maxISO, minISO, todayISO } from './dates';
import { WorkingDayCalendar } from './workingday';

export interface TaskSchedule {
  /** Early start (indeks hari kerja) */
  es: number;
  /** Early finish (indeks hari kerja, inklusif) */
  ef: number;
  /** Late start */
  ls: number;
  /** Late finish */
  lf: number;
  /** Total float (hari kerja). 0 = jalur kritis. */
  float: number;
  /** Total float setelah pembulatan untuk tampilan. */
  floatDays: number;
  startDate: string;
  endDate: string;
  /** Durasi terjadwal (hari kerja) */
  duration: number;
  critical: boolean;
  isSummary: boolean;
  /** Nilai constraint awal dari predecessor (indeks) */
  constraint: number;
  /** True bila tanggal mulai dikunci manual */
  pinned: boolean;
}

export interface ScheduleLink {
  id: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lag: number;
  fromStart: number;
  fromEnd: number;
  toStart: number;
  toEnd: number;
  critical: boolean;
}

export interface Schedule {
  entries: Record<string, TaskSchedule>;
  order: string[];
  projectStart: string;
  projectEnd: string;
  projectDuration: number;
  criticalIds: string[];
  criticalPath: string[];
  links: ScheduleLink[];
  cal: WorkingDayCalendar;
  hasCycle: boolean;
  /** PERT */
  pert: { expected: number; variance: number; sd: number };
}

const EMPTY_SCHEDULE = (cal: WorkingDayCalendar): Schedule => ({
  entries: {},
  order: [],
  projectStart: cal.first,
  projectEnd: cal.first,
  projectDuration: 0,
  criticalIds: [],
  criticalPath: [],
  links: [],
  cal,
  hasCycle: false,
  pert: { expected: 0, variance: 0, sd: 0 },
});

function safeDuration(value: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 5000);
}

function safeLag(value: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(-3650, Math.min(3650, n));
}

/** Estimasi PERT sebuah tugas: TE = (O + 4M + P) / 6, varians = ((P - O) / 6)^2 */
export function pertForTask(task: Task): { te: number; variance: number; sd: number } {
  const base = safeDuration(task.duration);
  const o = task.optimistic ?? base;
  const m = task.mostLikely ?? base;
  const p = task.pessimistic ?? base;
  const te = (o + 4 * m + p) / 6;
  const sd = Math.abs(p - o) / 6;
  return { te, variance: sd * sd, sd };
}

/**
 * Topological sort (Kahn) pada graf ketergantungan.
 * Tugas yang berada dalam siklus dikembalikan lewat `cyclic` dan
 * tetap disertakan dalam `order` tanpa mengikut sertakan sisi siklus.
 */
function topoSort(
  ids: string[],
  preds: Map<string, Dependency[]>,
): { order: string[]; cyclic: Set<string> } {
  const indegree = new Map<string, number>();
  const succs = new Map<string, string[]>();
  ids.forEach((id) => indegree.set(id, 0));

  for (const id of ids) {
    for (const dep of preds.get(id) ?? []) {
      if (dep.predecessorId === id) continue;
      indegree.set(id, (indegree.get(id) ?? 0) + 1);
      const list = succs.get(dep.predecessorId) ?? [];
      list.push(id);
      succs.set(dep.predecessorId, list);
    }
  }

  const queue = ids.filter((id) => (indegree.get(id) ?? 0) === 0);
  const order: string[] = [];
  const emitted = new Set<string>();

  while (queue.length > 0) {
    const id = queue.shift() as string;
    order.push(id);
    emitted.add(id);
    for (const next of succs.get(id) ?? []) {
      const deg = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  const cyclic = new Set<string>();
  for (const id of ids) {
    if (!emitted.has(id)) {
      cyclic.add(id);
      order.push(id);
    }
  }
  return { order, cyclic };
}

/**
 * Forward pass + backward pass (Critical Path Method) beserta
 * penurunan constraint hirarki parent -> child dan aggregasi summary task.
 */
export function computeSchedule(state: ProjectState): Schedule {
  const calConfig: CalendarConfig = state.calendar;
  const tasks = state.tasks;

  if (tasks.length === 0) {
    const emptyCal = new WorkingDayCalendar(calConfig, todayISO());
    return EMPTY_SCHEDULE(emptyCal);
  }

  const byId = new Map<string, Task>();
  for (const t of tasks) byId.set(t.id, t);

  // --- Hirarki (parent-child), putus siklus bila ada -----------------------
  const parentOf = new Map<string, string | null>();
  for (const t of tasks) {
    const valid = t.parentId && byId.has(t.parentId) && t.parentId !== t.id;
    parentOf.set(t.id, valid ? (t.parentId as string) : null);
  }
  for (const t of tasks) {
    const seen = new Set<string>([t.id]);
    let cursor: string | null = t.id;
    while (cursor) {
      const parent: string | null = parentOf.get(cursor) ?? null;
      if (!parent) break;
      if (seen.has(parent)) {
        parentOf.set(cursor, null);
        break;
      }
      seen.add(parent);
      cursor = parent;
    }
  }

  const childrenOf = new Map<string, string[]>();
  const roots: string[] = [];
  for (const t of tasks) {
    const parent = parentOf.get(t.id) ?? null;
    if (parent) {
      const list = childrenOf.get(parent) ?? [];
      list.push(t.id);
      childrenOf.set(parent, list);
    } else {
      roots.push(t.id);
    }
  }

  // --- Graf ketergantungan -------------------------------------------------
  const preds = new Map<string, Dependency[]>();
  const succs = new Map<string, Dependency[]>();
  const validDeps: Dependency[] = [];
  for (const dep of state.dependencies) {
    if (!byId.has(dep.predecessorId) || !byId.has(dep.successorId)) continue;
    if (dep.predecessorId === dep.successorId) continue;
    validDeps.push(dep);
    const p = preds.get(dep.successorId) ?? [];
    p.push(dep);
    preds.set(dep.successorId, p);
    const s = succs.get(dep.predecessorId) ?? [];
    s.push(dep);
    succs.set(dep.predecessorId, s);
  }

  const ids = tasks.map((t) => t.id);
  const { order, cyclic } = topoSort(ids, preds);

  // --- Kalender kerja & anchor --------------------------------------------
  let epoch = firstWorkingDayOnOrAfter(tasks[0].startDate, calConfig);
  const anchors = new Map<string, number>();
  for (const t of tasks) {
    const start = firstWorkingDayOnOrAfter(t.startDate, calConfig);
    if (start < epoch) epoch = start;
  }
  const cal = new WorkingDayCalendar(calConfig, epoch);
  for (const t of tasks) {
    anchors.set(t.id, cal.index(firstWorkingDayOnOrAfter(t.startDate, calConfig)));
  }

  // --- Forward pass --------------------------------------------------------
  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  const constraintOf = new Map<string, number>();
  const done = new Set<string>();
  const visiting = new Set<string>();
  const ROOT_CONSTRAINT = 0; // indeks 0 = awal proyek

  const clearSubtree = (id: string): void => {
    done.delete(id);
    es.delete(id);
    ef.delete(id);
    for (const child of childrenOf.get(id) ?? []) clearSubtree(child);
  };

  const resolve = (id: string, inherit: number): void => {
    if (done.has(id) || visiting.has(id)) return;
    const task = byId.get(id);
    if (!task) return;
    visiting.add(id);

    let constraint = Math.max(ROOT_CONSTRAINT, inherit);
    const ownPreds = (preds.get(id) ?? []).filter((d) => !cyclic.has(d.predecessorId));
    for (const dep of ownPreds) {
      const pEs = es.get(dep.predecessorId);
      const pEf = ef.get(dep.predecessorId);
      if (pEs === undefined || pEf === undefined) {
        resolve(dep.predecessorId, ROOT_CONSTRAINT);
      }
      const predEs = es.get(dep.predecessorId);
      const predEf = ef.get(dep.predecessorId);
      if (predEs === undefined || predEf === undefined) continue;
      const lag = safeLag(dep.lag);
      const value =
        dep.type === 'FS' ? predEf + 1 + lag : predEs + lag;
      constraint = Math.max(constraint, value);
    }
    constraintOf.set(id, constraint);

    const kids = childrenOf.get(id) ?? [];
    let summarised = false;

    if (kids.length > 0) {
      for (const kid of kids) resolve(kid, constraint);

      const collect = () => {
        let minEs = Number.POSITIVE_INFINITY;
        let maxEf = Number.NEGATIVE_INFINITY;
        for (const kid of kids) {
          const kEs = es.get(kid);
          const kEf = ef.get(kid);
          if (kEs === undefined || kEf === undefined) continue;
          minEs = Math.min(minEs, kEs);
          maxEf = Math.max(maxEf, kEf);
        }
        return { minEs, maxEf };
      };

      let span = collect();
      if (span.minEs !== Number.POSITIVE_INFINITY && constraint > span.minEs) {
        // Sebagian anak sudah terhitung sebelum mewarisi constraint induk:
        // hitung ulang subtree dengan constraint yang benar.
        for (const kid of kids) clearSubtree(kid);
        for (const kid of kids) resolve(kid, constraint);
        span = collect();
      }

      if (span.minEs !== Number.POSITIVE_INFINITY) {
        es.set(id, span.minEs);
        ef.set(id, span.maxEf);
        summarised = true;
      }
    }

    if (!summarised) {
      const anchor = anchors.get(id) ?? 0;
      const hasPreds = ownPreds.length > 0;
      const early = hasPreds && !task.pinned ? constraint : Math.max(anchor, constraint);
      const start = Math.max(ROOT_CONSTRAINT, early);
      const duration = safeDuration(task.duration);
      es.set(id, start);
      ef.set(id, start + duration - 1);
    }

    done.add(id);
    visiting.delete(id);
  };

  for (const rootId of roots) resolve(rootId, ROOT_CONSTRAINT);
  for (const id of order) resolve(id, ROOT_CONSTRAINT);
  for (const id of ids) resolve(id, ROOT_CONSTRAINT);

  // --- Rentang proyek ------------------------------------------------------
  let projectStartIdx = Number.POSITIVE_INFINITY;
  let projectEndIdx = Number.NEGATIVE_INFINITY;
  for (const id of ids) {
    const s = es.get(id) ?? 0;
    const f = ef.get(id) ?? 0;
    projectStartIdx = Math.min(projectStartIdx, s);
    projectEndIdx = Math.max(projectEndIdx, f);
  }
  if (!Number.isFinite(projectStartIdx)) projectStartIdx = 0;
  if (!Number.isFinite(projectEndIdx)) projectEndIdx = projectStartIdx;

  // --- Backward pass -------------------------------------------------------
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();
  const durationOf = (id: string): number => {
    const s = es.get(id) ?? 0;
    const f = ef.get(id) ?? s;
    return Math.max(1, f - s + 1);
  };

  for (let i = order.length - 1; i >= 0; i -= 1) {
    const id = order[i];
    const own = succs.get(id) ?? [];
    let lateFinish = projectEndIdx;
    for (const dep of own) {
      if (cyclic.has(dep.successorId)) continue;
      const successorLs = ls.get(dep.successorId);
      if (successorLs === undefined) continue;
      const lag = safeLag(dep.lag);
      const value =
        dep.type === 'FS'
          ? successorLs - 1 - lag
          : successorLs - lag + durationOf(id) - 1;
      lateFinish = Math.min(lateFinish, value);
    }
    // Tidak ada tugas boleh melewati akhir proyek.
    lateFinish = Math.min(lateFinish, projectEndIdx);
    lf.set(id, lateFinish);
    ls.set(id, lateFinish - durationOf(id) + 1);
  }

  // --- Float & jalur kritis ------------------------------------------------
  const entries: Record<string, TaskSchedule> = {};
  const criticalIds: string[] = [];
  for (const id of ids) {
    const task = byId.get(id) as Task;
    const s = es.get(id) ?? 0;
    const f = ef.get(id) ?? s;
    const lateS = ls.get(id) ?? s;
    const lateF = lf.get(id) ?? f;
    const floatIdx = lateS - s;
    const floatDays = workingDaysInclusive(cal.date(Math.max(0, lateS)), cal.date(Math.max(0, s)), calConfig) - 1;
    const isCritical = floatIdx <= 0;
    if (isCritical) criticalIds.push(id);
    entries[id] = {
      es: s,
      ef: f,
      ls: lateS,
      lf: lateF,
      float: floatIdx,
      floatDays: Math.max(0, floatDays),
      startDate: cal.date(s),
      endDate: cal.date(f),
      duration: Math.max(1, f - s + 1),
      critical: isCritical,
      isSummary: (childrenOf.get(id) ?? []).length > 0,
      constraint: constraintOf.get(id) ?? s,
      pinned: task.pinned,
    };
  }

  const criticalSet = new Set(criticalIds);
  const links: ScheduleLink[] = validDeps.map((dep) => {
    const a = entries[dep.predecessorId];
    const b = entries[dep.successorId];
    return {
      id: dep.id,
      predecessorId: dep.predecessorId,
      successorId: dep.successorId,
      type: dep.type,
      lag: safeLag(dep.lag),
      fromStart: a?.es ?? 0,
      fromEnd: a?.ef ?? 0,
      toStart: b?.es ?? 0,
      toEnd: b?.ef ?? 0,
      critical: criticalSet.has(dep.predecessorId) && criticalSet.has(dep.successorId),
    };
  });

  const criticalPath = extractCriticalPath(entries, preds, criticalSet);

  // --- PERT ----------------------------------------------------------------
  let expected = 0;
  let variance = 0;
  const pathSet = criticalPath.length > 0 ? criticalPath : criticalIds;
  for (const id of pathSet) {
    const task = byId.get(id);
    if (!task) continue;
    const p = pertForTask(task);
    expected += p.te;
    variance += p.variance;
  }

  const projectStart = cal.date(projectStartIdx);
  const projectEnd = cal.date(projectEndIdx);

  return {
    entries,
    order,
    projectStart,
    projectEnd,
    projectDuration:
      workingDaysInclusive(projectStart, projectEnd, calConfig) || 1,
    criticalIds,
    criticalPath,
    links,
    cal,
    hasCycle: cyclic.size > 0,
    pert: { expected, variance, sd: Math.sqrt(variance) },
  };
}

/** Menyusun rantai jalur kritis dari tugas akhir mundur ke tugas awal. */
function extractCriticalPath(
  entries: Record<string, TaskSchedule>,
  preds: Map<string, Dependency[]>,
  critical: Set<string>,
): string[] {
  const ids = Object.keys(entries);
  if (critical.size === 0) return [];

  const successorMap = new Map<string, string[]>();
  for (const id of ids) {
    for (const dep of preds.get(id) ?? []) {
      const list = successorMap.get(dep.predecessorId) ?? [];
      list.push(id);
      successorMap.set(dep.predecessorId, list);
    }
  }

  // Node kritis tanpa successor kritis = ujung jalur kritis.
  let endId: string | null = null;
  let bestEf = -1;
  for (const id of ids) {
    if (!critical.has(id)) continue;
    const succ = successorMap.get(id) ?? [];
    if (succ.some((s) => critical.has(s))) continue;
    const ef = entries[id]?.ef ?? -1;
    if (ef > bestEf) {
      bestEf = ef;
      endId = id;
    }
  }

  if (!endId) return [];
  const path: string[] = [endId];
  let cursor = endId;
  let guard = 0;
  while (guard < 5000) {
    guard += 1;
    const current = entries[cursor];
    if (!current) break;
    let best: string | null = null;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (const dep of preds.get(cursor) ?? []) {
      const p = entries[dep.predecessorId];
      if (!p || !critical.has(dep.predecessorId)) continue;
      const value = dep.type === 'FS' ? p.ef + 1 + safeLag(dep.lag) : p.es + safeLag(dep.lag);
      if (value === current.es && value > bestValue) {
        best = dep.predecessorId;
        bestValue = value;
      }
    }
    if (!best) break;
    path.unshift(best);
    cursor = best;
  }
  return path;
}

/** Menentukan batas kiri/kanan tampilan timeline. */
export function timelineBounds(
  state: ProjectState,
  schedule: Schedule,
  paddingBefore = 3,
  paddingAfter = 14,
): { start: string; end: string } {
  const today = todayISO();
  if (state.tasks.length === 0) {
    return { start: today, end: today };
  }
  let start = schedule.projectStart;
  let end = schedule.projectEnd;
  for (const entry of Object.values(schedule.entries)) {
    start = minISO(start, entry.startDate);
    end = maxISO(end, entry.endDate);
  }
  start = addDays(minISO(start, today), -Math.max(0, paddingBefore));
  end = addDays(maxISO(end, today), Math.max(0, paddingAfter));
  return { start: firstWorkingDayOnOrAfter(start, state.calendar), end };
}
