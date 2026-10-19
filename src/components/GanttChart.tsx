import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Task } from '../types';
import { useApp } from '../store/store';
import { flattenTasks } from '../lib/taskTree';
import { timelineBounds } from '../lib/schedule';
import {
  addDays,
  diffDays,
  formatShortID,
  formatMonthID,
  monthEndISO,
  monthStartISO,
  dayOfWeek,
  todayISO,
  yearOf,
  monthOf,
} from '../lib/dates';
import {
  addWorkingDays,
  firstWorkingDayOnOrAfter,
  isWorkingDay,
  snapToWorkingDay,
  workingDaysInclusive,
} from '../lib/calendar';
import { TaskForm } from './TaskForm';
import { Avatar, PriorityBadge } from './ui';

export const ROW_H = 46;
const MONTH_H = 26;
const TIME_H = 26;
const HEADER_H = MONTH_H + TIME_H;

const DAY_WIDTHS = [44, 28, 16, 9, 5];
const ZOOM_LABELS = ['Sangat dekat', 'Dekat', 'Normal', 'Minggu', 'Bulan'];
const MAX_TIMELINE_DAYS = 4000;

type DragMode = 'move' | 'start' | 'end';

interface DragState {
  mode: DragMode;
  taskId: string;
  originX: number;
  startISO: string;
  endISO: string;
  duration: number;
  moved: boolean;
}

interface Preview {
  taskId: string;
  startISO: string;
  endISO: string;
  duration: number;
}

interface FormTarget {
  task: Task | null;
  parentId?: string | null;
}

interface MonthSeg {
  key: string;
  left: number;
  width: number;
  label: string;
}

interface TimeSeg {
  left: number;
  width: number;
  label: string;
  rest: boolean;
}

