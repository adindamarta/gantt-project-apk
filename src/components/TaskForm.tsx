import { useMemo, useState, type FormEvent } from 'react';
import type { Dependency, DependencyType, Priority, Task } from '../types';
import { PRIORITIES } from '../types';
import { useApp } from '../store/store';
import { uid } from '../data/seed';
import { TASK_COLORS, PRIORITY_LABEL_ID, priorityColor } from '../lib/color';
import { isAncestor, parentOptions } from '../lib/taskTree';
import { findCycle } from '../lib/dependencies';
import { todayISO } from '../lib/dates';
import { firstWorkingDayOnOrAfter } from '../lib/calendar';
import { Modal } from './ui';

interface Props {
  task: Task | null;
  defaultParentId?: string | null;
  onClose: () => void;
}

interface DraftDep {
  key: string;
  existingId: string | null;
  predecessorId: string;
  type: DependencyType;
  lag: number;
}

export function TaskForm({ task, defaultParentId = null, onClose }: Props) {
  const { state, dispatch, schedule } = useApp();
  const isNew = task === null;

  const existingDeps = useMemo(
    () => (task ? state.dependencies.filter((d) => d.successorId === task.id) : []),
    [state.dependencies, task],
  );

  const [name, setName] = useState(task?.name ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [duration, setDuration] = useState(String(task?.duration ?? 3));
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'Medium');
  const [color, setColor] = useState(task?.color ?? TASK_COLORS[0]);
  const [parentId, setParentId] = useState<string>(task?.parentId ?? defaultParentId ?? '');
  const [progress, setProgress] = useState(String(task?.progress ?? 0));
  const [resourceIds, setResourceIds] = useState<string[]>(task?.resourceIds ?? []);
  const [pinned, setPinned] = useState(task?.pinned ?? false);
  const [optimistic, setOptimistic] = useState(task?.optimistic?.toString() ?? '');
  const [mostLikely, setMostLikely] = useState(task?.mostLikely?.toString() ?? '');
  const [pessimistic, setPessimistic] = useState(task?.pessimistic?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);

  const scheduledStart = task ? schedule.entries[task.id]?.startDate : undefined;
  const defaultStart = firstWorkingDayOnOrAfter(todayISO(), state.calendar);
  const [manualStart, setManualStart] = useState(task?.startDate ?? defaultStart);

  const [draftDeps, setDraftDeps] = useState<DraftDep[]>(() =>
    existingDeps.map((d) => ({
      key: d.id,
      existingId: d.id,
      predecessorId: d.predecessorId,
      type: d.type,
      lag: d.lag,
    })),
  );

  const usedPredecessors = new Set(draftDeps.map((d) => d.predecessorId).filter(Boolean));

  const predecessorOptions = useMemo(
    () =>
      state.tasks.filter(
        (t) =>
          t.id !== task?.id &&
          !(task && isAncestor(state.tasks, task.id, t.id)) &&
          !usedPredecessors.has(t.id),
      ),
    [state.tasks, task, usedPredecessors],
  );

  const parents = useMemo(() => parentOptions(state, task), [state, task]);

  const autoScheduled = !pinned && draftDeps.some((d) => d.predecessorId);
  const effectiveStart =
    autoScheduled && scheduledStart ? scheduledStart : manualStart;

  const toggleResource = (id: string) => {
    setResourceIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  };

  const addDepRow = () => {
    const candidate = predecessorOptions[0];
    if (!candidate) return;
    setDraftDeps((prev) => [
      ...prev,
      { key: uid('draft'), existingId: null, predecessorId: candidate.id, type: 'FS', lag: 0 },
    ]);
  };

  const updateDepRow = (key: string, patch: Partial<DraftDep>) => {
    setDraftDeps((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const removeDepRow = (key: string) => {
    setDraftDeps((prev) => prev.filter((d) => d.key !== key));
  };

  const validate = (): string | null => {
    if (!name.trim()) return 'Nama tugas wajib diisi.';

    const dur = Math.round(Number(duration));
    if (!Number.isFinite(dur) || dur < 1) return 'Durasi minimal 1 hari kerja.';

    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveStart)) {
      return 'Tanggal mulai tidak valid.';
    }

    const successorId = task?.id ?? '__new__';
    for (const row of draftDeps) {
      if (!row.predecessorId) return 'Predecessor belum dipilih.';
      if (row.predecessorId === successorId) {
        return 'Tugas tidak boleh bergantung pada dirinya sendiri.';
      }
    }

    for (let i = 0; i < draftDeps.length; i += 1) {
      for (let j = i + 1; j < draftDeps.length; j += 1) {
        const a = draftDeps[i];
        const b = draftDeps[j];
        if (a.predecessorId === b.predecessorId && a.type === b.type && a.predecessorId) {
          return 'Terdapat predecessor duplikat dengan tipe yang sama.';
        }
      }
    }

    const hypothetical: Dependency[] = [
      ...state.dependencies.filter((d) => d.successorId !== successorId),
      ...draftDeps
        .filter((d) => d.predecessorId)
        .map((d) => ({
          id: d.key,
          predecessorId: d.predecessorId,
          successorId,
          type: d.type,
          lag: d.lag,
        })),
    ];
    if (findCycle(hypothetical)) {
      return 'Ketergantungan tersebut membentuk siklus. Ubah hubungan lain terlebih dahulu.';
    }

    return null;
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    const pct = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
    const parseNumber = (value: string): number | undefined => {
      if (value.trim() === '') return undefined;
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 ? n : undefined;
    };

    const nextTask: Task = {
      id: task?.id ?? uid('task'),
      name: name.trim(),
      description: description.trim(),
      startDate: effectiveStart,
      duration: Math.round(Number(duration)),
      priority,
      color,
      parentId: parentId === '' ? null : parentId,
      progress: pct,
      resourceIds,
      pinned,
      optimistic: parseNumber(optimistic),
      mostLikely: parseNumber(mostLikely),
      pessimistic: parseNumber(pessimistic),
    };

    if (isNew) {
      dispatch({ type: 'add-task', task: nextTask });
      for (const row of draftDeps) {
        if (!row.predecessorId) continue;
        dispatch({
          type: 'add-dependency',
          dependency: {
            id: uid('dep'),
            predecessorId: row.predecessorId,
            successorId: nextTask.id,
            type: row.type,
            lag: row.lag,
          },
        });
      }
      onClose();
      return;
    }

    dispatch({ type: 'update-task', id: task.id, patch: nextTask });

    const keep = new Set<string>();
    for (const row of draftDeps) {
      if (!row.predecessorId) continue;
      if (row.existingId) {
        keep.add(row.existingId);
        dispatch({
          type: 'update-dependency',
          id: row.existingId,
          patch: { predecessorId: row.predecessorId, type: row.type, lag: row.lag },
        });
      } else {
        const id = uid('dep');
        keep.add(id);
        dispatch({
          type: 'add-dependency',
          dependency: {
            id,
            predecessorId: row.predecessorId,
            successorId: task.id,
            type: row.type,
            lag: row.lag,
          },
        });
      }
    }
    for (const dep of existingDeps) {
      if (!keep.has(dep.id)) dispatch({ type: 'delete-dependency', id: dep.id });
    }

    onClose();
  };

  return (
    <Modal title={isNew ? 'Tambah Tugas' : 'Edit Tugas'} onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <div className="field field-full">
          <label htmlFor="task-name">Nama tugas</label>
          <input
            id="task-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="mis. Susun kontrak vendor"
            autoFocus
          />
        </div>

        <div className="field field-full">
          <label htmlFor="task-desc">Deskripsi</label>
          <textarea
            id="task-desc"
            value={description}
            rows={2}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detail singkat tentang tugas ini"
          />
        </div>

        <div className="field">
          <label htmlFor="task-duration">Durasi (hari kerja)</label>
          <input
            id="task-duration"
            type="number"
            min={1}
            max={5000}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="task-start">Tanggal mulai</label>
          <input
            id="task-start"
            type="date"
            value={effectiveStart}
            disabled={autoScheduled}
            onChange={(e) => setManualStart(e.target.value)}
          />
          {autoScheduled ? (
            <small className="hint">
              Dijadwalkan otomatis dari predecessor. Centang “kunci” untuk mengatur manual.
            </small>
          ) : null}
        </div>

        <div className="field field-full">
          <label className="check-line">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => {
                if (e.target.checked) setManualStart(scheduledStart ?? effectiveStart);
                setPinned(e.target.checked);
              }}
            />
            <span>Kunci tanggal mulai (posisi manual, tidak ikut otomatis)</span>
          </label>
        </div>

        <div className="field">
          <label>Prioritas</label>
          <div className="segmented">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                className={p === priority ? 'seg active' : 'seg'}
                style={p === priority ? { background: priorityColor(p) } : undefined}
                onClick={() => setPriority(p)}
              >
                {PRIORITY_LABEL_ID[p]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Warna indikator</label>
          <div className="swatches">
            {TASK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={c === color ? 'swatch active' : 'swatch'}
                style={{ background: c }}
                aria-label={`Pilih warna ${c}`}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="task-parent">Tugas induk (sub-tugas)</label>
          <select id="task-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— Tugas utama —</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="task-progress">Progres (%)</label>
          <input
            id="task-progress"
            type="number"
            min={0}
            max={100}
            value={progress}
            onChange={(e) => setProgress(e.target.value)}
          />
        </div>

        <div className="field field-full">
          <label>Anggota tim yang dialokasikan</label>
          {state.resources.length === 0 ? (
            <p className="hint">Belum ada anggota tim. Tambahkan lewat tab “Tim”.</p>
          ) : (
            <div className="chip-list">
              {state.resources.map((r) => (
                <label
                  key={r.id}
                  className={resourceIds.includes(r.id) ? 'chip active' : 'chip'}
                >
                  <input
                    type="checkbox"
                    checked={resourceIds.includes(r.id)}
                    onChange={() => toggleResource(r.id)}
                  />
                  <span className="chip-dot" style={{ background: r.color }} />
                  {r.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <fieldset className="field field-full fieldset">
          <legend>Estimasi PERT (hari kerja)</legend>
          <div className="grid-3">
            <div className="field">
              <label htmlFor="task-opt">Optimis (O)</label>
              <input
                id="task-opt"
                type="number"
                min={0}
                value={optimistic}
                placeholder={duration}
                onChange={(e) => setOptimistic(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="task-ml">Paling mungkin (M)</label>
              <input
                id="task-ml"
                type="number"
                min={0}
                value={mostLikely}
                placeholder={duration}
                onChange={(e) => setMostLikely(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="task-pes">Pesimis (P)</label>
              <input
                id="task-pes"
                type="number"
                min={0}
                value={pessimistic}
                placeholder={duration}
                onChange={(e) => setPessimistic(e.target.value)}
              />
            </div>
          </div>
          <small className="hint">Kosongkan untuk memakai durasi sebagai nilai default.</small>
        </fieldset>

        <fieldset className="field field-full fieldset">
          <legend>Predecessor &amp; hubungan</legend>
          {draftDeps.length === 0 ? (
            <p className="hint">Tugas ini tidak bergantung pada tugas lain.</p>
          ) : (
            <div className="dep-rows">
              {draftDeps.map((row) => (
                <div className="dep-row" key={row.key}>
                  <select
                    aria-label="Predecessor"
                    value={row.predecessorId}
                    onChange={(e) => updateDepRow(row.key, { predecessorId: e.target.value })}
                  >
                    <option value="">— pilih tugas —</option>
                    {[...predecessorOptions, ...state.tasks.filter(
                      (t) => t.id === row.predecessorId,
                    )].map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Tipe hubungan"
                    value={row.type}
                    onChange={(e) =>
                      updateDepRow(row.key, { type: e.target.value as DependencyType })
                    }
                  >
                    <option value="FS">Finish-to-Start (FS)</option>
                    <option value="SS">Start-to-Start (SS)</option>
                  </select>
                  <label className="lag-input">
                    <span>Lag (hari)</span>
                    <input
                      type="number"
                      value={row.lag}
                      onChange={(e) =>
                        updateDepRow(row.key, { lag: Math.round(Number(e.target.value) || 0) })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-btn danger"
                    onClick={() => removeDepRow(row.key)}
                    aria-label="Hapus predecessor"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={addDepRow}
            disabled={predecessorOptions.length === 0}
          >
            + Tambah predecessor
          </button>
        </fieldset>

        {error ? <p className="form-error field-full">{error}</p> : null}

        <div className="modal-actions field-full">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary">
            {isNew ? 'Tambah' : 'Simpan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
