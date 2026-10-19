export type Priority = 'Low' | 'Medium' | 'High';
export type DependencyType = 'FS' | 'SS';

export interface Holiday {
  id: string;
  /** ISO date yyyy-mm-dd */
  date: string;
  name: string;
}

export interface CalendarConfig {
  /** 0 = Sunday ... 6 = Saturday */
  weekendDays: number[];
  holidays: Holiday[];
}

export interface Resource {
  id: string;
  name: string;
  email: string;
  role: string;
  /** Gaji per bulan (rupiah) */
  salary: number;
  color: string;
}

export interface Task {
  id: string;
  name: string;
  description: string;
  /** Tanggal mulai acuan (anchor). Diabaikan bila tugas memiliki predecessor
   *  dan tidak dikunci (pinned). */
  startDate: string;
  /** Durasi dalam hari kerja */
  duration: number;
  priority: Priority;
  color: string;
  parentId: string | null;
  /** 0 - 100 */
  progress: number;
  resourceIds: string[];
  /** Bila true, tanggal mulai ditentukan manual dan tidak ikut otomatis */
  pinned: boolean;
  collapsed?: boolean;
  /** Estimasi PERT (hari kerja) */
  optimistic?: number;
  mostLikely?: number;
  pessimistic?: number;
}

export interface Dependency {
  id: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  /** Jeda hari kerja (lag). Bisa negatif (lead time). */
  lag: number;
}

export interface ProjectState {
  projectName: string;
  tasks: Task[];
  dependencies: Dependency[];
  resources: Resource[];
  calendar: CalendarConfig;
}

export const PRIORITIES: Priority[] = ['Low', 'Medium', 'High'];

export const DAY_NAMES_ID = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
];

export const SHORT_DAY_NAMES_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
