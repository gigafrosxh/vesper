import type { RewindFailure } from '../core/events';
import { angleDiff, distXZ, v3, type Vec3 } from '../core/math';
import type { TemporalTarget } from '../time/temporal';
import type { SimContext } from './context';

// Enemy types for the slice: Clockwork Hollow (village), Rootbound (forest) and the Bell-Metal Sentinel
// mini-boss. Enemies are rewindable: rewinding one restores its pose and attack timing but never its
// health, and leaves it briefly staggered — the combat use of rewind (FR-007).

export type EnemyKind = 'hollow' | 'rootbound' | 'sentinel';

export enum ES {
  Idle = 0,
  Chase = 1,
  Windup = 2,
  Strike = 3,
  Recover = 4,
  Stagger = 5,
  Dead = 6,
  ChargeWindup = 7,
  Charge = 8,
  SlamWindup = 9,
  Slam = 10,
  Stunned = 11,
  Emerge = 12,
}

export interface Hazard {
  id: number;
  kind: 'eruption' | 'shockwave';
  pos: Vec3;
  t: number;
  delay: number; // telegraph time before it becomes active
  radius: number;
  damage: number;
  speed?: number; // shockwave expansion
  maxRadius?: number;
  hit: boolean;
  owner: string;
}

export abstract class Enemy implements TemporalTarget {
  temporalFrozen = false;
  readonly rewindable = true;
  readonly anchorable = false;
  pos: Vec3;
  yaw = 0;
  hp: number;
  maxHp: number;
  state: ES = ES.Idle;
  stateT = 0;
  cooldown = 0;
  aggro = false;
  struck = false;
  home: Vec3;
  leash = 30;
  radius = 0.55;
  hitFlash = 0;
  abstract readonly kind: EnemyKind;
  abstract readonly nameKey: string;
  /** Damage multiplier (armor). */
  armor = 1;
  deathT = 0;
  vy = 0;

  constructor(
    public readonly id: string,
    pos: Vec3,
    hp: number,
  ) {
    this.pos = { ...pos };
    this.home = { ...pos };
    this.hp = hp;
    this.maxHp = hp;
  }

  get alive(): boolean {
    return this.state !== ES.Dead;
  }

  capture(): number[] {
    return [this.pos.x, this.pos.y, this.pos.z, this.yaw, this.state, this.stateT, this.cooldown, ...this.extraState()];
  }

  restore(s: number[]): void {
    this.pos = v3(s[0], s[1], s[2]);
    this.yaw = s[3];
    this.state = s[4];
    this.stateT = s[5];
    this.cooldown = s[6];
    this.restoreExtra(s.slice(7));
  }

  protected extraState(): number[] {
    return [];
  }
  protected restoreExtra(_s: number[]): void {}

  getPosition(): Vec3 {
    return v3(this.pos.x, this.pos.y + 1, this.pos.z);
  }

  blockedReason(): RewindFailure | null {
    return this.alive ? null : 'anchored_death';
  }

  /** Temporal stagger: a rewound enemy loses its footing in time. */
  onRewound(_seconds: number): void {
    if (!this.alive) return;
    this.setState(ES.Stagger);
    this.staggerFromRewind = true;
  }
  staggerFromRewind = false;

  setState(s: ES): void {
    this.state = s;
    this.stateT = 0;
    this.struck = false;
  }

  takeDamage(ctx: SimContext, amount: number): number {
    if (!this.alive) return 0;
    const dealt = Math.max(1, Math.round(amount * this.armor));
    this.hp = Math.max(0, this.hp - dealt);
    this.hitFlash = 0.15;
    this.aggro = true;
    ctx.bus.emit('enemy.damaged', { id: this.id, amount: dealt, health: this.hp });
    if (this.hp <= 0) {
      this.setState(ES.Dead);
      ctx.bus.emit('enemy.defeated', { id: this.id, kind: this.kind });
      ctx.bus.emit('sound', { id: `${this.kind}_death`, position: [this.pos.x, this.pos.y, this.pos.z] });
    } else this.onHurt(ctx, dealt);
    return dealt;
  }

  protected onHurt(_ctx: SimContext, _dealt: number): void {}

