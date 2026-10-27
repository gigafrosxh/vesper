import * as THREE from 'three';
import type { Decor } from '../content/level';
import { clockTexture, G } from './geometry';
import { M, mat } from './palette';

// Decor templates built from primitives and drawn with one InstancedMesh per template part.

interface Part {
  geo: THREE.BufferGeometry;
  material: THREE.Material;
  matrix: THREE.Matrix4;
  shadow?: boolean;
}

const mtx = (pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) =>
  new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale));

const P = (geo: THREE.BufferGeometry, material: THREE.Material, pos: [number, number, number], rot?: [number, number, number], scale?: [number, number, number], shadow = true): Part => ({
  geo,
  material,
  matrix: mtx(pos, rot, scale),
  shadow,
});

const clockMats = new Map<number, THREE.Material>();
function clockMat(n: number | null): THREE.Material {
  const key = n ?? -1;
  let m = clockMats.get(key);
  if (!m) {
    const tex = clockTexture(n === 13 ? null : n);
    m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#5a5470'), roughness: 0.7 });
    clockMats.set(key, m);
  }
  return m;
}

function template(d: Decor): Part[] {
  switch (d.type) {
    case 'tree':
      return [
        P(G.cyl(0.18, 0.3, 2.6, 7), M.bark(), [0, 1.3, 0]),
        P(G.ico(1.7, 0), M.leaf(), [0, 3.5, 0]),
        P(G.ico(1.25, 0), M.leafDark(), [0.7, 4.5, 0.25]),
        P(G.ico(1.05, 0), M.leaf(), [-0.6, 4.2, -0.45]),
      ];
    case 'pine':
      return [
        P(G.cyl(0.14, 0.22, 1.8, 6), M.bark(), [0, 0.9, 0]),
        P(G.cone(1.7, 2.6, 7), M.pine(), [0, 2.7, 0]),
        P(G.cone(1.3, 2.2, 7), M.pine(), [0, 3.9, 0]),
        P(G.cone(0.85, 1.9, 7), M.leafDark(), [0, 5.0, 0]),
      ];
    case 'lamp':
      return [
        P(G.cyl(0.07, 0.11, 3.2, 6), M.iron(), [0, 1.6, 0]),
        P(G.box(0.36, 0.06, 0.36), M.iron(), [0, 3.58, 0]),
        P(G.box(0.26, 0.36, 0.26), M.lampGlow(), [0, 3.36, 0], undefined, undefined, false),
        P(G.cone(0.26, 0.24, 4), M.iron(), [0, 3.72, 0], [0, Math.PI / 4, 0]),
      ];
    case 'crate':
      return [P(G.box(1.1, 1.1, 1.1), M.wood(), [0, 0.55, 0]), P(G.box(1.14, 0.12, 1.14), M.darkwood(), [0, 0.55, 0])];
    case 'barrel':
      return [P(G.cyl(0.4, 0.4, 0.95, 10), M.wood(), [0, 0.48, 0]), P(G.cyl(0.42, 0.42, 0.07, 10), M.iron(), [0, 0.2, 0]), P(G.cyl(0.42, 0.42, 0.07, 10), M.iron(), [0, 0.78, 0])];
    case 'gear':
      return [P(G.cyl(0.6, 0.6, 0.12, 12), M.brass(), [0, 0.06, 0]), P(G.cyl(0.18, 0.18, 0.2, 8), M.iron(), [0, 0.1, 0])];
    case 'bed':
      return [
        P(G.box(2.2, 0.45, 3.4), M.darkwood(), [0, 0.22, 0]),
        P(G.box(2.0, 0.22, 3.2), M.cloth(), [0, 0.55, 0]),
        P(G.box(1.4, 0.16, 0.5), M.porcelain(), [0, 0.72, 1.3]),
        P(G.box(2.2, 1.0, 0.12), M.darkwood(), [0, 0.5, 1.68]),
      ];
    case 'clockface':
      return [P(new THREE.CircleGeometry(1, 32), clockMat(d.n ?? 13), [0, 0, 0.02], undefined, undefined, false), P(G.torus(1, 0.07, 6, 32), M.brass(), [0, 0, 0.02])];
    case 'wallclock':
      return [
        P(G.box(0.9, 1.5, 0.3), M.darkwood(), [0, 0, 0]),
        P(new THREE.CircleGeometry(0.36, 28), clockMat(d.n ?? null), [0, 0.3, 0.16], undefined, undefined, false),
        P(G.torus(0.36, 0.04, 6, 24), M.brass(), [0, 0.3, 0.16]),
        P(G.cyl(0.04, 0.04, 0.5, 5), M.brass(), [0, -0.35, 0.16]),
      ];
    case 'calendar':
      return [P(G.box(0.55, 0.75, 0.02), M.paper(), [0, 0, 0.01], undefined, undefined, false), P(G.box(0.55, 0.12, 0.03), M.clothRed(), [0, 0.32, 0.02])];
    case 'note':
      return [P(G.box(0.32, 0.42, 0.01), M.paper(), [0, 0, 0.01], [0, 0, 0.08], undefined, false)];
    case 'bench':
      return [
        P(G.box(3, 0.1, 0.8), M.wood(), [0, 0.45, 0]),
        P(G.box(3, 0.6, 0.08), M.wood(), [0, 0.8, -0.36]),
        P(G.box(0.1, 0.45, 0.7), M.iron(), [-1.3, 0.22, 0]),
        P(G.box(0.1, 0.45, 0.7), M.iron(), [1.3, 0.22, 0]),
      ];
    case 'lanternpost':
      return [
        P(G.cyl(0.09, 0.13, 3.1, 6), M.iron(), [0, 1.55, 0]),
        P(G.box(0.75, 0.08, 0.08), M.iron(), [0.36, 3.0, 0]),
        P(G.cyl(0.02, 0.02, 0.3, 4), M.iron(), [0.6, 2.85, 0]),
      ];
    case 'automaton':
      return [
        P(G.cyl(0.35, 0.45, 1.1, 8), M.brass(), [0, 0.9, 0]),
        P(G.sphere(0.28, 8, 6), M.brass(), [0, 1.65, 0]),
        P(G.sphere(0.06, 6, 4), M.cyanGlow(), [0.1, 1.68, 0.24], undefined, undefined, false),
        P(G.cyl(0.08, 0.08, 0.8, 6), M.iron(), [0.45, 0.95, 0.1], [0.3, 0, 0.5]),
        P(G.cyl(0.15, 0.2, 0.35, 8), M.iron(), [0, 0.18, 0]),
      ];
    case 'desk':
      return [
        P(G.box(2.8, 0.1, 1.8), M.wood(), [0, 0.85, 0]),
        P(G.box(0.12, 0.8, 1.6), M.darkwood(), [-1.25, 0.4, 0]),
        P(G.box(0.12, 0.8, 1.6), M.darkwood(), [1.25, 0.4, 0]),
        P(G.box(0.5, 0.02, 0.36), M.paper(), [0.3, 0.91, 0.2], [0, 0.3, 0]),
        P(G.box(0.4, 0.02, 0.3), M.paper(), [-0.5, 0.91, -0.3], [0, -0.4, 0]),
      ];
    case 'portrait':
      return [P(G.box(1.2, 1.5, 0.08), M.brass(), [0, 0, 0]), P(G.box(1.0, 1.3, 0.02), mat('portraitCanvas', '#5b4c80'), [0, 0, 0.05]), P(G.sphere(0.22, 8, 6), M.skin(), [0, 0.15, 0.06], undefined, [1, 1.2, 0.2])];
    case 'dial':
      return [
        P(G.cyl(0.5, 0.5, 0.1, 20), M.iron(), [0, 0, 0.05], [Math.PI / 2, 0, 0]),
        P(G.torus(0.42, 0.035, 6, 24), M.brass(), [0, 0, 0.11]),
        P(G.torus(0.29, 0.035, 6, 24), M.brass(), [0, 0, 0.11]),
        P(G.torus(0.16, 0.035, 6, 24), M.brass(), [0, 0, 0.11]),
      ];
    case 'gramophone':
      return [
        P(G.box(0.8, 0.8, 0.8), M.darkwood(), [0, 0.4, 0]),
        P(G.cyl(0.32, 0.32, 0.04, 16), M.hair(), [0, 0.82, 0]),
        P(G.cone(0.45, 0.9, 12, ), M.brass(), [0.15, 1.35, 0], [0, 0, 2.3]),
      ];
    case 'gallows':
      return [P(G.box(4.6, 0.3, 0.45), M.wood(), [0, 6.1, 0]), P(G.cyl(0.035, 0.035, 1.4, 4), M.paper(), [0, 5.3, 0])];
    case 'signpost':
      return [
        P(G.cyl(0.08, 0.1, 2.5, 6), M.wood(), [0, 1.25, 0]),
        P(G.box(1.2, 0.26, 0.05), M.paper(), [0.4, 2.05, 0], [0, 0, 0.08]),
        P(G.box(1.0, 0.24, 0.05), M.paper(), [-0.3, 1.65, 0], [0, 0.5, -0.06]),
      ];
    case 'arch':
      return [
        P(G.box(0.7, 3.8, 0.7), M.stone(), [-1.7, 1.9, 0]),
        P(G.box(0.7, 3.8, 0.7), M.stone(), [1.7, 1.9, 0]),
        P(G.box(4.2, 0.7, 0.8), M.stone(), [0, 4.1, 0]),
        P(G.ico(0.18, 0), M.violetGlow(), [0, 4.1, 0.42], undefined, undefined, false),
      ];
    case 'hare':
      return [
        P(G.sphere(0.9, 8, 6), M.stone(), [0, 0.8, 0], undefined, [1, 0.9, 1.3]),
        P(G.sphere(0.5, 8, 6), M.stone(), [0, 1.6, 0.8]),
        P(G.capsule(0.12, 0.9), M.stone(), [-0.18, 2.4, 0.7], [-0.2, 0, -0.15]),
        P(G.capsule(0.12, 0.9), M.stone(), [0.18, 2.4, 0.7], [-0.2, 0, 0.15]),
        P(G.box(1.6, 0.3, 2.2), M.stone(), [0, 0.15, 0]),
      ];
    case 'startree': {
      const parts: Part[] = [
        P(G.cyl(0.5, 0.95, 7, 8), M.bark(), [0, 3.5, 0]),
        P(G.ico(3.2, 1), M.leafDark(), [0, 8.2, 0]),
        P(G.ico(2.2, 0), M.leaf(), [2.2, 7.2, 1]),
        P(G.ico(2.0, 0), M.leaf(), [-2.3, 7.6, -0.8]),
      ];
      for (let i = 0; i < 14; i++) {
        const a = i * 2.39;
        const r = 2.6 + (i % 3) * 0.6;
        parts.push(P(new THREE.OctahedronGeometry(0.22), M.starGlow(), [Math.cos(a) * r, 6.2 + (i % 4) * 0.9, Math.sin(a) * r], undefined, undefined, false));
      }
      return parts;
    }
    case 'paperstar':
      return [P(new THREE.OctahedronGeometry(0.25), M.starGlow(), [0, 0, 0], [0, 0, 0], [1, 1.3, 0.4], false)];
    case 'mushroom':
      return [P(G.cyl(0.07, 0.1, 0.45, 6), M.porcelain(), [0, 0.22, 0]), P(new THREE.SphereGeometry(0.3, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), M.mushroomGlow(), [0, 0.42, 0], undefined, [1, 0.7, 1], false)];
    case 'tent':
      return [P(G.cone(2, 3, 8), M.clothRed(), [0, 1.5, 0]), P(G.cyl(0.04, 0.04, 1, 4), M.wood(), [0, 3.4, 0]), P(G.box(0.5, 0.3, 0.02), M.amberGlow(), [0.25, 3.7, 0], undefined, undefined, false)];
    case 'fence':
      return [P(G.box(2, 0.1, 0.1), M.wood(), [0, 0.8, 0]), P(G.box(0.1, 1, 0.1), M.wood(), [-0.9, 0.5, 0]), P(G.box(0.1, 1, 0.1), M.wood(), [0.9, 0.5, 0])];
    default:
      return [];
  }
}

