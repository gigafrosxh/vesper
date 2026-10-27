import * as THREE from 'three';
import type { Decor } from '../content/level';
import { COMBO, type Player } from '../sim/player';
import type { Mira } from '../sim/mira';
import { ES, type Enemy, type Sentinel } from '../sim/enemies';
import { G } from './geometry';
import { glow, M, mat, PALETTE } from './palette';

// Procedural characters with simple procedural animation (no external rigs).

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Sim yaw faces (-sin, -cos); models face +Z. */
export const modelYaw = (yaw: number) => yaw + Math.PI;

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scale?: [number, number, number]): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(...pos);
  o.rotation.set(...rot);
  if (scale) o.scale.set(...scale);
  o.castShadow = true;
  return o;
}

function pivot(parent: THREE.Object3D, pos: [number, number, number]): THREE.Group {
  const g = new THREE.Group();
  g.position.set(...pos);
  parent.add(g);
  return g;
}

interface Humanoid {
  root: THREE.Group;
  body: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
}

interface HumanoidStyle {
  height?: number;
  coat: THREE.Material;
  trousers: THREE.Material;
  skin: THREE.Material;
  hair?: THREE.Material;
  boots?: THREE.Material;
  bulk?: number;
}

function humanoid(style: HumanoidStyle): Humanoid {
  const s = (style.height ?? 1.8) / 1.8;
  const bulk = style.bulk ?? 1;
  const root = new THREE.Group();
  const body = pivot(root, [0, 0, 0]);
  body.scale.setScalar(s);
  const hips = pivot(body, [0, 0.95, 0]);
  const legL = pivot(hips, [-0.12, 0, 0]);
  const legR = pivot(hips, [0.12, 0, 0]);
  for (const leg of [legL, legR]) {
    leg.add(mesh(G.capsule(0.085 * bulk, 0.62), style.trousers, [0, -0.43, 0]));
    leg.add(mesh(G.box(0.16 * bulk, 0.12, 0.28), style.boots ?? M.boots(), [0, -0.88, 0.05]));
  }
  const torso = pivot(hips, [0, 0.02, 0]);
  torso.add(mesh(G.capsule(0.22 * bulk, 0.42), style.coat, [0, 0.36, 0], [0, 0, 0], [1, 1, 0.78]));
  // Coat tails.
  torso.add(mesh(G.box(0.4 * bulk, 0.42, 0.06), style.coat, [0, -0.08, -0.15], [0.15, 0, 0]));
  const head = pivot(torso, [0, 0.8, 0]);
  head.add(mesh(G.sphere(0.165, 12, 10), style.skin, [0, 0.08, 0]));
  if (style.hair) head.add(mesh(G.sphere(0.175, 12, 8), style.hair, [0, 0.13, -0.025], [0, 0, 0], [1, 0.82, 1]));
  const armL = pivot(torso, [-0.29 * bulk, 0.62, 0]);
  const armR = pivot(torso, [0.29 * bulk, 0.62, 0]);
  for (const arm of [armL, armR]) {
    arm.add(mesh(G.capsule(0.07 * bulk, 0.46), style.coat, [0, -0.3, 0]));
    arm.add(mesh(G.sphere(0.065, 6, 5), style.skin, [0, -0.6, 0]));
  }
  return { root, body, hips, torso, head, armL, armR, legL, legR };
}

function walkPose(h: Humanoid, phase: number, amount: number, armScale = 0.8): void {
  const sw = Math.sin(phase * Math.PI) * 0.75 * amount;
  h.legL.rotation.x = sw;
  h.legR.rotation.x = -sw;
  h.armL.rotation.x = -sw * armScale;
  h.armR.rotation.x = sw * armScale;
  h.hips.position.y = 0.95 + Math.abs(Math.cos(phase * Math.PI)) * 0.045 * amount;
}

function resetPose(h: Humanoid): void {
  for (const g of [h.body, h.hips, h.torso, h.head, h.armL, h.armR, h.legL, h.legR]) g.rotation.set(0, 0, 0);
  h.hips.position.y = 0.95;
  h.body.position.set(0, 0, 0);
}

// ------------------------------------------------------------------------------------------------ Elian

