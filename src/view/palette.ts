import * as THREE from 'three';
import type { Material as WorldMaterial } from '../sim/physics';

// Art direction (Charter/UX): Midnight Ink, Astral Violet, Temporal Cyan, Porcelain, Warning Amber.
export const PALETTE = {
  ink: '#17152B',
  violet: '#6E56A6',
  cyan: '#66BFD4',
  porcelain: '#EEE9F6',
  amber: '#D7A35C',
};

const WORLD_COLORS: Record<WorldMaterial, { color: string; rough?: number; metal?: number }> = {
  ground: { color: '#2b2a3f' },
  grass: { color: '#2d3b46' },
  cobble: { color: '#4a4660' },
  stone: { color: '#5b5772' },
  darkstone: { color: '#211e33' },
  wood: { color: '#5d4339' },
  plank: { color: '#6e5040' },
  roof: { color: '#3e3164' },
  brass: { color: '#b58c4c', rough: 0.45, metal: 0.7 },
  plaster: { color: '#8b83a8' },
  invisible: { color: '#000000' },
  moss: { color: '#2c4640' },
  root: { color: '#3d2b33' },
  bark: { color: '#3f2f2c' },
  iron: { color: '#3d4150', rough: 0.55, metal: 0.6 },
  water: { color: '#1e3550', rough: 0.2 },
};

const cache = new Map<string, THREE.Material>();

/** Shared world materials; flat-shaded with per-vertex tint variation. */
export function worldMaterial(mat: WorldMaterial): THREE.MeshStandardMaterial {
  const key = `w:${mat}`;
  let m = cache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    const c = WORLD_COLORS[mat];
    m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: c.rough ?? 0.92, metalness: c.metal ?? 0, flatShading: true, vertexColors: true });
    m.userData.base = new THREE.Color(c.color);
    cache.set(key, m);
  }
  return m;
}

export function worldColor(mat: WorldMaterial): THREE.Color {
  return new THREE.Color(WORLD_COLORS[mat].color);
}

/** Named shared materials for decor, props and characters. */
export function mat(name: string, color: string, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const key = `n:${name}`;
  let m = cache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...opts });
    cache.set(key, m);
  }
  return m;
}

export function glow(name: string, color: string, intensity = 1.6): THREE.MeshStandardMaterial {
  return mat(name, color, { emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 1 });
}

export const M = {
  coat: () => mat('coat', '#3b3360'),
  shirt: () => mat('shirt', '#d9d2e6'),
  skin: () => mat('skin', '#e2c2a8'),
  hair: () => mat('hair', '#2a2234'),
  trousers: () => mat('trousers', '#2b2840'),
  boots: () => mat('boots', '#231c26'),
  brass: () => mat('brass', '#c39a52', { metalness: 0.75, roughness: 0.4 }),
  iron: () => mat('iron', '#454a5c', { metalness: 0.6, roughness: 0.5 }),
  wood: () => mat('wood', '#5d4339'),
  darkwood: () => mat('darkwood', '#3e2c28'),
  leaf: () => mat('leaf', '#2f4d55'),
  leafDark: () => mat('leafDark', '#243b4b'),
  pine: () => mat('pine', '#1f3b44'),
  bark: () => mat('bark', '#3f2f2c'),
  cloth: () => mat('cloth', '#6e56a6'),
  clothRed: () => mat('clothRed', '#8a4a5c'),
  clothBlue: () => mat('clothBlue', '#3f5f86'),
  paper: () => mat('paper', '#e9e2cf'),
  porcelain: () => mat('porcelain', PALETTE.porcelain, { roughness: 0.35 }),
  catFur: () => mat('catFur', '#2a2540'),
  catLight: () => mat('catLight', '#cfc8e0'),
  hollow: () => mat('hollow', '#1d1930', { roughness: 1 }),
  root: () => mat('root', '#3d2b33'),
  moss: () => mat('moss', '#3d5a45'),
  bronze: () => mat('bronze', '#8c6a3a', { metalness: 0.7, roughness: 0.45 }),
  stone: () => mat('stone', '#5b5772'),
  lampGlow: () => glow('lampGlow', '#ffd9a0', 2.2),
  cyanGlow: () => glow('cyanGlow', PALETTE.cyan, 2.0),
  violetGlow: () => glow('violetGlow', '#a58be0', 1.6),
  amberGlow: () => glow('amberGlow', PALETTE.amber, 2.0),
  starGlow: () => glow('starGlow', '#f4e7c2', 1.4),
  eyeGlow: () => glow('eyeGlow', '#9fe6f2', 2.4),
  mushroomGlow: () => glow('mushroomGlow', '#7fd0d8', 1.2),
};
