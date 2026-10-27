import { angleDiff, approach, clamp, v3, type Vec3 } from '../core/math';
import type { InputFrame } from '../input/inputRouter';
import type { SimContext } from './context';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from './props';

// Elian: walk, sprint, jump, climb authored ledges (FR-002), attack and dodge (FR-008).

export type PlayerMode = 'move' | 'climb' | 'dodge' | 'attack' | 'hurt' | 'dead';

export const WALK_SPEED = 4.2;
export const SPRINT_SPEED = 7.4;
export const JUMP_SPEED = 7.4;
export const GRAVITY = 22;
export const STEP_HEIGHT = 0.45;
export const MAX_HEALTH = 100;

export interface AttackSpec {
  duration: number;
  hitStart: number;
  hitEnd: number;
  damage: number;
  range: number;
  arc: number; // half angle radians
  lunge: number;
}

export const COMBO: AttackSpec[] = [
  { duration: 0.42, hitStart: 0.12, hitEnd: 0.24, damage: 12, range: 2.3, arc: 1.0, lunge: 2.5 },
  { duration: 0.42, hitStart: 0.12, hitEnd: 0.24, damage: 12, range: 2.3, arc: 1.0, lunge: 2.5 },
  { duration: 0.62, hitStart: 0.2, hitEnd: 0.34, damage: 22, range: 2.6, arc: 1.2, lunge: 4 },
];

export class Player {
  pos: Vec3;
  vel: Vec3 = v3();
  yaw: number; // facing; direction = (-sin yaw, 0, -cos yaw)
  camYaw: number;
  camPitch = 0.28;
  onGround = true;
  health = MAX_HEALTH;
  maxHealth = MAX_HEALTH;
  mode: PlayerMode = 'move';
  modeT = 0;
  combo = 0;
  comboQueued = false;
  hitDone = new Set<string>();
  dodgeCooldown = 0;
  invuln = 0;
  climbFrom: Vec3 = v3();
  climbTo: Vec3 = v3();
  lockTargetId: string | null = null;
  coyote = 0;
  jumpBuffer = 0;
  sprinting = false;
  moveAmount = 0; // 0..1, for animation
  /** Cinematics and dialogue lock control. */
  locked = false;
  lastSafe: Vec3;
  stepPhase = 0;
  deathCause = '';

  constructor(pos: Vec3, yaw: number) {
    this.pos = { ...pos };
    this.yaw = yaw;
    this.camYaw = yaw;
    this.lastSafe = { ...pos };
  }

  get alive(): boolean {
    return this.mode !== 'dead';
  }

  facingDir(): Vec3 {
    return v3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  damage(ctx: SimContext, amount: number, source: Vec3 | null, cause = 'combat'): boolean {
    if (!this.alive || this.invuln > 0) return false;
    if (this.mode === 'dodge' && this.modeT > 0.04 && this.modeT < 0.36) return false; // i-frames
    this.health = Math.max(0, this.health - amount);
    ctx.bus.emit('player.damaged', { amount, health: this.health });
    ctx.bus.emit('sound', { id: 'player_hurt' });
    if (this.health <= 0) {
      this.die(ctx, cause);
      return true;
    }
    this.mode = 'hurt';
    this.modeT = 0;
    this.invuln = 0.6;
    if (source) {
      const dx = this.pos.x - source.x;
      const dz = this.pos.z - source.z;
      const d = Math.hypot(dx, dz) || 1;
      this.vel.x = (dx / d) * 6;
      this.vel.z = (dz / d) * 6;
    }
    return true;
  }

  heal(amount: number): void {
    if (!this.alive) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  die(ctx: SimContext, cause: string): void {
    if (!this.alive) return;
    this.mode = 'dead';
    this.modeT = 0;
    this.health = 0;
    this.deathCause = cause;
    this.vel = v3();
    ctx.bus.emit('player.died', { cause });
  }

  updateCamera(frame: InputFrame, dt: number, lockPos: Vec3 | null): void {
    this.camYaw -= frame.lookX;
    this.camPitch = clamp(this.camPitch + frame.lookY, -0.45, 1.1);
    if (lockPos) {
      const target = Math.atan2(-(lockPos.x - this.pos.x), -(lockPos.z - this.pos.z));
      this.camYaw += angleDiff(this.camYaw, target) * Math.min(1, dt * 6);
      this.camPitch += (0.32 - this.camPitch) * Math.min(1, dt * 3);
    }
  }

  update(ctx: SimContext, frame: InputFrame, dt: number, lockPos: Vec3 | null): void {
    const w = ctx.world;
    this.modeT += dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.dodgeCooldown > 0) this.dodgeCooldown -= dt;
    if (this.coyote > 0) this.coyote -= dt;
    if (this.jumpBuffer > 0) this.jumpBuffer -= dt;

    if (this.mode === 'dead') return;

    const input = this.locked ? { moveX: 0, moveY: 0, pressed: new Set<string>(), active: new Set<string>() } : frame;
    const pressed = input.pressed as ReadonlySet<string>;

    // Camera-relative wish direction.
    const fx = -Math.sin(this.camYaw);
    const fz = -Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw);
    const rz = -Math.sin(this.camYaw);
    let wx = rx * input.moveX + fx * input.moveY;
    let wz = rz * input.moveX + fz * input.moveY;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) {
      wx /= wl;
      wz /= wl;
    }
    const wishLen = Math.min(1, wl);
    this.moveAmount = wishLen;

