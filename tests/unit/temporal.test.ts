import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/events';
import { v3 } from '../../src/core/math';
import { StoryLedger } from '../../src/time/ledger';
import { SnapshotTrack, TemporalService, TICK_RATE } from '../../src/time/temporal';
import { FallingProp } from '../../src/sim/props';
import type { SimContext } from '../../src/sim/context';
import { CollisionWorld } from '../../src/sim/physics';

function makeProp() {
  return new FallingProp({
    id: 'crate',
    kind: 'crate',
    visual: 'crate',
    rest: { pos: v3(0, 3, 0), rot: v3() },
    fallen: { pos: v3(0, 0, 0), rot: v3(1, 0, 0) },
    accel: 3,
  });
}

function ctxFor(bus: EventBus): SimContext {
  return { bus, world: new CollisionWorld(), ledger: new StoryLedger() } as unknown as SimContext;
}

function runTicks(service: TemporalService, prop: FallingProp, ctx: SimContext, n: number, start: number) {
  for (let i = 0; i < n; i++) {
    prop.update(ctx, 1 / TICK_RATE);
    service.recordAll(start + i);
    service.update(1 / TICK_RATE);
  }
  return start + n;
}

function rewindFully(service: TemporalService, id: string) {
  service.beginPreview(id);
  for (let i = 0; i < 600 && service.preview; i++) service.updatePreview(1 / TICK_RATE);
  return service.commit();
}

describe('SnapshotTrack', () => {
  it('records only changes and keeps monotonic order', () => {
    const t = new SnapshotTrack(10);
    t.record(1, [0]);
    t.record(2, [0]);
    t.record(3, [1]);
    t.record(3, [2]); // same tick after a restore is bumped forward
    expect(t.entries.map((e) => e.tick)).toEqual([1, 3, 4]);
    expect(t.validate()).toBe(true);
  });

  it('respects its capacity (configurable window)', () => {
    const t = new SnapshotTrack(5);
    for (let i = 0; i < 20; i++) t.record(i, [i]);
    expect(t.length).toBe(5);
    expect(t.entries[0].state).toEqual([15]);
  });

  it('detects corrupted history', () => {
    const t = new SnapshotTrack(5);
    t.record(1, [0]);
    t.record(2, [1]);
    t.entries[1].state = [Number.NaN];
    expect(t.validate()).toBe(false);
  });
});

