import * as THREE from 'three';
import { Counterweight, FallingProp, poseAt, PulsingRoots, type Prop } from '../sim/props';
import { clockTexture, G } from './geometry';
import { M, mat } from './palette';

// Views for rewindable props. Each view can pose itself from any captured state, which the ghost preview uses.

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0]): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(...pos);
  o.rotation.set(...rot);
  o.castShadow = o.receiveShadow = true;
  parent.add(o);
  return o;
}

function lanternModel(): THREE.Group {
  const g = new THREE.Group();
  for (const [x, z] of [
    [-0.14, -0.14],
    [0.14, -0.14],
    [-0.14, 0.14],
    [0.14, 0.14],
  ] as const)
    add(g, G.cyl(0.015, 0.015, 0.46, 4), M.iron(), [x, 0, z]);
  add(g, G.cone(0.24, 0.18, 4), M.iron(), [0, 0.32, 0], [0, Math.PI / 4, 0]);
  add(g, G.box(0.32, 0.04, 0.32), M.iron(), [0, -0.23, 0]);
  add(g, G.torus(0.05, 0.012, 4, 10), M.iron(), [0, 0.44, 0]);
  add(g, G.sphere(0.11, 8, 6), M.lampGlow(), [0, 0, 0]).castShadow = false;
  return g;
}

function spanModel(): THREE.Group {
  const g = new THREE.Group();
  add(g, G.box(3.0, 0.22, 8), M.wood(), [0, 0.14, 0]);
  for (let i = 0; i < 8; i++) add(g, G.box(3.2, 0.06, 0.8), mat('plankLight', '#7a5a46'), [0, 0.27, -3.5 + i], [0, (i % 3) * 0.02 - 0.02, 0]);
  add(g, G.box(0.2, 0.4, 8), M.darkwood(), [-1.4, -0.1, 0]);
  add(g, G.box(0.2, 0.4, 8), M.darkwood(), [1.4, -0.1, 0]);
  for (const x of [-1.7, 1.7]) {
    add(g, G.box(0.1, 0.1, 8), M.wood(), [x, 1.3, 0]);
    for (let i = 0; i < 5; i++) add(g, G.box(0.1, 1.05, 0.1), M.wood(), [x, 0.78, -3.8 + i * 1.9]);
  }
  return g;
}