  faceTowards(p: Vec3, dt: number, rate = 6): void {
    const target = Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z));
    this.yaw += angleDiff(this.yaw, target) * Math.min(1, dt * rate);
  }

  moveTowards(ctx: SimContext, p: Vec3, speed: number, dt: number): void {
    const dx = p.x - this.pos.x;
    const dz = p.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) return;
    const nx = this.pos.x + (dx / d) * speed * dt;
    const nz = this.pos.z + (dz / d) * speed * dt;
    // Stay on solid ground: never walk off ledges (no pathing into the ravine).
    const g = ctx.world.groundHeight(nx, nz, this.radius, this.pos.y + 0.5);
    if (g < this.pos.y - 0.6) return;
    if (distXZ({ x: nx, y: 0, z: nz }, this.home) > this.leash) return;
    this.pos.x = nx;
    this.pos.z = nz;
    ctx.world.resolveHorizontal(this.pos, this.radius, 1.8, 0.45);
    this.pos.y = Math.max(g, ctx.world.groundHeight(this.pos.x, this.pos.z, this.radius, this.pos.y + 0.5));
  }

  /** Player within range and arc of a strike. */
  inStrike(ctx: SimContext, range: number, arc: number): boolean {
    const p = ctx.player.pos;
    const d = distXZ(p, this.pos);
    if (d > range || Math.abs(p.y - this.pos.y) > 1.8) return false;
    const ang = Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z));
    return Math.abs(angleDiff(this.yaw, ang)) < arc;
  }

  update(ctx: SimContext, dt: number, hazards: HazardSink): void {
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.temporalFrozen) return;
    this.stateT += dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.state === ES.Dead) {
      this.deathT += dt;
      return;
    }
    // Gravity: enemies fall when the ground disappears (e.g. a collapsing bridge span).
    const g = ctx.world.groundHeight(this.pos.x, this.pos.z, this.radius * 0.6, this.pos.y + 0.3);
    if (g < this.pos.y - 0.05) {
      this.vy -= 22 * dt;
      this.pos.y = Math.max(g, this.pos.y + this.vy * dt);
      if (this.pos.y < -6) {
        this.hp = 0;
        this.setState(ES.Dead);
        ctx.bus.emit('enemy.defeated', { id: this.id, kind: this.kind });
        return;
      }
      if (this.pos.y > g + 0.3) return;
    } else {
      this.vy = 0;
      this.pos.y = Math.max(this.pos.y, g);
    }
    if (this.state === ES.Stagger) {
      if (this.stateT > (this.staggerFromRewind ? this.rewindStagger : 0.45)) {
        this.staggerFromRewind = false;
        this.setState(ES.Chase);
      }
      return;
    }
    if (!this.aggro) {
      const p = ctx.player.pos;
      if (distXZ(p, this.pos) < this.aggroRadius && Math.abs(p.y - this.pos.y) < 4 && ctx.player.alive) {
        this.aggro = true;
        this.onAggro(ctx);
      } else return;
    }
    if (!ctx.player.alive) {
      if (this.state !== ES.Idle) this.setState(ES.Idle);
      return;
    }
    this.think(ctx, dt, hazards);
  }

  rewindStagger = 1.6;
  aggroRadius = 12;
  protected onAggro(_ctx: SimContext): void {}
  protected abstract think(ctx: SimContext, dt: number, hazards: HazardSink): void;
}

export interface HazardSink {
  spawn(h: Omit<Hazard, 'id' | 't' | 'hit'>): void;
}

export class Hollow extends Enemy {
  readonly kind = 'hollow';
  readonly nameKey = 'enemy.hollow';

  constructor(id: string, pos: Vec3) {
    super(id, pos, 40);
  }

  protected think(ctx: SimContext, dt: number): void {
    const p = ctx.player.pos;
    const d = distXZ(p, this.pos);
    switch (this.state) {
      case ES.Idle:
      case ES.Emerge:
        if (this.state === ES.Emerge && this.stateT < 1.2) return;
        this.setState(ES.Chase);
        break;
      case ES.Chase:
        this.faceTowards(p, dt);
        if (d > 1.7) this.moveTowards(ctx, p, 2.7, dt);
        if (d < 2.0 && this.cooldown <= 0) {
          this.setState(ES.Windup);
          ctx.bus.emit('sound', { id: 'hollow_windup', position: [this.pos.x, this.pos.y, this.pos.z] });
        }
        break;
      case ES.Windup:
        this.faceTowards(p, dt, 3);
        if (this.stateT > 0.75) this.setState(ES.Strike);
        break;
      case ES.Strike:
        if (!this.struck && this.inStrike(ctx, 2.1, 1.0)) {
          this.struck = true;
          ctx.player.damage(ctx, 14, this.pos);
        }
        if (this.stateT > 0.25) this.setState(ES.Recover);
        break;
      case ES.Recover:
        if (this.stateT > 0.7) {
          this.cooldown = 0.6 + ctx.rng.next() * 0.6;
          this.setState(ES.Chase);
        }
        break;
    }
  }
}

