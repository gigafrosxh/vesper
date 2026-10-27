import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Small procedural geometry helpers (all art is generated, no third-party assets).

/** Triangular prism roof spanning the given size, ridge along the longer horizontal axis. */
export function prismGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const alongX = w >= d;
  const L = alongX ? w : d;
  const W = alongX ? d : w;
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2, 0);
  shape.lineTo(W / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: L, bevelEnabled: false });
  g.translate(0, 0, -L / 2);
  if (alongX) g.rotateY(Math.PI / 2);
  g.translate(0, -h / 2, 0);
  return g;
}

/** Normalizes a geometry for merging: non-indexed with position, normal, uv and a uniform color. */
export function prepare(g: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  if (!out.getAttribute('uv')) out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((out.getAttribute('position').count) * 2), 2));
  if (!out.getAttribute('normal')) out.computeVertexNormals();
  const n = out.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) out.deleteAttribute(k);
  out.morphAttributes = {};
  return out;
}

export function merge(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(geoms, false);
  if (!m) throw new Error('merge failed');
  return m;
}

/** Shorthand mesh constructor with position, rotation and scale. */
export function part(
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  pos: [number, number, number] = [0, 0, 0],
  rot: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export const G = {
  box: (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg),
  cone: (r: number, h: number, seg = 10) => new THREE.ConeGeometry(r, h, seg),
  sphere: (r: number, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h),
  ico: (r: number, d = 0) => new THREE.IcosahedronGeometry(r, d),
  capsule: (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 4, 10),
  torus: (r: number, t: number, rs = 8, ts = 20) => new THREE.TorusGeometry(r, t, rs, ts),
};

/** 13-hour clock face (Clockfall's clocks count thirteen) with an optional hand pointing at `hour`. */
export function clockTexture(hour: number | null, hours = 13): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const r = size / 2;
  g.fillStyle = '#e9e2cf';
  g.beginPath();
  g.arc(r, r, r - 4, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 10;
  g.strokeStyle = '#8c6a3a';
  g.stroke();
  g.fillStyle = '#2a2234';
  g.font = 'bold 30px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 1; i <= hours; i++) {
    const a = (i / hours) * Math.PI * 2 - Math.PI / 2;
    g.fillText(String(i), r + Math.cos(a) * (r - 34), r + Math.sin(a) * (r - 34));
  }
  if (hour !== null) {
    const a = (hour / hours) * Math.PI * 2 - Math.PI / 2;
    g.strokeStyle = '#17152B';
    g.lineCap = 'round';
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(r, r);
    g.lineTo(r + Math.cos(a) * (r - 64), r + Math.sin(a) * (r - 64));
    g.stroke();
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(r, r);
    g.lineTo(r + Math.cos(a + 2.2) * (r - 90), r + Math.sin(a + 2.2) * (r - 90));
    g.stroke();
  }
  g.fillStyle = '#8c6a3a';
  g.beginPath();
  g.arc(r, r, 10, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function radialTexture(inner: string, outer: string, size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