export class PlayerView {
  readonly h: Humanoid;
  readonly watch: THREE.Mesh;
  readonly wrench: THREE.Group;
  private prev = new THREE.Vector3();
  private cur = new THREE.Vector3();

  constructor() {
    this.h = humanoid({ coat: M.coat(), trousers: M.trousers(), skin: M.skin(), hair: M.hair() });
    const { torso, head, armR } = this.h;
    // Shirt, scarf and goggles: Elian is a clockmaker's apprentice.
    torso.add(mesh(G.box(0.2, 0.36, 0.05), M.shirt(), [0, 0.42, 0.16]));
    torso.add(mesh(G.torus(0.15, 0.05, 6, 14), mat('scarf', '#4f7f96'), [0, 0.7, 0], [Math.PI / 2, 0, 0]));
    head.add(mesh(G.torus(0.17, 0.025, 6, 16), M.brass(), [0, 0.2, 0.01], [Math.PI / 2.4, 0, 0]));
    head.add(mesh(G.cyl(0.045, 0.045, 0.04, 8), M.cyanGlow(), [-0.07, 0.24, 0.14], [1.2, 0, 0]));
    head.add(mesh(G.cyl(0.045, 0.045, 0.04, 8), M.cyanGlow(), [0.07, 0.24, 0.14], [1.2, 0, 0]));
    this.watch = mesh(G.cyl(0.07, 0.07, 0.03, 12), glow('watchGlow', PALETTE.cyan, 0.6), [0.13, 0.3, 0.17], [Math.PI / 2, 0, 0]);
    torso.add(this.watch);
    // Brass wrench-staff (melee weapon).
    this.wrench = pivot(armR, [0, -0.62, 0.02]);
    this.wrench.add(mesh(G.cyl(0.03, 0.03, 0.95, 6), M.brass(), [0, 0, 0.32], [Math.PI / 2, 0, 0]));
    this.wrench.add(mesh(G.box(0.18, 0.06, 0.12), M.brass(), [0, 0, 0.8]));
    this.wrench.add(mesh(G.torus(0.07, 0.025, 5, 10), M.iron(), [0, 0, 0.88], [Math.PI / 2, 0, 0]));
  }

  get object(): THREE.Group {
    return this.h.root;
  }

  /** Called once per sim step so rendering can interpolate between ticks. */
  capture(p: Player): void {
    this.prev.copy(this.cur);
    this.cur.set(p.pos.x, p.pos.y, p.pos.z);
  }

  snap(p: Player): void {
    this.cur.set(p.pos.x, p.pos.y, p.pos.z);
    this.prev.copy(this.cur);
  }

