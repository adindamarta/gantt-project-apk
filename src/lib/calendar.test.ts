import { describe, expect, it } from 'vitest';
import type { CalendarConfig } from '../types';
import {
  DEFAULT_WEEKENDS,
  addWorkingDays,
  firstWorkingDayOnOrAfter,
  hasWorkingDay,
  isWorkingDay,
  nextWorkingDayAfter,
  workingDaysInclusive,
} from './calendar';

const cal: CalendarConfig = { weekendDays: [...DEFAULT_WEEKENDS], holidays: [] };

describe('calendar', () => {
  it('akhir pekan Sabtu & Minggu bukan hari kerja', () => {
    expect(isWorkingDay('2026-01-03', cal)).toBe(false); // Sabtu
    expect(isWorkingDay('2026-01-04', cal)).toBe(false); // Minggu
    expect(isWorkingDay('2026-01-05', cal)).toBe(true); // Senin
    expect(isWorkingDay('2026-01-06', cal)).toBe(true); // Selasa
  });

  it('hari libur khusus bukan hari kerja', () => {
    const withHoliday: CalendarConfig = {
      weekendDays: [...DEFAULT_WEEKENDS],
      holidays: [{ id: 'h1', date: '2026-01-07', name: 'Libur' }],
    };
    expect(isWorkingDay('2026-01-07', withHoliday)).toBe(false);
    expect(isWorkingDay('2026-01-08', withHoliday)).toBe(true);
  });

  it('weekend bisa dikonfigurasi (mis. Jumat-Sabtu)', () => {
    const weekend: CalendarConfig = {
      weekendDays: [5, 6],
      holidays: [],
    };
    expect(isWorkingDay('2026-01-02', weekend)).toBe(false); // Jumat
    expect(isWorkingDay('2026-01-03', weekend)).toBe(false); // Sabtu
    expect(isWorkingDay('2026-01-04', weekend)).toBe(true); // Minggu
    expect(isWorkingDay('2026-01-01', weekend)).toBe(true); // Kamis
  });

  it('firstWorkingDayOnOrAfter melompati akhir pekan', () => {
    expect(firstWorkingDayOnOrAfter('2026-01-03', cal)).toBe('2026-01-05');
    expect(firstWorkingDayOnOrAfter('2026-01-05', cal)).toBe('2026-01-05');
    expect(firstWorkingDayOnOrAfter('2026-01-04', cal)).toBe('2026-01-05');
  });

  it('nextWorkingDayAfter selalu maju satu hari kerja', () => {
    expect(nextWorkingDayAfter('2026-01-02', cal)).toBe('2026-01-05');
    expect(nextWorkingDayAfter('2026-01-05', cal)).toBe('2026-01-06');
  });

  it('addWorkingDays menghitung maju per hari kerja', () => {
    expect(addWorkingDays('2026-01-02', 0, cal)).toBe('2026-01-02');
    expect(addWorkingDays('2026-01-02', 1, cal)).toBe('2026-01-05');
    expect(addWorkingDays('2026-01-05', 5, cal)).toBe('2026-01-12');
    // Dari Sabtu -> mulai Senin dulu, lalu maju.
    expect(addWorkingDays('2026-01-03', 1, cal)).toBe('2026-01-06');
  });

  it('workingDaysInclusive menghitung rentang inklusif', () => {
    expect(workingDaysInclusive('2026-01-01', '2026-01-09', cal)).toBe(7);
    expect(workingDaysInclusive('2026-01-05', '2026-01-05', cal)).toBe(1);
    expect(workingDaysInclusive('2026-01-10', '2026-01-05', cal)).toBe(0);
    expect(workingDaysInclusive('2026-01-03', '2026-01-04', cal)).toBe(0);
  });

  it('addWorkingDays mengabaikan hari libur khusus', () => {
    const withHoliday: CalendarConfig = {
      weekendDays: [...DEFAULT_WEEKENDS],
      holidays: [{ id: 'h1', date: '2026-01-07', name: 'Libur' }],
    };
    expect(addWorkingDays('2026-01-06', 1, withHoliday)).toBe('2026-01-08');
  });

  it('hasWorkingDay menolak kalender tanpa hari kerja sama sekali', () => {
    expect(hasWorkingDay(cal)).toBe(true);
    expect(hasWorkingDay({ weekendDays: [0, 1, 2, 3, 4, 5, 6], holidays: [] })).toBe(false);
  });
});