describe('TemporalService', () => {
  it('restores a fallen object to its rest state (FR-003)', () => {
    const bus = new EventBus();
    const s = new TemporalService(bus);
    s.enabled.rewind = true;
    const prop = makeProp();
    s.register(prop);
    const ctx = ctxFor(bus);
    prop.trigger();
    runTicks(s, prop, ctx, 90, 1);
    expect(prop.phase).toBe(2);
    expect(rewindFully(s, 'crate')).toBeNull();
    expect(prop.phase).toBe(0);
    expect(prop.p).toBe(0);
    expect(s.energy).toBeLessThan(5);
  });

  it('reports every failure branch with a recoverable reason (SRS §7)', () => {
    const bus = new EventBus();
    const s = new TemporalService(bus);
    expect(s.beginPreview('crate')).toBe('locked');
    s.enabled.rewind = true;
    expect(s.beginPreview(null)).toBe('no_target');
    const prop = makeProp();
    s.register(prop);
    expect(s.beginPreview('crate')).toBe('no_history');
    prop.trigger();
    const ctx = ctxFor(bus);
    runTicks(s, prop, ctx, 30, 1);
    s.energy = 0.1;
    expect(s.beginPreview('crate')).toBe('insufficient_energy');
    s.energy = 5;
    s.enabled.anchor = true;
    expect(s.setAnchor('crate')).toBeNull();
    expect(s.beginPreview('crate')).toBe('anchor_conflict');
    s.releaseAnchor();
    s.track('crate')!.entries[1].tick = -5;
    expect(s.beginPreview('crate')).toBe('corrupt_snapshot');
    expect(bus.getLog('rewind.failed').length).toBe(6);
  });

  it('cancel leaves the object untouched and costs nothing', () => {
    const bus = new EventBus();
    const s = new TemporalService(bus);
    s.enabled.rewind = true;
    const prop = makeProp();
    s.register(prop);
    prop.trigger();
    runTicks(s, prop, ctxFor(bus), 90, 1);
    s.beginPreview('crate');
    for (let i = 0; i < 30; i++) s.updatePreview(1 / 60);
    s.cancelPreview();
    expect(prop.phase).toBe(2);
    expect(s.energy).toBe(5);
    expect(prop.temporalFrozen).toBe(false);
  });

  it('anchor freezes one object while the rest of the world updates (FR-015)', () => {
    const bus = new EventBus();
    const s = new TemporalService(bus);
    s.enabled.anchor = true;
    const a = makeProp();
    const b = new FallingProp({ ...a.cfg, id: 'other' });
    s.register(a);
    s.register(b);
    a.trigger();
    b.trigger();
    const ctx = ctxFor(bus);
    for (let i = 0; i < 10; i++) {
      a.update(ctx, 1 / 60);
      b.update(ctx, 1 / 60);
    }
    expect(s.setAnchor('crate')).toBeNull();
    const frozenAt = a.p;
    for (let i = 0; i < 60; i++) {
      a.update(ctx, 1 / 60);
      b.update(ctx, 1 / 60);
      s.update(1 / 60);
    }
    expect(a.p).toBe(frozenAt);
    expect(b.p).toBeGreaterThan(frozenAt);
    for (let i = 0; i < 6 * 60; i++) s.update(1 / 60);
    expect(s.anchor).toBeNull();
    expect(a.temporalFrozen).toBe(false);
  });

  it('TC-TIME-01: no duplication or impossible state after 100 replay cycles', () => {
    const bus = new EventBus();
    const s = new TemporalService(bus);
    s.enabled.rewind = true;
    s.config.regenDelay = 0;
    s.config.regenPerSecond = 100;
    const ledger = new StoryLedger();
    const prop = makeProp();
    // Reward handed out when the crate lands — must be granted exactly once no matter how often it replays.
    prop.onImpact = () => {
      ledger.claim('crate.reward', 'tonic');
    };
    s.register(prop);
    const ctx = ctxFor(bus);
    let commits = 0;
    bus.on('rewind.commit', () => commits++);
    let tick = 1;
    for (let cycle = 0; cycle < 100; cycle++) {
      prop.trigger();
      tick = runTicks(s, prop, ctx, 80, tick);
      expect(prop.phase).toBe(2);
      expect(rewindFully(s, 'crate')).toBeNull();
      expect(prop.phase).toBe(0);
      expect(prop.p).toBe(0);
      expect(s.track('crate')!.validate()).toBe(true);
      tick = runTicks(s, prop, ctx, 5, tick);
    }
    expect(ledger.count('tonic')).toBe(1);
    expect(commits).toBe(100);
  });

  it('is deterministic: identical inputs give identical states', () => {
    const run = () => {
      const bus = new EventBus();
      const s = new TemporalService(bus);
      s.enabled.rewind = true;
      const prop = makeProp();
      s.register(prop);
      prop.trigger();
      runTicks(s, prop, ctxFor(bus), 37, 1);
      s.beginPreview('crate');
      for (let i = 0; i < 17; i++) s.updatePreview(1 / 60);
      s.commit();
      runTicks(s, prop, ctxFor(bus), 11, 100);
      return prop.capture();
    };
    expect(run()).toEqual(run());
  });
});

describe('StoryLedger (FR-004)', () => {
  it('never duplicates rewards or overwrites irreversible facts', () => {
    const l = new StoryLedger();
    expect(l.claim('chest', 'tonic')).toBe(true);
    expect(l.claim('chest', 'tonic')).toBe(false);
    expect(l.count('tonic')).toBe(1);
    expect(l.commit('choice.bellcore', 'take')).toBe(true);
    expect(l.commit('choice.bellcore', 'leave')).toBe(false);
    expect(l.set('choice.bellcore', 'leave')).toBe(false);
    expect(l.get('choice.bellcore')).toBe('take');
    const copy = StoryLedger.from(l.serialize());
    expect(copy.claim('chest')).toBe(false);
    expect(copy.isIrreversible('choice.bellcore')).toBe(true);
  });
});
