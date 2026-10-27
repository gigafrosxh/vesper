// Storage adapters. Keys are validated so a save path can never escape the save directory (NFR-06).

export interface StorageAdapter {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}

const KEY_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function assertValidKey(key: string): void {
  if (!KEY_RE.test(key) || key.includes('..')) throw new Error(`invalid storage key: ${key}`);
}

export class MemoryStorage implements StorageAdapter {
  data = new Map<string, string>();
  /** Test hook: throw on the n-th write to simulate a crash mid-save (TC-SAVE-03). */
  failOnWrite: ((key: string) => boolean) | null = null;

  read(key: string): string | null {
    assertValidKey(key);
    return this.data.get(key) ?? null;
  }
  write(key: string, value: string): void {
    assertValidKey(key);
    if (this.failOnWrite?.(key)) throw new Error('simulated write interruption');
    this.data.set(key, value);
  }
  remove(key: string): void {
    assertValidKey(key);
    this.data.delete(key);
  }
  keys(): string[] {
    return [...this.data.keys()];
  }
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private prefix = 'vesper:') {}
  read(key: string): string | null {
    assertValidKey(key);
    try {
      return localStorage.getItem(this.prefix + key);
    } catch {
      return null;
    }
  }
  write(key: string, value: string): void {
    assertValidKey(key);
    localStorage.setItem(this.prefix + key, value);
  }
  remove(key: string): void {
    assertValidKey(key);
    try {
      localStorage.removeItem(this.prefix + key);
    } catch {
      /* ignore */
    }
  }
  keys(): string[] {
    const out: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(this.prefix)) out.push(k.slice(this.prefix.length));
      }
    } catch {
      /* ignore */
    }
    return out;
  }
}

/** Bridge exposed by the Electron preload script; writes are tmp-file + fsync + rename on disk. */
export interface NativeStorageBridge {
  readSync(key: string): string | null;
  writeSync(key: string, value: string): void;
  removeSync(key: string): void;
  keysSync(): string[];
}

export class NativeStorageAdapter implements StorageAdapter {
  constructor(private bridge: NativeStorageBridge) {}
  read(key: string): string | null {
    assertValidKey(key);
    return this.bridge.readSync(key);
  }
  write(key: string, value: string): void {
    assertValidKey(key);
    this.bridge.writeSync(key, value);
  }
  remove(key: string): void {
    assertValidKey(key);
    this.bridge.removeSync(key);
  }
  keys(): string[] {
    return this.bridge.keysSync();
  }
}

export function createDefaultStorage(): StorageAdapter {
  const w = globalThis as unknown as { vesperNative?: NativeStorageBridge };
  if (w.vesperNative) return new NativeStorageAdapter(w.vesperNative);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vesper:probe', '1');
      localStorage.removeItem('vesper:probe');
      return new LocalStorageAdapter();
    }
  } catch {
    /* fall through */
  }
  return new MemoryStorage();
}
