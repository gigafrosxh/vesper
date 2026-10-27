import type { RewindFailure } from '../core/events';
import { lerp, v3, type Vec3 } from '../core/math';
import type { TemporalTarget } from '../time/temporal';
import { boxOverlapsCylinder, type Box, type CollisionWorld, type Material } from './physics';
import type { SimContext } from './context';

// Rewindable props. Their entire state is a short numeric vector so snapshots stay cheap and exact.

export interface Pose {
  pos: Vec3;
  rot: Vec3; // euler radians
}

export const PLAYER_RADIUS = 0.4;
export const PLAYER_HEIGHT = 1.8;

export abstract class Prop implements TemporalTarget {
  temporalFrozen = false;
  rewindable = true;
  anchorable = true;
  /** Visual style key for the view layer. */
  abstract readonly visual: string;
  /** Human-readable name key for HUD targeting. */
  nameKey: string;

  constructor(
    public readonly id: string,
    public readonly kind: string,
    nameKey?: string,
  ) {
    this.nameKey = nameKey ?? `target.${kind}`;
  }

  abstract capture(): number[];
  abstract restore(state: number[]): void;
  abstract getPosition(): Vec3;
  abstract getPose(): Pose;
  abstract update(ctx: SimContext, dt: number): void;
  /** Called after restore or update to move dynamic colliders. */
  syncColliders(_world: CollisionWorld): void {}
  blockedReason?(): RewindFailure | null;
  wouldTrapPlayer?(state: number[], playerPos: Vec3): boolean;
  onRewound?(seconds: number): void;
  /** Max targeting distance for rewind/anchor; large structures can be read from further away. */
  targetRange = 22;
  /** Skip the line-of-sight test (e.g. a span lying deep in the ravine below the walkway). */
  ignoreLos = false;
  /** Whether the prop currently shows up as a temporal target. */
  targetable(): boolean {
    return true;
  }
  /**
   * Deterministically regenerates the motion that led to the current state, so a checkpoint reload does not
   * strand a puzzle object without history (rewind must never be blocked by a reload, Story Bible QA notes).
   */
  synthesizeHistory(): number[][] {
    return [];
  }
  /** Persistent state written into checkpoints (puzzle progress survives reloads, NFR-08). */
  persist(): number[] {
    return this.capture();
  }
  load(state: number[]): void {
    this.restore(state);
  }
}

export interface FallingPropConfig {
  id: string;
  kind: string;
  visual: string;
  rest: Pose;
  fallen: Pose;
  /** Peak height of the arc between rest and fallen (for thrown/falling motion). */
  arc?: number;
  /** Progress acceleration (1/s²). Larger = faster fall. */
  accel?: number;
  /** Collider size (centered on pose position, axis-aligned). */
  size?: Vec3;
  colliderMat?: Material;
  /** Collider active while resting / while fallen. */
  solidAtRest?: boolean;
  solidWhenFallen?: boolean;
  climbable?: boolean;
  /** Constant-speed motion instead of accelerating fall (growing roots, rising objects). */
  linear?: number;
  anchorable?: boolean;
  nameKey?: string;
  impactSound?: string;
  impactShake?: number;
  targetRange?: number;
  ignoreLos?: boolean;
}

/**
 * Generic prop moving from a rest pose to a "fallen" pose when triggered: falling lanterns, bridge spans,
 * bells, growing root walls, a shattering clock. State: [progress, velocity, phase].
 */
export class FallingProp extends Prop {
  readonly visual: string;
  p = 0;
  v = 0;
  phase: 0 | 1 | 2 = 0; // rest | moving | fallen
  cfg: FallingPropConfig;
  box: Box | null = null;
  onImpact: ((ctx: SimContext) => void) | null = null;
  onRestoredToRest: ((ctx: SimContext | null) => void) | null = null;
  lastRewindSeconds = 0;
  rewoundFlag = false; // set on restore, consumed by scripts
  /** Scripted rewind (Mira's demonstration): progress per second running backwards to rest. */
  selfRewind = 0;

