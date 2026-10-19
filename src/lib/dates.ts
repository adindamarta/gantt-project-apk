const MONTHS_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const MONTHS_SHORT_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

export const DAYS_SHORT_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export const DAYS_FULL_ID = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
];

const pad = (n: number): string => String(n).padStart(2, '0');

/** Parse string ISO (yyyy-mm-dd) menjadi Date berbasis UTC agar bebas DST. */
export function parseISO(value: string): Date {
  const parts = value.split('-').map(Number);
  const y = parts[0] || 1970;
  const m = parts[1] || 1;
  const d = parts[2] || 1;
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function isValidISO(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = parseISO(value);
  return !Number.isNaN(d.getTime()) && toISO(d) === value;
}

export function addDays(isoDate: string, days: number): string {
  const d = parseISO(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

export function dayOfWeek(isoDate: string): number {
  return parseISO(isoDate).getUTCDay();
}

export function compareDates(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function minISO(a: string, b: string): string {
  return a <= b ? a : b;
}

export function maxISO(a: string, b: string): string {
  return a >= b ? a : b;
}

/** Selisih hari kalender (to - from). */
export function diffDays(from: string, to: string): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000);
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function monthStartISO(year: number, monthIndex: number): string {
  return `${year}-${pad(monthIndex + 1)}-01`;
}

export function monthEndISO(year: number, monthIndex: number): string {
  return `${year}-${pad(monthIndex + 1)}-${pad(daysInMonth(year, monthIndex))}`;
}

export function yearOf(isoDate: string): number {
  return parseISO(isoDate).getUTCFullYear();
}

export function monthOf(isoDate: string): number {
  return parseISO(isoDate).getUTCMonth();
}

/** "5 Januari 2026" */
export function formatDateID(isoDate: string): string {
  const d = parseISO(isoDate);
  return `${d.getUTCDate()} ${MONTHS_ID[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "5 Jan" */
export function formatShortID(isoDate: string): string {
  const d = parseISO(isoDate);
  return `${d.getUTCDate()} ${MONTHS_SHORT_ID[d.getUTCMonth()]}`;
}

/** "Januari 2026" */
export function formatMonthID(isoDate: string): string {
  const d = parseISO(isoDate);
  return `${MONTHS_ID[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function monthNameID(monthIndex: number): string {
  return MONTHS_ID[monthIndex];
}

export function monthShortID(monthIndex: number): string {
  return MONTHS_SHORT_ID[monthIndex];
}

/** "Senin, 5 Januari 2026" */
export function formatFullID(isoDate: string): string {
  const d = parseISO(isoDate);
  const dow = DAYS_FULL_ID[d.getUTCDay()];
  return `${dow}, ${d.getUTCDate()} ${MONTHS_ID[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatNumberID(value: number): string {
  return new Intl.NumberFormat('id-ID').format(Math.round(value));
}

export function formatCurrencyID(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}
