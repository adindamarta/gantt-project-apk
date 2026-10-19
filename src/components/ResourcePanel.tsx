import { useMemo, useState, type FormEvent } from 'react';
import type { Resource } from '../types';
import { useApp } from '../store/store';
import { uid } from '../data/seed';
import { formatCurrencyID } from '../lib/dates';
import { RESOURCE_COLORS } from '../lib/color';
import { Avatar, EmptyState, Modal } from './ui';

interface Draft {
  id: string | null;
  name: string;
  email: string;
  role: string;
  salary: string;
}

const EMPTY: Draft = { id: null, name: '', email: '', role: '', salary: '' };

export function ResourcePanel() {
  const { state, dispatch, schedule } = useApp();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allocation = useMemo(() => {
    const map = new Map<string, { taskIds: string[]; days: number; cost: number }>();
    for (const r of state.resources) map.set(r.id, { taskIds: [], days: 0, cost: 0 });
    for (const task of state.tasks) {
      const entry = schedule.entries[task.id];
      for (const rid of task.resourceIds) {
        const agg = map.get(rid);
        if (!agg) continue;
        agg.taskIds.push(task.id);
        if (entry) agg.days += entry.duration;
      }
    }
    for (const r of state.resources) {
      const agg = map.get(r.id);
      if (!agg) continue;
      agg.cost = Math.round((r.salary / 21) * agg.days);
    }
    return map;
  }, [state.resources, state.tasks, schedule]);

  const totalSalary = state.resources.reduce((sum, r) => sum + (r.salary || 0), 0);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const current = draft;
    if (!current) return;

    const name = current.name.trim();
    if (!name) {
      setError('Nama anggota wajib diisi.');
      return;
    }
    if (current.email && !/^\S+@\S+\.\S+$/.test(current.email)) {
      setError('Format email tidak valid.');
      return;
    }
    const salary = Math.max(0, Math.round(Number(current.salary) || 0));

    if (current.id) {
      dispatch({
        type: 'update-resource',
        id: current.id,
        patch: { name, email: current.email.trim(), role: current.role.trim(), salary },
      });
    } else {
      const resource: Resource = {
        id: uid('res'),
        name,
        email: draft.email.trim(),
        role: draft.role.trim() || 'Anggota tim',
        salary,
        color: RESOURCE_COLORS[state.resources.length % RESOURCE_COLORS.length],
      };
      dispatch({ type: 'add-resource', resource });
    }
    setDraft(null);
    setError(null);
  };

  const remove = (resource: Resource) => {
    const used = state.tasks.filter((t) => t.resourceIds.includes(resource.id)).length;
    const message = used
      ? `Hapus "${resource.name}"? Alokasinya di ${used} tugas akan ikut terhapus.`
      : `Hapus anggota tim "${resource.name}"?`;
    if (window.confirm(message)) dispatch({ type: 'delete-resource', id: resource.id });
  };

  return (
    <div className="panel">
      <div className="toolbar">
        <div className="toolbar-group">
          <button
            className="btn btn-primary"
            onClick={() => {
              setDraft({ ...EMPTY });
              setError(null);
            }}
          >
            + Anggota tim
          </button>
        </div>
        <div className="toolbar-group">
          <span className="muted">
            {state.resources.length} anggota • gaji bulanan total{' '}
            {formatCurrencyID(totalSalary)}
          </span>
        </div>
      </div>

      {state.resources.length === 0 ? (
        <EmptyState
          title="Belum ada anggota tim"
          hint="Daftarkan anggota (nama, email, peran, gaji) lalu alokasikan ke tugas."
          action={
            <button
              className="btn btn-primary"
              onClick={() => setDraft({ ...EMPTY })}
            >
              + Anggota tim
            </button>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Email</th>
                <th>Peran</th>
                <th className="num">Gaji / bulan</th>
                <th className="num">Tugas</th>
                <th className="num">Hari kerja</th>
                <th className="num">Estimasi biaya</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {state.resources.map((r) => {
                const agg = allocation.get(r.id);
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="res-cell">
                        <Avatar name={r.name} color={r.color} />
                        <div>
                          <div className="res-name">{r.name}</div>
                          <div className="muted small">{r.role}</div>
                        </div>
                      </div>
                    </td>
                    <td className="muted">{r.email || '—'}</td>
                    <td>{r.role}</td>
                    <td className="num">{formatCurrencyID(r.salary)}</td>
                    <td className="num">{agg?.taskIds.length ?? 0}</td>
                    <td className="num">{agg?.days ?? 0}</td>
                    <td className="num">{formatCurrencyID(agg?.cost ?? 0)}</td>
                    <td>
                      <div className="g-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          title="Edit anggota"
                          aria-label={`Edit ${r.name}`}
                          onClick={() =>
                            setDraft({
                              id: r.id,
                              name: r.name,
                              email: r.email,
                              role: r.role,
                              salary: String(r.salary),
                            })
                          }
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          title="Hapus anggota"
                          aria-label={`Hapus ${r.name}`}
                          onClick={() => remove(r)}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="section-title">Alokasi anggota ke tugas</h3>
      {state.tasks.length === 0 ? (
        <p className="hint">Belum ada tugas untuk dialokasikan.</p>
      ) : (
        <div className="table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Tugas</th>
                <th>Jadwal</th>
                <th>Anggota yang dialokasikan</th>
              </tr>
            </thead>
            <tbody>
              {state.tasks.map((task) => {
                const entry = schedule.entries[task.id];
                return (
                  <tr key={task.id}>
                    <td>
                      <span className="color-chip" style={{ background: task.color }} />
                      {task.name}
                    </td>
                    <td className="muted">
                      {entry
                        ? `${entry.startDate} → ${entry.endDate}`
                        : '—'}
                    </td>
                    <td>
                      <div className="alloc-row">
                        {state.resources.map((r) => {
                          const active = task.resourceIds.includes(r.id);
                          return (
                            <button
                              key={r.id}
                              type="button"
                              className={active ? 'alloc-chip active' : 'alloc-chip'}
                              style={active ? { borderColor: r.color } : undefined}
                              title={`${r.name} — ${r.role}`}
                              onClick={() => {
                                const next = active
                                  ? task.resourceIds.filter((id) => id !== r.id)
                                  : [...task.resourceIds, r.id];
                                dispatch({
                                  type: 'update-task',
                                  id: task.id,
                                  patch: { resourceIds: next },
                                });
                              }}
                            >
                              <span
                                className="chip-dot"
                                style={{ background: active ? r.color : '#c6cfda' }}
                              />
                              {r.name}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {draft ? (
        <Modal
          title={draft.id ? 'Edit Anggota Tim' : 'Tambah Anggota Tim'}
          onClose={() => setDraft(null)}
        >
          <form className="form" onSubmit={submit}>
            <div className="field field-full">
              <label htmlFor="res-name">Nama</label>
              <input
                id="res-name"
                value={draft.name}
                autoFocus
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="mis. Rina Amelia"
              />
            </div>
            <div className="field field-full">
              <label htmlFor="res-email">Email</label>
              <input
                id="res-email"
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                placeholder="nama@perusahaan.com"
              />
            </div>
            <div className="field">
              <label htmlFor="res-role">Peran</label>
              <input
                id="res-role"
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                placeholder="mis. Backend Engineer"
              />
            </div>
            <div className="field">
              <label htmlFor="res-salary">Gaji / bulan (IDR)</label>
              <input
                id="res-salary"
                type="number"
                min={0}
                step={100000}
                value={draft.salary}
                onChange={(e) => setDraft({ ...draft, salary: e.target.value })}
                placeholder="15000000"
              />
            </div>
            {error ? <p className="form-error field-full">{error}</p> : null}
            <div className="modal-actions field-full">
              <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>
                Batal
              </button>
              <button type="submit" className="btn btn-primary">
                Simpan
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
