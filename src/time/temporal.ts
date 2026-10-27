import type { EventBus, RewindFailure } from '../core/events';
import type { Vec3 } from '../core/math';

// Temporal service (SRS §5): snapshot registry, rewind scheduler and anchor.
// Story facts, inventory and rewards live in the StoryLedger, which this service cannot reach (FR-004).

export const TICK_RATE = 60;

export type TemporalStatus = { kind: 'eligible' } | { kind: 'blocked'; reason: RewindFailure } | { kind: 'unsafe'; reason: RewindFailure };

export interface TemporalTarget {
  readonly id: string;
  readonly kind: string;
  readonly rewindable: boolean;
  readonly anchorable: boolean;
  /** Set by the service while previewed or anchored: the entity must skip its own update. */
  temporalFrozen: boolean;
  /** Compact numeric state vector. Must be deterministic and contain only object state (no rewards). */
  capture(): number[];
  restore(state: number[]): void;
  getPosition(): Vec3;
  /** Extra blockers (e.g. defeated enemies are anchored deaths). */
  blockedReason?(): RewindFailure | null;
  /** True if restoring this state would trap the player inside the object. */
  wouldTrapPlayer?(state: number[], playerPos: Vec3): boolean;
  onRewound?(seconds: number): void;
}

export interface SnapshotEntry {
  tick: number;
  state: number[];
}

/**
 * Per-object ring buffer of state changes. Unchanged ticks are not recorded, so the window measures
 * the object's own motion time: a bridge that fell and then lay still still remembers its fall.
 */
export class SnapshotTrack {
  entries: SnapshotEntry[] = [];
  constructor(public capacity: number) {}

  record(tick: number, state: number[]): void {
    const last = this.entries[this.entries.length - 1];
    if (last && sameState(last.state, state)) return;
    if (last && tick <= last.tick) tick = last.tick + 1; // keep monotonic order even after restores
    this.entries.push({ tick, state });
    if (this.entries.length > this.capacity) this.entries.splice(0, this.entries.length - this.capacity);
  }

  get length(): number {
    return this.entries.length;
  }

  /** Recorded motion history in seconds that can be rewound (the newest entry is the present). */
  get seconds(): number {
    return Math.max(0, this.entries.length - 1) / TICK_RATE;
  }

  stateAtOffset(offset: number): number[] | null {
    const idx = this.entries.length - 1 - offset;
    return idx >= 0 ? this.entries[idx].state : null;
  }

  truncateToOffset(offset: number): void {
    const keep = this.entries.length - offset;
    if (keep >= 1) this.entries.length = keep;
  }

  validate(): boolean {
    let prev = -Infinity;
    let len = -1;
    for (const e of this.entries) {
      if (!(e.tick > prev)) return false;
      if (!Array.isArray(e.state)) return false;
      if (len >= 0 && e.state.length !== len) return false;
      len = e.state.length;
      for (const v of e.state) if (!Number.isFinite(v)) return false;
      prev = e.tick;
    }
    return true;
  }

  clear(): void {
    this.entries = [];
  }
}

export function sameState(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-6) return false;
  return true;
}

export interface TemporalConfig {
  windowSeconds: number;
  maxEnergy: number;
  regenPerSecond: number;
  regenDelay: number;
  scrubRate: number; // history seconds scrubbed per real second while previewing
  anchorDuration: number;
  anchorCost: number;
  minCost: number;
}

export const DEFAULT_TEMPORAL_CONFIG: TemporalConfig = {
  windowSeconds: 6,
  maxEnergy: 5,
  regenPerSecond: 0.6,
  regenDelay: 1.2,
  scrubRate: 1.6,
  anchorDuration: 6,
  anchorCost: 1,
  minCost: 0.25,
};

export interface PreviewState {
  targetId: string;
  offset: number; // entries back from the present
  ghost: number[];
}

export interface AnchorState {
  targetId: string;
  remaining: number; // seconds
}

export class TemporalService {
  private targets = new Map<string, TemporalTarget>();
  private tracks = new Map<string, SnapshotTrack>();
  energy: number;
  private sinceUse = 99;
  preview: PreviewState | null = null;
  anchor: AnchorState | null = null;
  enabled = { rewind: false, anchor: false };
  /** Disabled by story (e.g. suppression fields); reported as "locked". */
  suppressed = false;
  private tick = 0;

