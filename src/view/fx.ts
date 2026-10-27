import * as THREE from 'three';
import type { Hazard } from '../sim/enemies';
import { radialTexture } from './geometry';
import { PALETTE } from './palette';

// Lightweight effects: pooled particles and hazard telegraphs (readable by shape and motion, not only colour).

const MAX = 900;

export class Particles {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private base = new Float32Array(MAX * 3);
  private gravity = new Float32Array(MAX);
  private next = 0;

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        size: 0.22,
        map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 32),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -9999;
  }

  burst(at: THREE.Vector3, color: string, count: number, speed: number, life = 0.9, gravity = 4, spread = 0.3): void {
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * Math.PI - Math.PI / 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.pos[i * 3] = at.x + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 1] = at.y + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 2] = at.z + (Math.random() - 0.5) * spread;
      this.vel[i * 3] = Math.cos(th) * Math.cos(ph) * v;
      this.vel[i * 3 + 1] = Math.abs(Math.sin(ph)) * v + speed * 0.3;
      this.vel[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * v;
      this.base[i * 3] = c.r;
      this.base[i * 3 + 1] = c.g;
      this.base[i * 3 + 2] = c.b;
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.4);
      this.gravity[i] = gravity;
    }
  }

  /** Motes drifting from one point to another (rewind "time flowing back"). */
  stream(from: THREE.Vector3, to: THREE.Vector3, color: string, count: number): void {
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const t = Math.random();
      this.pos[i * 3] = from.x + (to.x - from.x) * t + (Math.random() - 0.5) * 0.6;
      this.pos[i * 3 + 1] = from.y + (to.y - from.y) * t + (Math.random() - 0.5) * 0.6;
      this.pos[i * 3 + 2] = from.z + (to.z - from.z) * t + (Math.random() - 0.5) * 0.6;
      this.vel[i * 3] = (to.x - from.x) * 0.6;
      this.vel[i * 3 + 1] = (to.y - from.y) * 0.6 + 0.3;
      this.vel[i * 3 + 2] = (to.z - from.z) * 0.6;
      this.base[i * 3] = c.r;
      this.base[i * 3 + 1] = c.g;
      this.base[i * 3 + 2] = c.b;
      this.life[i] = this.maxLife[i] = 0.7;
      this.gravity[i] = 0;
    }
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -9999;
        this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0;
        continue;
      }
      this.vel[i * 3 + 1] -= this.gravity[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const a = this.life[i] / this.maxLife[i];
      this.col[i * 3] = this.base[i * 3] * a;
      this.col[i * 3 + 1] = this.base[i * 3 + 1] * a;
      this.col[i * 3 + 2] = this.base[i * 3 + 2] * a;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

/** Telegraphs: eruptions show a dashed amber ring that fills in; shockwaves are an expanding ring. */
export class HazardViews {
  readonly group = new THREE.Group();
  private views = new Map<number, THREE.Object3D>();
  private ringGeo = new THREE.RingGeometry(0.85, 1, 40);
  private dashGeo: THREE.BufferGeometry;
  private spikeGeo = new THREE.ConeGeometry(0.3, 1.6, 5);

  constructor() {
    // Dashed ring: shape cue independent of colour.
    const segs: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 16; i++) {
      const g = new THREE.RingGeometry(0.88, 1, 4, 1, (i / 16) * Math.PI * 2, (Math.PI * 2) / 32);
      segs.push(g);
    }
    const merged = new THREE.BufferGeometry();
    const pos: number[] = [];
    for (const g of segs) {
      const ng = g.toNonIndexed();
      pos.push(...(ng.getAttribute('position').array as Float32Array));
    }
    merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.dashGeo = merged;
  }

  update(hazards: Hazard[], time: number): void {
    const alive = new Set<number>();
    for (const h of hazards) {
      alive.add(h.id);
      let v = this.views.get(h.id);
      if (!v) {
        v = this.create(h);
        this.views.set(h.id, v);
        this.group.add(v);
      }
      v.position.set(h.pos.x, h.pos.y + 0.06, h.pos.z);
      if (h.kind === 'eruption') {
        const ring = v.children[0] as THREE.Mesh;
        const fill = v.children[1] as THREE.Mesh;
        const spikes = v.children[2];
        const k = Math.min(1, h.t / h.delay);
        ring.scale.setScalar(h.radius);
        ring.rotation.z = time * 0.8;
        fill.scale.setScalar(h.radius * k);
        (fill.material as THREE.MeshBasicMaterial).opacity = 0.15 + 0.35 * k;
        spikes.visible = h.t >= h.delay;
        spikes.scale.y = Math.min(1, (h.t - h.delay) * 6);
      } else {
        const ring = v.children[0] as THREE.Mesh;
        ring.scale.setScalar(Math.max(0.1, h.radius));
        (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - h.radius / (h.maxRadius ?? 14));
      }
    }
    for (const [id, v] of this.views) {
      if (!alive.has(id)) {
        this.group.remove(v);
        this.views.delete(id);
      }
    }
  }

  private create(h: Hazard): THREE.Object3D {
    const g = new THREE.Group();
    const flat = (geo: THREE.BufferGeometry, color: string, opacity: number) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      return m;
    };
    if (h.kind === 'eruption') {
      g.add(flat(this.dashGeo, PALETTE.amber, 0.9));
      g.add(flat(new THREE.CircleGeometry(1, 32), PALETTE.amber, 0.2));
      const spikes = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const s = new THREE.Mesh(this.spikeGeo, new THREE.MeshStandardMaterial({ color: '#3d2b33', flatShading: true }));
        const a = (i / 5) * Math.PI * 2;
        s.position.set(Math.cos(a) * h.radius * 0.5, 0.8, Math.sin(a) * h.radius * 0.5);
        s.rotation.z = Math.cos(a) * 0.3;
        s.rotation.x = Math.sin(a) * 0.3;
        spikes.add(s);
      }
      spikes.visible = false;
      g.add(spikes);
    } else {
      g.add(flat(this.ringGeo, PALETTE.amber, 1));
    }
    return g;
  }
}
