import { describe, expect, it } from 'vitest';
import type { CalendarConfig, Dependency, ProjectState, Task } from '../types';
import { DEFAULT_WEEKENDS } from './calendar';
import { computeSchedule, pertForTask, timelineBounds } from './schedule';

const CAL: CalendarConfig = { weekendDays: [...DEFAULT_WEEKENDS], holidays: [] };

/**
 * Indeks hari kerja sejak 2026-01-05 (Senin):
 * 0=5 Jan, 1=6 Jan, 2=7 Jan, 3=8 Jan, 4=9 Jan, 5=12 Jan, 6=13 Jan, 7=14 Jan ...
 */
const D0 = '2026-01-05';
const IDX = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09',
  '2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15', '2026-01-16',
  '2026-01-19', '2026-01-20', '2026-01-21', '2026-01-22', '2026-01-23'];

function task(partial: Partial<Task> & { id: string }): Task {
  return {
    name: partial.id,
    description: '',
    startDate: D0,
    duration: 3,
    priority: 'Medium',
    color: '#4f7cff',
    parentId: null,
    progress: 0,
    resourceIds: [],
    pinned: false,
    ...partial,
  };
}

function dep(
  id: string,
  predecessorId: string,
  successorId: string,
  type: Dependency['type'] = 'FS',
  lag = 0,
): Dependency {
  return { id, predecessorId, successorId, type, lag };
}

function state(tasks: Task[], dependencies: Dependency[] = []): ProjectState {
  return {
    projectName: 'Test',
    tasks,
    dependencies,
    resources: [],
    calendar: CAL,
  };
}

describe('computeSchedule — forward & backward pass', () => {
  it('rantai FS tanpa lag dijadwalkan berurutan', () => {
    const sched = computeSchedule(
      state(
        [
          task({ id: 'A', startDate: D0, duration: 3 }),
          task({ id: 'B', startDate: D0, duration: 2 }),
        ],
        [dep('d1', 'A', 'B', 'FS', 0)],
      ),
    );

    expect(sched.entries.A.startDate).toBe(IDX[0]);
    expect(sched.entries.A.endDate).toBe(IDX[2]);
    expect(sched.entries.B.startDate).toBe(IDX[3]);
    expect(sched.entries.B.endDate).toBe(IDX[4]);

    expect(sched.entries.A.float).toBe(0);
    expect(sched.entries.B.float).toBe(0);
    expect(sched.criticalIds).toEqual(['A', 'B']);
    expect(sched.criticalPath).toEqual(['A', 'B']);
    expect(sched.projectStart).toBe(IDX[0]);
    expect(sched.projectEnd).toBe(IDX[4]);
    expect(sched.projectDuration).toBe(5);
  });

  it('lag FS menambah jeda hari kerja pada successor', () => {
    const sched = computeSchedule(
      state(
        [
          task({ id: 'A', startDate: D0, duration: 3 }),
          task({ id: 'B', startDate: D0, duration: 2 }),
        ],
        [dep('d1', 'A', 'B', 'FS', 2)],
      ),
    );

    // A selesai 7 Jan (idx 2) -> +1 +2 lag = idx 5 = 12 Jan
    expect(sched.entries.B.startDate).toBe(IDX[5]);
    expect(sched.entries.B.endDate).toBe(IDX[6]);
    expect(sched.entries.A.critical).toBe(true);
    expect(sched.entries.B.critical).toBe(true);
  });

  it('hubungan SS menjadwalkan successor sejak awal predecessor + lag', () => {
    const sched = computeSchedule(
      state(
        [
          task({ id: 'A', startDate: D0, duration: 5 }),
          task({ id: 'B', startDate: D0, duration: 3 }),
        ],
        [dep('d1', 'A', 'B', 'SS', 0)],
      ),
    );

    expect(sched.entries.A.startDate).toBe(IDX[0]);
    expect(sched.entries.A.endDate).toBe(IDX[4]);
    expect(sched.entries.B.startDate).toBe(IDX[0]);
    expect(sched.entries.B.endDate).toBe(IDX[2]);
    // A menggerakkan akhir proyek sehingga kritis, B punya float 2 hari kerja.
    expect(sched.entries.A.float).toBe(0);
    expect(sched.entries.B.float).toBe(2);
    expect(sched.criticalIds).toEqual(['A']);
  });

  it('SS dengan lag menggeser successor maju', () => {
    const sched = computeSchedule(
      state(
        [
          task({ id: 'A', startDate: D0, duration: 5 }),
          task({ id: 'B', startDate: D0, duration: 3 }),
        ],
        [dep('d1', 'A', 'B', 'SS', 2)],
      ),
    );
    expect(sched.entries.B.startDate).toBe(IDX[2]);
    expect(sched.entries.B.endDate).toBe(IDX[4]);
  });

  it('float tidak pernah negatif dan jalur kritis berakhir di akhir proyek', () => {
    const sched = computeSchedule(
      state(
        [
          task({ id: 'A', duration: 4 }),
          task({ id: 'B', duration: 4 }),
          task({ id: 'C', duration: 2 }),
        ],
        [dep('d1', 'A', 'C', 'FS', 0), dep('d2', 'B', 'C', 'FS', 1)],
      ),
    );
    for (const entry of Object.values(sched.entries)) {
      expect(entry.float).toBeGreaterThanOrEqual(0);
    }
    expect(sched.entries.C.critical).toBe(true);
    // B memakai lag 1 hari sehingga menjadi penggerak akhir proyek.
    expect(sched.entries.B.float).toBe(0);
    expect(sched.entries.B.critical).toBe(true);
    // A dapat bergeser 1 hari kerja tanpa menunda proyek.
    expect(sched.entries.A.float).toBe(1);
    expect(sched.entries.A.critical).toBe(false);
    expect(sched.criticalPath).toEqual(['B', 'C']);
  });

  it('tugas dengan predecessor bersifat otomatis (mengabaikan startDate manual)', () => {
    const sched = computeSchedule(
      state(
        [
          task({ id: 'A', startDate: D0, duration: 3 }),
          task({ id: 'B', startDate: '2026-03-02', duration: 1 }),
        ],
        [dep('d1', 'A', 'B', 'FS', 0)],
      ),
    );
    expect(sched.entries.B.startDate).toBe(IDX[3]);
  });

  it('tugas terkunci (pinned) mempertahankan tanggal mulai manual', () => {
    const sched = computeSchedule(
      state(
        [
          task({ id: 'A', startDate: D0, duration: 3 }),
          task({ id: 'B', startDate: IDX[6], duration: 2, pinned: true }),
        ],
        [dep('d1', 'A', 'B', 'FS', 0)],
      ),
    );
    // constraint = idx 3, anchor = idx 6 -> max = 6
    expect(sched.entries.B.startDate).toBe(IDX[6]);
  });

  it('tugas tanpa predecessor memakai tanggal mulainya sendiri', () => {
    const sched = computeSchedule(
      state([task({ id: 'A', startDate: '2026-01-20', duration: 2 })]),
    );
    expect(sched.entries.A.startDate).toBe('2026-01-20');
    expect(sched.entries.A.endDate).toBe('2026-01-21');
  });

  it('tanggal mulai di akhir pekan dinormalkan ke hari kerja', () => {
    const sched = computeSchedule(
      state([task({ id: 'A', startDate: '2026-01-03', duration: 1 })]),
    );
    expect(sched.entries.A.startDate).toBe('2026-01-05');
  });
});