export class Rootbound extends Enemy {
  readonly kind = 'rootbound';
  readonly nameKey = 'enemy.rootbound';
  aggroRadius = 14;

  constructor(id: string, pos: Vec3) {
    super(id, pos, 55);
    this.leash = 8;
    this.radius = 0.8;
  }

  private target: Vec3 = v3();
  protected extraState(): number[] {
    return [this.target.x, this.target.z];
  }
  protected restoreExtra(s: number[]): void {
    this.target = v3(s[0] ?? 0, this.pos.y, s[1] ?? 0);
  }

  protected think(ctx: SimContext, dt: number, hazards: HazardSink): void {
    const p = ctx.player.pos;
    const d = distXZ(p, this.pos);
    switch (this.state) {
      case ES.Idle:
      case ES.Emerge:
        if (this.state === ES.Emerge && this.stateT < 1.0) return;
        this.setState(ES.Chase);
        break;
      case ES.Chase:
        this.faceTowards(p, dt, 3);
        if (d > 3) this.moveTowards(ctx, p, 1.1, dt);
        if (this.cooldown <= 0) {
          this.target = v3(p.x, p.y, p.z);
          this.setState(d < 3 ? ES.Windup : ES.SlamWindup);
          ctx.bus.emit('sound', { id: 'root_windup', position: [this.pos.x, this.pos.y, this.pos.z] });
        }
        break;
      case ES.Windup: // close sweep
        this.faceTowards(p, dt, 2);
        if (this.stateT > 0.85) this.setState(ES.Strike);
        break;
      case ES.Strike:
        if (!this.struck && this.inStrike(ctx, 3.1, 1.6)) {
          this.struck = true;
          ctx.player.damage(ctx, 16, this.pos);
        }
        if (this.stateT > 0.3) this.setState(ES.Recover);
        break;
      case ES.SlamWindup: // ranged root eruption under the player's last position, telegraphed
        this.faceTowards(p, dt, 2);
        if (this.stateT > 0.9) {
          hazards.spawn({ kind: 'eruption', pos: { ...this.target }, delay: 1.0, radius: 1.5, damage: 18, owner: this.id });
          this.setState(ES.Recover);
        }
        break;
      case ES.Recover:
        if (this.stateT > 1.0) {
          this.cooldown = 1.4 + ctx.rng.next() * 0.8;
          this.setState(ES.Chase);
        }
        break;
    }
  }
}

export interface SentinelHooks {
  onSlam(ctx: SimContext, sentinel: Sentinel): void;
  onPhase(ctx: SimContext, sentinel: Sentinel, phase: number): void;
}

/**
 * Bell-Metal Sentinel (Mission 01.04). Bell-metal armor reduces damage to 25% until a lawful bell rings
 * nearby — which only happens when the player rewinds a fallen bell back onto its hook.
 */
export class Sentinel extends Enemy {
  readonly kind = 'sentinel';
  readonly nameKey = 'enemy.sentinel';
  phase = 1;
  crackT = 0;
  hooks: SentinelHooks | null = null;
  chargeDir: Vec3 = v3();
  rewindStagger = 1.0;
  aggroRadius = 16;

  constructor(id: string, pos: Vec3) {
    super(id, pos, 300);
    this.radius = 1.1;
    this.leash = 22;
    this.armor = 0.25;
  }

  protected extraState(): number[] {
    return [this.chargeDir.x, this.chargeDir.z];
  }
  protected restoreExtra(s: number[]): void {
    this.chargeDir = v3(s[0] ?? 0, 0, s[1] ?? 0);
  }

  /** Called when a lawful bell rings within range. */
  resonate(ctx: SimContext): void {
    if (!this.alive) return;
    this.crackT = 6;
    this.armor = 1.5;
    this.setState(ES.Stunned);
    ctx.bus.emit('enemy.staggered', { id: this.id });
    ctx.bus.emit('sound', { id: 'sentinel_crack', position: [this.pos.x, this.pos.y, this.pos.z] });
  }

