import { useMemo, useState } from 'react';
import type { Task } from '../types';
import { useApp } from '../store/store';
import { flattenTasks } from '../lib/taskTree';
import { formatShortID } from '../lib/dates';
import { priorityColor } from '../lib/color';
import { findCycle } from '../lib/dependencies';
import { TaskForm } from './TaskForm';
import { Avatar, EmptyState, PriorityBadge, ProgressBar } from './ui';

type Filter = 'all' | 'critical' | 'high';

export function TaskList() {
  const { state, dispatch, schedule } = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [form, setForm] = useState<{ task: Task | null; parentId?: string | null } | null>(
    null,
  );

  const criticalSet = useMemo(() => new Set(schedule.criticalIds), [schedule.criticalIds]);
  const rows = useMemo(() => flattenTasks(state.tasks), [state.tasks]);

  const visible = rows.filter((row) => {
    const task = row.task;
    if (query && !task.name.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === 'critical' && !criticalSet.has(task.id)) return false;
    if (filter === 'high' && task.priority !== 'High') return false;
    return true;
  });

  const cycle = useMemo(() => findCycle(state.dependencies), [state.dependencies]);

  const remove = (task: Task) => {
    const children = state.tasks.filter((t) => t.parentId === task.id).length;
    const message = children
      ? `Hapus "${task.name}" beserta ${children} sub-tugas di dalamnya?`
      : `Hapus tugas "${task.name}"?`;
    if (window.confirm(message)) dispatch({ type: 'delete-task', id: task.id });
  };

  const predecessorNames = (task: Task) =>
    state.dependencies
      .filter((d) => d.successorId === task.id)
      .map((d) => {
        const pred = state.tasks.find((t) => t.id === d.predecessorId);
        if (!pred) return null;
        return {
          id: d.id,
          label: `${pred.name} (${d.type}${d.lag !== 0 ? `${d.lag > 0 ? '+' : ''}${d.lag}` : ''})`,
        };
      })
      .filter((x): x is { id: string; label: string } => x !== null);

  return (
    <div className="panel">
      <div className="toolbar">
        <div className="toolbar-group">
          <button className="btn btn-primary" onClick={() => setForm({ task: null })}>
            + Tugas baru
          </button>
        </div>
        <div className="toolbar-group grow">
          <input
            className="search"
            type="search"
            placeholder="Cari tugas…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Cari tugas"
          />
          <div className="segmented">
            {(
              [
                ['all', 'Semua'],
                ['critical', 'Kritis'],
                ['high', 'Prioritas tinggi'],
              ] as [Filter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={filter === key ? 'seg active' : 'seg'}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar-group">
          <button
            className="btn"
            onClick={() => dispatch({ type: 'reflow' })}
            title="Samakan tanggal mulai dengan hasil penjadwalan otomatis"
          >
            Sejajarkan jadwal
          </button>
        </div>
      </div>

      {cycle ? (
        <div className="alert warn">
          Terdeteksi siklus ketergantungan: <strong>{cycle.join(' → ')}</strong>. Sisi pada
          siklus diabaikan saat penjadwalan.
        </div>
      ) : null}

      {state.tasks.length === 0 ? (
        <EmptyState
          title="Belum ada tugas"
          hint="Mulai dengan menambahkan tugas pertama atau muat ulang data contoh."
          action={
            <button className="btn btn-primary" onClick={() => setForm({ task: null })}>
              + Tugas baru
            </button>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="th-name">Tugas</th>
                <th>Mulai</th>
                <th>Selesai</th>
                <th className="num">Hari</th>
                <th>Prioritas</th>
                <th>Progres</th>
                <th>Tim</th>
                <th>Predecessor</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const task = row.task;
                const entry = schedule.entries[task.id];
                const isCritical = criticalSet.has(task.id);
                return (
                  <tr key={task.id} className={isCritical ? 'row-critical' : ''}>
                    <td className="th-name">
                      <div
                        className="task-cell"
                        style={{ paddingLeft: row.depth * 18 }}
                      >
                        <span
                          className="color-chip"
                          style={{ background: priorityColor(task.priority) }}
                        />
                        <span className="task-title">{task.name}</span>
                        {isCritical ? <span className="crit-tag">KRITIS</span> : null}
                        {row.isSummary ? <span className="muted-tag">induk</span> : null}
                        {task.pinned ? <span className="muted-tag">dikunci</span> : null}
                      </div>
                      {task.description ? (
                        <div
                          className="task-desc"
                          style={{ paddingLeft: row.depth * 18 + 16 }}
                        >
                          {task.description}
                        </div>
                      ) : null}
                    </td>
                    <td>{entry ? formatShortID(entry.startDate) : '—'}</td>
                    <td>{entry ? formatShortID(entry.endDate) : '—'}</td>
                    <td className="num">{entry ? entry.duration : '—'}</td>
                    <td>
                      <PriorityBadge priority={task.priority} />
                    </td>
                    <td>
                      <div className="progress-cell">
                        <ProgressBar value={task.progress} color={task.color} />
                        <span className="num">{task.progress}%</span>
                      </div>
                    </td>
                    <td>
                      <div className="avatar-stack">
                        {task.resourceIds.length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          task.resourceIds.map((rid) => {
                            const r = state.resources.find((res) => res.id === rid);
                            return r ? <Avatar key={rid} name={r.name} color={r.color} /> : null;
                          })
                        )}
                      </div>
                    </td>
                    <td className="th-dep">
                      {predecessorNames(task).length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        <div className="dep-tags">
                          {predecessorNames(task).map((p) => (
                            <span key={p.id} className="dep-tag">
                              {p.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="g-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          title="Tambah sub-tugas"
                          aria-label={`Tambah sub-tugas untuk ${task.name}`}
                          onClick={() => setForm({ task: null, parentId: task.id })}
                        >
                          ＋
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          title="Edit"
                          aria-label={`Edit ${task.name}`}
                          onClick={() => setForm({ task })}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          title="Hapus"
                          aria-label={`Hapus ${task.name}`}
                          onClick={() => remove(task)}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={9} className="muted center">
                    Tidak ada tugas yang cocok dengan filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="section-title">Semua ketergantungan</h3>
      {state.dependencies.length === 0 ? (
        <p className="hint">Belum ada hubungan antar tugas.</p>
      ) : (
        <div className="table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Predecessor</th>
                <th>Tipe</th>
                <th className="num">Lag (hari)</th>
                <th>Successor</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {state.dependencies.map((d) => {
                const a = state.tasks.find((t) => t.id === d.predecessorId);
                const b = state.tasks.find((t) => t.id === d.successorId);
                const link = schedule.links.find((l) => l.id === d.id);
                return (
                  <tr key={d.id}>
                    <td>{a?.name ?? '(hilang)'}</td>
                    <td>
                      <span className="dep-tag">{d.type === 'FS' ? 'Finish → Start' : 'Start → Start'}</span>
                    </td>
                    <td className="num">{d.lag}</td>
                    <td>{b?.name ?? '(hilang)'}</td>
                    <td>
                      {link?.critical ? (
                        <span className="badge crit">Kritis</span>
                      ) : (
                        <span className="badge">Normal</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="Hapus dependensi"
                        aria-label={`Hapus dependensi ${a?.name} ke ${b?.name}`}
                        onClick={() => dispatch({ type: 'delete-dependency', id: d.id })}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {form ? (
        <TaskForm
          task={form.task}
          defaultParentId={form.parentId ?? null}
          onClose={() => setForm(null)}
        />
      ) : null}
    </div>
  );
}
