import { describe, expect, it } from 'vitest';
import { assertValidKey, MemoryStorage } from '../../src/persistence/storage';
import { SaveSystem } from '../../src/persistence/saveSystem';

interface P {
  value: number;
}
const isP = (p: unknown): p is P => !!p && typeof (p as P).value === 'number';
const meta = (t: number) => ({ timestamp: t, region: 'clockfall', checkpointId: `cp${t}`, playTime: t });

describe('SaveSystem (FR-011, NFR-02)', () => {
  it('saves and loads with validation', () => {
    const st = new MemoryStorage();
    const s = new SaveSystem<P>(st, isP);
    expect(s.save(1, { value: 7 }, meta(1)).ok).toBe(true);
    const r = s.load(1);
    expect(r.status).toBe('ok');
    expect(r.envelope?.payload.value).toBe(7);
    expect(st.keys()).not.toContain('slot1.tmp');
  });

  it('TC-SAVE-03: prior checkpoint remains readable after an interrupted write', () => {
    const st = new MemoryStorage();
    const s = new SaveSystem<P>(st, isP);
    s.save(1, { value: 1 }, meta(1));
    // Crash while committing the main record.
    st.failOnWrite = (k) => k === 'slot1';
    const res = s.save(1, { value: 2 }, meta(2));
    expect(res.ok).toBe(false);
    st.failOnWrite = null;
    const r = s.load(1);
    expect(r.envelope).not.toBeNull();
    // Either the old main survives or the verified tmp copy is used — never nothing.
    expect([1, 2]).toContain(r.envelope!.payload.value);
  });

  it('crash while writing the temporary file leaves the old save untouched', () => {
    const st = new MemoryStorage();
    const s = new SaveSystem<P>(st, isP);
    s.save(1, { value: 1 }, meta(1));
    st.failOnWrite = (k) => k === 'slot1.tmp';
    expect(s.save(1, { value: 2 }, meta(2)).ok).toBe(false);
    st.failOnWrite = null;
    expect(s.load(1)).toMatchObject({ status: 'ok', envelope: { payload: { value: 1 } } });
  });

  it('recovers from a corrupt main file using the backup', () => {
    const st = new MemoryStorage();
    const s = new SaveSystem<P>(st, isP);
    s.save(2, { value: 1 }, meta(1));
    s.save(2, { value: 2 }, meta(2));
    st.data.set('slot2', st.data.get('slot2')!.slice(0, 40)); // truncated file
    const r = s.load(2);
    expect(r.status).toBe('recovered');
    expect(r.envelope!.payload.value).toBe(1);
    expect(s.repair(2)).toBe(true);
    expect(s.load(2).status).toBe('ok');
  });

  it('rejects tampered checksums, wrong slots and future versions', () => {
    const st = new MemoryStorage();
    const s = new SaveSystem<P>(st, isP);
    s.save(1, { value: 5 }, meta(1));
    const env = JSON.parse(st.data.get('slot1')!);
    env.payload.value = 999;
    st.data.set('slot1', JSON.stringify(env));
    expect(s.load(1).status).toBe('corrupt');
    const raw = s.serialize(1, { value: 1 }, meta(1));
    expect(s.parse(raw, 2)).toBeNull();
    const fut = JSON.parse(raw);
    fut.version = 99;
    expect(s.parse(JSON.stringify(fut), 1)).toBeNull();
  });

  it('lists slots and picks the latest valid one for Continue', () => {
    const st = new MemoryStorage();
    const s = new SaveSystem<P>(st, isP);
    expect(s.latest()).toBeNull();
    s.save(1, { value: 1 }, meta(10));
    s.save(3, { value: 3 }, meta(30));
    expect(s.list().map((x) => x.status)).toEqual(['ok', 'empty', 'ok']);
    expect(s.latest()?.slot).toBe(3);
    s.delete(3);
    expect(s.latest()?.slot).toBe(1);
  });

  it('validates storage keys (NFR-06)', () => {
    expect(() => assertValidKey('../evil')).toThrow();
    expect(() => assertValidKey('slot1.bak')).not.toThrow();
    expect(() => assertValidKey('a/b')).toThrow();
  });
});
