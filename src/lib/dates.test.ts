import { describe, expect, it } from 'vitest';
import {
  addDays,
  compareDates,
  diffDays,
  formatFullID,
  isValidISO,
  monthEndISO,
  toISO,
  parseISO,
} from './dates';

describe('dates', () => {
  it('parseISO/toISO membalikkan tanggal yang sama', () => {
    expect(toISO(parseISO('2026-10-19'))).toBe('2026-10-19');
  });

  it('addDays melewati batas bulan dan tahun', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('addDays tidak terpengaruh kapanjungan (DST)', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });

  it('diffDays menghitung selisih kalender', () => {
    expect(diffDays('2026-01-01', '2026-01-11')).toBe(10);
    expect(diffDays('2026-01-11', '2026-01-01')).toBe(-10);
    expect(diffDays('2026-01-01', '2026-01-01')).toBe(0);
  });

  it('compareDates mengurutkan secara kronologis', () => {
    expect(compareDates('2026-01-01', '2026-02-01')).toBe(-1);
    expect(compareDates('2026-02-01', '2026-01-01')).toBe(1);
    expect(compareDates('2026-01-01', '2026-01-01')).toBe(0);
  });

  it('isValidISO menolak format yang salah', () => {
    expect(isValidISO('2026-10-19')).toBe(true);
    expect(isValidISO('19-10-2026')).toBe(false);
    expect(isValidISO('2026-13-40')).toBe(false);
    expect(isValidISO('')).toBe(false);
  });

  it('monthEndISO menghasilkan hari terakhir bulan', () => {
    expect(monthEndISO(2026, 1)).toBe('2026-02-28');
    expect(monthEndISO(2024, 1)).toBe('2024-02-29');
    expect(monthEndISO(2026, 0)).toBe('2026-01-31');
  });

  it('formatFullID menampilkan tanggal berbahasa Indonesia', () => {
    expect(formatFullID('2026-10-19')).toBe('Senin, 19 Oktober 2026');
  });
});
