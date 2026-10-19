import { describe, expect, it } from 'vitest';
import {
  collectSubtree,
  reducer,
  reflowState,
  type Action,
} from './store';
import { createSeedState } from '../data/seed';
import { computeSchedule } from '../lib/schedule';
import type { ProjectState, Task } from '../types';

const base = (): ProjectState => createSeedState('2026-01-05');

const patch = (state: ProjectState, action: Action): ProjectState =>
  reducer(state, action);

describe('seed data', () => {
  it('berisi tugas, sub-tugas, dependensi, anggota tim, dan hari libur', () => {
    const s = base();
    expect(s.tasks.length).toBeGreaterThanOrEqual(10);
    expect(s.tasks.some((t) => t.parentId !== null)).toBe(true);
    expect(s.dependencies.length).toBeGreaterThanOrEqual(5);
    expect(s.resources.length).toBeGreaterThanOrEqual(3);
    expect(s.calendar.holidays.length).toBeGreaterThan(0);
    expect(s.calendar.weekendDays).toEqual([0, 6]);
    expect(s.projectName).toBeTruthy();
  });

  it('referensi silang pada seed tidak menggantung', () => {
    const s = base();
    const ids = new Set(s.tasks.map((t) => t.id));
    const resIds = new Set(s.resources.map((r) => r.id));
    for (const t of s.tasks) {
      if (t.parentId) expect(ids.has(t.parentId)).toBe(true);
      for (const r of t.resourceIds) expect(resIds.has(r)).toBe(true);
    }
    for (const d of s.dependencies) {
      expect(ids.has(d.predecessorId)).toBe(true);
      expect(ids.has(d.successorId)).toBe(true);
    }
  });

  it('seed berhasil dijadwalkan tanpa siklus', () => {
    const schedule = computeSchedule(base());
    expect(schedule.hasCycle).toBe(false);
    expect(schedule.projectDuration).toBeGreaterThan(1);
    expect(schedule.criticalPath.length).toBeGreaterThan(0);
    expect(schedule.projectEnd >= schedule.projectStart).toBe(true);
  });
});

describe('reducer — tugas', () => {
  it('menambahkan tugas baru', () => {
    const s = base();
    const before = s.tasks.length;
    const task: Task = {
      id: 'x1',
      name: 'Tugas Baru',
      description: '',
      startDate: '2026-01-05',
      duration: 2,
      priority: 'Low',
      color: '#4f7cff',
      parentId: null,
      progress: 0,
      resourceIds: [],
      pinned: false,
    };
    const next = patch(s, { type: 'add-task', task });
    expect(next.tasks).toHaveLength(before + 1);
    expect(next.tasks[next.tasks.length - 1]?.name).toBe('Tugas Baru');
  });

  it('mengupdate sebagian atribut tugas', () => {
    const s = base();
    const id = s.tasks[0].id;
    const next = patch(s, { type: 'update-task', id, patch: { priority: 'High', duration: 9 } });
    const updated = next.tasks.find((t) => t.id === id);
    expect(updated?.priority).toBe('High');
    expect(updated?.duration).toBe(9);
    expect(updated?.name).toBe(s.tasks[0].name);
  });

  it('menghapus tugas beserta sub-tugas dan dependensinya', () => {
    const s = base();
    const parent = s.tasks.find((t) => s.tasks.some((c) => c.parentId === t.id));
    expect(parent).toBeDefined();
    const parentName = parent?.name ?? '';
    const next = patch(s, { type: 'delete-task', id: parent!.id });

    expect(next.tasks.some((t) => t.id === parent!.id)).toBe(false);
    expect(next.tasks.some((t) => t.name === parentName)).toBe(false);
    expect(next.tasks.some((t) => t.parentId === parent!.id)).toBe(false);
    const doomed = collectSubtree(s.tasks, parent!.id);
    expect(
      next.dependencies.some((d) => doomed.has(d.predecessorId) || doomed.has(d.successorId)),
    ).toBe(false);
  });

  it('mencegah tugas menjadi anak dari keturunannya sendiri', () => {
    const s = base();
    const parent = s.tasks.find((t) => s.tasks.some((c) => c.parentId === t.id))!;
    const child = s.tasks.find((t) => t.parentId === parent.id)!;
    const next = patch(s, { type: 'update-task', id: parent.id, patch: { parentId: child.id } });
    expect(next.tasks.find((t) => t.id === parent.id)?.parentId).toBeNull();
  });

  it('meratakan status collapse', () => {
    const s = base();
    const id = s.tasks[0].id;
    const a = patch(s, { type: 'toggle-collapse', id });
    expect(a.tasks.find((t) => t.id === id)?.collapsed).toBe(true);
    const b = patch(a, { type: 'toggle-collapse', id });
    expect(b.tasks.find((t) => t.id === id)?.collapsed).toBe(false);
  });
});