  constructor(cfg: FallingPropConfig) {
    super(cfg.id, cfg.kind, cfg.nameKey);
    this.cfg = cfg;
    this.visual = cfg.visual;
    if (cfg.anchorable !== undefined) this.anchorable = cfg.anchorable;
    if (cfg.targetRange !== undefined) this.targetRange = cfg.targetRange;
    if (cfg.ignoreLos !== undefined) this.ignoreLos = cfg.ignoreLos;
  }

  attach(world: CollisionWorld): void {
    if (!this.cfg.size) return;
    this.box = world.add({
      id: `${this.id}:col`,
      min: v3(),
      max: v3(),
      mat: this.cfg.colliderMat ?? 'invisible',
      owner: this.id,
      climbable: this.cfg.climbable,
      ghost: false,
    });
    this.syncColliders(world);
  }

  trigger(): boolean {
    if (this.phase !== 0) return false;
    this.phase = 1;
    this.v = this.cfg.linear ?? 0;
    return true;
  }

  /** Instantly place in the fallen state (used when rebuilding the world from a checkpoint). */
  setFallen(): void {
    this.p = 1;
    this.v = 0;
    this.phase = 2;
  }

  capture(): number[] {
    return [this.p, this.v, this.phase];
  }

  restore(s: number[]): void {
    const wasNotRest = this.phase !== 0;
    this.p = s[0];
    this.v = s[1];
    this.phase = s[2] as 0 | 1 | 2;
    this.rewoundFlag = true;
    if (wasNotRest && this.phase === 0) this.onRestoredToRest?.(null);
  }

  onRewound(seconds: number): void {
    this.lastRewindSeconds = seconds;
  }

  getPose(): Pose {
    return poseAt(this.cfg, this.p);
  }

  getPosition(): Vec3 {
    return this.getPose().pos;
  }

  /** Mira's demonstration: the object visibly remembers being whole. */
  rewindItself(seconds: number): void {
    this.selfRewind = Math.max(this.p, 0.01) / seconds;
  }

  synthesizeHistory(): number[][] {
    if (this.phase === 0) return [];
    const ghost = new FallingProp(this.cfg);
    ghost.trigger();
    const out: number[][] = [[0, 0, 0]];
    const dt = 1 / 60;
    for (let i = 0; i < 2000 && ghost.phase === 1 && ghost.p < this.p - 1e-9; i++) {
      out.push(ghost.capture());
      if (ghost.cfg.linear !== undefined) ghost.v = ghost.cfg.linear;
      else ghost.v += (ghost.cfg.accel ?? 2.2) * dt;
      ghost.p = Math.min(1, ghost.p + ghost.v * dt);
      if (ghost.p >= 1) {
        ghost.p = 1;
        ghost.v = 0;
        ghost.phase = 2;
      }
    }
    out.push(this.capture());
    return out;
  }

  update(ctx: SimContext, dt: number): void {
    if (this.selfRewind > 0 && !this.temporalFrozen) {
      this.p -= this.selfRewind * dt;
      if (this.p <= 0) {
        this.p = 0;
        this.v = 0;
        this.phase = 0;
        this.selfRewind = 0;
      }
      return;
    }
    if (this.temporalFrozen || this.phase !== 1) return;
    if (this.cfg.linear !== undefined) this.v = this.cfg.linear;
    else this.v += (this.cfg.accel ?? 2.2) * dt;
    this.p += this.v * dt;
    if (this.p >= 1) {
      this.p = 1;
      this.v = 0;
      this.phase = 2;
      if (this.cfg.impactSound) ctx.bus.emit('sound', { id: this.cfg.impactSound, position: [this.getPosition().x, this.getPosition().y, this.getPosition().z] });
      if (this.cfg.impactShake) ctx.bus.emit('camera.shake', { strength: this.cfg.impactShake, duration: 0.5 });
      this.onImpact?.(ctx);
    }
  }

  colliderActive(p: number, phase: number): boolean {
    if (phase === 0 || p < 0.02) return this.cfg.solidAtRest ?? true;
    if (phase === 2 || p > 0.98) return this.cfg.solidWhenFallen ?? false;
    return false;
  }

