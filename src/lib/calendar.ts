import type { CalendarConfig, Holiday } from '../types';
import { addDays, dayOfWeek, diffDays } from './dates';

/** Batas pengaman agar loop tidak pernah tak berujung. */
const GUARD = 4000;

export function isWeekendDay(isoDate: string, weekendDays: number[]): boolean {
  return weekendDays.includes(dayOfWeek(isoDate));
}

export function findHoliday(isoDate: string, holidays: Holiday[]): Holiday | undefined {
  return holidays.find((h) => h.date === isoDate);
}

export function isWorkingDay(isoDate: string, cal: CalendarConfig): boolean {
  if (isWeekendDay(isoDate, cal.weekendDays)) return false;
  if (findHoliday(isoDate, cal.holidays)) return false;
  return true;
}

/** Hari kerja pertama >= isoDate. */
export function firstWorkingDayOnOrAfter(isoDate: string, cal: CalendarConfig): string {
  let cursor = isoDate;
  for (let i = 0; i < GUARD; i += 1) {
    if (isWorkingDay(cursor, cal)) return cursor;
    cursor = addDays(cursor, 1);
  }
  return isoDate;
}

/** Hari kerja pertama setelah isoDate (strictly after). */
export function nextWorkingDayAfter(isoDate: string, cal: CalendarConfig): string {
  let cursor = addDays(isoDate, 1);
  for (let i = 0; i < GUARD; i += 1) {
    if (isWorkingDay(cursor, cal)) return cursor;
    const next = addDays(cursor, 1);
    if (next === cursor) break;
    cursor = next;
  }
  return isoDate;
}

/** Hari kerja terakhir sebelum atau pada isoDate. */
export function lastWorkingDayOnOrBefore(isoDate: string, cal: CalendarConfig): string {
  let cursor = isoDate;
  for (let i = 0; i < GUARD; i += 1) {
    if (isWorkingDay(cursor, cal)) return cursor;
    const prev = addDays(cursor, -1);
    if (prev === cursor) break;
    cursor = prev;
  }
  return isoDate;
}

/**
 * Memilih hari kerja terdekat dari `targetDate`. Bila jaraknya sama,
 * arah `direction` menjadi penentu agar bar terasa mengikuti kursor.
 */
export function snapToWorkingDay(
  targetDate: string,
  cal: CalendarConfig,
  direction: 0 | 1 | -1 = 0,
): string {
  if (direction === 0) return firstWorkingDayOnOrAfter(targetDate, cal);
  const forward = firstWorkingDayOnOrAfter(targetDate, cal);
  const backward = lastWorkingDayOnOrBefore(targetDate, cal);
  if (forward === backward) return forward;
  const distF = Math.abs(diffDays(targetDate, forward));
  const distB = Math.abs(diffDays(targetDate, backward));
  if (distF === distB) return direction > 0 ? forward : backward;
  return distF < distB ? forward : backward;
}

/**
 * Menambah `days` hari kerja dari `isoDate` (tanggal awal dihitung sebagai hari ke-0).
 * Menghasilkan hari kerja pertama >= isoDate bila days = 0.
 */
export function addWorkingDays(isoDate: string, days: number, cal: CalendarConfig): string {
  const step = Math.max(0, Math.round(days));
  let cursor = firstWorkingDayOnOrAfter(isoDate, cal);
  for (let i = 0; i < step; i += 1) {
    const next = nextWorkingDayAfter(cursor, cal);
    if (next === cursor) break;
    cursor = next;
  }
  return cursor;
}

/** Jumlah hari kerja inklusif di antara dua tanggal. Mengembalikan 0 bila to < from. */
export function workingDaysInclusive(from: string, to: string, cal: CalendarConfig): number {
  if (to < from) return 0;
  let count = 0;
  let cursor = from;
  for (let i = 0; i < 30_000; i += 1) {
    if (isWorkingDay(cursor, cal)) count += 1;
    if (cursor >= to) break;
    cursor = addDays(cursor, 1);
  }
  return count;
}

/** Apakah kalender masih memiliki minimal satu hari kerja? */
export function hasWorkingDay(cal: CalendarConfig): boolean {
  if (cal.weekendDays.length >= 7) return false;
  // Coba 14 hari ke depan dari hari ini.
  const start = new Date();
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(start.getTime() + i * 86_400_000);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    if (isWorkingDay(iso, cal)) return true;
  }
  return false;
}

export const DEFAULT_WEEKENDS: number[] = [0, 6];