function bellModel(): THREE.Group {
  const g = new THREE.Group();
  const pts = [
    [0.0, 0.75],
    [0.22, 0.74],
    [0.32, 0.62],
    [0.38, 0.3],
    [0.48, -0.2],
    [0.7, -0.62],
    [0.74, -0.72],
    [0.66, -0.74],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const bell = add(g, new THREE.LatheGeometry(pts, 16), M.bronze(), [0, 0, 0]);
  (bell.material as THREE.Material).side = THREE.DoubleSide;
  add(g, G.torus(0.1, 0.03, 5, 10), M.iron(), [0, 0.8, 0]);
  add(g, G.sphere(0.12, 8, 6), M.iron(), [0, -0.6, 0]);
  add(g, G.torus(0.62, 0.04, 5, 20), M.brass(), [0, -0.5, 0], [Math.PI / 2, 0, 0]);
  return g;
}

function rootwallModel(size: THREE.Vector3, seed: number): THREE.Group {
  const g = new THREE.Group();
  const rnd = (i: number) => (Math.sin(i * 91.7 + seed * 13.1) * 43758.5453) % 1;
  const r = (i: number) => Math.abs(rnd(i));
  const n = Math.round(size.x * 2.2);
  for (let i = 0; i < n; i++) {
    const x = (r(i) - 0.5) * size.x;
    const len = size.y * (0.9 + r(i + 50) * 0.4);
    add(g, G.cyl(0.08, 0.22 + r(i + 7) * 0.12, len, 6), M.root(), [x, 0, (r(i + 3) - 0.5) * size.z * 0.8], [(r(i + 11) - 0.5) * 0.5, 0, (r(i + 13) - 0.5) * 0.9]);
  }
  for (let i = 0; i < 4; i++) add(g, G.cyl(0.12, 0.16, size.x * 0.9, 6), M.root(), [0, (r(i + 20) - 0.5) * size.y * 0.8, (r(i + 21) - 0.5) * size.z * 0.6], [0, 0, Math.PI / 2 + (r(i + 22) - 0.5) * 0.3]);
  for (let i = 0; i < 6; i++) add(g, G.ico(0.1, 0), M.amberGlow(), [(r(i + 30) - 0.5) * size.x * 0.9, (r(i + 31) - 0.3) * size.y * 0.7, size.z * 0.42]).castShadow = false;
  return g;
}

const keyFaces: { whole?: THREE.Material; broken?: THREE.Material } = {};
function keyclockModel(): THREE.Group {
  const g = new THREE.Group();
  keyFaces.whole ??= new THREE.MeshStandardMaterial({ map: clockTexture(7, 12), emissiveMap: clockTexture(7, 12), emissive: new THREE.Color('#6a6488'), roughness: 0.6 });
  keyFaces.broken ??= new THREE.MeshStandardMaterial({ map: clockTexture(null, 12), color: '#8a8396', roughness: 0.9 });
  add(g, G.box(0.56, 0.78, 0.34), M.darkwood(), [0, 0.39, 0]);
  const face = add(g, new THREE.CircleGeometry(0.21, 24), keyFaces.whole, [0, 0.5, 0.175]);
  face.name = 'face';
  const shards = new THREE.Group();
  shards.name = 'shards';
  const glass = mat('glass', '#cfe8f0', { transparent: true, opacity: 0.45, roughness: 0.1 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = add(shards, G.box(0.12, 0.14, 0.01), glass, [Math.cos(a) * 0.15, 0.5 + Math.sin(a) * 0.15, 0.2], [0, 0, a]);
    s.userData.dir = new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.6 - 0.3, 0.8 + (i % 3) * 0.2);
    s.userData.base = s.position.clone();
  }
  g.add(shards);
  return g;
}

function counterweightModel(cw: Counterweight): { group: THREE.Group; weight: THREE.Mesh; chain: THREE.Mesh; door: THREE.Mesh } {
  const group = new THREE.Group();
  const weight = add(group, G.box(0.9, 1.2, 0.9), M.iron(), [0, 0, 0]);
  add(weight, G.box(0.96, 0.12, 0.96), M.brass(), [0, 0.4, 0]);
  const chain = add(group, G.cyl(0.03, 0.03, 1, 5), M.iron(), [0, 0, 0]);
  const dw = cw.door.max.x - cw.door.min.x;
  const dh = cw.door.max.y - cw.door.min.y;
  const dd = cw.door.max.z - cw.door.min.z;
  const door = add(group, G.box(dw, dh, dd), M.iron(), [0, 0, 0]);
  for (let i = 0; i < 4; i++) add(door, G.box(dw * 1.02, 0.08, dd * 1.4), M.brass(), [0, -dh / 2 + 0.4 + i * 0.85, 0]);
  return { group, weight, chain, door };
}

export class PropView {
  readonly object = new THREE.Group();
  private model: THREE.Group;
  private cw?: ReturnType<typeof counterweightModel>;
  private baseOffset = 0;
  private override: THREE.Material | null = null;

  constructor(readonly prop: Prop) {
    if (prop instanceof Counterweight) {
      this.cw = counterweightModel(prop);
      this.model = this.cw.group;
    } else if (prop instanceof PulsingRoots) {
      this.model = rootwallModel(new THREE.Vector3(prop.size.x, prop.size.y, prop.size.z), 7);
      this.baseOffset = prop.size.y / 2;
    } else if (prop instanceof FallingProp) {
      switch (prop.visual) {
        case 'lantern':
          this.model = lanternModel();
          break;
        case 'span':
          this.model = spanModel();
          break;
        case 'bell':
          this.model = bellModel();
          break;
        case 'keyclock':
          this.model = keyclockModel();
          this.model.rotation.y = -Math.PI / 2;
          break;
        case 'rootwall': {
          const s = prop.cfg.size ?? { x: 8, y: 3.6, z: 1.6 };
          this.model = rootwallModel(new THREE.Vector3(s.x, s.y, s.z), 3);
          break;
        }
        default:
          this.model = new THREE.Group();
          add(this.model, G.box(0.6, 0.6, 0.6), M.wood(), [0, 0, 0]);
      }
    } else {
      this.model = new THREE.Group();
    }
    if (this.cw) this.object.add(this.model);
    else {
      const holder = new THREE.Group();
      holder.add(this.model);
      this.model.position.y += this.baseOffset;
      this.object.add(holder);
    }
  }

  /** Poses the view from a captured temporal state (live state when omitted). */
  apply(state: number[] = this.prop.capture()): void {
    const p = this.prop;
    const holder = this.object.children[0];
    if (p instanceof Counterweight && this.cw) {
      const h = state[0];
      const y = p.anchor.y - p.travel * (1 - h) - 0.8;
      this.cw.weight.position.set(p.anchor.x, y, p.anchor.z);
      const top = p.anchor.y;
      this.cw.chain.position.set(p.anchor.x, (top + y + 0.6) / 2, p.anchor.z);
      this.cw.chain.scale.y = Math.max(0.05, top - (y + 0.6));
      const d = p.door;
      this.cw.door.position.set((d.min.x + d.max.x) / 2, (d.min.y + d.max.y) / 2 + d.lift * h, (d.min.z + d.max.z) / 2);
      return;
    }
    if (p instanceof PulsingRoots) {
      const prog = state[0];
      holder.position.set(p.center.x, p.center.y - p.size.y * (1 - prog), p.center.z);
      holder.visible = prog > 0.02;
      return;
    }
    if (p instanceof FallingProp) {
      const pose = poseAt(p.cfg, state[0]);
      holder.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
      holder.rotation.set(pose.rot.x, pose.rot.y, pose.rot.z);
      if (p.visual === 'keyclock') {
        const k = state[0];
        const face = this.model.getObjectByName('face') as THREE.Mesh;
        face.material = this.override ?? (k < 0.05 ? keyFaces.whole! : keyFaces.broken!);
        const shards = this.model.getObjectByName('shards')!;
        for (const s of shards.children) {
          const dir = s.userData.dir as THREE.Vector3;
          s.position.copy(s.userData.base as THREE.Vector3).addScaledVector(dir, k * 0.9);
          s.position.y = Math.max(-0.02, s.position.y - k * k * 0.6);
          s.rotation.x = k * 4;
        }
      }
      if (p.visual === 'rootwall') holder.visible = state[0] > 0.02 || p.cfg.rest.pos.y > -1;
    }
  }

  /** Draws the whole view with one material (rewind ghost, target outline). */
  useMaterial(material: THREE.Material): this {
    this.override = material;
    this.object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.material = material;
        m.castShadow = m.receiveShadow = false;
      }
    });
    return this;
  }
}
