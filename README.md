# Amanah — Manajemen Proyek Berbasis Gantt Chart

Aplikasi manajemen proyek berbasis **Gantt Chart** yang dibangun dengan
**React + TypeScript + Vite**. Seluruh data disimpan di `localStorage`
browser dan sudah dilengkapi dengan data contoh (seed data).

## Fitur

| # | Fitur | Detail |
|---|-------|--------|
| 1 | **Manajemen Tugas** | Tambah / edit / hapus tugas, durasi dalam **hari kerja**, tanggal mulai, prioritas **Low / Medium / High**, warna indikator bar, serta **sub-tugas** (parent–child) dengan bar induk (summary) dan collapse/expand. |
| 2 | **Predecessors & Timeline** | Hubungan **Finish-to-Start (FS)** dan **Start-to-Start (SS)** beserta **lag / delay hari kerja**, panah dependensi di Gantt, serta **drag bar** (pindah jadwal) dan **resize** (geser tepi kiri/kanan untuk mengubah durasi). |
| 3 | **Manajemen Sumber Daya** | Pendaftaran anggota tim (**nama, email, peran, gaji**), alokasi anggota ke tugas lewat formulir maupun tabel alokasi, rekap hari kerja & estimasi biaya per anggota. |
| 4 | **Kalender Proyek** | Pengaturan **akhir pekan** (pilih hari apa pun), penambahan **hari libur khusus** (custom holiday). Durasi & penjadwalan **hanya menghitung hari kerja**. |
| 5 | **Analisis Proyek** | **Critical Path** (ES/EF/LS/LF/total float, rantai jalur kritis) dan **Diagram PERT** (TE, σ, varians, rentang kepercayaan 95%). |

Fitur pendukung:

- Penyimpanan otomatis ke **localStorage** + tombol *Muat data contoh*.
- Deteksi **siklus dependensi** (penjadwalan tetap aman, sisi siklus diabaikan).
- Tombol **Sejajarkan jadwal** untuk menyetel ulang semua tanggal mulai sesuai hasil penjadwalan otomatis.
- Tampilan **responsif** (desktop, tablet, dan layar kecil).

## Kebutuhan

- **Node.js** 18 atau lebih baru
- **npm** 9 atau lebih baru

## Cara Install

```bash
npm install
```

## Menjalankan (Development)

```bash
npm run dev
```

Buka alamat yang dicetak di terminal (biasanya `http://localhost:5173`).

## Menjalankan Build Produksi

```bash
npm run build      # typecheck (tsc -b) + bundling Vite
npm run preview    # menyajikan hasil build secara lokal
```

Hasil build tersimpan di folder `dist/`.

## Perintah Lainnya

```bash
npm run typecheck  # pemeriksaan tipe TypeScript tanpa emit
npm test           # menjalankan seluruh unit test (Vitest)
npm run test:watch  # mode watch
```

## Struktur Proyek

```
src/
├── main.tsx                 # Titik masuk React
├── App.tsx                  # Shell aplikasi + navigasi tab
├── types.ts                 # Tipe domain (Task, Dependency, Resource, ...)
├── styles.css               # Seluruh gaya UI
├── data/
│   └── seed.ts              # Data contoh (seed data)
├── lib/
│   ├── dates.ts             # Utilitas tanggal ISO
│   ├── calendar.ts          # Hari kerja, akhir pekan, hari libur, lag
│   ├── workingday.ts        # Indeks hari kerja (untuk CPM)
│   ├── schedule.ts          # Critical Path Method + PERT
│   ├── dependencies.ts      # Deteksi siklus graf dependensi
│   ├── taskTree.ts          # Pelipatan pohon tugas
│   └── color.ts             # Palet warna & warna prioritas
├── store/
│   └── store.tsx            # Context + reducer + localStorage
├── components/
│   ├── GanttChart.tsx       # Grafik Gantt (bar, panah, drag/resize)
│   ├── TaskList.tsx         # Tabel tugas + tabel dependensi
│   ├── TaskForm.tsx         # Formulir tambah/edit tugas & predecessor
│   ├── ResourcePanel.tsx    # Anggota tim + alokasi
│   ├── CalendarSettings.tsx # Akhir pekan + hari libur
│   ├── AnalysisView.tsx     # Jalur kritis + diagram PERT
│   └── ui.tsx               # Komponen UI bersama
└── test/
    └── setup.ts             # Setup Vitest
```

## Cara Kerja Penjadwalan

1. **Hari kerja** ditentukan oleh Kalender (weekend + hari libur).
   Semua durasi dinyatakan dalam **hari kerja**.
2. **Forward pass** menghitung `ES`/`EF`:
   - Tugas tanpa predecessor → memakai tanggal mulai manualnya.
   - Tugas berpredecessor → `ES = max(konstrain predecessor)`.
     - FS: `ES_succ = EF_pred + 1 + lag`
     - SS: `ES_succ = ES_pred + lag`
   - Tugas **induk** (punya sub-tugas) dijadwalkan sebagai **summary** yang
     membentang dari sub-tugas pertama ke sub-tugas terakhir, dan konstrain
     predecessor-nya diwariskan ke seluruh anaknya.
   - Opsi **“Kunci tanggal mulai”** membuat tugas mempertahankan posisi
     manualnya (tetap menghormati konstrain sebagai batas minimum).
3. **Backward pass** menghitung `LS`/`LF`, lalu **total float = LS − ES**.
   Tugas dengan `float = 0` dianggap berada pada **jalur kritis**.
4. **PERT**: `TE = (O + 4M + P) / 6`, varians `= ((P − O) / 6)²`.
   Ekspektasi & deviasi proyek dijumlahkan dari tugas pada jalur kritis.

## Penyimpanan Data

Seluruh state disimpan di `localStorage` dengan kunci:

```
amanah.gantt.project.v1
```

Bila data rusak atau tidak kompatibel, aplikasi otomatis memuat ulang data
contoh. Anda juga dapat mengembalikannya kapan saja lewat tombol
**“Muat data contoh”** di header.

## Teknologi

- React 18
- TypeScript 5 (strict)
- Vite 5
- Vitest + Testing Library (+ jsdom)

## Screenshot Aplikasi

### 1. Tampilan1

![Dashboard1](screenshots/screnshots1.png)

### 2. Tampilan2

![Tampilan2](screenshots/screnshots2.png)
