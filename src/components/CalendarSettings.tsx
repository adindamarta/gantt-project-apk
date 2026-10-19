import { useState, type FormEvent } from 'react';
import { useApp } from '../store/store';
import { uid } from '../data/seed';
import { DAY_NAMES_ID, SHORT_DAY_NAMES_ID } from '../types';
import { DEFAULT_WEEKENDS, hasWorkingDay } from '../lib/calendar';
import { formatDateID, formatFullID, todayISO } from '../lib/dates';
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function CalendarSettings() {
  const { state, dispatch, schedule } = useApp();
  const [holidayDate, setHolidayDate] = useState(todayISO());
  const [holidayName, setHolidayName] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const { calendar } = state;

  const toggleDay = (day: number) => {
    const active = calendar.weekendDays.includes(day);
    const next = active
      ? calendar.weekendDays.filter((d) => d !== day)
      : [...calendar.weekendDays, day];
    const sorted = [...new Set(next)].sort((a, b) => a - b);

    if (sorted.length >= 7) {
      setMessage('Minimal satu hari harus tetap menjadi hari kerja.');
      return;
    }
    if (!hasWorkingDay({ ...calendar, weekendDays: sorted })) {
      setMessage('Konfigurasi tersebut tidak menyisakan hari kerja sama sekali.');
      return;
    }
    setMessage(null);
    dispatch({ type: 'set-weekend', days: sorted });
  };

  const addHoliday = (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayDate)) {
      setMessage('Tanggal libur tidak valid.');
      return;
    }
    const name = holidayName.trim() || 'Hari libur';
    dispatch({ type: 'add-holiday', holiday: { id: uid('hol'), date: holidayDate, name } });
    setHolidayName('');
    setMessage(null);
  };

  const resetWeekend = () => {
    dispatch({ type: 'set-weekend', days: [...DEFAULT_WEEKENDS] });
    setMessage(null);
  };

  const workingPattern = ALL_DAYS.map((d) => ({
    day: d,
    working: !calendar.weekendDays.includes(d),
  }));

  return (
    <div className="panel calendar-panel">
      <div className="cal-grid">
        <section className="card">
          <h3 className="section-title">Akhir pekan</h3>
          <p className="hint">
            Hari yang dicentang dianggap akhir pekan dan tidak dihitung dalam durasi maupun
            penjadwalan.
          </p>
          <div className="day-toggles">
            {ALL_DAYS.map((day) => {
              const active = calendar.weekendDays.includes(day);
              return (
                <label key={day} className={active ? 'day-toggle on' : 'day-toggle'}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleDay(day)}
                  />
                  <span className="day-short">{SHORT_DAY_NAMES_ID[day]}</span>
                  <span className="day-full">{DAY_NAMES_ID[day]}</span>
                </label>
              );
            })}
          </div>
          <div className="inline-actions">
            <button type="button" className="btn" onClick={resetWeekend}>
              Kembalikan Sabtu–Minggu
            </button>
          </div>
          {calendar.weekendDays.length === 0 ? (
            <p className="hint">Tidak ada akhir pekan — semua hari dianggap kerja.</p>
          ) : (
            <p className="hint">
              Akhir pekan aktif:{' '}
              {calendar.weekendDays
                .slice()
                .sort((a, b) => a - b)
                .map((d) => DAY_NAMES_ID[d])
                .join(', ')}
            </p>
          )}
          {message ? <p className="form-error">{message}</p> : null}

          <div className="pattern">
            <span className="pattern-label">Pola mingguan saat ini</span>
            <div className="pattern-days">
              {workingPattern.map((p) => (
                <span
                  key={p.day}
                  className={p.working ? 'pattern-day work' : 'pattern-day off'}
                  title={DAY_NAMES_ID[p.day]}
                >
                  {SHORT_DAY_NAMES_ID[p.day][0]}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="card">
          <h3 className="section-title">Hari libur khusus</h3>
          <p className="hint">
            Tanggal di daftar ini dilewati saat menghitung hari kerja.
          </p>
          <form className="inline-form" onSubmit={addHoliday}>
            <div className="field">
              <label htmlFor="hol-date">Tanggal</label>
              <input
                id="hol-date"
                type="date"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
              />
            </div>
            <div className="field grow">
              <label htmlFor="hol-name">Nama hari libur</label>
              <input
                id="hol-name"
                value={holidayName}
                onChange={(e) => setHolidayName(e.target.value)}
                placeholder="mis. Cuti bersama"
              />
            </div>
            <button type="submit" className="btn btn-primary">
              Tambah
            </button>
          </form>

          {calendar.holidays.length === 0 ? (
            <p className="hint">Belum ada hari libur khusus.</p>
          ) : (
            <ul className="holiday-list">
              {calendar.holidays.map((h) => (
                <li key={h.id} className="holiday-item">
                  <div>
                    <div className="holiday-name">{h.name}</div>
                    <div className="muted small">{formatFullID(h.date)}</div>
                  </div>
                  <button
                    type="button"
                    className="icon-btn danger"
                    aria-label={`Hapus libur ${h.name}`}
                    title="Hapus hari libur"
                    onClick={() => dispatch({ type: 'delete-holiday', id: h.id })}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card card-wide">
          <h3 className="section-title">Dampak pada proyek</h3>
          <div className="impact-grid">
            <div className="impact">
              <span className="impact-value">{state.tasks.length}</span>
              <span className="impact-label">Tugas terjadwal</span>
            </div>
            <div className="impact">
              <span className="impact-value">{schedule.projectDuration}</span>
              <span className="impact-label">Hari kerja proyek</span>
            </div>
            <div className="impact">
              <span className="impact-value">{calendar.holidays.length}</span>
              <span className="impact-label">Hari libur khusus</span>
            </div>
            <div className="impact">
              <span className="impact-value">{calendar.weekendDays.length}</span>
              <span className="impact-label">Hari akhir pekan / minggu</span>
            </div>
          </div>
          <div className="timeline-info">
            <div>
              <span className="muted">Mulai proyek</span>
              <strong>{formatDateID(schedule.projectStart)}</strong>
            </div>
            <div>
              <span className="muted">Selesai proyek</span>
              <strong>{formatDateID(schedule.projectEnd)}</strong>
            </div>
          </div>
          <p className="hint">
            Mengubah akhir pekan atau hari libur akan langsung menjadwalkan ulang seluruh
            tugas karena durasi dihitung hanya dalam hari kerja.
          </p>
        </section>
      </div>
    </div>
  );
}