  update(p: Player, alpha: number, time: number, rewinding: boolean): void {
    const h = this.h;
    h.root.position.lerpVectors(this.prev, this.cur, alpha);
    h.root.rotation.y = modelYaw(p.yaw);
    resetPose(h);
    const wm = this.watch.material as THREE.MeshStandardMaterial;
    wm.emissiveIntensity = rewinding ? 2.6 + Math.sin(time * 14) * 0.6 : 0.6;
    switch (p.mode) {
      case 'move':
        if (!p.onGround) {
          h.legL.rotation.x = -0.7;
          h.legR.rotation.x = 0.35;
          h.armL.rotation.z = -0.6;
          h.armR.rotation.z = 0.6;
          h.armL.rotation.x = h.armR.rotation.x = -0.5;
        } else {
          walkPose(h, p.stepPhase, p.moveAmount);
          h.torso.rotation.x = p.sprinting ? 0.22 * p.moveAmount : 0.04 * p.moveAmount;
          // Idle breathing.
          h.torso.position.y = 0.02 + Math.sin(time * 2.2) * 0.008 * (1 - p.moveAmount);
        }
        if (rewinding) {
          h.armL.rotation.x = -1.2;
          h.armL.rotation.z = 0.3;
        }
        break;
      case 'attack': {
        const spec = COMBO[p.combo];
        const t = clamp01(p.modeT / spec.duration);
        const hit = clamp01((p.modeT - spec.hitStart * 0.6) / (spec.hitEnd - spec.hitStart * 0.6));
        if (p.combo === 2) {
          // Overhead finisher.
          h.armR.rotation.x = lerp(-2.9, 0.4, hit);
          h.armL.rotation.x = lerp(-2.6, 0.2, hit);
          h.torso.rotation.x = lerp(-0.2, 0.35, hit);
        } else {
          const dir = p.combo === 0 ? 1 : -1;
          h.armR.rotation.x = -1.4;
          h.armR.rotation.z = lerp(1.4 * dir, -1.0 * dir, hit);
          h.torso.rotation.y = lerp(0.6 * dir, -0.5 * dir, hit);
        }
        h.legL.rotation.x = 0.35 * (1 - t);
        h.legR.rotation.x = -0.25 * (1 - t);
        break;
      }
      case 'dodge': {
        const t = clamp01(p.modeT / 0.45);
        h.body.position.y = 0.45 * Math.sin(t * Math.PI) * 0.4;
        h.body.rotation.x = t < 0.8 ? (t / 0.8) * Math.PI * 2 : 0;
        h.legL.rotation.x = h.legR.rotation.x = -1.2 * Math.sin(t * Math.PI);
        h.armL.rotation.x = h.armR.rotation.x = -1.0 * Math.sin(t * Math.PI);
        break;
      }
      case 'climb': {
        const t = clamp01(p.modeT / 0.55);
        h.armL.rotation.x = h.armR.rotation.x = lerp(-2.9, -0.4, t);
        h.legL.rotation.x = -0.9 * Math.sin(t * Math.PI);
        h.legR.rotation.x = 0.2;
        break;
      }
      case 'hurt':
        h.torso.rotation.x = -0.35;
        h.head.rotation.x = -0.3;
        h.armL.rotation.z = -0.5;
        h.armR.rotation.z = 0.5;
        break;
      case 'dead': {
        const t = clamp01(p.modeT / 0.8);
        h.body.rotation.x = -Math.PI / 2 * t;
        h.body.position.y = 0.15 * t;
        h.body.position.z = -0.6 * t;
        break;
      }
    }
    // Invulnerability frames during the dodge flicker softly (no strobing).
    h.root.visible = true;
  }
}

// ------------------------------------------------------------------------------------------------ Mira

export class MiraView {
  readonly root = new THREE.Group();
  private body: THREE.Group;
  private head: THREE.Group;
  private tail: THREE.Group[] = [];
  private legs: THREE.Group[] = [];
  private prev = new THREE.Vector3();
  private cur = new THREE.Vector3();

  constructor() {
    const fur = M.catFur();
    this.body = pivot(this.root, [0, 0.28, 0]);
    this.body.add(mesh(G.capsule(0.12, 0.34), fur, [0, 0, 0], [Math.PI / 2, 0, 0]));
    this.body.add(mesh(G.sphere(0.09, 8, 6), M.catLight(), [0, -0.03, 0.2]));
    // Star speckles in her fur (astral cat).
    for (const [x, y, z] of [
      [0.08, 0.08, -0.05],
      [-0.06, 0.1, 0.08],
      [0.02, 0.11, -0.16],
    ] as const)
      this.body.add(mesh(G.ico(0.018, 0), M.cyanGlow(), [x, y, z]));
    this.head = pivot(this.body, [0, 0.13, 0.27]);
    this.head.add(mesh(G.sphere(0.11, 10, 8), fur));
    this.head.add(mesh(G.cone(0.045, 0.1, 4), fur, [-0.06, 0.11, 0], [0, 0, 0.25]));
    this.head.add(mesh(G.cone(0.045, 0.1, 4), fur, [0.06, 0.11, 0], [0, 0, -0.25]));
    this.head.add(mesh(G.sphere(0.022, 6, 4), M.eyeGlow(), [-0.045, 0.02, 0.095]));
    this.head.add(mesh(G.sphere(0.022, 6, 4), M.eyeGlow(), [0.045, 0.02, 0.095]));
    this.head.add(mesh(G.sphere(0.03, 6, 4), M.catLight(), [0, -0.035, 0.09]));
    let parent: THREE.Object3D = this.body;
    let pos: [number, number, number] = [0, 0.05, -0.26];
    for (let i = 0; i < 4; i++) {
      const seg = pivot(parent, pos);
      seg.add(mesh(G.capsule(0.03 - i * 0.004, 0.1), fur, [0, 0.06, 0]));
      this.tail.push(seg);
      parent = seg;
      pos = [0, 0.13, 0];
    }
    for (const [x, z] of [
      [-0.07, 0.17],
      [0.07, 0.17],
      [-0.07, -0.15],
      [0.07, -0.15],
    ] as const) {
      const leg = pivot(this.root, [x, 0.22, z]);
      leg.add(mesh(G.cyl(0.025, 0.022, 0.22, 5), fur, [0, -0.11, 0]));
      this.legs.push(leg);
    }
  }

