import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { AppProvider, clearStoredState, loadStoredState } from './store/store';
import { createSeedState } from './data/seed';

function renderApp() {
  return render(
    <AppProvider>
      <App />
    </AppProvider>,
  );
}

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  clearStoredState();
});

describe('Aplikasi utama', () => {
  it('merender header, tab navigasi, dan grafik Gantt berisi bar tugas', () => {
    const { container } = renderApp();

    expect(screen.getByRole('button', { name: 'Gantt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tugas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tim' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kalender' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Analisis/ })).toBeInTheDocument();

    expect(container.querySelectorAll('.g-row').length).toBeGreaterThan(5);
    expect(container.querySelectorAll('.bar-wrap').length).toBeGreaterThan(3);
    expect(container.querySelectorAll('.summary-bar').length).toBeGreaterThan(2);
    expect(container.querySelectorAll('.gantt-arrows > g > path').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.offday').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.month-seg').length).toBeGreaterThan(0);
  });

  it('menampilkan ringkasan proyek pada strip statistik', () => {
    const { container } = renderApp();
    const strip = container.querySelector('.stat-strip');
    expect(strip).not.toBeNull();
    expect(strip?.textContent).toContain('hari kerja');
    expect(strip?.textContent).toContain('Kritis');
    expect(strip?.textContent).toContain('Tugas');
    expect(strip?.textContent).toMatch(/Mulai|Durasi/);
  });

  it('berpindah ke tab Tugas dan menampilkan tabel tugas + dependensi', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Tugas' }));

    expect(screen.getAllByText('Riset pasar & kompetitor').length).toBeGreaterThan(0);
    expect(screen.getByText('Semua ketergantungan')).toBeInTheDocument();
    expect(screen.getAllByText('Finish → Start').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Start → Start').length).toBeGreaterThan(0);
    expect(screen.getAllByText('KRITIS').length).toBeGreaterThan(0);
  });

  it('membuka formulir tugas baru dan menambahkan tugas', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Tugas' }));
    fireEvent.click(screen.getByRole('button', { name: /Tugas baru/ }));

    expect(screen.getByRole('dialog', { name: 'Tambah Tugas' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nama tugas'), {
      target: { value: 'Tugas Hasil Uji' },
    });
    fireEvent.change(screen.getByLabelText('Durasi (hari kerja)'), {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByText('Tugas Hasil Uji').length).toBeGreaterThan(0);
  });

  it('memvalidasi nama tugas wajib diisi', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Tugas' }));
    fireEvent.click(screen.getByRole('button', { name: /Tugas baru/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));

    expect(screen.getByText('Nama tugas wajib diisi.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Tambah Tugas' })).toBeInTheDocument();
  });

  it('mengedit tugas yang sudah ada lewat tombol edit', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Tugas' }));
    fireEvent.click(screen.getAllByTitle('Edit')[0]);

    expect(screen.getByRole('dialog', { name: 'Edit Tugas' })).toBeInTheDocument();
    const nameInput = screen.getByLabelText('Nama tugas');
    fireEvent.change(nameInput, { target: { value: 'Nama Diganti' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByText('Nama Diganti').length).toBeGreaterThan(0);
  });

  it('menampilkan tabel anggota tim dan alokasi pada tab Tim', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Tim' }));

    expect(screen.getAllByText('Andi Wijaya').length).toBeGreaterThan(0);
    expect(screen.getByText('andi@amanah.id')).toBeInTheDocument();
    expect(screen.getAllByText('Tech Lead').length).toBeGreaterThan(0);
    expect(screen.getByText('Alokasi anggota ke tugas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Anggota tim/ })).toBeInTheDocument();
    expect(screen.getAllByTitle(/— QA Engineer|— Tech Lead/).length).toBeGreaterThan(0);
  });

  it('mengubah pengaturan akhir pekan pada tab Kalender', () => {
    const { container } = renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Kalender' }));

    const jumat = screen.getByLabelText(/Jumat/);
    expect(jumat).not.toBeChecked();
    fireEvent.click(jumat);
    expect(jumat).toBeChecked();
    expect(screen.getByText(/Akhir pekan aktif:.*Jumat/)).toBeInTheDocument();

    expect(screen.getByLabelText('Tanggal')).toBeInTheDocument();
    expect(screen.getByLabelText('Nama hari libur')).toBeInTheDocument();
    expect(container.querySelectorAll('.holiday-item').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.impact').length).toBe(4);
  });

  it('menampilkan jalur kritis dan diagram PERT pada tab Analisis', () => {
    const { container } = renderApp();
    fireEvent.click(screen.getByRole('button', { name: /^Analisis/ }));

    expect(screen.getByText('Rantai jalur kritis')).toBeInTheDocument();
    expect(screen.getByText(/ES\/EF\/LS\/LF/)).toBeInTheDocument();
    expect(screen.getByText('Ekspektasi PERT (hari)')).toBeInTheDocument();
    expect(container.querySelectorAll('.chain-node').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('tbody tr.row-critical').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Diagram PERT' }));
    expect(screen.getByText(/TE jalur kritis/)).toBeInTheDocument();
    expect(screen.getByText('Rincian estimasi PERT')).toBeInTheDocument();
    expect(container.querySelectorAll('.pert-node').length).toBeGreaterThan(3);
    expect(container.querySelectorAll('.pert-edges path').length).toBeGreaterThan(0);
  });
});

describe('Penyimpanan localStorage', () => {
  it('memuat data contoh bila storage kosong', () => {
    const state = loadStoredState();
    expect(state.tasks.length).toBeGreaterThan(0);
    expect(state.projectName).toBe('Peluncuran Platform E-Commerce');
  });

  it('menyimpan state ke storage setelah perubahan', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Tugas' }));
    fireEvent.click(screen.getByRole('button', { name: /Tugas baru/ }));
    fireEvent.change(screen.getByLabelText('Nama tugas'), {
      target: { value: 'Disimpan Ke Storage' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }));

    const stored = loadStoredState();
    expect(stored.tasks.some((t) => t.name === 'Disimpan Ke Storage')).toBe(true);
    expect(window.localStorage.getItem('amanah.gantt.project.v1')).toBeTruthy();
  });

  it('jatuh ke data contoh bila isi storage rusak', () => {
    window.localStorage.setItem('amanah.gantt.project.v1', '{ not json');
    expect(loadStoredState().tasks.length).toBeGreaterThan(0);

    window.localStorage.setItem(
      'amanah.gantt.project.v1',
      JSON.stringify({ hello: 'world' }),
    );
    expect(loadStoredState().tasks.length).toBeGreaterThan(0);
  });

  it('data contoh tidak berubah oleh pemakaian normal', () => {
    const fresh = createSeedState();
    expect(fresh.tasks.map((t) => t.name)).toContain('Fase 3 — Pengembangan');
    expect(fresh.calendar.weekendDays).toEqual([0, 6]);
  });
});