    if (pressed.has('jump')) this.jumpBuffer = 0.15;

    // Mode transitions.
    if (this.mode === 'climb') {
      const t = Math.min(1, this.modeT / 0.55);
      const up = Math.min(1, t / 0.65);
      const fwd = Math.max(0, (t - 0.45) / 0.55);
      this.pos.x = this.climbFrom.x + (this.climbTo.x - this.climbFrom.x) * fwd;
      this.pos.z = this.climbFrom.z + (this.climbTo.z - this.climbFrom.z) * fwd;
      this.pos.y = this.climbFrom.y + (this.climbTo.y - this.climbFrom.y) * up;
      if (t >= 1) {
        this.mode = 'move';
        this.modeT = 0;
        this.onGround = true;
        this.vel = v3();
      }
      return;
    }

    if (this.mode === 'hurt' && this.modeT > 0.32) {
      this.mode = 'move';
      this.modeT = 0;
    }

    if (this.mode === 'dodge') {
      const d = this.facingDir();
      const speed = this.modeT < 0.32 ? 9.5 : 3;
      this.vel.x = d.x * speed;
      this.vel.z = d.z * speed;
      if (this.modeT > 0.45) {
        this.mode = 'move';
        this.modeT = 0;
      }
    }

    if (this.mode === 'attack') {
      const spec = COMBO[this.combo];
      if (pressed.has('attack')) this.comboQueued = true;
      const d = this.facingDir();
      const lungeT = this.modeT < spec.hitStart ? 1 : 0;
      this.vel.x = d.x * spec.lunge * lungeT;
      this.vel.z = d.z * spec.lunge * lungeT;
      if (this.modeT >= spec.duration) {
        if (this.comboQueued && this.combo < COMBO.length - 1) {
          this.combo++;
          this.startAttack(ctx, lockPos, wx, wz, wishLen, false);
        } else {
          this.mode = 'move';
          this.modeT = 0;
          this.combo = 0;
        }
        this.comboQueued = false;
      }
      if (pressed.has('dodge') && this.modeT > spec.hitEnd) this.startDodge(ctx, wx, wz, wishLen);
    }

    if (this.mode === 'move' || this.mode === 'hurt') {
      const active = input.active as ReadonlySet<string>;
      this.sprinting = active.has('sprint') && wishLen > 0.3 && this.mode === 'move' && !lockPos;
      const speed = (this.sprinting ? SPRINT_SPEED : WALK_SPEED) * wishLen;
      const accel = this.onGround ? (this.mode === 'hurt' ? 4 : 32) : 9;
      const tx = wl > 0.01 ? (wx / Math.max(wl, 1e-6)) * speed : 0;
      const tz = wl > 0.01 ? (wz / Math.max(wl, 1e-6)) * speed : 0;
      this.vel.x = approach(this.vel.x, tx, accel * dt);
      this.vel.z = approach(this.vel.z, tz, accel * dt);

      if (this.mode === 'move') {
        if (lockPos) {
          const target = Math.atan2(-(lockPos.x - this.pos.x), -(lockPos.z - this.pos.z));
          this.yaw += angleDiff(this.yaw, target) * Math.min(1, dt * 12);
        } else if (wl > 0.05) {
          const target = Math.atan2(-wx, -wz);
          this.yaw += angleDiff(this.yaw, target) * Math.min(1, dt * 12);
        }
        if (pressed.has('attack') && this.onGround) this.startAttack(ctx, lockPos, wx, wz, wishLen, true);
        else if (pressed.has('dodge') && this.onGround && this.dodgeCooldown <= 0) this.startDodge(ctx, wx, wz, wishLen);
        else if (this.jumpBuffer > 0 && (this.onGround || this.coyote > 0)) {
          // Mantle directly if a climbable ledge is right in front.
          const d = wl > 0.05 ? { x: wx / wl, z: wz / wl } : { x: this.facingDir().x, z: this.facingDir().z };
          const ledge = w.findLedge(this.pos, d.x, d.z, PLAYER_RADIUS, 0.9, 2.4);
          if (ledge) this.startClimb(ctx, ledge.top, d.x, d.z);
          else {
            this.vel.y = JUMP_SPEED;
            this.onGround = false;
            this.coyote = 0;
            ctx.bus.emit('sound', { id: 'jump' });
          }
          this.jumpBuffer = 0;
        }
      }
    }