describe('reducer — sumber daya', () => {
  it('menghapus anggota sekaligus alokasinya pada tugas', () => {
    const s = base();
    const target = s.resources.find((r) => s.tasks.some((t) => t.resourceIds.includes(r.id)))!;
    const next = patch(s, { type: 'delete-resource', id: target.id });
    expect(next.resources.some((r) => r.id === target.id)).toBe(false);
    expect(next.tasks.every((t) => !t.resourceIds.includes(target.id))).toBe(true);
  });

  it('menambahkan anggota baru', () => {
    const s = base();
    const before = s.resources.length;
    const next = patch(s, {
      type: 'add-resource',
      resource: {
        id: 'res-x',
        name: 'Uji Coba',
        email: 'uji@x.id',
        role: 'QA',
        salary: 1_000,
        color: '#4f7cff',
      },
    });
    expect(next.resources).toHaveLength(before + 1);
  });
});

describe('reducer — kalender', () => {
  it('mengganti hari akhir pekan', () => {
    const s = base();
    const next = patch(s, { type: 'set-weekend', days: [5, 6] });
    expect(next.calendar.weekendDays).toEqual([5, 6]);
  });

  it('menolak konfigurasi tanpa hari kerja', () => {
    const s = base();
    const next = patch(s, { type: 'set-weekend', days: [0, 1, 2, 3, 4, 5, 6] });
    expect(next.calendar.weekendDays).toEqual([0, 6]);
  });

  it('menambah dan menghapus hari libur khusus', () => {
    const s = base();
    const before = s.calendar.holidays.length;
    const added = patch(s, {
      type: 'add-holiday',
      holiday: { id: 'h-new', date: '2026-01-15', name: 'Libur Uji' },
    });
    expect(added.calendar.holidays).toHaveLength(before + 1);

    const removed = patch(added, { type: 'delete-holiday', id: 'h-new' });
    expect(removed.calendar.holidays).toHaveLength(before);
  });

  it('hari libur ikut memengaruhi perhitungan hari kerja', () => {
    const s = base();
    const withHoliday: ProjectState = {
      ...s,
      calendar: {
        ...s.calendar,
        holidays: [{ id: 'hx', date: s.tasks[0].startDate, name: 'Libur' }],
      },
    };
    const a = computeSchedule(s);
    const b = computeSchedule(withHoliday);
    expect(b.projectEnd !== a.projectEnd || b.projectStart !== a.projectStart).toBe(true);
  });
});

describe('reflow', () => {
  it('menyetel tanggal mulai tugas dengan hasil penjadwalan otomatis', () => {
    const s = base();
    const messed: ProjectState = {
      ...s,
      tasks: s.tasks.map((t) => ({ ...t, startDate: '2026-01-05' })),
    };
    const next = reflowState(messed);
    const schedule = computeSchedule(messed);
    for (const t of next.tasks) {
      expect(t.startDate).toBe(schedule.entries[t.id].startDate);
    }
  });
});

describe('dependensi', () => {
  it('menambah, mengubah, dan menghapus dependensi', () => {
    const s = base();
    const added = patch(s, {
      type: 'add-dependency',
      dependency: {
        id: 'd-new',
        predecessorId: s.tasks[0].id,
        successorId: s.tasks[1].id,
        type: 'SS',
        lag: 3,
      },
    });
    expect(added.dependencies[added.dependencies.length - 1]).toMatchObject({
      type: 'SS',
      lag: 3,
    });

    const updated = patch(added, {
      type: 'update-dependency',
      id: 'd-new',
      patch: { type: 'FS', lag: 0 },
    });
    expect(updated.dependencies.find((d) => d.id === 'd-new')).toMatchObject({
      type: 'FS',
      lag: 0,
    });

    const removed = patch(updated, { type: 'delete-dependency', id: 'd-new' });
    expect(removed.dependencies.some((d) => d.id === 'd-new')).toBe(false);
  });

  it('bergantung pada diri sendiri diabaikan oleh penjadwalan', () => {
    const s = base();
    const id = s.tasks[0].id;
    const broken = patch(s, {
      type: 'add-dependency',
      dependency: { id: 'loop', predecessorId: id, successorId: id, type: 'FS', lag: 0 },
    });
    const schedule = computeSchedule(broken);
    expect(schedule.entries[id]).toBeDefined();
  });
});