describe('computeSchedule — sub-tugas (parent-child)', () => {
  it('tugas induk menjadi summary yang membentang dari anak pertama ke anak terakhir', () => {
    const sched = computeSchedule(
      state(
        [
          task({ id: 'P', parentId: null, duration: 1 }),
          task({ id: 'C1', parentId: 'P', startDate: D0, duration: 2 }),
          task({ id: 'C2', parentId: 'P', startDate: D0, duration: 3 }),
        ],
        [dep('d1', 'C1', 'C2', 'FS', 0)],
      ),
    );

    expect(sched.entries.P.isSummary).toBe(true);
    expect(sched.entries.C1.isSummary).toBe(false);
    expect(sched.entries.P.startDate).toBe(IDX[0]);
    expect(sched.entries.P.endDate).toBe(IDX[4]);
    expect(sched.entries.P.duration).toBe(5);
  });

  it('constraint predecessor pada induk diturunkan ke seluruh sub-tugas', () => {
    const sched = computeSchedule(
      state(
        [
          task({ id: 'P1', parentId: null, duration: 1 }),
          task({ id: 'C', parentId: 'P1', startDate: D0, duration: 2 }),
          task({ id: 'P2', parentId: null, duration: 1 }),
          task({ id: 'D', parentId: 'P2', startDate: D0, duration: 2 }),
        ],
        [dep('d1', 'P1', 'P2', 'FS', 0)],
      ),
    );

    expect(sched.entries.P1.endDate).toBe(IDX[1]);
    expect(sched.entries.D.startDate).toBe(IDX[2]);
    expect(sched.entries.P2.startDate).toBe(IDX[2]);
    expect(sched.entries.P2.endDate).toBe(IDX[3]);
  });

  it('induk dengan predecessor tidak membiarkan anaknya melewati constraint', () => {
    const sched = computeSchedule(
      state(
        [
          task({ id: 'A', startDate: D0, duration: 6 }),
          task({ id: 'P', parentId: null, duration: 1 }),
          task({ id: 'C1', parentId: 'P', startDate: D0, duration: 2 }),
        ],
        [dep('d1', 'A', 'P', 'FS', 0)],
      ),
    );
    // A selesai indeks 5 -> anak minimal indeks 6
    expect(sched.entries.C1.startDate).toBe(IDX[6]);
    expect(sched.entries.P.startDate).toBe(IDX[6]);
  });
});

