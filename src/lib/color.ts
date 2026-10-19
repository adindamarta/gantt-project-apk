import type { Priority } from '../types';

export const PRIORITY_COLORS: Record<Priority, string> = {
  Low: '#2f9e6e',
  Medium: '#e8a13a',
  High: '#e0525f',
};

export const PRIORITY_LABEL_ID: Record<Priority, string> = {
  Low: 'Rendah',
  Medium: 'Sedang',
  High: 'Tinggi',
};

/** Palet warna yang tersedia untuk bar tugas. */
export const TASK_COLORS: string[] = [
  '#4f7cff',
  '#2f9e6e',
  '#e8a13a',
  '#e0525f',
  '#9b5de5',
  '#00a3b8',
  '#f26bb5',
  '#7a8b99',
  '#c98a1b',
  '#3b6fd4',
];

/** Palet warna untuk anggota tim. */
export const RESOURCE_COLORS: string[] = [
  '#4f7cff',
  '#9b5de5',
  '#00a3b8',
  '#2f9e6e',
  '#e8a13a',
  '#e0525f',
  '#f26bb5',
  '#7a8b99',
  '#3b6fd4',
  '#c98a1b',
];

export function priorityColor(priority: Priority): string {
  return PRIORITY_COLORS[priority] ?? '#4f7cff';
}
