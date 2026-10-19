import type { CalendarConfig } from '../types';
import { firstWorkingDayOnOrAfter, nextWorkingDayAfter } from './calendar';

/**
 * Indeks hari kerja: memetakan tanggal ISO ke urutan hari kerja ke-n
 * (dan sebaliknya). Dipakai algoritma CPM agar perhitungan ES/EF/LS/LF
 * dilakukan pada ruang indeks, bukan ruang tanggal.
 *
 * Indeks 0 = hari kerja pertama pada atau setelah `startDate`.
 */
export class WorkingDayCalendar {
  private days: string[] = [];
  private lookup = new Map<string, number>();
  readonly first: string;

  constructor(
    private readonly config: CalendarConfig,
    startDate: string,
  ) {
    this.first = firstWorkingDayOnOrAfter(startDate, config);
    this.days.push(this.first);
    this.lookup.set(this.first, 0);
    this.grow(60);
  }

  private append(): boolean {
    const last = this.days[this.days.length - 1];
    const next = nextWorkingDayAfter(last, this.config);
    if (!next || next <= last) return false;
    this.lookup.set(next, this.days.length);
    this.days.push(next);
    return true;
  }

  private grow(count: number): void {
    let added = 0;
    while (added < count) {
      if (!this.append()) return;
      added += 1;
    }
  }

  private ensure(index: number): void {
    let guard = 0;
    while (this.days.length <= index && guard < 100_000) {
      if (!this.append()) return;
      guard += 1;
    }
  }

  get size(): number {
    return this.days.length;
  }

  /** Tanggal ISO dari indeks hari kerja. */
  date(index: number): string {
    const i = Math.max(0, Math.round(index));
    this.ensure(i);
    return this.days[Math.min(i, this.days.length - 1)];
  }

  /**
   * Indeks hari kerja pertama pada atau setelah tanggal tertentu.
   * Bila tanggal adalah hari kerja, mengembalikan indeks tanggal itu sendiri.
   */
  index(isoDate: string): number {
    if (isoDate <= this.days[0]) return 0;
    const hit = this.lookup.get(isoDate);
    if (hit !== undefined) return hit;

    let guard = 0;
    while (this.days[this.days.length - 1] < isoDate && guard < 200_000) {
      if (!this.append()) break;
      guard += 1;
    }

    let lo = 0;
    let hi = this.days.length - 1;
    let result = this.days.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.days[mid] >= isoDate) {
        result = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    return result;
  }

  /** Jumlah hari kerja inklusif antara dua tanggal berdasarkan indeks. */
  spanInWorkingDays(from: string, to: string): number {
    if (to < from) return 0;
    return this.index(to) - this.index(from) + 1;
  }
}