export function GanttChart() {
  const { state, dispatch, schedule, reflow } = useApp();
  const [zoom, setZoom] = useState(2);
  const [showCritical, setShowCritical] = useState(true);
  const [showLinks, setShowLinks] = useState(true);
  const [form, setForm] = useState<FormTarget | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const previewRef = useRef<Preview | null>(null);
  previewRef.current = preview;

  const dayWidth = DAY_WIDTHS[zoom];
  const rows = useMemo(() => flattenTasks(state.tasks), [state.tasks]);
  const rowIndex = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row, i) => map.set(row.task.id, i));
    return map;
  }, [rows]);

  const bounds = useMemo(
    () => timelineBounds(state, schedule, 3, 14),
    [state, schedule],
  );

  const totalDays = Math.min(MAX_TIMELINE_DAYS, diffDays(bounds.start, bounds.end) + 1);
  const timelineEnd = addDays(bounds.start, totalDays - 1);
  const timelineWidth = totalDays * dayWidth;
  const bodyHeight = Math.max(rows.length * ROW_H, 120);

  const x = useCallback(
    (date: string) => diffDays(bounds.start, date) * dayWidth,
    [bounds.start, dayWidth],
  );

  const months = useMemo<MonthSeg[]>(() => {
    const list: MonthSeg[] = [];
    let y = yearOf(bounds.start);
    let m = monthOf(bounds.start);
    const endY = yearOf(timelineEnd);
    const endM = monthOf(timelineEnd);
    let guard = 0;
    while ((y < endY || (y === endY && m <= endM)) && guard < 600) {
      guard += 1;
      const mStart = monthStartISO(y, m);
      const mEnd = monthEndISO(y, m);
      const from = mStart > bounds.start ? mStart : bounds.start;
      const to = mEnd < timelineEnd ? mEnd : timelineEnd;
      list.push({
        key: `${y}-${m}`,
        left: diffDays(bounds.start, from) * dayWidth,
        width: (diffDays(from, to) + 1) * dayWidth,
        label: formatMonthID(mStart),
      });
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return list;
  }, [bounds.start, timelineEnd, dayWidth]);

  const showDays = dayWidth >= 16;
  const showWeeks = !showDays && dayWidth >= 8;

  const dayCells = useMemo(() => {
    if (!showDays) return [];
    const cells: { left: number; width: number; label: number; rest: boolean }[] = [];
    for (let i = 0; i < totalDays; i += 1) {
      const date = addDays(bounds.start, i);
      cells.push({
        left: i * dayWidth,
        width: dayWidth,
        label: Number(date.slice(8, 10)),
        rest: !isWorkingDay(date, state.calendar),
      });
    }
    return cells;
  }, [showDays, totalDays, bounds.start, dayWidth, state.calendar]);

  const weekCells = useMemo<TimeSeg[]>(() => {
    if (!showWeeks) return [];
    const list: TimeSeg[] = [];
    let segStart = 0;
    for (let i = 1; i <= totalDays; i += 1) {
      const boundary = i < totalDays && dayOfWeek(addDays(bounds.start, i)) !== 1;
      if (boundary) continue;
      const fromDate = addDays(bounds.start, segStart);
      list.push({
        left: segStart * dayWidth,
        width: (i - segStart) * dayWidth,
        label: formatShortID(fromDate),
        rest: false,
      });
      segStart = i;
    }
    return list;
  }, [showWeeks, totalDays, bounds.start, dayWidth]);

  const offDays = useMemo(() => {
    const list: { left: number }[] = [];
    for (let i = 0; i < totalDays; i += 1) {
      const date = addDays(bounds.start, i);
      if (!isWorkingDay(date, state.calendar)) list.push({ left: i * dayWidth });
    }
    return list;
  }, [totalDays, bounds.start, dayWidth, state.calendar]);

  const today = todayISO();
  const todayLeft = today >= bounds.start && today <= timelineEnd ? x(today) : null;

  /** Posisi bar sesuai pratinjau drag bila sedang digeser. */
  const barGeometry = (task: Task) => {
    const entry = schedule.entries[task.id];
    if (!entry) return null;
    const isPreview = preview?.taskId === task.id;
    const startISO = isPreview ? (preview?.startISO ?? entry.startDate) : entry.startDate;
    const endISO = isPreview ? (preview?.endISO ?? entry.endDate) : entry.endDate;
    const duration = isPreview ? (preview?.duration ?? entry.duration) : entry.duration;
    const left = x(startISO);
    const width = Math.max(dayWidth, (diffDays(startISO, endISO) + 1) * dayWidth);
    return { entry, startISO, endISO, duration, left, width, isPreview: Boolean(isPreview) };
  };

  const scrollToToday = () => {
    const el = scrollRef.current;
    if (!el) return;
    const left = x(today) - el.clientWidth * 0.35;
    el.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = 0;
  }, []);

  const commit = useCallback(() => {
    const drag = dragRef.current;
    const result = previewRef.current;
    dragRef.current = null;
    setPreview(null);
    if (!drag) return;

    if (!drag.moved) {
      const target = state.tasks.find((t) => t.id === drag.taskId);
      if (target) setForm({ task: target });
      return;
    }
    if (!result) return;

    const task = state.tasks.find((t) => t.id === drag.taskId);
    const hasPredecessors = state.dependencies.some((d) => d.successorId === drag.taskId);
    dispatch({
      type: 'update-task',
      id: drag.taskId,
      patch: {
        startDate: result.startISO,
        duration: result.duration,
        pinned: hasPredecessors ? true : (task?.pinned ?? false),
      },
    });
  }, [dispatch, state.dependencies, state.tasks]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.originX;
      if (!drag.moved && Math.abs(dx) < 3) return;
      drag.moved = true;

      const direction: 0 | 1 | -1 = dx > 0 ? 1 : dx < 0 ? -1 : 0;
      const delta = Math.round(dx / dayWidth);
      const cal = state.calendar;

      if (drag.mode === 'move') {
        const target = addDays(drag.startISO, delta);
        const startISO = snapToWorkingDay(target, cal, direction);
        const endISO = addWorkingDays(startISO, drag.duration - 1, cal);
        setPreview({ taskId: drag.taskId, startISO, endISO, duration: drag.duration });
        return;
      }

      if (drag.mode === 'end') {
        const anchor = firstWorkingDayOnOrAfter(drag.startISO, cal);
        const target = snapToWorkingDay(addDays(drag.endISO, delta), cal, direction);
        const endISO = target < anchor ? anchor : target;
        const duration = Math.max(1, workingDaysInclusive(anchor, endISO, cal));
        setPreview({
          taskId: drag.taskId,
          startISO: anchor,
          endISO: addWorkingDays(anchor, duration - 1, cal),
          duration,
        });
        return;
      }

      const anchor = drag.endISO;
      let rawStart = snapToWorkingDay(addDays(drag.startISO, delta), cal, direction);
      if (rawStart > anchor) rawStart = anchor;
      const startISO = firstWorkingDayOnOrAfter(rawStart, cal);
      const duration = Math.max(1, workingDaysInclusive(startISO, anchor, cal));
      setPreview({
        taskId: drag.taskId,
        startISO,
        endISO: anchor,
        duration,
      });
    };

    const onUp = () => commit();

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [commit, dayWidth, state.calendar]);

  const startDrag = (
    event: React.PointerEvent,
    task: Task,
    mode: DragMode,
    geometry: { startISO: string; endISO: string; duration: number },
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      mode,
      taskId: task.id,
      originX: event.clientX,
      startISO: geometry.startISO,
      endISO: geometry.endISO,
      duration: geometry.duration,
      moved: false,
    };
  };

  const removeTask = (task: Task) => {
    const children = state.tasks.filter((t) => t.parentId === task.id).length;
    const message = children
      ? `Hapus "${task.name}" beserta ${children} sub-tugas di dalamnya?`
      : `Hapus tugas "${task.name}"?`;
    if (window.confirm(message)) dispatch({ type: 'delete-task', id: task.id });
  };

  const arrows = useMemo(() => {
    if (!showLinks) return [];
    const result: {
      id: string;
      d: string;
      label?: string;
      critical: boolean;
      labelX: number;
      labelY: number;
    }[] = [];
    for (const link of schedule.links) {
      const fromIdx = rowIndex.get(link.predecessorId);
      const toIdx = rowIndex.get(link.successorId);
      if (fromIdx === undefined || toIdx === undefined) continue;
      const fromY = fromIdx * ROW_H + ROW_H / 2;
      const toY = toIdx * ROW_H + ROW_H / 2;
      let d: string;
      let labelX = 0;
      let labelY = toY - 5;
      let label: string | undefined;

      if (link.type === 'FS') {
        const rightEdge = x(link.fromEnd ? schedule.cal.date(link.fromEnd) : bounds.start) + dayWidth;
        const outX = rightEdge + 10;
        const targetX = x(schedule.cal.date(link.toStart)) - 5;
        d = `M ${rightEdge} ${fromY} H ${outX} V ${toY} H ${targetX}`;
        const mid = (outX + targetX) / 2;
        labelX = mid;
        if (targetX - outX > 34) label = link.lag !== 0 ? `FS+${link.lag}` : 'FS';
      } else {
        const leftEdge = x(schedule.cal.date(link.fromStart));
        const outX = leftEdge - 10;
        const targetX = x(schedule.cal.date(link.toStart)) - 5;
        d = `M ${leftEdge} ${fromY} H ${outX} V ${toY} H ${targetX}`;
        const mid = (outX + targetX) / 2;
        labelX = mid;
        if (Math.abs(targetX - outX) > 34) label = link.lag !== 0 ? `SS+${link.lag}` : 'SS';
      }
      result.push({
        id: link.id,
        d,
        label,
        critical: link.critical,
        labelX,
        labelY,
      });
    }
    return result;
  }, [showLinks, schedule, rowIndex, x, dayWidth, bounds.start]);

  const criticalSet = useMemo(() => new Set(schedule.criticalIds), [schedule.criticalIds]);

  return (
    <div className="panel">
      <div className="toolbar">
        <div className="toolbar-group">
          <button className="btn btn-primary" onClick={() => setForm({ task: null })}>
            + Tugas baru
          </button>
          <button className="btn" onClick={reflow} title="Samakan semua tanggal mulai dengan hasil penjadwalan otomatis">
            Sejajarkan jadwal
          </button>
        </div>

        <div className="toolbar-group">
          <label className="toggle">
            <input
              type="checkbox"
              checked={showCritical}
              onChange={(e) => setShowCritical(e.target.checked)}
            />
            <span>Jalur kritis</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showLinks}
              onChange={(e) => setShowLinks(e.target.checked)}
            />
            <span>Ketergantungan</span>
          </label>
        </div>

        <div className="toolbar-group">
          <button className="btn" onClick={scrollToToday}>
            Hari ini
          </button>
          <div className="zoom">
            <button
              className="icon-btn"
              onClick={() => setZoom((z) => Math.min(DAY_WIDTHS.length - 1, z + 1))}
              aria-label="Perkecil"
              title="Perkecil"
            >
              −
            </button>
            <span className="zoom-label">{ZOOM_LABELS[zoom]}</span>
            <button
              className="icon-btn"
              onClick={() => setZoom((z) => Math.max(0, z - 1))}
              aria-label="Perbesar"
              title="Perbesar"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="stat-strip">
        <span>
          <strong>Mulai</strong> {formatShortID(schedule.projectStart)}
        </span>
        <span>
          <strong>Selesai</strong> {formatShortID(schedule.projectEnd)}
        </span>
        <span>
          <strong>Durasi</strong> {schedule.projectDuration} hari kerja
        </span>
        <span>
          <strong>Kritis</strong> {schedule.criticalPath.length} tugas
        </span>
        <span>
          <strong>Tugas</strong> {state.tasks.length}
        </span>
        {schedule.hasCycle ? <span className="warn-chip">Ada siklus dependensi</span> : null}
      </div>

      <div className="gantt-scroll" ref={scrollRef}>
        <div className="gantt-grid">
          <div className="gantt-left">
            <div className="gantt-left-head" style={{ height: HEADER_H }}>
              <div className="g-col-name">Tugas</div>
              <div className="g-col-start">Mulai</div>
              <div className="g-col-end">Selesai</div>
              <div className="g-col-dur">Hari</div>
              <div className="g-col-prio">Prioritas</div>
              <div className="g-col-act">Aksi</div>
            </div>

            <div className="gantt-left-body">
              {rows.length === 0 ? (
                <div className="gantt-empty">
                  Belum ada tugas. Klik “Tugas baru” untuk memulai.
                </div>
              ) : (
                rows.map((row) => {
                  const entry = schedule.entries[row.task.id];
                  return (
                    <div className="g-row" key={row.task.id} style={{ height: ROW_H }}>
                      <div
                        className="g-col-name g-cell-name"
                        style={{ paddingLeft: 8 + row.depth * 16 }}
                        onClick={() => setForm({ task: row.task })}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') setForm({ task: row.task });
                        }}
                        title={row.task.description || row.task.name}
                      >
                        {row.hasChildren ? (
                          <button
                            type="button"
                            className="chevron"
                            aria-label="Buka/tutup sub-tugas"
                            onClick={(e) => {
                              e.stopPropagation();
                              dispatch({ type: 'toggle-collapse', id: row.task.id });
                            }}
                          >
                            {row.collapsed ? '▸' : '▾'}
                          </button>
                        ) : (
                          <span className="chevron placeholder" />
                        )}
                        <span
                          className="color-chip"
                          style={{ background: row.task.color }}
                          title={`Warna: ${row.task.color}`}
                        />
                        <span className="g-task-name">{row.task.name}</span>
                        {entry?.critical && showCritical ? (
                          <span className="crit-dot" title="Jalur kritis" />
                        ) : null}
                        <span className="g-avatars">
                          {row.task.resourceIds.slice(0, 3).map((rid) => {
                            const r = state.resources.find((res) => res.id === rid);
                            if (!r) return null;
                            return <Avatar key={rid} name={r.name} color={r.color} />;
                          })}
                        </span>
                      </div>
                      <div className="g-col-start g-cell">
                        {entry ? formatShortID(entry.startDate) : '—'}
                      </div>
                      <div className="g-col-end g-cell">
                        {entry ? formatShortID(entry.endDate) : '—'}
                      </div>
                      <div className="g-col-dur g-cell num">
                        {entry ? entry.duration : '—'}
                      </div>
                      <div className="g-col-prio g-cell">
                        <PriorityBadge priority={row.task.priority} />
                      </div>
                      <div className="g-col-act g-cell g-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          title="Tambah sub-tugas"
                          aria-label={`Tambah sub-tugas untuk ${row.task.name}`}
                          onClick={() => setForm({ task: null, parentId: row.task.id })}
                        >
                          ＋
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          title="Edit tugas"
                          aria-label={`Edit ${row.task.name}`}
                          onClick={() => setForm({ task: row.task })}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          title="Hapus tugas"
                          aria-label={`Hapus ${row.task.name}`}
                          onClick={() => removeTask(row.task)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="gantt-right" style={{ width: timelineWidth }}>
            <div className="gantt-time-head" style={{ height: HEADER_H }}>
              <div className="month-row" style={{ height: MONTH_H }}>
                {months.map((m) => (
                  <div
                    key={m.key}
                    className="month-seg"
                    style={{ left: m.left, width: m.width }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
              <div className="time-row" style={{ height: TIME_H }}>
                {showDays
                  ? dayCells.map((c, i) => (
                      <div
                        key={i}
                        className={c.rest ? 'day-seg rest' : 'day-seg'}
                        style={{ left: c.left, width: c.width }}
                      >
                        {dayWidth >= 16 ? c.label : ''}
                      </div>
                    ))
                  : weekCells.map((c, i) => (
                      <div
                        key={i}
                        className="week-seg"
                        style={{ left: c.left, width: c.width }}
                      >
                        {c.label}
                      </div>
                    ))}
              </div>
            </div>

            <div
              className="gantt-canvas"
              style={{
                height: bodyHeight,
                width: timelineWidth,
                backgroundSize: `${dayWidth}px 100%`,
              }}
            >
              {offDays.map((d, i) => (
                <div
                  key={i}
                  className="offday"
                  style={{ left: d.left, width: dayWidth }}
                />
              ))}

              {months.map((m) => (
                <div
                  key={`line-${m.key}`}
                  className="month-line"
                  style={{ left: m.left }}
                />
              ))}

              {todayLeft !== null ? (
                <div className="today-line" style={{ left: todayLeft }}>
                  <span className="today-flag">Hari ini</span>
                </div>
              ) : null}

              {rows.map((row, index) => {
                const task = row.task;
                const geometry = barGeometry(task);
                if (!geometry) return null;
                const isDragged = preview?.taskId === task.id;
                const isCritical = showCritical && criticalSet.has(task.id);
                const top = index * ROW_H;
                const rangeLabel = `${formatShortID(geometry.startISO)} → ${formatShortID(
                  geometry.endISO,
                )} • ${geometry.duration} hari kerja`;

                if (row.isSummary) {
                  return (
                    <div
                      key={task.id}
                      className={`summary-bar ${isCritical ? 'critical' : ''}`}
                      style={{
                        left: geometry.left,
                        top: top + 6,
                        width: geometry.width,
                        height: ROW_H - 14,
                      }}
                      title={`${task.name} (tugas induk — mengikuti sub-tugas) • ${rangeLabel}`}
                    />
                  );
                }

                return (
                  <div
                    key={task.id}
                    className={`bar-wrap ${isDragged ? 'dragging' : ''} ${
                      isCritical ? 'critical' : ''
                    }`}
                    style={{
                      left: geometry.left,
                      top: top + 9,
                      width: geometry.width,
                      height: ROW_H - 22,
                      background: task.color,
                    }}
                    onPointerDown={(e) =>
                      startDrag(e, task, 'move', {
                        startISO: geometry.startISO,
                        endISO: geometry.endISO,
                        duration: geometry.duration,
                      })
                    }
                    title={`${task.name} • ${rangeLabel}`}
                  >
                    <div className="bar-progress" style={{ width: `${task.progress}%` }} />
                    <span className="bar-label">{task.name}</span>
                    <span
                      className="handle handle-start"
                      onPointerDown={(e) =>
                        startDrag(e, task, 'start', {
                          startISO: geometry.startISO,
                          endISO: geometry.endISO,
                          duration: geometry.duration,
                        })
                      }
                    />
                    <span
                      className="handle handle-end"
                      onPointerDown={(e) =>
                        startDrag(e, task, 'end', {
                          startISO: geometry.startISO,
                          endISO: geometry.endISO,
                          duration: geometry.duration,
                        })
                      }
                    />
                  </div>
                );
              })}

              <svg className="gantt-arrows" width={timelineWidth} height={bodyHeight}>
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="7"
                    markerHeight="7"
                    refX="6"
                    refY="3.5"
                    orient="auto"
                  >
                    <path d="M0,0 L7,3.5 L0,7 z" fill="#8b9bb0" />
                  </marker>
                  <marker
                    id="arrowhead-critical"
                    markerWidth="7"
                    markerHeight="7"
                    refX="6"
                    refY="3.5"
                    orient="auto"
                  >
                    <path d="M0,0 L7,3.5 L0,7 z" fill="#e0525f" />
                  </marker>
                </defs>
                {arrows.map((a) => (
                  <g key={a.id}>
                    <path
                      d={a.d}
                      fill="none"
                      stroke={a.critical ? '#e0525f' : '#8b9bb0'}
                      strokeWidth={a.critical ? 1.8 : 1.3}
                      markerEnd={`url(#${a.critical ? 'arrowhead-critical' : 'arrowhead'})`}
                    />
                    {a.label ? (
                      <text
                        x={a.labelX}
                        y={a.labelY}
                        className="arrow-label"
                        fill={a.critical ? '#e0525f' : '#7b8ba0'}
                      >
                        {a.label}
                      </text>
                    ) : null}
                  </g>
                ))}
              </svg>
            </div>
          </div>
        </div>
      </div>

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
