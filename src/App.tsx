import { useState } from 'react';
import { useApp } from './store/store';
import { formatShortID } from './lib/dates';
import { GanttChart } from './components/GanttChart';
import { TaskList } from './components/TaskList';
import { ResourcePanel } from './components/ResourcePanel';
import { CalendarSettings } from './components/CalendarSettings';
import { AnalysisView } from './components/AnalysisView';

type Tab = 'gantt' | 'tasks' | 'resources' | 'calendar' | 'analysis';

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'gantt', label: 'Gantt', hint: 'Timeline, bar, dan panah dependensi' },
  { id: 'tasks', label: 'Tugas', hint: 'Kelola tugas, sub-tugas, dan predecessor' },
  { id: 'resources', label: 'Tim', hint: 'Anggota tim dan alokasi ke tugas' },
  { id: 'calendar', label: 'Kalender', hint: 'Akhir pekan dan hari libur khusus' },
  { id: 'analysis', label: 'Analisis', hint: 'Jalur kritis dan diagram PERT' },
];

export function App() {
  const { state, dispatch, schedule } = useApp();
  const [tab, setTab] = useState<Tab>('gantt');
  const [projectName, setProjectName] = useState(state.projectName);
  const [editingName, setEditingName] = useState(false);

  const resetData = () => {
    if (window.confirm('Muat ulang data contoh? Semua perubahan lokal akan hilang.')) {
      dispatch({ type: 'reset-seed' });
      setEditingName(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="4" width="12" height="4" rx="1.5" fill="#fff" />
              <rect x="6" y="10" width="14" height="4" rx="1.5" fill="#ffd166" />
              <rect x="4" y="16" width="9" height="4" rx="1.5" fill="#8ff0c2" />
            </svg>
          </span>
          <div className="brand-text">
            {editingName ? (
              <input
                className="project-name-input"
                value={projectName}
                autoFocus
                onChange={(e) => setProjectName(e.target.value)}
                onBlur={() => {
                  dispatch({ type: 'set-project-name', name: projectName.trim() || 'Proyek' });
                  setEditingName(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    dispatch({
                      type: 'set-project-name',
                      name: projectName.trim() || 'Proyek',
                    });
                    setEditingName(false);
                  }
                  if (e.key === 'Escape') {
                    setProjectName(state.projectName);
                    setEditingName(false);
                  }
                }}
                aria-label="Nama proyek"
              />
            ) : (
              <button
                type="button"
                className="project-name"
                onClick={() => {
                  setProjectName(state.projectName);
                  setEditingName(true);
                }}
                title="Klik untuk mengganti nama proyek"
              >
                {state.projectName}
              </button>
            )}
            <span className="brand-sub">
              {formatRange(schedule.projectStart, schedule.projectEnd)} •{' '}
              {schedule.projectDuration} hari kerja
            </span>
          </div>
        </div>

        <nav className="tabs" aria-label="Navigasi utama">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? 'tab active' : 'tab'}
              onClick={() => setTab(t.id)}
              title={t.hint}
            >
              {t.label}
              {t.id === 'analysis' && schedule.criticalIds.length > 0 ? (
                <span className="tab-badge">{schedule.criticalIds.length}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="header-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={resetData}
            title="Kembalikan seluruh data ke contoh bawaan"
          >
            Muat data contoh
          </button>
        </div>
      </header>

      <main className="app-main">
        {tab === 'gantt' ? <GanttChart /> : null}
        {tab === 'tasks' ? <TaskList /> : null}
        {tab === 'resources' ? <ResourcePanel /> : null}
        {tab === 'calendar' ? <CalendarSettings /> : null}
        {tab === 'analysis' ? <AnalysisView /> : null}
      </main>

      <footer className="app-footer">
        <span>Data tersimpan otomatis di localStorage browser Anda.</span>
        <span>
          {state.tasks.length} tugas • {state.dependencies.length} dependensi •{' '}
          {state.resources.length} anggota tim
        </span>
      </footer>
    </div>
  );
}

function formatRange(start: string, end: string): string {
  return `${formatShortID(start)} – ${formatShortID(end)}`;
}

export default App;
