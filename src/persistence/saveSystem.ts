import { fnv1a } from '../core/math';
import type { StorageAdapter } from './storage';

// Checkpoint saves with atomic replace, checksum and load validation (FR-011, NFR-02, UC-05, TC-SAVE-03).
// Write order: tmp -> verify -> previous main becomes .bak -> main -> drop tmp.
// A failure at any step leaves the previous valid checkpoint readable.

export const SAVE_VERSION = 1;
export const SLOT_COUNT = 3;

export interface SaveMeta {
  slot: number;
  timestamp: number;
  region: string;
  checkpointId: string;
  playTime: number;
}

export interface SaveEnvelope<P> extends SaveMeta {
  version: number;
  checksum: string;
  payload: P;
}

export type SlotStatus = 'empty' | 'ok' | 'recovered' | 'corrupt';

export interface SlotInfo {
  slot: number;
  status: SlotStatus;
  meta?: SaveMeta;
}

export type PayloadValidator<P> = (payload: unknown) => payload is P;

const mainKey = (slot: number) => `slot${slot}`;
const bakKey = (slot: number) => `slot${slot}.bak`;
const tmpKey = (slot: number) => `slot${slot}.tmp`;

export function checksumOf(payload: unknown, meta: Omit<SaveMeta, 'slot'> & { version: number }): string {
  return fnv1a(JSON.stringify([meta.version, meta.timestamp, meta.region, meta.checkpointId, meta.playTime, payload]));
}

export interface LoadResult<P> {
  envelope: SaveEnvelope<P> | null;
  status: SlotStatus;
  error?: string;
}

export class SaveSystem<P> {
  constructor(
    private storage: StorageAdapter,
    private validate: PayloadValidator<P>,
    private migrate: (version: number, payload: unknown) => unknown = (_v, p) => p,
  ) {}

  private assertSlot(slot: number): void {
    if (!Number.isInteger(slot) || slot < 1 || slot > SLOT_COUNT) throw new Error(`invalid slot ${slot}`);
  }

  serialize(slot: number, payload: P, meta: Omit<SaveMeta, 'slot'>): string {
    const base = { ...meta, version: SAVE_VERSION };
    const env: SaveEnvelope<P> = { slot, ...base, checksum: checksumOf(payload, base), payload };
    return JSON.stringify(env);
  }

  /** Parses and validates one stored record; returns null when anything is off. */
  parse(raw: string | null, slot: number): SaveEnvelope<P> | null {
    if (!raw) return null;
    let env: SaveEnvelope<unknown>;
    try {
      env = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!env || typeof env !== 'object') return null;
    if (env.slot !== slot) return null;
    if (typeof env.version !== 'number' || env.version > SAVE_VERSION || env.version < 1) return null;
    if (typeof env.timestamp !== 'number' || typeof env.region !== 'string' || typeof env.checkpointId !== 'string') return null;
    if (typeof env.playTime !== 'number' || !Number.isFinite(env.playTime)) return null;
    const expected = checksumOf(env.payload, env);
    if (env.checksum !== expected) return null;
    const payload = env.version < SAVE_VERSION ? this.migrate(env.version, env.payload) : env.payload;
    if (!this.validate(payload)) return null;
    return { ...env, payload } as SaveEnvelope<P>;
  }

  save(slot: number, payload: P, meta: Omit<SaveMeta, 'slot'>): { ok: boolean; error?: string } {
    this.assertSlot(slot);
    let json: string;
    try {
      json = this.serialize(slot, payload, meta);
    } catch (e) {
      return { ok: false, error: `serialize: ${(e as Error).message}` };
    }
    try {
      this.storage.write(tmpKey(slot), json);
      if (!this.parse(this.storage.read(tmpKey(slot)), slot)) throw new Error('verification of temporary save failed');
      const previous = this.storage.read(mainKey(slot));
      if (previous && this.parse(previous, slot)) this.storage.write(bakKey(slot), previous);
      this.storage.write(mainKey(slot), json);
      if (!this.parse(this.storage.read(mainKey(slot)), slot)) throw new Error('verification of committed save failed');
      this.storage.remove(tmpKey(slot));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  load(slot: number): LoadResult<P> {
    this.assertSlot(slot);
    const main = this.storage.read(mainKey(slot));
    const parsedMain = this.parse(main, slot);
    if (parsedMain) return { envelope: parsedMain, status: 'ok' };
    // Main missing or damaged: newest verified copy wins (tmp is only kept if the commit was interrupted).
    const candidates = [this.parse(this.storage.read(tmpKey(slot)), slot), this.parse(this.storage.read(bakKey(slot)), slot)].filter(
      (e): e is SaveEnvelope<P> => e !== null,
    );
    candidates.sort((a, b) => b.timestamp - a.timestamp);
    if (candidates.length > 0) return { envelope: candidates[0], status: 'recovered', error: main ? 'main save corrupt' : 'main save missing' };
    if (main) return { envelope: null, status: 'corrupt', error: 'no valid copy found' };
    return { envelope: null, status: 'empty' };
  }

  /** Repairs a recovered slot by rewriting the recovered copy as main. */
  repair(slot: number): boolean {
    const r = this.load(slot);
    if (r.status !== 'recovered' || !r.envelope) return false;
    const { payload, slot: _s, version: _v, checksum: _c, ...meta } = r.envelope;
    return this.save(slot, payload, meta).ok;
  }

  info(slot: number): SlotInfo {
    const r = this.load(slot);
    if (!r.envelope) return { slot, status: r.status };
    const { timestamp, region, checkpointId, playTime } = r.envelope;
    return { slot, status: r.status, meta: { slot, timestamp, region, checkpointId, playTime } };
  }

  list(): SlotInfo[] {
    const out: SlotInfo[] = [];
    for (let s = 1; s <= SLOT_COUNT; s++) out.push(this.info(s));
    return out;
  }

  /** Most recent loadable slot, used by "Continue" (only shown with a valid save). */
  latest(): SlotInfo | null {
    const valid = this.list().filter((s) => s.meta && (s.status === 'ok' || s.status === 'recovered'));
    valid.sort((a, b) => b.meta!.timestamp - a.meta!.timestamp);
    return valid[0] ?? null;
  }

  delete(slot: number): void {
    this.assertSlot(slot);
    this.storage.remove(mainKey(slot));
    this.storage.remove(bakKey(slot));
    this.storage.remove(tmpKey(slot));
  }
}