  constructor(
    private bus: EventBus,
    public config: TemporalConfig = { ...DEFAULT_TEMPORAL_CONFIG },
  ) {
    this.energy = config.maxEnergy;
  }

  setWindow(seconds: number): void {
    this.config.windowSeconds = seconds;
    const cap = Math.round(seconds * TICK_RATE) + 1;
    for (const t of this.tracks.values()) {
      t.capacity = cap;
      if (t.entries.length > cap) t.entries.splice(0, t.entries.length - cap);
    }
  }

  register(target: TemporalTarget): void {
    this.targets.set(target.id, target);
    const track = new SnapshotTrack(Math.round(this.config.windowSeconds * TICK_RATE) + 1);
    track.record(this.tick, target.capture());
    this.tracks.set(target.id, track);
  }

  unregister(id: string): void {
    this.targets.delete(id);
    this.tracks.delete(id);
    if (this.preview?.targetId === id) this.preview = null;
    if (this.anchor?.targetId === id) this.anchor = null;
  }

  get(id: string): TemporalTarget | undefined {
    return this.targets.get(id);
  }

  all(): IterableIterator<TemporalTarget> {
    return this.targets.values();
  }

  track(id: string): SnapshotTrack | undefined {
    return this.tracks.get(id);
  }

  /** Record every registered target once per simulation tick (after entity updates). */
  recordAll(tick: number): void {
    this.tick = tick;
    for (const [id, target] of this.targets) {
      if (target.temporalFrozen) continue;
      this.tracks.get(id)!.record(tick, target.capture());
    }
  }

  statusFor(target: TemporalTarget | undefined, playerPos?: Vec3): TemporalStatus {
    if (!target) return { kind: 'blocked', reason: 'no_target' };
    if (this.suppressed) return { kind: 'blocked', reason: 'locked' };
    if (!target.rewindable) return { kind: 'blocked', reason: 'not_rewindable' };
    const extra = target.blockedReason?.();
    if (extra) return { kind: 'blocked', reason: extra };
    if (this.anchor?.targetId === target.id) return { kind: 'blocked', reason: 'anchor_conflict' };
    const track = this.tracks.get(target.id);
    if (!track || track.length < 2) return { kind: 'blocked', reason: 'no_history' };
    if (this.energy < this.config.minCost) return { kind: 'blocked', reason: 'insufficient_energy' };
    if (playerPos && target.wouldTrapPlayer) {
      const oldest = track.stateAtOffset(Math.min(track.length - 1, Math.round(this.energy * TICK_RATE)));
      if (oldest && target.wouldTrapPlayer(oldest, playerPos)) return { kind: 'unsafe', reason: 'unsafe' };
    }
    return { kind: 'eligible' };
  }

  /** UC-02 step 2: activate. Returns a failure reason or null. */
  beginPreview(targetId: string | null, playerPos?: Vec3): RewindFailure | null {
    if (!this.enabled.rewind) return this.fail('locked', targetId ?? undefined);
    if (!targetId) return this.fail('no_target');
    const target = this.targets.get(targetId);
    const status = this.statusFor(target, undefined);
    if (status.kind !== 'eligible') return this.fail(status.reason, targetId);
    const track = this.tracks.get(targetId)!;
    if (!track.validate()) {
      track.clear();
      track.record(this.tick, target!.capture());
      return this.fail('corrupt_snapshot', targetId);
    }
    void playerPos;
    target!.temporalFrozen = true;
    this.preview = { targetId, offset: 0, ghost: track.stateAtOffset(0)! };
    return null;
  }

  /** UC-02 step 3: preview, scrubbing further back each tick while the input is held. */
  updatePreview(dt: number): void {
    if (!this.preview) return;
    const track = this.tracks.get(this.preview.targetId);
    if (!track) {
      this.preview = null;
      return;
    }
    const maxByEnergy = Math.floor(this.energy * TICK_RATE);
    const maxOffset = Math.min(track.length - 1, maxByEnergy);
    const next = Math.min(maxOffset, this.preview.offset + this.config.scrubRate * dt * TICK_RATE);
    this.preview.offset = next;
    this.preview.ghost = track.stateAtOffset(Math.floor(next)) ?? this.preview.ghost;
    const seconds = Math.floor(next) / TICK_RATE;
    this.bus.emit('rewind.preview', { targetId: this.preview.targetId, seconds, cost: Math.max(this.config.minCost, seconds) });
  }