  colliderFor(p: number): { min: Vec3; max: Vec3 } | null {
    const size = this.cfg.size;
    if (!size) return null;
    const pose = poseAt(this.cfg, p);
    return {
      min: v3(pose.pos.x - size.x / 2, pose.pos.y - size.y / 2, pose.pos.z - size.z / 2),
      max: v3(pose.pos.x + size.x / 2, pose.pos.y + size.y / 2, pose.pos.z + size.z / 2),
    };
  }

  syncColliders(_world: CollisionWorld): void {
    if (!this.box) return;
    const c = this.colliderFor(this.p);
    if (!c) return;
    this.box.min = c.min;
    this.box.max = c.max;
    this.box.enabled = this.colliderActive(this.p, this.phase);
  }

  wouldTrapPlayer(state: number[], playerPos: Vec3): boolean {
    if (!this.colliderActive(state[0], state[2])) return false;
    const c = this.colliderFor(state[0]);
    return c ? boxOverlapsCylinder(c, playerPos, PLAYER_RADIUS, PLAYER_HEIGHT) : false;
  }
}

export function poseAt(cfg: FallingPropConfig, p: number): Pose {
  const a = cfg.rest;
  const b = cfg.fallen;
  const arc = cfg.arc ?? 0;
  return {
    pos: v3(lerp(a.pos.x, b.pos.x, p), lerp(a.pos.y, b.pos.y, p) + arc * 4 * p * (1 - p), lerp(a.pos.z, b.pos.z, p)),
    rot: v3(lerp(a.rot.x, b.rot.x, p), lerp(a.rot.y, b.rot.y, p), lerp(a.rot.z, b.rot.z, p)),
  };
}

/**
 * Counterweight that drives a heavy door (cellar puzzle). Pulling the lever raises the weight; it holds
 * briefly, then drops and the door slams. Rewinding the dropped weight buys time to pass (FR-006).
 * State: [height, velocity, phase, timer]; phase 0 down, 1 raising, 2 holding, 3 dropping.
 */
export class Counterweight extends Prop {
  readonly visual = 'counterweight';
  h = 0;
  v = 0;
  phase = 0;
  timer = 0;
  doorBox: Box | null = null;

  constructor(
    id: string,
    public anchor: Vec3, // top of the shaft
    public travel: number,
    public door: { min: Vec3; max: Vec3; lift: number },
    public holdTime = 0.6,
  ) {
    super(id, 'counterweight', 'target.counterweight');
  }

  attach(world: CollisionWorld): void {
    this.doorBox = world.add({ id: `${this.id}:door`, min: { ...this.door.min }, max: { ...this.door.max }, mat: 'iron', owner: this.id });
    this.syncColliders(world);
  }

  pull(): boolean {
    if (this.phase !== 0) return false;
    this.phase = 1;
    return true;
  }

  capture(): number[] {
    return [this.h, this.v, this.phase, this.timer];
  }

  restore(s: number[]): void {
    [this.h, this.v, this.phase, this.timer] = s;
  }

  getPosition(): Vec3 {
    return v3(this.anchor.x, this.anchor.y - this.travel * (1 - this.h) - 0.8, this.anchor.z);
  }

  getPose(): Pose {
    return { pos: this.getPosition(), rot: v3() };
  }

  doorOpen(h = this.h): number {
    return h;
  }

  update(ctx: SimContext, dt: number): void {
    if (this.temporalFrozen) return;
    switch (this.phase) {
      case 1:
        this.h += dt * 0.9;
        if (this.h >= 1) {
          this.h = 1;
          this.phase = 2;
          this.timer = this.holdTime;
        }
        break;
      case 2:
        this.timer -= dt;
        if (this.timer <= 0) {
          this.phase = 3;
          this.v = 0;
          ctx.bus.emit('sound', { id: 'chain_release', position: [this.anchor.x, this.anchor.y, this.anchor.z] });
        }
        break;
      case 3:
        this.v += 3.2 * dt;
        this.h -= this.v * dt;
        if (this.h <= 0) {
          this.h = 0;
          this.v = 0;
          this.phase = 0;
          ctx.bus.emit('sound', { id: 'door_slam', position: [this.door.min.x, this.door.min.y, this.door.min.z] });
          ctx.bus.emit('camera.shake', { strength: 0.3, duration: 0.4 });
        }
        break;
    }
  }