  capture(m: Mira): void {
    this.prev.copy(this.cur);
    this.cur.set(m.pos.x, m.pos.y, m.pos.z);
  }

  snap(m: Mira): void {
    this.cur.set(m.pos.x, m.pos.y, m.pos.z);
    this.prev.copy(this.cur);
  }

  update(m: Mira, alpha: number, time: number): void {
    this.root.visible = m.visible;
    if (!m.visible) return;
    this.root.position.lerpVectors(this.prev, this.cur, alpha);
    this.root.rotation.y = modelYaw(m.yaw);
    const moving = Math.min(1, m.speed / 4);
    const ph = time * 9;
    this.legs.forEach((l, i) => (l.rotation.x = Math.sin(ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 * moving));
    const sit = m.sitting && moving < 0.1;
    this.body.rotation.x = sit ? -0.55 : 0;
    this.body.position.y = sit ? 0.22 : 0.28 + Math.abs(Math.sin(ph)) * 0.02 * moving;
    this.head.rotation.x = sit ? 0.5 : 0;
    this.head.rotation.y = Math.sin(time * 0.7) * 0.25 * (1 - moving);
    this.tail.forEach((t, i) => {
      t.rotation.x = (i === 0 ? -0.9 : 0.25) + Math.sin(time * 2.4 - i * 0.7) * 0.12;
      t.rotation.z = Math.sin(time * 1.6 - i * 0.8) * 0.25;
    });
  }
}

// ------------------------------------------------------------------------------------------------ Enemies

interface EnemyRig {
  root: THREE.Group;
  h?: Humanoid;
  eyes: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
  core?: THREE.MeshStandardMaterial;
  cracks?: THREE.Object3D;
  hammer?: THREE.Group;
}

function hollowRig(): EnemyRig {
  const skin = M.hollow().clone();
  const eyes = glow('hollowEye', '#a58be0', 2).clone();
  const h = humanoid({ coat: skin, trousers: skin, skin: M.porcelain(), boots: skin, height: 1.85 });
  h.torso.rotation.x = 0.35;
  // Porcelain mask with violet cracks; long arms.
  h.head.add(mesh(G.box(0.03, 0.18, 0.02), M.violetGlow(), [0.05, 0.1, 0.16], [0, 0, 0.4]));
  h.head.add(mesh(G.sphere(0.03, 6, 4), eyes, [-0.06, 0.1, 0.15]));
  h.head.add(mesh(G.sphere(0.03, 6, 4), eyes, [0.06, 0.1, 0.15]));
  for (const arm of [h.armL, h.armR]) arm.add(mesh(G.cone(0.05, 0.25, 4), skin, [0, -0.78, 0], [Math.PI, 0, 0]));
  // Smoky tatters.
  h.torso.add(mesh(G.cone(0.3, 0.7, 6), skin, [0, -0.15, 0], [Math.PI, 0, 0]));
  return { root: h.root, h, eyes, skin };
}

function rootboundRig(): EnemyRig {
  const skin = M.root().clone();
  const eyes = glow('rootEye', PALETTE.amber, 2).clone();
  const h = humanoid({ coat: skin, trousers: skin, skin, boots: skin, height: 2.1, bulk: 1.5 });
  h.torso.add(mesh(G.ico(0.3, 0), M.moss(), [-0.25, 0.65, 0]));
  h.torso.add(mesh(G.ico(0.26, 0), M.moss(), [0.27, 0.7, -0.05]));
  for (let i = 0; i < 6; i++) h.torso.add(mesh(G.cyl(0.04, 0.07, 0.8, 5), skin, [Math.sin(i * 1.7) * 0.22, 0.3, Math.cos(i * 1.7) * 0.18], [0.3 * Math.sin(i), 0, 0.4 * Math.cos(i * 2)]));
  h.head.add(mesh(G.sphere(0.035, 6, 4), eyes, [-0.06, 0.08, 0.15]));
  h.head.add(mesh(G.sphere(0.035, 6, 4), eyes, [0.06, 0.08, 0.15]));
  h.head.add(mesh(G.cone(0.04, 0.3, 4), skin, [-0.1, 0.3, 0], [0, 0, 0.4]));
  h.head.add(mesh(G.cone(0.04, 0.3, 4), skin, [0.1, 0.3, 0], [0, 0, -0.4]));
  return { root: h.root, h, eyes, skin };
}

function sentinelRig(): EnemyRig {
  const skin = M.iron().clone();
  const eyes = glow('sentEye', '#a58be0', 2.2).clone();
  const core = glow('sentCore', PALETTE.cyan, 1.4).clone();
  const h = humanoid({ coat: skin, trousers: skin, skin, boots: skin, height: 3.6, bulk: 1.9 });
  h.torso.add(mesh(G.box(0.62, 0.5, 0.42), M.brass(), [0, 0.45, 0.02]));
  h.torso.add(mesh(G.sphere(0.12, 10, 8), core, [0, 0.45, 0.24]));
  // Bell-shaped head (it was built to guard the bells).
  h.head.add(mesh(G.cyl(0.14, 0.24, 0.3, 12), M.bronze(), [0, 0.12, 0]));
  h.head.add(mesh(G.sphere(0.14, 10, 6), M.bronze(), [0, 0.27, 0], [0, 0, 0], [1, 0.6, 1]));
  h.head.add(mesh(G.box(0.2, 0.035, 0.03), eyes, [0, 0.1, 0.22]));
  // Shoulder plates.
  h.torso.add(mesh(G.sphere(0.16, 8, 6), M.brass(), [-0.42, 0.66, 0], [0, 0, 0], [1, 0.7, 1]));
  h.torso.add(mesh(G.sphere(0.16, 8, 6), M.brass(), [0.42, 0.66, 0], [0, 0, 0], [1, 0.7, 1]));
  const hammer = pivot(h.armR, [0, -0.62, 0]);
  hammer.add(mesh(G.cyl(0.03, 0.03, 0.8, 6), M.darkwood(), [0, 0, 0.3], [Math.PI / 2, 0, 0]));
  hammer.add(mesh(G.box(0.34, 0.22, 0.22), M.iron(), [0, 0, 0.7]));
  const cracks = new THREE.Group();
  for (let i = 0; i < 5; i++) cracks.add(mesh(G.box(0.02, 0.22, 0.01), M.amberGlow(), [-0.18 + i * 0.09, 0.45 + Math.sin(i) * 0.08, 0.235], [0, 0, (i - 2) * 0.35]));
  cracks.visible = false;
  h.torso.add(cracks);
  return { root: h.root, h, eyes, skin, core, cracks, hammer };
}

export class EnemyView {
  readonly rig: EnemyRig;
  private prev = new THREE.Vector3();
  private cur = new THREE.Vector3();
  private baseEye: THREE.Color;