/** Decor types animated or rendered by other modules. */
const SPECIAL = new Set(['npc_sweeper', 'npc_waver', 'npc_cup', 'npc_hesper', 'npc_lamplighter', 'carousel']);

export interface DecorBuild {
  group: THREE.Group;
  lamps: THREE.Vector3[];
  carousel: THREE.Group | null;
  stars: THREE.InstancedMesh[];
}

export function buildDecor(decor: Decor[]): DecorBuild {
  const group = new THREE.Group();
  group.name = 'decor';
  const buckets = new Map<string, Decor[]>();
  const lamps: THREE.Vector3[] = [];
  let carousel: THREE.Group | null = null;
  for (const d of decor) {
    if (d.type === 'carousel') {
      carousel = buildCarousel();
      carousel.position.set(d.pos.x, d.pos.y, d.pos.z);
      carousel.scale.setScalar(d.scale ?? 1);
      group.add(carousel);
      continue;
    }
    if (SPECIAL.has(d.type)) continue;
    if (d.type === 'lamp') lamps.push(new THREE.Vector3(d.pos.x, d.pos.y + 3.36, d.pos.z));
    const key = `${d.type}:${d.type === 'wallclock' || d.type === 'clockface' ? (d.n ?? '') : ''}`;
    const list = buckets.get(key) ?? [];
    list.push(d);
    buckets.set(key, list);
  }
  const stars: THREE.InstancedMesh[] = [];
  const inst = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (const list of buckets.values()) {
    const parts = template(list[0]);
    for (const p of parts) {
      const im = new THREE.InstancedMesh(p.geo, p.material, list.length);
      im.castShadow = p.shadow !== false && list[0].type !== 'mushroom';
      im.receiveShadow = true;
      list.forEach((d, i) => {
        const s = d.scale ?? 1;
        inst.compose(new THREE.Vector3(d.pos.x, d.pos.y, d.pos.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.rotY ?? 0), new THREE.Vector3(s, s, s));
        im.setMatrixAt(i, inst.clone().multiply(p.matrix));
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      if (list[0].type === 'paperstar') stars.push(im);
      group.add(im);
    }
  }
  return { group, lamps, carousel, stars };
}

function buildCarousel(): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, pos: [number, number, number]) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(...pos);
    g.add(mesh);
    return mesh;
  };
  add(G.cyl(3, 3.2, 0.4, 16), M.wood(), [0, 0.2, 0]);
  add(G.cyl(0.18, 0.18, 4, 8), M.brass(), [0, 2.2, 0]);
  add(G.cone(3.6, 1.8, 16), M.clothRed(), [0, 5, 0]);
  add(G.cyl(3.4, 3.4, 0.3, 16), M.cloth(), [0, 4, 0]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    add(G.cyl(0.04, 0.04, 3.6, 4), M.brass(), [Math.cos(a) * 2.4, 2.2, Math.sin(a) * 2.4]);
    add(G.box(0.4, 0.5, 0.9), i % 2 ? M.porcelain() : M.clothBlue(), [Math.cos(a) * 2.4, 1.3, Math.sin(a) * 2.4]).rotation.y = -a;
    add(G.sphere(0.12, 6, 4), M.lampGlow(), [Math.cos(a) * 3.4, 4.0, Math.sin(a) * 3.4]);
  }
  return g;
}
