import * as THREE from 'three';
import { Rng } from '../core/math';
import type { Box, CollisionWorld, Material } from '../sim/physics';
import { merge, prepare, prismGeometry } from './geometry';
import { worldColor, worldMaterial } from './palette';

// Builds the level's static geometry from the collision world, merged per material (few draw calls).

export interface RoofPart {
  mesh: THREE.Mesh;
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export interface FoldPart {
  group: THREE.Group;
  seed: number;
}

export interface StaticWorld {
  group: THREE.Group;
  roofs: RoofPart[];
  doors: Map<string, { mesh: THREE.Mesh; box: Box }>;
  folds: FoldPart[];
}

function boxGeometry(b: Box): THREE.BufferGeometry {
  const w = b.max.x - b.min.x;
  const h = b.max.y - b.min.y;
  const d = b.max.z - b.min.z;
  let g: THREE.BufferGeometry;
  switch (b.shape) {
    case 'prism':
      g = prismGeometry(w, h, d);
      break;
    case 'cylinder':
      g = new THREE.CylinderGeometry(Math.min(w, d) / 2, Math.min(w, d) / 2, h, 14);
      break;
    case 'cone':
      g = new THREE.ConeGeometry(Math.max(w, d) / 2, h, 14);
      break;
    default: {
      // Large ground slabs get subdivisions so the vertex tint can vary across them.
      const seg = (v: number) => Math.max(1, Math.min(24, Math.round(v / 8)));
      g = new THREE.BoxGeometry(w, h, d, seg(w), 1, seg(d));
    }
  }
  if (b.rotY) g.rotateY(b.rotY);
  g.translate((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
  return g;
}

/** Per-vertex tint noise so merged surfaces don't read as flat plastic. */
function tint(g: THREE.BufferGeometry, base: THREE.Color, rng: Rng, amount: number): THREE.BufferGeometry {
  const prepared = prepare(g, base);
  const pos = prepared.getAttribute('position');
  const col = prepared.getAttribute('color') as THREE.BufferAttribute;
  const boxShift = rng.range(-amount, amount);
  for (let i = 0; i < pos.count; i += 3) {
    // Same tint per triangle keeps the flat-shaded look crisp.
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const n = Math.sin(x * 0.37 + z * 0.21) * 0.5 + Math.sin(x * 0.11 - z * 0.29) * 0.5;
    const k = 1 + boxShift + n * amount * 0.6;
    for (let j = 0; j < 3; j++) col.setXYZ(i + j, base.r * k, base.g * k, base.b * k);
  }
  return prepared;
}

export function buildStaticWorld(world: CollisionWorld, dynamicOwners: Set<string>): StaticWorld {
  const group = new THREE.Group();
  group.name = 'static-world';
  const rng = new Rng(77);
  const byMat = new Map<Material, THREE.BufferGeometry[]>();
  const roofs: RoofPart[] = [];
  const doors = new Map<string, { mesh: THREE.Mesh; box: Box }>();
  const foldGeoms = new Map<string, Array<{ g: THREE.BufferGeometry; mat: Material }>>();

  for (const b of world.boxes) {
    if (b.mat === 'invisible') continue;
    if (b.owner && dynamicOwners.has(b.owner)) continue; // drawn by its prop view
    const base = worldColor(b.mat);
    if (b.owner) {
      // Scripted doors: their own mesh so they can disappear when opened.
      const mesh = new THREE.Mesh(tint(boxGeometry(b), base, rng, 0.05), worldMaterial(b.mat));
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      doors.set(b.owner, { mesh, box: b });
      continue;
    }
    const g = tint(boxGeometry(b), base, rng, b.mat === 'grass' || b.mat === 'moss' ? 0.16 : 0.08);
    if (b.tag?.startsWith('fold')) {
      const list = foldGeoms.get(b.tag) ?? [];
      list.push({ g, mat: b.mat });
      foldGeoms.set(b.tag, list);
      continue;
    }
    if (b.roofOf) {
      const mesh = new THREE.Mesh(g, worldMaterial(b.mat));
      mesh.castShadow = true;
      group.add(mesh);
      roofs.push({ mesh, min: new THREE.Vector3(b.min.x, b.min.y, b.min.z), max: new THREE.Vector3(b.max.x, b.max.y, b.max.z) });
      continue;
    }
    const list = byMat.get(b.mat) ?? [];
    list.push(g);
    byMat.set(b.mat, list);
  }

  for (const [m, geoms] of byMat) {
    const mesh = new THREE.Mesh(merge(geoms), worldMaterial(m));
    mesh.receiveShadow = true;
    mesh.castShadow = m !== 'grass' && m !== 'moss' && m !== 'cobble' && m !== 'darkstone';
    mesh.name = `world-${m}`;
    group.add(mesh);
  }

  const folds: FoldPart[] = [];
  let seed = 0;
  for (const parts of foldGeoms.values()) {
    const fg = new THREE.Group();
    // Pivot at the house base so the fold reads as a page being turned.
    const bb = new THREE.Box3();
    for (const p of parts) {
      p.g.computeBoundingBox();
      bb.union(p.g.boundingBox!);
    }
    const pivot = new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.min.y, (bb.min.z + bb.max.z) / 2);
    for (const p of parts) {
      p.g.translate(-pivot.x, -pivot.y, -pivot.z);
      const mesh = new THREE.Mesh(p.g, worldMaterial(p.mat));
      mesh.castShadow = true;
      fg.add(mesh);
    }
    fg.position.copy(pivot);
    group.add(fg);
    folds.push({ group: fg, seed: seed++ });
  }

  return { group, roofs, doors, folds };
}