  constructor(readonly enemy: Enemy) {
    this.rig = enemy.kind === 'hollow' ? hollowRig() : enemy.kind === 'rootbound' ? rootboundRig() : sentinelRig();
    this.baseEye = this.rig.eyes.emissive.clone();
    this.snap();
  }

  get object(): THREE.Group {
    return this.rig.root;
  }

  useMaterial(material: THREE.Material): this {
    this.rig.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.material = material;
        m.castShadow = false;
      }
    });
    return this;
  }

  capture(): void {
    this.prev.copy(this.cur);
    this.cur.set(this.enemy.pos.x, this.enemy.pos.y, this.enemy.pos.z);
  }

  snap(): void {
    this.cur.set(this.enemy.pos.x, this.enemy.pos.y, this.enemy.pos.z);
    this.prev.copy(this.cur);
  }

  /** Poses the rig from the enemy's (possibly ghost) state. */
  pose(e: Enemy, time: number, interp = true, alpha = 1): void {
    const r = this.rig;
    const h = r.h!;
    if (interp) r.root.position.lerpVectors(this.prev, this.cur, alpha);
    else r.root.position.set(e.pos.x, e.pos.y, e.pos.z);
    r.root.rotation.y = modelYaw(e.yaw);
    resetPose(h);
    if (e.kind === 'hollow') h.torso.rotation.x = 0.35;
    const t = e.stateT;
    const amberWarn = e.state === ES.Windup || e.state === ES.ChargeWindup || e.state === ES.SlamWindup;
    r.eyes.emissive.copy(amberWarn ? new THREE.Color(PALETTE.amber) : this.baseEye);
    r.eyes.emissiveIntensity = amberWarn ? 3 + Math.sin(time * 20) * 0.5 : 2;
    r.skin.emissive.set(e.hitFlash > 0 ? '#ffffff' : '#000000');
    r.skin.emissiveIntensity = e.hitFlash > 0 ? 0.6 : 0;
    r.root.scale.setScalar(1);
    switch (e.state) {
      case ES.Idle:
        h.torso.rotation.z = Math.sin(time * 1.3 + e.pos.x) * 0.04;
        break;
      case ES.Chase:
      case ES.Charge:
        walkPose(h, time * (e.state === ES.Charge ? 4 : 2.2), 1, 0.6);
        if (e.state === ES.Charge) h.torso.rotation.x = 0.5;
        break;
      case ES.Windup:
        h.armR.rotation.x = -2.4 * clamp01(t / 0.5);
        h.armL.rotation.x = -1.6 * clamp01(t / 0.5);
        h.torso.rotation.x = -0.2;
        break;
      case ES.Strike:
        h.armR.rotation.x = lerp(-2.4, 0.6, clamp01(t / 0.15));
        h.armL.rotation.x = lerp(-1.6, 0.4, clamp01(t / 0.15));
        h.torso.rotation.x = 0.45;
        break;
      case ES.Recover:
        h.armR.rotation.x = 0.4 * (1 - clamp01(t / 0.6));
        h.torso.rotation.x = 0.3;
        break;
      case ES.Stagger:
        h.torso.rotation.x = -0.5;
        h.body.rotation.z = Math.sin(time * 30) * 0.06;
        break;
      case ES.ChargeWindup:
        h.torso.rotation.x = 0.6;
        h.legL.rotation.x = 0.6;
        h.legR.rotation.x = -0.5;
        break;
      case ES.SlamWindup:
        h.armL.rotation.x = h.armR.rotation.x = -3.0 * clamp01(t / 0.6);
        h.torso.rotation.x = -0.3;
        break;
      case ES.Slam:
        h.armL.rotation.x = h.armR.rotation.x = lerp(-3.0, 0.5, clamp01(t / 0.12));
        h.torso.rotation.x = 0.6;
        break;
      case ES.Stunned:
        h.torso.rotation.x = 0.7;
        h.head.rotation.x = 0.5;
        h.armL.rotation.x = h.armR.rotation.x = 0.3;
        h.body.position.y = -0.15;
        break;
      case ES.Emerge: {
        const k = clamp01(t / 1.2);
        r.root.position.y -= (1 - k) * 2.2;
        h.armL.rotation.x = h.armR.rotation.x = -2.6 * (1 - k);
        break;
      }
      case ES.Dead: {
        const k = clamp01(e.deathT / 1.4);
        h.body.rotation.x = -k * 1.3;
        r.root.position.y -= k * 0.8;
        r.root.scale.set(1, 1 - k * 0.6, 1);
        break;
      }
    }
    if (e.kind === 'sentinel' && r.core && r.cracks) {
      const s = e as Sentinel;
      const cracked = s.crackT > 0;
      r.cracks.visible = cracked || s.phase >= 2;
      r.core.emissive.set(cracked ? PALETTE.porcelain : PALETTE.cyan);
      r.core.emissiveIntensity = cracked ? 3.2 : e.state === ES.Stunned ? 0.5 + Math.abs(Math.sin(time * 6)) : 1.4;
    }
    r.root.visible = !(e.state === ES.Dead && e.deathT > 1.6);
  }
}

