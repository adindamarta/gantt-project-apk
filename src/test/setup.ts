import '@testing-library/jest-dom/vitest';

/**
 * Pada kombinasi Node 25 + jsdom, `window.localStorage` kadang muncul sebagai
 * objek kosong tanpa method (lihat warning `--localstorage-file`).
 * Aplikasi memang menyimpan data ke localStorage sungguhan di peramban,
 * jadi di lingkungan uji kita pasang Storage in-memory yang perilakunya sama
 * persis agar skrip uji bisa memverifikasi perilaku penyimpanan.
 */
function installMemoryStorage(): void {
  const host = window as unknown as Record<string, unknown>;
  const probe = host.localStorage as Storage | undefined;
  if (
    probe &&
    typeof probe.getItem === 'function' &&
    typeof probe.setItem === 'function' &&
    typeof probe.clear === 'function' &&
    typeof probe.removeItem === 'function'
  ) {
    return;
  }

  const data = new Map<string, string>();
  const storage: Storage = {
    get length(): number {
      return data.size;
    },
    key(index: number): string | null {
      return Array.from(data.keys())[index] ?? null;
    },
    getItem(key: string): string | null {
      const k = String(key);
      return data.has(k) ? (data.get(k) as string) : null;
    },
    setItem(key: string, value: string): void {
      data.set(String(key), String(value));
    },
    removeItem(key: string): void {
      data.delete(String(key));
    },
    clear(): void {
      data.clear();
    },
  };

  try {
    Object.defineProperty(window, 'localStorage', {
      value: storage,
      configurable: true,
      writable: true,
    });
  } catch {
    /* bila properti tidak dapat ditimpa, biarkan — penyimpanan menjadi no-op */
  }
}

installMemoryStorage();
