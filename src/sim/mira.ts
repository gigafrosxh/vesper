import { angleDiff, distXZ, v3, type Vec3 } from '../core/math';
import type { Player } from './player';
import type { Sim } from './game';

// Mira, the astral cat companion. She follows Elian, can be sent to authored spots by scripts and comments
// through subtitles — she never solves puzzles unless the player asks for a hint (UX §4).

export class Mira {
  pos: Vec3 = v3();
  yaw = 0;
  visible = false;
  mode: 'follow' | 'goto' | 'stay' = 'follow';
  goal: Vec3 = v3();
  speed = 0;
  sitting = false;

  snapTo(player: Player): void {
    const off = this.followOffset(player);
    this.pos = v3(player.pos.x + off.x, player.pos.y, player.pos.z + off.z);
    this.yaw = player.yaw;
  }

  private followOffset(player: Player): Vec3 {
    // Behind and to the left of Elian.
    const s = Math.sin(player.yaw);
    const c = Math.cos(player.yaw);
    const back = 1.8;
    const side = -1.2;
    return v3(s * back + c * side, 0, c * back - s * side);
  }

  goTo(p: Vec3): void {
    this.mode = 'goto';
    this.goal = { ...p };
  }

  follow(): void {
    this.mode = 'follow';
  }

  stay(): void {
    this.mode = 'stay';
  }

  arrived(): boolean {
    return distXZ(this.pos, this.goal) < 0.4;
  }

  update(sim: Sim, dt: number): void {
    if (!this.visible) return;
    const player = sim.player;
    let target: Vec3 | null = null;
    if (this.mode === 'follow') {
      const off = this.followOffset(player);
      target = v3(player.pos.x + off.x, player.pos.y, player.pos.z + off.z);
      if (distXZ(this.pos, player.pos) > 28 || Math.abs(this.pos.y - player.pos.y) > 6) {
        this.snapTo(player);
        return;
      }
    } else if (this.mode === 'goto') target = this.goal;

    if (target) {
      const dx = target.x - this.pos.x;
      const dz = target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const want = this.mode === 'follow' ? (d > 1.2 ? Math.min(9, d * 1.8) : 0) : Math.min(6, d * 3);
      this.speed += (want - this.speed) * Math.min(1, dt * 5);
      if (d > 0.05) {
        const step = Math.min(d, this.speed * dt);
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
        if (this.speed > 0.3) this.yaw += angleDiff(this.yaw, Math.atan2(-dx, -dz)) * Math.min(1, dt * 8);
      }
      const g = sim.world.groundHeight(this.pos.x, this.pos.z, 0.2, this.pos.y + 1.2);
      const ty = g > -50 ? g : target.y;
      this.pos.y += (ty - this.pos.y) * Math.min(1, dt * 8);
    }
    if (this.mode !== 'goto' && this.speed < 0.3) {
      this.yaw += angleDiff(this.yaw, Math.atan2(-(player.pos.x - this.pos.x), -(player.pos.z - this.pos.z))) * Math.min(1, dt * 3);
    }
    this.sitting = this.speed < 0.2;
  }
}