// ------------------------------------------------------------------------------------------------ Villagers

/** The looping residents of Clockfall repeat the same few seconds of motion (Story Bible 01.01). */
export class NpcView {
  readonly h: Humanoid;
  private extra: THREE.Object3D | null = null;

  constructor(readonly decor: Decor) {
    const styles: Record<string, HumanoidStyle> = {
      npc_sweeper: { coat: M.clothBlue(), trousers: M.trousers(), skin: M.skin(), hair: mat('greyHair', '#9a96a8') },
      npc_waver: { coat: M.clothRed(), trousers: M.trousers(), skin: M.skin(), hair: M.hair(), height: 1.6 },
      npc_cup: { coat: M.cloth(), trousers: M.trousers(), skin: M.skin(), hair: mat('brownHair', '#5b3c2c') },
      npc_hesper: { coat: mat('shawl', '#6b5878'), trousers: mat('skirt', '#3a3048'), skin: M.skin(), hair: mat('whiteHair', '#e6e2ee'), height: 1.65 },
      npc_lamplighter: { coat: mat('longcoat', '#2f3a4a'), trousers: M.trousers(), skin: M.skin(), hair: M.hair(), height: 1.95 },
    };
    this.h = humanoid(styles[decor.type] ?? styles.npc_cup);
    const { root, armR, head } = this.h;
    root.position.set(decor.pos.x, decor.pos.y, decor.pos.z);
    root.rotation.y = decor.rotY ?? 0;
    if (decor.type === 'npc_sweeper') {
      const broom = pivot(armR, [0, -0.6, 0]);
      broom.add(mesh(G.cyl(0.025, 0.025, 1.4, 5), M.wood(), [0, -0.3, 0.1], [0.3, 0, 0]));
      broom.add(mesh(G.cone(0.14, 0.3, 6), mat('straw', '#b39a62'), [0, -1.0, 0.3], [0.3, 0, 0]));
      this.extra = broom;
    } else if (decor.type === 'npc_cup') {
      const cup = pivot(armR, [0, -0.62, 0.05]);
      cup.add(mesh(G.cyl(0.05, 0.04, 0.1, 8), M.porcelain()));
      this.extra = cup;
    } else if (decor.type === 'npc_lamplighter') {
      const pole = pivot(armR, [0, -0.6, 0]);
      pole.add(mesh(G.cyl(0.025, 0.025, 2.4, 5), M.wood(), [0, 0.9, 0.05]));
      pole.add(mesh(G.sphere(0.08, 6, 5), M.lampGlow(), [0, 2.1, 0.05]));
      head.add(mesh(G.cyl(0.2, 0.2, 0.02, 10), mat('hat', '#20262f'), [0, 0.2, 0]));
      head.add(mesh(G.cyl(0.12, 0.12, 0.22, 10), mat('hat', '#20262f'), [0, 0.3, 0]));
      this.extra = pole;
    } else if (decor.type === 'npc_hesper') {
      this.h.torso.rotation.x = 0.15;
    }
  }

