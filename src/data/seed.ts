import type {
  CalendarConfig,
  Dependency,
  Holiday,
  ProjectState,
  Resource,
  Task,
} from '../types';
import { DEFAULT_WEEKENDS, firstWorkingDayOnOrAfter } from '../lib/calendar';
import { addDays, dayOfWeek, todayISO } from '../lib/dates';
import { RESOURCE_COLORS } from '../lib/color';

export function uid(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 9);
  const time = Date.now().toString(36).slice(-4);
  return `${prefix}_${rand}${time}`;
}

/** Senin pada minggu berjalan, agar data contoh selalu tampil dekat "hari ini". */
export function seedStartISO(base = todayISO()): string {
  const dow = dayOfWeek(base);
  const backToMonday = dow === 0 ? -6 : 1 - dow;
  return addDays(base, backToMonday);
}

interface SeedTaskSpec {
  id: string;
  name: string;
  description?: string;
  duration: number;
  priority?: Task['priority'];
  color?: string;
  parentId?: string | null;
  progress?: number;
  resources?: string[];
  pinned?: boolean;
  pert?: [number, number, number];
}

const TASK_SPECS: SeedTaskSpec[] = [
  {
    id: 't1',
    name: 'Fase 1 — Analisis & Riset',
    description: 'Memahami kebutuhan bisnis dan pengguna sebelum desain.',
    duration: 5,
    priority: 'High',
    color: '#4f7cff',
    progress: 100,
  },
  {
    id: 't1a',
    name: 'Riset pasar & kompetitor',
    description: 'Analisis 6 kompetitor utama dan pricing model.',
    duration: 3,
    priority: 'High',
    color: '#4f7cff',
    parentId: 't1',
    progress: 100,
    resources: ['r1', 'r5'],
    pert: [2, 3, 5],
  },
  {
    id: 't1b',
    name: 'Wawancara stakeholder',
    description: 'Interview 8 stakeholder internal dan eksternal.',
    duration: 2,
    priority: 'Medium',
    color: '#4f7cff',
    parentId: 't1',
    progress: 100,
    resources: ['r1'],
    pert: [2, 2, 4],
  },
  {
    id: 't2',
    name: 'Fase 2 — Desain Produk',
    description: 'Wireframe, prototype, dan design system.',
    duration: 7,
    priority: 'High',
    color: '#9b5de5',
    progress: 60,
  },
  {
    id: 't2a',
    name: 'Wireframe & user flow',
    description: 'Menyusun alur utama: onboarding, katalog, checkout.',
    duration: 3,
    priority: 'High',
    color: '#9b5de5',
    parentId: 't2',
    progress: 100,
    resources: ['r2'],
    pert: [2, 3, 4],
  },
  {
    id: 't2b',
    name: 'Prototype interaktif',
    description: 'Prototype high-fidelity di Figma + design system awal.',
    duration: 4,
    priority: 'Medium',
    color: '#9b5de5',
    parentId: 't2',
    progress: 40,
    resources: ['r2'],
    pert: [3, 4, 8],
  },
  {
    id: 't3',
    name: 'Fase 3 — Pengembangan',
    description: 'Implementasi backend, frontend, dan integrasi pembayaran.',
    duration: 15,
    priority: 'High',
    color: '#2f9e6e',
    progress: 25,
  },
  {
    id: 't3a',
    name: 'Backend API & database',
    description: 'REST/GraphQL API, skema database, autentikasi.',
    duration: 8,
    priority: 'High',
    color: '#2f9e6e',
    parentId: 't3',
    progress: 45,
    resources: ['r3'],
    pert: [6, 8, 14],
  },
  {
    id: 't3b',
    name: 'Frontend web & mobile',
    description: 'Implementasi React + React Native dari design system.',
    duration: 8,
    priority: 'High',
    color: '#2f9e6e',
    parentId: 't3',
    progress: 20,
    resources: ['r4'],
    pert: [7, 9, 16],
  },
  {
    id: 't3c',
    name: 'Integrasi pembayaran',
    description: 'Midtrans, virtual account, dan e-wallet.',
    duration: 5,
    priority: 'High',
    color: '#e0525f',
    parentId: 't3',
    progress: 0,
    resources: ['r3', 'r4'],
    pert: [4, 6, 12],
  },
  {
    id: 't4',
    name: 'Fase 4 — Pengujian & QA',
    description: 'Pengujian otomatis, manual, dan uat.',
    duration: 6,
    priority: 'Medium',
    color: '#e8a13a',
    progress: 0,
  },
  {
    id: 't4a',
    name: 'Automation & regression test',
    duration: 3,
    priority: 'Medium',
    color: '#e8a13a',
    parentId: 't4',
    progress: 0,
    resources: ['r5'],
    pert: [2, 3, 6],
  },
  {
    id: 't4b',
    name: 'User acceptance test',
    duration: 3,
    priority: 'High',
    color: '#e8a13a',
    parentId: 't4',
    progress: 0,
    resources: ['r1', 'r5'],
    pert: [3, 4, 7],
  },
  {
    id: 't5',
    name: 'Fase 5 — Peluncuran',
    description: 'Deployment, monitoring, dan serah terima.',
    duration: 3,
    priority: 'High',
    color: '#00a3b8',
    progress: 0,
    resources: ['r1', 'r3'],
    pert: [2, 3, 5],
  },
];

