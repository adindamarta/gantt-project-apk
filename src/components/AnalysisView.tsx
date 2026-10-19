import { useMemo, useState } from 'react';
import { useApp } from '../store/store';
import { flattenTasks } from '../lib/taskTree';
import { pertForTask } from '../lib/schedule';
import { formatNumberID, formatShortID } from '../lib/dates';
import { EmptyState } from './ui';

const NODE_W = 118;
const NODE_H = 64;
const COL_GAP = 64;
const ROW_GAP = 24;

interface NodePos {
  x: number;
  y: number;
}

export function AnalysisView() {
  const { state, schedule } = useApp();
  const [showPert, setShowPert] = useState(false);

  const criticalSet = useMemo(() => new Set(schedule.criticalIds), [schedule.criticalIds]);
  const rows = useMemo(() => flattenTasks(state.tasks), [state.tasks]);

  const pathIds = useMemo(() => new Set(schedule.criticalPath), [schedule.criticalPath]);

  const pertRows = useMemo(
    () => rows.filter((row) => !row.isSummary).map((row) => ({ row, pert: pertForTask(row.task) })),
    [rows],
  );

  const totalPertVariance = pertRows.reduce((sum, r) => sum + r.pert.variance, 0);

  /** Layout jaring PERT: kolom = kedalaman topologi, baris = urutan ketergantungan. */
  const nodeLayout = useMemo(() => {
    const visibleIds = new Set(rows.map((r) => r.task.id));
    const deps = state.dependencies.filter(
      (d) => visibleIds.has(d.predecessorId) && visibleIds.has(d.successorId),
    );
    const predsOf = (id: string) => deps.filter((d) => d.successorId === id);

    const colOf = new Map<string, number>();
    const computeCol = (id: string, seen: Set<string>): number => {
      const memo = colOf.get(id);
      if (memo !== undefined) return memo;
      if (seen.has(id)) return 0;
      seen.add(id);
      let col = 0;
      for (const p of predsOf(id)) {
        col = Math.max(col, computeCol(p.predecessorId, seen) + 1);
      }
      colOf.set(id, col);
      return col;
    };
    for (const row of rows) computeCol(row.task.id, new Set());

    const ordered = rows
      .map((row) => ({ row, entry: schedule.entries[row.task.id] }))
      .filter((item) => Boolean(item.entry))
      .sort((a, b) => (a.entry?.es ?? 0) - (b.entry?.es ?? 0) || a.row.task.name.localeCompare(b.row.task.name));

    const laneCount = new Map<number, number>();
    const positions = new Map<string, NodePos>();
    for (const { row } of ordered) {
      const col = colOf.get(row.task.id) ?? 0;
      const lane = laneCount.get(col) ?? 0;
      laneCount.set(col, lane + 1);
      positions.set(row.task.id, {
        x: col * (NODE_W + COL_GAP) + 20,
        y: lane * (NODE_H + ROW_GAP) + 20,
      });
    }

    const maxX = Math.max(0, ...[...positions.values()].map((p) => p.x));
    const maxY = Math.max(0, ...[...positions.values()].map((p) => p.y));
    return {
      deps,
      ordered,
      positions,
      width: maxX + NODE_W + 40,
      height: maxY + NODE_H + 40,
    };
  }, [rows, schedule.entries, state.dependencies]);

  const criticalDuration = schedule.criticalPath.reduce((sum, id) => {
    const entry = schedule.entries[id];
    return sum + (entry ? entry.duration : 0);
  }, 0);

  if (state.tasks.length === 0) {
    return (
      <div className="panel">
        <EmptyState
          title="Belum ada data untuk dianalisis"
          hint="Tambahkan tugas terlebih dahulu."
        />
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="toolbar">
        <div className="toolbar-group">
          <div className="segmented">
            <button
              type="button"
              className={!showPert ? 'seg active' : 'seg'}
              onClick={() => setShowPert(false)}
            >
              Jalur kritis
            </button>
            <button
              type="button"
              className={showPert ? 'seg active' : 'seg'}
              onClick={() => setShowPert(true)}
            >
              Diagram PERT
            </button>
          </div>
        </div>
        <div className="toolbar-group">
          <span className="muted">
            Durasi proyek {schedule.projectDuration} hari kerja • jalur kritis{' '}
            {schedule.criticalPath.length} tugas
          </span>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <span className="kpi-value">{schedule.projectDuration}</span>
          <span className="kpi-label">Hari kerja terjadwal</span>
        </div>
        <div className="kpi">
          <span className="kpi-value">{schedule.criticalPath.length}</span>
          <span className="kpi-label">Tugas pada jalur kritis</span>
        </div>
        <div className="kpi">
          <span className="kpi-value">{criticalDuration}</span>
          <span className="kpi-label">Panjang jalur kritis</span>
        </div>
        <div className="kpi">
          <span className="kpi-value">{formatNumberID(schedule.pert.expected)}</span>
          <span className="kpi-label">Ekspektasi PERT (hari)</span>
        </div>
        <div className="kpi">
          <span className="kpi-value">{schedule.pert.sd.toFixed(2)}</span>
          <span className="kpi-label">Deviasi standar jalur kritis</span>
        </div>
      </div>

      {!showPert ? (
        <>
          <h3 className="section-title">Rantai jalur kritis</h3>
          {schedule.criticalPath.length === 0 ? (
            <p className="hint">Tidak ada jalur kritis saat ini.</p>
          ) : (
            <ol className="critical-chain">
              {schedule.criticalPath.map((id) => {
                const entry = schedule.entries[id];
                const task = state.tasks.find((t) => t.id === id);
                if (!task || !entry) return null;
                return (
                  <li key={id} className="chain-node">
                    <span className="chain-index">
                      {schedule.criticalPath.indexOf(id) + 1}
                    </span>
                    <div>
                      <span className="chain-name">{task.name}</span>
                      <span className="chain-meta">
                        {formatShortID(entry.startDate)} → {formatShortID(entry.endDate)} •{' '}
                        {entry.duration} hari kerja • float {entry.float}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <h3 className="section-title">Semua tugas, ES/EF/LS/LF &amp; total float</h3>
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Tugas</th>
                  <th>Mulai</th>
                  <th>Selesai</th>
                  <th className="num">Durasi</th>
                  <th className="num">ES</th>
                  <th className="num">EF</th>
                  <th className="num">LS</th>
                  <th className="num">LF</th>
                  <th className="num">Float</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const entry = schedule.entries[row.task.id];
                  if (!entry) return null;
                  const critical = criticalSet.has(row.task.id);
                  const onPath = pathIds.has(row.task.id);
                  return (
                    <tr key={row.task.id} className={critical ? 'row-critical' : ''}>
                      <td style={{ paddingLeft: 8 + row.depth * 16 }}>
                        <span className="color-chip" style={{ background: row.task.color }} />
                        {row.task.name}
                        {onPath ? <span className="crit-tag">jalur</span> : null}
                      </td>
                      <td>{formatShortID(entry.startDate)}</td>
                      <td>{formatShortID(entry.endDate)}</td>
                      <td className="num">{entry.duration}</td>
                      <td className="num mono">{formatShortID(schedule.cal.date(entry.es))}</td>
                      <td className="num mono">{formatShortID(schedule.cal.date(entry.ef))}</td>
                      <td className="num mono">{formatShortID(schedule.cal.date(entry.ls))}</td>
                      <td className="num mono">{formatShortID(schedule.cal.date(entry.lf))}</td>
                      <td className="num">{entry.float}</td>
                      <td>
                        {critical ? (
                          <span className="badge crit">Kritis</span>
                        ) : (
                          <span className="badge">Float {entry.float}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="kpi-row">
            <div className="kpi">
              <span className="kpi-value">{formatNumberID(schedule.pert.expected)}</span>
              <span className="kpi-label">TE jalur kritis (hari)</span>
            </div>
            <div className="kpi">
              <span className="kpi-value">{formatNumberID(totalPertVariance)}</span>
              <span className="kpi-label">Total varians semua tugas</span>
            </div>
            <div className="kpi">
              <span className="kpi-value">± {formatNumberID(1.96 * schedule.pert.sd)}</span>
              <span className="kpi-label">Rentang kepercayaan 95% (hari)</span>
            </div>
          </div>

          <p className="hint">
            TE = (O + 4M + P) / 6 • varians = ((P − O) / 6)². Node bertanda merah berada pada
            jalur kritis. Hubungan digambar sesuai FS/SS beserta lag-nya.
          </p>

          <div className="pert-scroll">
            <div
              className="pert-canvas"
              style={{ width: nodeLayout.width, height: nodeLayout.height }}
            >
              <svg
                className="pert-edges"
                width={nodeLayout.width}
                height={nodeLayout.height}
                aria-hidden="true"
              >
                <defs>
                  <marker
                    id="pert-arrow"
                    markerWidth="7"
                    markerHeight="7"
                    refX="6"
                    refY="3.5"
                    orient="auto"
                  >
                    <path d="M0,0 L7,3.5 L0,7 z" fill="#8b9bb0" />
                  </marker>
                  <marker
                    id="pert-arrow-critical"
                    markerWidth="7"
                    markerHeight="7"
                    refX="6"
                    refY="3.5"
                    orient="auto"
                  >
                    <path d="M0,0 L7,3.5 L0,7 z" fill="#e0525f" />
                  </marker>
                </defs>
                {nodeLayout.deps.map((d) => {
                  const from = nodeLayout.positions.get(d.predecessorId);
                  const to = nodeLayout.positions.get(d.successorId);
                  if (!from || !to) return null;
                  const x1 = from.x + NODE_W;
                  const y1 = from.y + NODE_H / 2;
                  const x2 = to.x;
                  const y2 = to.y + NODE_H / 2;
                  const critical =
                    criticalSet.has(d.predecessorId) && criticalSet.has(d.successorId);
                  const forward = x2 > x1 + 24;
                  const midX = forward ? (x1 + x2) / 2 : x1 + 30;
                  const path = forward
                    ? `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`
                    : `M ${x1} ${y1} H ${x1 + 30} V ${y1 + 22} H ${x2 - 30} V ${y2} H ${x2}`;
                  const label = `${d.type}${d.lag !== 0 ? `${d.lag > 0 ? '+' : ''}${d.lag}` : ''}`;
                  return (
                    <g key={d.id}>
                      <path
                        d={path}
                        fill="none"
                        stroke={critical ? '#e0525f' : '#8b9bb0'}
                        strokeWidth={critical ? 1.8 : 1.2}
                        markerEnd={`url(#${critical ? 'pert-arrow-critical' : 'pert-arrow'})`}
                      />
                      <text
                        x={forward ? midX : x1 + 34}
                        y={forward ? (y1 + y2) / 2 - 5 : y1 + 16}
                        className="arrow-label"
                        fill={critical ? '#e0525f' : '#7b8ba0'}
                      >
                        {label}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {nodeLayout.ordered.map(({ row }) => {
                const pos = nodeLayout.positions.get(row.task.id);
                if (!pos) return null;
                const pert = pertForTask(row.task);
                const critical = criticalSet.has(row.task.id);
                return (
                  <div
                    key={row.task.id}
                    className={`pert-node ${critical ? 'critical' : ''}`}
                    style={{ left: pos.x, top: pos.y, width: NODE_W, height: NODE_H }}
                    title={`${row.task.name} — TE ${pert.te.toFixed(2)} hari, σ ${pert.sd.toFixed(
                      2,
                    )}`}
                  >
                    <div className="pert-node-bar" style={{ background: row.task.color }} />
                    <div className="pert-node-name">{row.task.name}</div>
                    <div className="pert-node-body">
                      <span>TE {pert.te.toFixed(1)}</span>
                      <span>σ {pert.sd.toFixed(1)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <h3 className="section-title">Rincian estimasi PERT</h3>
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Tugas</th>
                  <th className="num">O</th>
                  <th className="num">M</th>
                  <th className="num">P</th>
                  <th className="num">TE</th>
                  <th className="num">Std dev (σ)</th>
                  <th className="num">Varians</th>
                  <th>Kritis</th>
                </tr>
              </thead>
              <tbody>
                {pertRows.map(({ row, pert }) => {
                  const base = Math.max(1, row.task.duration);
                  const o = row.task.optimistic ?? base;
                  const m = row.task.mostLikely ?? base;
                  const p = row.task.pessimistic ?? base;
                  const critical = criticalSet.has(row.task.id);
                  return (
                    <tr key={row.task.id} className={critical ? 'row-critical' : ''}>
                      <td>
                        <span className="color-chip" style={{ background: row.task.color }} />
                        {row.task.name}
                      </td>
                      <td className="num">{o}</td>
                      <td className="num">{m}</td>
                      <td className="num">{p}</td>
                      <td className="num">{pert.te.toFixed(2)}</td>
                      <td className="num">{pert.sd.toFixed(2)}</td>
                      <td className="num">{pert.variance.toFixed(3)}</td>
                      <td>
                        {critical ? (
                          <span className="badge crit">Ya</span>
                        ) : (
                          <span className="muted">Tidak</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