  update(time: number): void {
    const h = this.h;
    resetPose(h);
    // Each loop lasts a few seconds and then snaps back: the night repeating itself.
    const loop = 4.2;
    const t = (time + this.decor.pos.x * 0.37) % loop;
    switch (this.decor.type) {
      case 'npc_sweeper':
        h.armR.rotation.x = -0.6 + Math.sin(t * 3) * 0.5;
        h.armL.rotation.x = -0.7 + Math.sin(t * 3) * 0.5;
        h.torso.rotation.x = 0.25;
        break;
      case 'npc_waver':
        h.armR.rotation.z = 2.4;
        h.armR.rotation.x = Math.sin(t * 6) * 0.35;
        break;
      case 'npc_cup': {
        const k = t < 1.4 ? t / 1.4 : t < 2.6 ? 1 : Math.max(0, 1 - (t - 2.6) / 1.2);
        h.armR.rotation.x = -1.9 * k;
        h.head.rotation.x = -0.25 * k;
        break;
      }
      case 'npc_hesper':
        h.torso.rotation.x = 0.15;
        h.head.rotation.y = Math.sin(time * 0.4) * 0.3;
        break;
      case 'npc_lamplighter':
        h.armR.rotation.x = -0.4;
        h.head.rotation.x = -0.15;
        break;
    }
    void this.extra;
  }
}
