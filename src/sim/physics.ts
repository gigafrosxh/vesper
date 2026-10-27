import type { Vec3 } from '../core/math';

// Deterministic kinematic collision world made of axis-aligned boxes (R1: no physics-engine nondeterminism).

export type Material =
  | 'ground'
  | 'grass'
  | 'cobble'
  | 'stone'
  | 'darkstone'
  | 'wood'
  | 'plank'
  | 'roof'
  | 'brass'
  | 'plaster'
  | 'invisible'
  | 'moss'
  | 'root'
  | 'bark'
  | 'iron'
  | 'water';

export interface Box {
  id: string;
  min: Vec3;
  max: Vec3;
  mat: Material;
  /** Top edge can be mantled/climbed (FR-002 "authored ledges"). */
  climbable?: boolean;
  /** Disabled boxes (e.g. a falling bridge span) are ignored by collision. */
  enabled?: boolean;
  /** Visual only, no collision. */
  ghost?: boolean;
  /** Owner of a dynamic box. */
  owner?: string;
  /** Hidden when the player is inside (roof over an interior). */
  roofOf?: string;
  rotY?: number; // visual rotation only (collision stays axis-aligned)
  /** Visual shape; collision is always the box. */
  shape?: 'box' | 'prism' | 'cylinder' | 'cone';
  /** Free-form tag for the view layer (e.g. 'fold' for the folding rooftops). */
  tag?: string;
}

export interface KillVolume {
  id: string;
  min: Vec3;
  max: Vec3;
  cause: string;
}

export class CollisionWorld {
  boxes: Box[] = [];
  kills: KillVolume[] = [];
  private byId = new Map<string, Box>();

  add(box: Box): Box {
    if (box.enabled === undefined) box.enabled = true;
    this.boxes.push(box);
    this.byId.set(box.id, box);
    return box;
  }

  get(id: string): Box | undefined {
    return this.byId.get(id);
  }

  private solid(b: Box): boolean {
    return b.enabled !== false && !b.ghost;
  }

  /** Highest walkable surface under a circle footprint, not higher than maxY. */
  groundHeight(x: number, z: number, radius: number, maxY: number): number {
    let best = -Infinity;
    for (const b of this.boxes) {
      if (!this.solid(b)) continue;
      if (b.max.y > maxY) continue;
      if (x + radius * 0.7 < b.min.x || x - radius * 0.7 > b.max.x) continue;
      if (z + radius * 0.7 < b.min.z || z - radius * 0.7 > b.max.z) continue;
      if (b.max.y > best) best = b.max.y;
    }
    return best;
  }

  /** Lowest ceiling above the head, used to stop jumps. */
  ceilingHeight(x: number, z: number, radius: number, minY: number): number {
    let best = Infinity;
    for (const b of this.boxes) {
      if (!this.solid(b)) continue;
      if (b.min.y < minY) continue;
      if (x + radius * 0.7 < b.min.x || x - radius * 0.7 > b.max.x) continue;
      if (z + radius * 0.7 < b.min.z || z - radius * 0.7 > b.max.z) continue;
      if (b.min.y < best) best = b.min.y;
    }
    return best;
  }

  /**
   * Pushes a vertical cylinder (feet at pos.y) out of walls. Boxes whose top is within stepHeight of the
   * feet are treated as steps and ignored here. Returns the wall box that was hit last (for ledge checks).
   */
  resolveHorizontal(pos: Vec3, radius: number, height: number, stepHeight: number): Box | null {
    let hit: Box | null = null;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const b of this.boxes) {
        if (!this.solid(b)) continue;
        if (b.max.y <= pos.y + stepHeight) continue;
        if (b.min.y >= pos.y + height) continue;
        const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
        const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const push = radius - d;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
        } else {
          // Centre inside the box: push out along the shallowest axis.
          const left = pos.x - b.min.x;
          const right = b.max.x - pos.x;
          const back = pos.z - b.min.z;
          const front = b.max.z - pos.z;
          const m = Math.min(left, right, back, front);
          if (m === left) pos.x = b.min.x - radius;
          else if (m === right) pos.x = b.max.x + radius;
          else if (m === back) pos.z = b.min.z - radius;
          else pos.z = b.max.z + radius;
        }
        hit = b;
        moved = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  /** Finds a climbable ledge in front of the actor whose top is in [minRise, maxRise] above the feet. */
  findLedge(pos: Vec3, dirX: number, dirZ: number, radius: number, minRise: number, maxRise: number): { box: Box; top: number } | null {
    const probeX = pos.x + dirX * (radius + 0.35);
    const probeZ = pos.z + dirZ * (radius + 0.35);
    let best: { box: Box; top: number } | null = null;
    for (const b of this.boxes) {
      if (!this.solid(b) || !b.climbable) continue;
      if (probeX < b.min.x || probeX > b.max.x || probeZ < b.min.z || probeZ > b.max.z) continue;
      const rise = b.max.y - pos.y;
      if (rise < minRise || rise > maxRise) continue;
      // Space above the ledge must be free.
      if (this.ceilingHeight(probeX, probeZ, radius, b.max.y + 0.01) < b.max.y + 1.7) continue;
      if (!best || b.max.y < best.top) best = { box: b, top: b.max.y };
    }
    return best;
  }

  /** Ray vs boxes (slab test). Returns distance to the first hit or Infinity. */
  raycast(origin: Vec3, dir: Vec3, maxDist: number, ignoreOwner?: string): number {
    let best = maxDist;
    for (const b of this.boxes) {
      if (!this.solid(b) || b.mat === 'invisible') continue;
      if (ignoreOwner && b.owner === ignoreOwner) continue;
      let tmin = 0;
      let tmax = best;
      let ok = true;
      for (const axis of ['x', 'y', 'z'] as const) {
        const o = origin[axis];
        const d = dir[axis];
        const lo = b.min[axis];
        const hi = b.max[axis];
        if (Math.abs(d) < 1e-9) {
          if (o < lo || o > hi) {
            ok = false;
            break;
          }
        } else {
          let t1 = (lo - o) / d;
          let t2 = (hi - o) / d;
          if (t1 > t2) [t1, t2] = [t2, t1];
          if (t1 > tmin) tmin = t1;
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) {
            ok = false;
            break;
          }
        }
      }
      if (ok && tmin < best) best = tmin;
    }
    return best;
  }

  lineOfSight(a: Vec3, b: Vec3, ignoreOwner?: string): boolean {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-6) return true;
    const hit = this.raycast(a, { x: dx / d, y: dy / d, z: dz / d }, d, ignoreOwner);
    return hit >= d - 0.3;
  }

  killAt(pos: Vec3): KillVolume | null {
    for (const k of this.kills) {
      if (pos.x >= k.min.x && pos.x <= k.max.x && pos.y >= k.min.y && pos.y <= k.max.y && pos.z >= k.min.z && pos.z <= k.max.z) return k;
    }
    return null;
  }
}

export function boxOverlapsCylinder(b: { min: Vec3; max: Vec3 }, pos: Vec3, radius: number, height: number): boolean {
  if (b.max.y <= pos.y + 0.05 || b.min.y >= pos.y + height) return false;
  const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
  const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
  return (pos.x - cx) ** 2 + (pos.z - cz) ** 2 < radius * radius;
}