const DEP_SPECS: Array<Omit<Dependency, 'id'> & { id: string }> = [
  { id: 'd1', predecessorId: 't1a', successorId: 't1b', type: 'FS', lag: 0 },
  { id: 'd2', predecessorId: 't1', successorId: 't2', type: 'FS', lag: 0 },
  { id: 'd3', predecessorId: 't2a', successorId: 't2b', type: 'SS', lag: 2 },
  { id: 'd4', predecessorId: 't2', successorId: 't3', type: 'FS', lag: 1 },
  { id: 'd5', predecessorId: 't3a', successorId: 't3b', type: 'SS', lag: 0 },
  { id: 'd6', predecessorId: 't3b', successorId: 't3c', type: 'FS', lag: 0 },
  { id: 'd7', predecessorId: 't3', successorId: 't4', type: 'FS', lag: 0 },
  { id: 'd8', predecessorId: 't4a', successorId: 't4b', type: 'FS', lag: 1 },
  { id: 'd9', predecessorId: 't4', successorId: 't5', type: 'FS', lag: 0 },
];

const RESOURCE_SPECS: Array<Omit<Resource, 'color'> & { color?: string }> = [
  { id: 'r1', name: 'Andi Wijaya', email: 'andi@amanah.id', role: 'Tech Lead', salary: 18_000_000 },
  { id: 'r2', name: 'Sari Rahayu', email: 'sari@amanah.id', role: 'UI/UX Designer', salary: 12_000_000 },
  { id: 'r3', name: 'Budi Santoso', email: 'budi@amanah.id', role: 'Backend Engineer', salary: 15_000_000 },
  { id: 'r4', name: 'Citra Lestari', email: 'citra@amanah.id', role: 'Frontend Engineer', salary: 14_000_000 },
  { id: 'r5', name: 'Dewi Kusuma', email: 'dewi@amanah.id', role: 'QA Engineer', salary: 11_000_000 },
];

export function createSeedState(base?: string): ProjectState {
  const start = firstWorkingDayOnOrAfter(seedStartISO(base), {
    weekendDays: DEFAULT_WEEKENDS,
    holidays: [],
  });

  const calendar: CalendarConfig = {
    weekendDays: [...DEFAULT_WEEKENDS],
    holidays: [
      { id: 'h1', date: addDays(start, 9), name: 'Hari Libur Nasional' },
      { id: 'h2', date: addDays(start, 23), name: 'Cutibersama' },
    ] as Holiday[],
  };

  const tasks: Task[] = TASK_SPECS.map((spec) => ({
    id: spec.id,
    name: spec.name,
    description: spec.description ?? '',
    startDate: start,
    duration: spec.duration,
    priority: spec.priority ?? 'Medium',
    color: spec.color ?? '#4f7cff',
    parentId: spec.parentId ?? null,
    progress: spec.progress ?? 0,
    resourceIds: spec.resources ?? [],
    pinned: spec.pinned ?? false,
    optimistic: spec.pert?.[0],
    mostLikely: spec.pert?.[1],
    pessimistic: spec.pert?.[2],
  }));

  const resources: Resource[] = RESOURCE_SPECS.map((spec, i) => ({
    ...spec,
    color: spec.color ?? RESOURCE_COLORS[i % RESOURCE_COLORS.length],
  }));

  return {
    projectName: 'Peluncuran Platform E-Commerce',
    tasks,
    dependencies: DEP_SPECS.map((d) => ({ ...d })),
    resources,
    calendar,
  };
}