  protected onHurt(ctx: SimContext): void {
    const ratio = this.hp / this.maxHp;
    const next = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
    if (next !== this.phase) {
      this.phase = next;
      this.hooks?.onPhase(ctx, this, next);
    }
  }

  update(ctx: SimContext, dt: number, hazards: HazardSink): void {
    if (this.crackT > 0 && !this.temporalFrozen) {
      this.crackT -= dt;
      if (this.crackT <= 0) this.armor = 0.25;
    }
    super.update(ctx, dt, hazards);
  }

  protected think(ctx: SimContext, dt: number, hazards: HazardSink): void {
    const p = ctx.player.pos;
    const d = distXZ(p, this.pos);
    const speedMul = this.phase === 3 ? 1.3 : 1;
    switch (this.state) {
      case ES.Idle:
        this.setState(ES.Chase);
        break;
      case ES.Stunned:
        if (this.stateT > 4.5) this.setState(ES.Chase);
        break;
      case ES.Chase: {
        this.faceTowards(p, dt, 2.5);
        if (d > 2.8) this.moveTowards(ctx, p, 2.2 * speedMul, dt);
        if (this.cooldown > 0) break;
        const roll = ctx.rng.next();
        if (d < 3.4) this.setState(ES.Windup);
        else if (d > 8 && roll < 0.5) this.setState(ES.ChargeWindup);
        else if (roll < (this.phase >= 2 ? 0.7 : 0.45)) this.setState(ES.SlamWindup);
        else if (d < 6) this.setState(ES.Windup);
        else this.setState(ES.ChargeWindup);
        ctx.bus.emit('sound', { id: 'sentinel_windup', position: [this.pos.x, this.pos.y, this.pos.z] });
        break;
      }
      case ES.Windup:
        this.faceTowards(p, dt, 2);
        if (this.stateT > 0.9 / speedMul) this.setState(ES.Strike);
        break;
      case ES.Strike:
        if (!this.struck && this.inStrike(ctx, 3.6, 1.1)) {
          this.struck = true;
          ctx.player.damage(ctx, 22, this.pos);
        }
        if (this.stateT > 0.3) this.setState(ES.Recover);
        break;
      case ES.ChargeWindup:
        this.faceTowards(p, dt, 4);
        if (this.stateT > 1.0 / speedMul) {
          this.chargeDir = v3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
          this.setState(ES.Charge);
          ctx.bus.emit('sound', { id: 'sentinel_charge', position: [this.pos.x, this.pos.y, this.pos.z] });
        }
        break;
      case ES.Charge: {
        const before = { ...this.pos };
        this.moveTowards(ctx, { x: this.pos.x + this.chargeDir.x * 3, y: this.pos.y, z: this.pos.z + this.chargeDir.z * 3 }, 11 * speedMul, dt);
        const blocked = Math.hypot(this.pos.x - before.x, this.pos.z - before.z) < 11 * speedMul * dt * 0.3;
        if (!this.struck && distXZ(p, this.pos) < 1.8 && Math.abs(p.y - this.pos.y) < 1.5) {
          this.struck = true;
          ctx.player.damage(ctx, 26, this.pos);
        }
        if (this.stateT > 1.1 || blocked) {
          if (blocked) ctx.bus.emit('camera.shake', { strength: 0.4, duration: 0.4 });
          this.setState(ES.Recover);
        }
        break;
      }
      case ES.SlamWindup:
        this.faceTowards(p, dt, 2);
        if (this.stateT > 1.1 / speedMul) {
          this.setState(ES.Slam);
          hazards.spawn({ kind: 'shockwave', pos: { ...this.pos }, delay: 0, radius: 0.5, damage: 18, speed: 8.5, maxRadius: 15, owner: this.id });
          ctx.bus.emit('camera.shake', { strength: 0.7, duration: 0.6 });
          ctx.bus.emit('sound', { id: 'sentinel_slam', position: [this.pos.x, this.pos.y, this.pos.z] });
          this.hooks?.onSlam(ctx, this);
        }
        break;
      case ES.Slam:
        if (this.stateT > 0.4) this.setState(ES.Recover);
        break;
      case ES.Recover:
        if (this.stateT > 1.1 / speedMul) {
          this.cooldown = (this.phase === 1 ? 1.2 : 0.8) + ctx.rng.next() * 0.6;
          this.setState(ES.Chase);
        }
        break;
    }
  }
}