describe('computeSchedule — ketahanan', () => {
  it('siklus dependensi tidak menyebabkan infinite loop', () => {
    const sched = computeSchedule(
      state(
        [
          task({ id: 'A', duration: 2 }),
          task({ id: 'B', duration: 2 }),
        ],
        [dep('d1', 'A', 'B', 'FS', 0), dep('d2', 'B', 'A', 'FS', 0)],
      ),
    );
    expect(sched.hasCycle).toBe(true);
    expect(sched.entries.A).toBeDefined();
    expect(sched.entries.B).toBeDefined();
    expect(sched.entries.A.startDate).toBe(D0);
    expect(sched.entries.B.startDate).toBe(D0);
  });

  it('dependensi yang menunjuk tugas tak dikenal diabaikan', () => {
    const sched = computeSchedule(
      state([task({ id: 'A', duration: 2 })], [dep('d1', 'GHOST', 'A', 'FS', 0)]),
    );
    expect(sched.entries.A.startDate).toBe(D0);
    // Kedua ujung harus dikenal agar dependensi ikut dihitung.
    expect(sched.links).toHaveLength(0);
  });

  it('durasi 0 atau negatif dikoreksi menjadi minimal 1 hari kerja', () => {
    const sched = computeSchedule(
      state([task({ id: 'A', duration: 0 }), task({ id: 'B', duration: -5 })]),
    );
    expect(sched.entries.A.duration).toBe(1);
    expect(sched.entries.B.duration).toBe(1);
  });

  it('proyek kosong tidak melempar error', () => {
    const sched = computeSchedule(state([]));
    expect(sched.criticalPath).toEqual([]);
    expect(sched.projectDuration).toBe(0);
    expect(sched.entries).toEqual({});
  });
});

describe('PERT', () => {
  it('menghitung TE dan varians sesuai rumus (O + 4M + P) / 6', () => {
    const p = pertForTask(task({ id: 'A', duration: 6, optimistic: 4, mostLikely: 6, pessimistic: 14 }));
    expect(p.te).toBeCloseTo(7, 6);
    expect(p.sd).toBeCloseTo(10 / 6, 6);
    expect(p.variance).toBeCloseTo((10 / 6) ** 2, 6);
  });

  it('tanpa estimasi eksplisit, TE sama dengan durasi terjadwal', () => {
    const p = pertForTask(task({ id: 'A', duration: 5 }));
    expect(p.te).toBe(5);
    expect(p.variance).toBe(0);
  });

  it('menghitung ekspektasi & deviasi proyek dari jalur kritis', () => {
    const sched = computeSchedule(
      state(
        [
          task({ id: 'A', duration: 6, optimistic: 4, mostLikely: 6, pessimistic: 14 }),
          task({ id: 'B', duration: 6, optimistic: 4, mostLikely: 6, pessimistic: 8 }),
        ],
        [dep('d1', 'A', 'B', 'FS', 0)],
      ),
    );
    expect(sched.pert.expected).toBeCloseTo(7 + 6, 6);
    expect(sched.pert.variance).toBeCloseTo(((14 - 4) / 6) ** 2 + ((8 - 4) / 6) ** 2, 6);
    expect(sched.pert.sd).toBeCloseTo(Math.sqrt(((14 - 4) / 6) ** 2 + ((8 - 4) / 6) ** 2), 6);
  });
});

describe('timelineBounds', () => {
  it('mencakup seluruh tugas dan tanggal hari ini', () => {
    const s = state([task({ id: 'A', startDate: '2026-01-05', duration: 2 })]);
    const sched = computeSchedule(s);
    const bounds = timelineBounds(s, sched);
    expect(bounds.start <= '2026-01-05').toBe(true);
    expect(bounds.end >= '2026-01-06').toBe(true);
  });
});
