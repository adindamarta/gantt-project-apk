import type { ProjectState, Task } from '../types';

export interface TaskRow {
  task: Task;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
  isSummary: boolean;
}

export function buildChildrenMap(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.parentId) continue;
    const list = map.get(t.parentId) ?? [];
    list.push(t);
    map.set(t.parentId, list);
  }
  return map;
}

/** Urutkan daftar tugas sesuai urutan deklarasi. */
function sortTasks(tasks: Task[]): Task[] {
  return [...tasks];
}

/**
 * Membentangkan pohon tugas menjadi baris datar untuk tabel/Gantt,
 * menghormati status collapse tiap tugas induk.
 */
export function flattenTasks(tasks: Task[], childrenMap?: Map<string, Task[]>): TaskRow[] {
  const children = childrenMap ?? buildChildrenMap(tasks);
  const roots = sortTasks(tasks.filter((t) => !t.parentId || !tasks.some((p) => p.id === t.parentId)));
  const rows: TaskRow[] = [];

  const walk = (task: Task, depth: number, visited: Set<string>): void => {
    if (visited.has(task.id)) return;
    visited.add(task.id);
    const kids = children.get(task.id) ?? [];
    const collapsed = Boolean(task.collapsed);
    rows.push({
      task,
      depth,
      hasChildren: kids.length > 0,
      collapsed,
      isSummary: kids.length > 0,
    });
    if (!collapsed) {
      for (const kid of kids) walk(kid, depth + 1, visited);
    }
  };

  const visited = new Set<string>();
  for (const root of roots) walk(root, 0, visited);
  // Tugas yatim (orang tua terhapus) tetap ditampilkan.
  for (const t of tasks) {
    if (!visited.has(t.id)) walk(t, 0, visited);
  }
  return rows;
}

export function isAncestor(tasks: Task[], ancestorId: string, taskId: string): boolean {
  const parentMap = new Map(tasks.map((t) => [t.id, t.parentId]));
  let cursor = parentMap.get(taskId) ?? null;
  let guard = 0;
  while (cursor && guard < 1000) {
    if (cursor === ancestorId) return true;
    cursor = parentMap.get(cursor) ?? null;
    guard += 1;
  }
  return false;
}

/** Opsi tugas yang boleh menjadi induk (bukan dirinya sendiri maupun keturunannya). */
export function parentOptions(state: ProjectState, current: Task | null): Task[] {
  if (!current) return state.tasks;
  return state.tasks.filter(
    (t) => t.id !== current.id && !isAncestor(state.tasks, current.id, t.id),
  );
}
