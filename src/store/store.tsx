import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import type {
  CalendarConfig,
  Dependency,
  Holiday,
  ProjectState,
  Resource,
  Task,
} from '../types';
import { createSeedState } from '../data/seed';
import { computeSchedule, type Schedule } from '../lib/schedule';
import { hasWorkingDay } from '../lib/calendar';

const STORAGE_KEY = 'amanah.gantt.project.v1';

export type Action =
  | { type: 'set-project-name'; name: string }
  | { type: 'add-task'; task: Task }
  | { type: 'update-task'; id: string; patch: Partial<Task> }
  | { type: 'delete-task'; id: string }
  | { type: 'toggle-collapse'; id: string }
  | { type: 'add-dependency'; dependency: Dependency }
  | { type: 'update-dependency'; id: string; patch: Partial<Dependency> }
  | { type: 'delete-dependency'; id: string }
  | { type: 'add-resource'; resource: Resource }
  | { type: 'update-resource'; id: string; patch: Partial<Resource> }
  | { type: 'delete-resource'; id: string }
  | { type: 'set-weekend'; days: number[] }
  | { type: 'add-holiday'; holiday: Holiday }
  | { type: 'update-holiday'; id: string; patch: Partial<Holiday> }
  | { type: 'delete-holiday'; id: string }
  | { type: 'reflow' }
  | { type: 'replace-state'; state: ProjectState }
  | { type: 'reset-seed' };

function isTask(value: unknown): value is Task {
  const t = value as Task;
  return Boolean(t && typeof t.id === 'string' && typeof t.name === 'string');
}

function isState(value: unknown): value is ProjectState {
  const s = value as ProjectState;
  if (!s || typeof s !== 'object') return false;
  return Array.isArray(s.tasks) && s.tasks.length > 0 && s.tasks.every(isTask) &&
    Array.isArray(s.dependencies) && Array.isArray(s.resources) &&
    Boolean(s.calendar) && Array.isArray(s.calendar.weekendDays) &&
    Array.isArray(s.calendar.holidays);
}

export function loadStoredState(): ProjectState {
  if (typeof window === 'undefined') return createSeedState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeedState();
    const parsed: unknown = JSON.parse(raw);
    if (isState(parsed)) return parsed;
    return createSeedState();
  } catch {
    return createSeedState();
  }
}

export function persistState(state: ProjectState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage penuh / tidak tersedia — abaikan */
  }
}

export function clearStoredState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* abaikan */
  }
}

/** Kumpulkan id tugas beserta seluruh keturunannya. */
export function collectSubtree(tasks: Task[], rootId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const t of tasks) {
    if (!t.parentId) continue;
    const list = children.get(t.parentId) ?? [];
    list.push(t.id);
    children.set(t.parentId, list);
  }
  const result = new Set<string>([rootId]);
  const stack = [rootId];
  let guard = 0;
  while (stack.length > 0 && guard < 10_000) {
    const id = stack.pop() as string;
    for (const child of children.get(id) ?? []) {
      if (result.has(child)) continue;
      result.add(child);
      stack.push(child);
    }
    guard += 1;
  }
  return result;
}

/** Samakan tanggal mulai seluruh tugas dengan hasil penjadwalan otomatis. */
export function reflowState(state: ProjectState): ProjectState {
  const schedule = computeSchedule(state);
  return {
    ...state,
    tasks: state.tasks.map((task) => {
      const entry = schedule.entries[task.id];
      if (!entry) return task;
      if (task.startDate === entry.startDate) return task;
      return { ...task, startDate: entry.startDate };
    }),
  };
}

export function reducer(state: ProjectState, action: Action): ProjectState {
  switch (action.type) {
    case 'set-project-name':
      return { ...state, projectName: action.name };

    case 'add-task':
      return { ...state, tasks: [...state.tasks, action.task] };

    case 'update-task': {
      const next = {
        ...state,
        tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t)),
      };
      // Pastikan tidak ada tugas yang menjadi anak dari dirinya sendiri / keturunannya.
      const target = next.tasks.find((t) => t.id === action.id);
      if (target?.parentId) {
        const subtree = collectSubtree(next.tasks, action.id);
        if (subtree.has(target.parentId)) {
          return {
            ...next,
            tasks: next.tasks.map((t) => (t.id === action.id ? { ...t, parentId: null } : t)),
          };
        }
      }
      return next;
    }

    case 'delete-task': {
      const doomed = collectSubtree(state.tasks, action.id);
      return {
        ...state,
        tasks: state.tasks.filter((t) => !doomed.has(t.id)),
        dependencies: state.dependencies.filter(
          (d) => !doomed.has(d.predecessorId) && !doomed.has(d.successorId),
        ),
      };
    }

    case 'toggle-collapse':
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.id ? { ...t, collapsed: !t.collapsed } : t,
        ),
      };

    case 'add-dependency':
      return { ...state, dependencies: [...state.dependencies, action.dependency] };

    case 'update-dependency':
      return {
        ...state,
        dependencies: state.dependencies.map((d) =>
          d.id === action.id ? { ...d, ...action.patch } : d,
        ),
      };

    case 'delete-dependency':
      return {
        ...state,
        dependencies: state.dependencies.filter((d) => d.id !== action.id),
      };

    case 'add-resource':
      return { ...state, resources: [...state.resources, action.resource] };

    case 'update-resource':
      return {
        ...state,
        resources: state.resources.map((r) =>
          r.id === action.id ? { ...r, ...action.patch } : r,
        ),
      };

    case 'delete-resource':
      return {
        ...state,
        resources: state.resources.filter((r) => r.id !== action.id),
        tasks: state.tasks.map((t) => ({
          ...t,
          resourceIds: t.resourceIds.filter((id) => id !== action.id),
        })),
      };

    case 'set-weekend': {
      const days = [...new Set(action.days)].filter((d) => d >= 0 && d <= 6).sort();
      const calendar: CalendarConfig = { ...state.calendar, weekendDays: days };
      if (!hasWorkingDay(calendar)) return state;
      return { ...state, calendar };
    }

    case 'add-holiday':
      return {
        ...state,
        calendar: {
          ...state.calendar,
          holidays: [
            ...state.calendar.holidays.filter((h) => h.date !== action.holiday.date),
            action.holiday,
          ].sort((a, b) => (a.date < b.date ? -1 : 1)),
        },
      };

    case 'update-holiday':
      return {
        ...state,
        calendar: {
          ...state.calendar,
          holidays: state.calendar.holidays.map((h) =>
            h.id === action.id ? { ...h, ...action.patch } : h,
          ),
        },
      };

    case 'delete-holiday':
      return {
        ...state,
        calendar: {
          ...state.calendar,
          holidays: state.calendar.holidays.filter((h) => h.id !== action.id),
        },
      };

    case 'reflow':
      return reflowState(state);

    case 'replace-state':
      return action.state;

    case 'reset-seed':
      return createSeedState();

    default:
      return state;
  }
}

interface StoreValue {
  state: ProjectState;
  dispatch: Dispatch<Action>;
  schedule: Schedule;
  reflow: () => void;
}

const AppContext = createContext<StoreValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadStoredState);
  const schedule = useMemo(() => computeSchedule(state), [state]);

  useEffect(() => {
    persistState(state);
  }, [state]);

  const reflow = useCallback(() => dispatch({ type: 'reflow' }), []);

  const value = useMemo<StoreValue>(
    () => ({ state, dispatch, schedule, reflow }),
    [state, schedule, reflow],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): StoreValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp harus dipakai di dalam AppProvider');
  return ctx;
}