  /** UC-02 steps 4–5: commit and spend the resource. */
  commit(playerPos?: Vec3): RewindFailure | null {
    const p = this.preview;
    if (!p) return null;
    const target = this.targets.get(p.targetId);
    const track = this.tracks.get(p.targetId);
    this.preview = null;
    if (!target || !track) return this.fail('no_target');
    target.temporalFrozen = false;
    const offset = Math.floor(p.offset);
    if (offset <= 0) {
      this.bus.emit('rewind.cancel', { targetId: p.targetId });
      return null;
    }
    const state = track.stateAtOffset(offset);
    if (!state) return this.fail('corrupt_snapshot', p.targetId);
    if (playerPos && target.wouldTrapPlayer?.(state, playerPos)) return this.fail('unsafe', p.targetId);
    const seconds = offset / TICK_RATE;
    const cost = Math.max(this.config.minCost, seconds);
    if (cost > this.energy + 1e-9) return this.fail('insufficient_energy', p.targetId);
    target.restore([...state]);
    track.truncateToOffset(offset);
    this.energy = Math.max(0, this.energy - cost);
    this.sinceUse = 0;
    target.onRewound?.(seconds);
    this.bus.emit('rewind.commit', { targetId: p.targetId, seconds, cost });
    return null;
  }

  cancelPreview(): void {
    if (!this.preview) return;
    const target = this.targets.get(this.preview.targetId);
    if (target) target.temporalFrozen = this.anchor?.targetId === target.id;
    this.bus.emit('rewind.cancel', { targetId: this.preview.targetId });
    this.preview = null;
  }

  setAnchor(targetId: string | null): RewindFailure | null {
    if (!this.enabled.anchor) return this.failAnchor('locked', targetId ?? undefined);
    if (!targetId) return this.failAnchor('no_target');
    const target = this.targets.get(targetId);
    if (!target) return this.failAnchor('no_target');
    if (this.suppressed) return this.failAnchor('locked', targetId);
    if (!target.anchorable) return this.failAnchor('not_rewindable', targetId);
    const extra = target.blockedReason?.();
    if (extra) return this.failAnchor(extra, targetId);
    if (this.preview) return this.failAnchor('anchor_conflict', targetId);
    if (this.anchor?.targetId === targetId) {
      this.releaseAnchor();
      return null;
    }
    if (this.energy < this.config.anchorCost) return this.failAnchor('insufficient_energy', targetId);
    if (this.anchor) this.releaseAnchor();
    this.energy -= this.config.anchorCost;
    this.sinceUse = 0;
    target.temporalFrozen = true;
    this.anchor = { targetId, remaining: this.config.anchorDuration };
    this.bus.emit('anchor.set', { targetId, duration: this.config.anchorDuration });
    return null;
  }

  releaseAnchor(): void {
    if (!this.anchor) return;
    const target = this.targets.get(this.anchor.targetId);
    if (target) target.temporalFrozen = false;
    this.bus.emit('anchor.released', { targetId: this.anchor.targetId });
    this.anchor = null;
  }

  /** Energy regeneration and anchor countdown. */
  update(dt: number): void {
    if (this.anchor) {
      this.anchor.remaining -= dt;
      if (this.anchor.remaining <= 0) this.releaseAnchor();
    }
    if (this.preview) return;
    this.sinceUse += dt;
    if (this.sinceUse >= this.config.regenDelay) this.energy = Math.min(this.config.maxEnergy, this.energy + this.config.regenPerSecond * dt);
  }

  isFrozen(id: string): boolean {
    return this.targets.get(id)?.temporalFrozen ?? false;
  }

  private fail(reason: RewindFailure, targetId?: string): RewindFailure {
    this.bus.emit('rewind.failed', { reason, targetId });
    return reason;
  }

  private failAnchor(reason: RewindFailure, targetId?: string): RewindFailure {
    this.bus.emit('anchor.failed', { reason, targetId });
    return reason;
  }

  /** Persisted cooldown/energy state (NFR-08); snapshot history itself is intentionally not saved. */
  serialize(): { energy: number; rewind: boolean; anchor: boolean } {
    return { energy: this.energy, rewind: this.enabled.rewind, anchor: this.enabled.anchor };
  }
}