  doorCollider(h: number): { min: Vec3; max: Vec3 } {
    const lift = this.door.lift * h;
    return { min: v3(this.door.min.x, this.door.min.y + lift, this.door.min.z), max: v3(this.door.max.x, this.door.max.y + lift, this.door.max.z) };
  }

  syncColliders(_world?: CollisionWorld): void {
    if (!this.doorBox) return;
    const c = this.doorCollider(this.h);
    this.doorBox.min = c.min;
    this.doorBox.max = c.max;
  }

  wouldTrapPlayer(state: number[], playerPos: Vec3): boolean {
    return boxOverlapsCylinder(this.doorCollider(state[0]), playerPos, PLAYER_RADIUS, PLAYER_HEIGHT);
  }
}

/**
 * Root gate that grows and withdraws on a cycle (forest). It can be timed, rewound to its open state or
 * anchored while open: three valid solutions. State: [p, cycleTime].
 */
export class PulsingRoots extends Prop {
  readonly visual = 'rootwall';
  p = 1;
  c = 0;
  box: Box | null = null;
  static readonly CYCLE = [2.6, 1.0, 1.6, 1.0]; // grown, retracting, open, growing

  constructor(
    id: string,
    public center: Vec3,
    public size: Vec3,
  ) {
    super(id, 'roots', 'target.roots');
  }

  attach(world: CollisionWorld): void {
    this.box = world.add({ id: `${this.id}:col`, min: v3(), max: v3(), mat: 'invisible', owner: this.id });
    this.syncColliders(world);
  }

  capture(): number[] {
    return [this.p, this.c];
  }
  restore(s: number[]): void {
    [this.p, this.c] = s;
  }
  getPosition(): Vec3 {
    return v3(this.center.x, this.center.y + this.size.y * (this.p - 0.5), this.center.z);
  }
  getPose(): Pose {
    return { pos: v3(this.center.x, this.center.y - this.size.y * (1 - this.p), this.center.z), rot: v3() };
  }

  static progressAt(c: number): number {
    const [g, r, o, w] = PulsingRoots.CYCLE;
    const t = c % (g + r + o + w);
    if (t < g) return 1;
    if (t < g + r) return 1 - (t - g) / r;
    if (t < g + r + o) return 0;
    return (t - g - r - o) / w;
  }

  update(_ctx: SimContext, dt: number): void {
    if (this.temporalFrozen) return;
    this.c += dt;
    this.p = PulsingRoots.progressAt(this.c);
  }

  colliderFor(p: number): { min: Vec3; max: Vec3 } {
    const h = this.size.y * p;
    return {
      min: v3(this.center.x - this.size.x / 2, this.center.y, this.center.z - this.size.z / 2),
      max: v3(this.center.x + this.size.x / 2, this.center.y + h, this.center.z + this.size.z / 2),
    };
  }

  syncColliders(_world?: CollisionWorld): void {
    if (!this.box) return;
    const c = this.colliderFor(this.p);
    this.box.min = c.min;
    this.box.max = c.max;
    this.box.enabled = this.p > 0.25;
  }

  wouldTrapPlayer(state: number[], playerPos: Vec3): boolean {
    return state[0] > 0.25 && boxOverlapsCylinder(this.colliderFor(state[0]), playerPos, PLAYER_RADIUS, PLAYER_HEIGHT);
  }

  synthesizeHistory(): number[][] {
    const out: number[][] = [];
    const start = Math.max(0, this.c - 6);
    for (let c = start; c < this.c; c += 1 / 60) out.push([PulsingRoots.progressAt(c), c]);
    out.push(this.capture());
    return out;
  }
}