    // Integrate horizontal motion.
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const wall = w.resolveHorizontal(this.pos, PLAYER_RADIUS, PLAYER_HEIGHT, STEP_HEIGHT);

    // Airborne ledge grab when pushing into a climbable wall.
    if (!this.onGround && wall?.climbable && this.mode === 'move' && wishLen > 0.3) {
      const ledge = w.findLedge(this.pos, wx / wl, wz / wl, PLAYER_RADIUS, 0.3, 2.3);
      if (ledge) {
        this.startClimb(ctx, ledge.top, wx / wl, wz / wl);
        return;
      }
    }

    // Vertical motion.
    const ground = w.groundHeight(this.pos.x, this.pos.z, PLAYER_RADIUS, this.pos.y + STEP_HEIGHT);
    if (this.onGround) {
      if (ground > this.pos.y - 0.6 && this.vel.y <= 0) {
        this.pos.y = ground;
        this.vel.y = 0;
      } else {
        this.onGround = false;
        this.coyote = 0.12;
      }
    }
    if (!this.onGround) {
      this.vel.y -= GRAVITY * dt;
      if (this.vel.y < -30) this.vel.y = -30;
      this.pos.y += this.vel.y * dt;
      const ceiling = w.ceilingHeight(this.pos.x, this.pos.z, PLAYER_RADIUS, this.pos.y + 0.5);
      if (this.vel.y > 0 && this.pos.y + PLAYER_HEIGHT > ceiling) {
        this.pos.y = ceiling - PLAYER_HEIGHT;
        this.vel.y = 0;
      }
      const g2 = w.groundHeight(this.pos.x, this.pos.z, PLAYER_RADIUS, this.pos.y + STEP_HEIGHT);
      if (this.vel.y <= 0 && this.pos.y <= g2) {
        if (this.vel.y < -14) ctx.bus.emit('sound', { id: 'land_heavy' });
        else ctx.bus.emit('sound', { id: 'land' });
        this.pos.y = g2;
        this.vel.y = 0;
        this.onGround = true;
      }
    }

    if (this.onGround && this.mode === 'move') {
      const sp = Math.hypot(this.vel.x, this.vel.z);
      if (sp > 0.5) {
        const prev = this.stepPhase;
        this.stepPhase += dt * sp * 0.75;
        if (Math.floor(prev) !== Math.floor(this.stepPhase)) ctx.bus.emit('sound', { id: 'step', volume: this.sprinting ? 0.8 : 0.5 });
      }
      this.lastSafe = { ...this.pos };
    }

    const kill = w.killAt(this.pos);
    if (kill) this.die(ctx, kill.cause);
  }

  private startAttack(ctx: SimContext, lockPos: Vec3 | null, wx: number, wz: number, wishLen: number, fresh: boolean): void {
    if (fresh) this.combo = 0;
    this.mode = 'attack';
    this.modeT = 0;
    this.hitDone.clear();
    this.comboQueued = false;
    if (lockPos) this.yaw = Math.atan2(-(lockPos.x - this.pos.x), -(lockPos.z - this.pos.z));
    else if (wishLen > 0.2) this.yaw = Math.atan2(-wx, -wz);
    ctx.bus.emit('sound', { id: this.combo === 2 ? 'swing_heavy' : 'swing' });
  }

  private startDodge(ctx: SimContext, wx: number, wz: number, wishLen: number): void {
    if (wishLen > 0.2) this.yaw = Math.atan2(-wx, -wz);
    this.mode = 'dodge';
    this.modeT = 0;
    this.dodgeCooldown = 0.55;
    this.combo = 0;
    ctx.bus.emit('sound', { id: 'dodge' });
  }

  private startClimb(ctx: SimContext, top: number, dx: number, dz: number): void {
    this.mode = 'climb';
    this.modeT = 0;
    this.climbFrom = { ...this.pos };
    this.climbTo = v3(this.pos.x + dx * (PLAYER_RADIUS + 0.6), top, this.pos.z + dz * (PLAYER_RADIUS + 0.6));
    this.vel = v3();
    this.yaw = Math.atan2(-dx, -dz);
    ctx.bus.emit('sound', { id: 'climb' });
  }

  /** Current attack hit window, if any. */
  activeAttack(): AttackSpec | null {
    if (this.mode !== 'attack') return null;
    const spec = COMBO[this.combo];
    return this.modeT >= spec.hitStart && this.modeT <= spec.hitEnd ? spec : null;
  }
}
