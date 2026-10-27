import { Rng, v3, type Vec3 } from '../core/math';
import type { Area, Landmark, Sim } from '../sim/game';
import type { Box, Material } from '../sim/physics';

// Static geometry of the slice: Clockfall Village (south plateau, ravine, old quarter, gate courtyard) and
// the first stretch of the Forest of False Wishes. North is -Z. Ground level is y = 0.

export interface Decor {
  type:
    | 'tree'
    | 'pine'
    | 'lamp'
    | 'npc_sweeper'
    | 'npc_waver'
    | 'npc_cup'
    | 'npc_hesper'
    | 'npc_lamplighter'
    | 'fence'
    | 'crate'
    | 'barrel'
    | 'gear'
    | 'paperstar'
    | 'lanternpost'
    | 'tent'
    | 'mushroom'
    | 'hare'
    | 'arch'
    | 'startree'
    | 'signpost'
    | 'clockface'
    | 'gallows'
    | 'automaton'
    | 'bed'
    | 'bench'
    | 'portrait'
    | 'wallclock'
    | 'gramophone'
    | 'desk'
    | 'dial'
    | 'note'
    | 'calendar'
    | 'carousel';
  pos: Vec3;
  /** Rotation about Y; the decor's front faces +Z before rotation. */
  rotY?: number;
  scale?: number;
  /** Extra numeric parameter (e.g. clock hour). */
  n?: number;
}

export const DECOR: Decor[] = [];

let counter = 0;
const id = (p: string) => `${p}${++counter}`;

function box(sim: Sim, min: [number, number, number], max: [number, number, number], mat: Material, extra: Partial<Box> = {}): Box {
  return sim.world.add({ id: extra.id ?? id('b'), min: v3(...min), max: v3(...max), mat, ...extra });
}

/** Solid house body with a visual roof. Door side is purely visual. */
function house(sim: Sim, x0: number, z0: number, x1: number, z1: number, h: number, mat: Material = 'plaster', roofH = 3, rotY = 0, tag?: string): void {
  box(sim, [x0, 0, z0], [x1, h, z1], mat, { tag });
  box(sim, [x0 - 0.4, h, z0 - 0.4], [x1 + 0.4, h + roofH, z1 + 0.4], 'roof', { ghost: true, shape: 'prism', rotY, tag });
  // Chimney.
  box(sim, [x0 + 0.8, h + 0.5, z0 + 0.8], [x0 + 1.6, h + roofH + 0.8, z0 + 1.6], 'stone', { ghost: true, tag });
}

/** Room with four walls, door gaps and a roof hidden while the player is inside. */
function room(
  sim: Sim,
  name: string,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  h: number,
  doors: Array<{ side: 'n' | 's'; x0: number; x1: number; height?: number }>,
  mat: Material = 'plaster',
): void {
  const t = 0.4;
  box(sim, [x0, 0, z0], [x0 + t, h, z1], mat);
  box(sim, [x1 - t, 0, z0], [x1, h, z1], mat);
  for (const side of ['n', 's'] as const) {
    const wz = side === 'n' ? z0 : z1 - t;
    const door = doors.find((d) => d.side === side);
    if (!door) {
      box(sim, [x0, 0, wz], [x1, h, wz + t], mat);
      continue;
    }
    box(sim, [x0, 0, wz], [door.x0, h, wz + t], mat);
    box(sim, [door.x1, 0, wz], [x1, h, wz + t], mat);
    box(sim, [door.x0, door.height ?? 3, wz], [door.x1, h, wz + t], mat);
  }
  box(sim, [x0 - 0.5, h, z0 - 0.5], [x1 + 0.5, h + 3.2, z1 + 0.5], 'roof', { ghost: true, shape: 'prism', roofOf: name });
}

function tree(sim: Sim, x: number, z: number, scale = 1, type: 'tree' | 'pine' = 'tree', collide = true): void {
  const r = 0.35 * scale;
  if (collide) box(sim, [x - r, 0, z - r], [x + r, 6 * scale, z + r], 'invisible');
  DECOR.push({ type, pos: v3(x, 0, z), scale, rotY: (x * 13.7 + z * 7.1) % 6.28 });
}

function lamp(sim: Sim, x: number, z: number): void {
  box(sim, [x - 0.15, 0, z - 0.15], [x + 0.15, 3.4, z + 0.15], 'invisible');
  DECOR.push({ type: 'lamp', pos: v3(x, 0, z) });
}

export const START = { id: 'start', pos: v3(-3.6, 0.1, 75.4), yaw: Math.PI * 0.85 };

export const POS = {
  workbench: v3(3.8, 0.1, 75.4),
  workshopDoor: v3(0, 0.1, 66.2),
  hesper: v3(7.2, 0, 45.5),
  tower: v3(0, 0, 30),
  towerDoor: v3(0, 0, 33.5),
  bridgeStart: v3(0, 0, -1),
  bridgeCheckpoint: v3(0, 0, 8),
  lanternPostL: v3(-2.4, 0, 0.6),
  lanternPostR: v3(2.4, 0, 0.6),
  span2: v3(0, -0.25, -14),
  span3: v3(0, -0.25, -22),
  northLanding: v3(0, 0, -30),
  orvenDoor: v3(0, 0, -48),
  lever: v3(-6.6, 0, -50.2),
  innerLever: v3(1.9, 0, -65.2),
  cellarDoor: v3(0, 0, -64),
  cellarFloor: v3(0, -4.5, -73),
  notebook: v3(-4.6, -4.5, -75.5),
  portrait: v3(-6.4, -4.5, -71.5),
  bellClock: v3(-6.4, -4.5, -75),
  moonClock: v3(6.4, -4.5, -75),
  keyClock: v3(3.6, -4.5, -71),
  dialLock: v3(1.8, -4.5, -77.6),
  vault: v3(0, -4.5, -80.5),
  gramophone: v3(-1.8, -4.5, -82.6),
  prototype: v3(1.8, -4.5, -82.6),
  lamplighter: v3(-9, 0, -80),
  courtyardEntry: v3(0, 0, -88),
  sentinel: v3(0, 0, -110),
  gate: v3(0, 0, -122),
  bells: [v3(-10, 0, -98), v3(10, 0, -98), v3(-10, 0, -114), v3(10, 0, -114)],
  forestEdge: v3(0, 0, -130),
  clearing: v3(0, 0, -142),
  signpost: v3(3.2, 0, -134.5),
  pack: v3(-9, 0, -143),
  rootWall1: v3(0, 0, -153),
  crossroads: v3(0, 0, -176),
  crossSign: v3(2.4, 0, -173.5),
  leftEnd: v3(-26, 0, -196),
  rightEnd: v3(26, 0, -196),
  starTree: v3(0, 0, -197),
  rootWall2: v3(0, 0, -214),
  overlook: v3(0, 0, -238),
  fair: v3(0, 0, -300),
};

export const AREAS: Area[] = [
  { id: 'area.workshop', region: 'clockfall', min: v3(-7, -2, 66), max: v3(7, 10, 78) },
  { id: 'area.square', region: 'clockfall', min: v3(-45, -2, 14), max: v3(45, 40, 95) },
  { id: 'area.bridge', region: 'clockfall', min: v3(-45, -60, -27), max: v3(45, 40, 14) },
  { id: 'area.orven', region: 'clockfall', min: v3(-8, -1, -64), max: v3(8, 10, -48) },
  { id: 'area.cellar', region: 'clockfall', min: v3(-8, -8, -86), max: v3(8, -1.5, -64) },
  { id: 'area.oldquarter', region: 'clockfall', min: v3(-45, -2, -86), max: v3(45, 40, -27) },
  { id: 'area.gate', region: 'clockfall', min: v3(-45, -2, -123), max: v3(45, 40, -86) },
  { id: 'area.forest_edge', region: 'forest', min: v3(-45, -2, -160), max: v3(45, 40, -123) },
  { id: 'area.crossroads', region: 'forest', min: v3(-45, -2, -205), max: v3(45, 40, -160) },
  { id: 'area.fair_road', region: 'forest', min: v3(-45, -2, -320), max: v3(45, 40, -205) },
];

export const LANDMARKS: Landmark[] = [
  { id: 'lm.workshop', name: 'lm.workshop', pos: v3(0, 0, 72), radius: 10 },
  { id: 'lm.tower', name: 'lm.tower', pos: POS.tower, radius: 26 },
  { id: 'lm.bridge', name: 'lm.bridge', pos: v3(0, 0, -14), radius: 18 },
  { id: 'lm.orven', name: 'lm.orven', pos: v3(0, 0, -56), radius: 16 },
  { id: 'lm.gate', name: 'lm.gate', pos: v3(0, 0, -104), radius: 20 },
  { id: 'lm.clearing', name: 'lm.clearing', pos: POS.clearing, radius: 14 },
  { id: 'lm.crossroads', name: 'lm.crossroads', pos: POS.crossroads, radius: 10 },
  { id: 'lm.startree', name: 'lm.startree', pos: POS.starTree, radius: 12 },
  { id: 'lm.arch', name: 'lm.arch', pos: v3(-17, 0, -188), radius: 9 },
  { id: 'lm.hare', name: 'lm.hare', pos: v3(17, 0, -188), radius: 9 },
  { id: 'lm.fair', name: 'lm.fair', pos: POS.overlook, radius: 12 },
];

export function buildLevel(sim: Sim): void {
  counter = 0;
  DECOR.length = 0;
  const rng = new Rng(4242);
  sim.areas = AREAS;
  sim.landmarks = LANDMARKS;

  // ---------------------------------------------------------------- terrain
  // South plateau (village) and its cobbled square/road.
  box(sim, [-46, -6, -2], [46, 0, 96], 'grass');
  box(sim, [-20, 0, 20], [20, 0.02, 52], 'cobble', { ghost: false });
  box(sim, [-3.5, 0, 52], [3.5, 0.02, 66], 'cobble');
  box(sim, [-4, 0, -2], [4, 0.02, 20], 'cobble');
  // Ravine floor (decorative) and kill volume: falling is a recoverable failure (UC-03).
  box(sim, [-46, -34, -26], [46, -30, -2], 'darkstone');
  sim.world.kills.push({ id: 'ravine', min: v3(-60, -80, -26.5), max: v3(60, -6, -1.5), cause: 'fall' });
  // North plateau, leaving the cellar pit and the stair cut free.
  box(sim, [-46, -6, -64], [46, 0, -26], 'grass');
  box(sim, [-46, -6, -130], [-7, 0, -64], 'grass');
  box(sim, [7, -6, -130], [46, 0, -64], 'grass');
  box(sim, [-7, -6, -130], [7, 0, -86], 'grass');
  box(sim, [-7, -6, -70], [-1.2, 0, -64], 'stone');
  box(sim, [1.2, -6, -70], [7, 0, -64], 'stone');
  box(sim, [-4, 0, -48], [4, 0.02, -27], 'cobble');
  box(sim, [-18, 0, -122], [18, 0.02, -86], 'cobble');
  // Forest floor.
  box(sim, [-46, -6, -330], [46, 0, -130], 'moss');

  // World bounds.
  box(sim, [-47, -10, -330], [-46, 30, 96], 'invisible');
  box(sim, [46, -10, -330], [47, 30, 96], 'invisible');
  box(sim, [-47, -10, 96], [47, 30, 97], 'invisible');
  box(sim, [-47, -10, -331], [47, 30, -330], 'invisible');

  // ---------------------------------------------------------------- Zone A: Elian's workshop
  box(sim, [-7, 0, 66], [7, 0.1, 78], 'plank');
  room(sim, 'workshopA', -7, 66, 7, 78, 5, [{ side: 'n', x0: -1.4, x1: 1.4 }], 'plaster');
  DECOR.push({ type: 'bed', pos: v3(-5.5, 0.1, 75.9) });
  box(sim, [-6.6, 0.1, 74.2], [-4.4, 0.7, 77.6], 'invisible');
  box(sim, [2.2, 0.1, 76.2], [5.6, 1.05, 77.6], 'wood'); // workbench
  // Loft reached by climbing (FR-002 authored ledge).
  box(sim, [-6.6, 0.1, 66.4], [-2.6, 2.2, 69.4], 'wood', { climbable: true });
  box(sim, [-2.6, 0.1, 66.4], [-1.9, 1.05, 67.6], 'wood', { climbable: true }); // crate step
  box(sim, [6.0, 0.1, 70], [6.6, 1.25, 72], 'wood'); // cabinet with mantel clock
  DECOR.push({ type: 'clockface', pos: v3(5.95, 1.6, 71), rotY: -Math.PI / 2, scale: 0.3, n: 13 });
  DECOR.push({ type: 'calendar', pos: v3(-6.55, 1.8, 72.5), rotY: Math.PI / 2 });
  DECOR.push({ type: 'note', pos: v3(1.9, 1.7, 66.45), rotY: 0 });
  DECOR.push({ type: 'gear', pos: v3(4.5, 1.05, 77), scale: 0.4 });
  DECOR.push({ type: 'crate', pos: v3(5.6, 0.1, 67.4) });
  box(sim, [5.0, 0.1, 66.8], [6.2, 1.2, 68.0], 'invisible');

  // ---------------------------------------------------------------- Zone B: village square
  // Clocktower (main landmark).
  box(sim, [-3, 0, 27], [3, 22, 33], 'stone');
  box(sim, [-3.6, 22, 26.4], [3.6, 23, 33.6], 'brass', { ghost: true });
  box(sim, [-2.6, 23, 27.4], [2.6, 28, 32.6], 'stone', { ghost: true, shape: 'cylinder' });
  box(sim, [-3.2, 28, 26.8], [3.2, 33, 33.2], 'roof', { ghost: true, shape: 'cone' });
  for (const [x, z, r] of [
    [0, 33.05, 0],
    [0, 26.95, Math.PI],
    [3.05, 30, Math.PI / 2],
    [-3.05, 30, -Math.PI / 2],
  ] as const)
    DECOR.push({ type: 'clockface', pos: v3(x, 18, z), rotY: r, scale: 2.2, n: 13 });
  // Houses around the square.
  house(sim, 8, 41, 16, 50, 5, 'plaster');
  house(sim, -16, 41, -8, 50, 5.5, 'plaster');
  house(sim, 10, 24, 18, 33, 6, 'plaster');
  house(sim, -18, 24, -10, 33, 5, 'plaster');
  house(sim, -18, 54, -9, 63, 5, 'plaster');
  house(sim, 9, 54, 18, 63, 5.5, 'plaster');
  house(sim, -30, 30, -22, 44, 6, 'plaster');
  house(sim, 22, 30, 31, 46, 5, 'plaster');
  house(sim, -34, 54, -24, 66, 5, 'plaster');
  house(sim, 24, 54, 34, 68, 6, 'plaster');
  house(sim, -14, 70, -9, 82, 4.5, 'plaster');
  house(sim, 9, 70, 15, 82, 4.5, 'plaster');
  house(sim, -24, 8, -12, 18, 5, 'plaster');
  house(sim, 12, 8, 24, 18, 5.5, 'plaster');
  for (const [x, z] of [
    [-6, 22],
    [6, 22],
    [-8, 52],
    [8, 52],
    [-4, 58],
    [4, 62],
    [-6, 36],
    [6, 38],
    [-5, 12],
    [5, 6],
  ])
    lamp(sim, x, z);
  // Bench + Hesper's diary spot.
  box(sim, [10.5, 0, 51], [13.5, 0.5, 51.8], 'wood');
  DECOR.push({ type: 'bench', pos: v3(12, 0, 51.4) });
  DECOR.push({ type: 'npc_hesper', pos: POS.hesper, rotY: -Math.PI / 2 });
  DECOR.push({ type: 'npc_sweeper', pos: v3(-7, 0, 40), rotY: 0.6 });
  DECOR.push({ type: 'npc_waver', pos: v3(-11.5, 0, 36), rotY: -0.3 });
  DECOR.push({ type: 'npc_cup', pos: v3(5.5, 0, 52.8), rotY: Math.PI });
  for (let i = 0; i < 4; i++) DECOR.push({ type: 'barrel', pos: v3(16.6 + (i % 2) * 0.9, 0, 40 - Math.floor(i / 2) * 0.9) });
  box(sim, [16, 0, 38.6], [18, 1.1, 40.6], 'invisible');
  // Village edge trees.
  for (let i = 0; i < 40; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (37 + rng.range(0, 7));
    const z = rng.range(0, 92);
    tree(sim, x, z, rng.range(0.9, 1.4), rng.next() > 0.5 ? 'pine' : 'tree');
  }
  for (let i = 0; i < 10; i++) tree(sim, rng.range(-40, 40), rng.range(86, 94), rng.range(0.9, 1.3), 'pine');

  // ---------------------------------------------------------------- Zone C: road, toll house, bridge
  house(sim, 6, 0, 12, 7, 4, 'wood');
  house(sim, -14, -1, -7, 6, 4.5, 'plaster');
  DECOR.push({ type: 'lanternpost', pos: POS.lanternPostL, rotY: 0 });
  DECOR.push({ type: 'lanternpost', pos: POS.lanternPostR, rotY: Math.PI });
  box(sim, [POS.lanternPostL.x - 0.15, 0, 0.45], [POS.lanternPostL.x + 0.15, 3.3, 0.75], 'invisible');
  box(sim, [POS.lanternPostR.x - 0.15, 0, 0.45], [POS.lanternPostR.x + 0.15, 3.3, 0.75], 'invisible');
  // Span 1 (static) with rails; spans 2 and 3 are rewindable props (see chapter script).
  box(sim, [-1.6, -0.5, -10], [1.6, 0, -2], 'plank');
  box(sim, [-1.8, 0, -10], [-1.6, 1.1, -2], 'wood');
  box(sim, [1.6, 0, -10], [1.8, 1.1, -2], 'wood');
  // Pillars.
  box(sim, [-1.1, -30, -10.6], [1.1, -0.5, -9.4], 'stone');
  box(sim, [-1.1, -30, -18.6], [1.1, -0.5, -17.4], 'stone');
  // Ravine cliff faces (visual depth).
  box(sim, [-46, -30, -2.4], [46, -6, -2], 'darkstone', { ghost: true });
  box(sim, [-46, -30, -26], [46, -6, -25.6], 'darkstone', { ghost: true });
  // Abutment rails on the north side.
  box(sim, [-1.8, 0, -28], [-1.6, 1.1, -26], 'wood');
  box(sim, [1.6, 0, -28], [1.8, 1.1, -26], 'wood');

  // ---------------------------------------------------------------- Zone D: old quarter, Orven's workshop, cellar
  house(sim, -22, -40, -12, -30, 6, 'plaster', 3.5, 0.15);
  house(sim, 12, -42, 22, -31, 5.5, 'plaster', 3.5, -0.12);
  house(sim, -26, -62, -14, -48, 6.5, 'plaster', 4, 0.2);
  house(sim, 14, -62, 26, -50, 6, 'plaster', 3.5, -0.2);
  house(sim, -30, -84, -18, -70, 5, 'plaster');
  house(sim, 18, -84, 30, -70, 5.5, 'plaster');
  for (const [x, z] of [
    [-5, -32],
    [5, -40],
    [-6, -46],
    [-10, -78],
    [10, -78],
  ])
    lamp(sim, x, z);
  DECOR.push({ type: 'npc_lamplighter', pos: POS.lamplighter, rotY: Math.PI / 2 });
  // Orven's workshop: door south, heavy iron door north (counterweight prop).
  box(sim, [-8, 0, -64], [8, 0.1, -48], 'plank');
  room(sim, 'orven', -8, -64, 8, -48, 6, [
    { side: 's', x0: -1.5, x1: 1.5 },
    { side: 'n', x0: -1.2, x1: 1.2, height: 3.4 },
  ], 'stone');
  // Workbenches as obstacles between lever and door.
  box(sim, [-6, 0.1, -58], [-1, 1.0, -56.4], 'wood');
  box(sim, [1, 0.1, -55], [6.5, 1.0, -53.4], 'wood');
  box(sim, [-3.5, 0.1, -61], [3.5, 1.0, -59.8], 'wood');
  DECOR.push({ type: 'automaton', pos: v3(5.2, 0.1, -60.5), rotY: -0.8 });
  DECOR.push({ type: 'gear', pos: v3(-3.5, 1.0, -57.2), scale: 0.8 });
  DECOR.push({ type: 'gear', pos: v3(3.4, 1.0, -54.2), scale: 0.6 });
  box(sim, [2.2, 2, -63.6], [3.4, 7, -62.6], 'iron', { ghost: true }); // counterweight shaft frame
  // Cellar stairs (12 steps of 0.375 m).
  for (let i = 1; i <= 12; i++) box(sim, [-1.2, -6, -64 - i * 0.5], [1.2, -0.375 * i, -64 - (i - 1) * 0.5], 'stone');
  box(sim, [-7, -6, -86], [7, -4.5, -70], 'stone');
  box(sim, [-7.4, -6, -86], [-7, 0, -70], 'stone');
  box(sim, [7, -6, -86], [7.4, 0, -70], 'stone');
  box(sim, [-7, -4.5, -78.4], [-1.2, 0, -78], 'stone');
  box(sim, [1.2, -4.5, -78.4], [7, 0, -78], 'stone');
  box(sim, [-1.2, -1.4, -78.4], [1.2, 0, -78], 'stone');
  box(sim, [-3.4, -4.5, -84], [-3, 0, -78.4], 'stone');
  box(sim, [3, -4.5, -84], [3.4, 0, -78.4], 'stone');
  box(sim, [-3.4, -4.5, -84.4], [3.4, 0, -84], 'stone');
  box(sim, [-7.5, 0, -86.5], [7.5, 0.4, -69.5], 'roof', { ghost: true, roofOf: 'cellar' });
  // Cellar furniture.
  box(sim, [-6.2, -4.5, -76.4], [-3.4, -3.6, -74.6], 'wood');
  DECOR.push({ type: 'desk', pos: v3(-4.8, -4.5, -75.5) });
  DECOR.push({ type: 'portrait', pos: v3(-6.95, -2.6, -71.5), rotY: Math.PI / 2 });
  DECOR.push({ type: 'wallclock', pos: v3(-6.95, -2.2, -75), rotY: Math.PI / 2, n: 4 });
  DECOR.push({ type: 'wallclock', pos: v3(6.95, -2.2, -75), rotY: -Math.PI / 2, n: 11 });
  DECOR.push({ type: 'dial', pos: v3(1.8, -3.0, -77.95), rotY: 0 });
  box(sim, [3, -4.5, -71.6], [4.2, -3.5, -70.4], 'stone'); // key clock pedestal
  DECOR.push({ type: 'gramophone', pos: v3(-1.8, -4.5, -82.6) });
  box(sim, [-2.4, -4.5, -83.2], [-1.2, -3.7, -82.0], 'invisible');
  box(sim, [1.2, -4.5, -83.2], [2.4, -3.6, -82.0], 'wood');

  // ---------------------------------------------------------------- Zone E: gate courtyard
  box(sim, [-18.4, 0, -122], [-18, 7, -86], 'stone');
  box(sim, [18, 0, -122], [18.4, 7, -86], 'stone');
  box(sim, [-18.4, 0, -86.4], [-4, 7, -86], 'stone');
  box(sim, [4, 0, -86.4], [18.4, 7, -86], 'stone');
  box(sim, [-18.4, 0, -122.8], [-4, 9, -122], 'stone');
  box(sim, [4, 0, -122.8], [18.4, 9, -122], 'stone');
  box(sim, [-5, 9, -123], [5, 12, -121.8], 'stone', { ghost: true, shape: 'prism' });
  // Folding rooftops beyond the courtyard walls (animated by the view).
  for (const [x, z] of [
    [-24, -96],
    [24, -100],
    [-26, -114],
    [25, -116],
  ])
    house(sim, x - 4, z - 4, x + 4, z + 4, 7, 'plaster', 4, 0, `fold${x}`);
  for (const b of POS.bells) {
    DECOR.push({ type: 'gallows', pos: v3(b.x, 0, b.z) });
    box(sim, [b.x - 2.1, 0, b.z - 0.25], [b.x - 1.6, 6, b.z + 0.25], 'wood', { ghost: true });
    box(sim, [b.x + 1.6, 0, b.z - 0.25], [b.x + 2.1, 6, b.z + 0.25], 'wood', { ghost: true });
    box(sim, [b.x - 2.1, 0, b.z - 0.25], [b.x - 1.6, 6, b.z + 0.25], 'invisible');
    box(sim, [b.x + 1.6, 0, b.z - 0.25], [b.x + 2.1, 6, b.z + 0.25], 'invisible');
  }

  // ---------------------------------------------------------------- Zone F: Forest of False Wishes
  // Forest corridor walls of dense trees; open areas are kept clear.
  const clear: Array<{ x: number; z: number; r: number }> = [
    { x: 0, z: -142, r: 14 },
    { x: 0, z: -176, r: 9 },
    { x: 0, z: -200, r: 8 },
    { x: 0, z: -238, r: 10 },
  ];
  const paths: Array<[number, number, number, number, number]> = [
    // x0, z0, x1, z1, half width
    [0, -122, 0, -134, 4.5],
    [0, -150, 0, -170, 3.5],
    [0, -180, -26, -198, 3.2],
    [0, -180, 26, -198, 3.2],
    [0, -182, 0, -200, 3.5],
    [0, -205, 0, -232, 3.5],
  ];
  const nearPathWide = (x: number, z: number) => {
    for (const c of clear) if (Math.hypot(x - c.x, z - c.z) < c.r + 5) return true;
    for (const [x0, z0, x1, z1, w] of paths) {
      const dx = x1 - x0;
      const dz = z1 - z0;
      const l2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / l2));
      if (Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t)) < w + 5) return true;
    }
    return false;
  };
  const nearPath = (x: number, z: number) => {
    for (const c of clear) if (Math.hypot(x - c.x, z - c.z) < c.r + 1.2) return true;
    for (const [x0, z0, x1, z1, w] of paths) {
      const dx = x1 - x0;
      const dz = z1 - z0;
      const l2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / l2));
      if (Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t)) < w + 1.2) return true;
    }
    return false;
  };
  for (let z = -128; z > -262; z -= 2.6) {
    for (let x = -44; x <= 44; x += 2.6) {
      const jx = x + rng.range(-1, 1);
      const jz = z + rng.range(-1, 1);
      if (nearPath(jx, jz)) continue;
      // Thin out trees far from the paths to keep the scene light.
      if (rng.next() < 0.35) continue;
      const sc = rng.range(0.8, 1.5);
      const kind = rng.next() > 0.4 ? 'tree' : 'pine';
      tree(sim, jx, jz, sc, kind, nearPathWide(jx, jz));
    }
  }
  // Path borders (invisible), so loops are readable and nobody gets lost in the undergrowth.
  for (const [x0, z0, x1, z1, w] of paths) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.ceil(len / 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = x0 + (x1 - x0) * t;
      const cz = z0 + (z1 - z0) * t;
      const nx = -(z1 - z0) / len;
      const nz = (x1 - x0) / len;
      for (const s of [-1, 1]) {
        const px = cx + nx * (w + 1.0) * s;
        const pz = cz + nz * (w + 1.0) * s;
        if (nearPathExcept(px, pz, clear, paths, [x0, z0, x1, z1, w])) continue;
        box(sim, [px - 0.7, 0, pz - 0.7], [px + 0.7, 4, pz + 0.7], 'invisible');
      }
    }
  }
  for (const c of clear) {
    for (let a = 0; a < Math.PI * 2; a += 0.22) {
      const px = c.x + Math.cos(a) * (c.r + 1.2);
      const pz = c.z + Math.sin(a) * (c.r + 1.2);
      if (nearPathExcept(px, pz, clear.filter((k) => k !== c), paths, null)) continue;
      box(sim, [px - 0.7, 0, pz - 0.7], [px + 0.7, 4, pz + 0.7], 'invisible');
    }
  }
  // Forest landmarks.
  DECOR.push({ type: 'signpost', pos: POS.signpost, rotY: -0.4 });
  DECOR.push({ type: 'signpost', pos: POS.crossSign, rotY: 0.3 });
  DECOR.push({ type: 'arch', pos: v3(-17, 0, -188), rotY: 0.9 });
  DECOR.push({ type: 'hare', pos: v3(17, 0, -188), rotY: -0.9 });
  DECOR.push({ type: 'startree', pos: POS.starTree });
  box(sim, [-1.2, 0, -198.2], [1.2, 9, -195.8], 'invisible');
  for (let i = 0; i < 24; i++) DECOR.push({ type: 'paperstar', pos: v3(rng.range(-12, 12), rng.range(3, 8), rng.range(-240, -130)), scale: rng.range(0.5, 1) });
  for (let i = 0; i < 30; i++) {
    const x = rng.range(-12, 12);
    const z = rng.range(-236, -130);
    if (nearPath(x, z)) DECOR.push({ type: 'mushroom', pos: v3(x + (x > 0 ? 3.5 : -3.5), 0, z), scale: rng.range(0.4, 1.1) });
  }
  // The Wandering Fair in the distance (visual only).
  for (const [x, z, s] of [
    [-14, -290, 1.6],
    [10, -296, 2],
    [-2, -310, 2.4],
    [22, -312, 1.4],
    [-24, -306, 1.5],
  ] as const)
    DECOR.push({ type: 'tent', pos: v3(x, 0, z), scale: s });
  DECOR.push({ type: 'carousel', pos: v3(0, 0, -300), scale: 1.6 });
  box(sim, [-10, 0, -244], [10, 4, -243], 'invisible'); // overlook barrier
}

function nearPathExcept(
  x: number,
  z: number,
  clear: Array<{ x: number; z: number; r: number }>,
  paths: Array<[number, number, number, number, number]>,
  except: [number, number, number, number, number] | null,
): boolean {
  for (const c of clear) if (Math.hypot(x - c.x, z - c.z) < c.r + 0.2) return true;
  for (const p of paths) {
    if (p === except) continue;
    const [x0, z0, x1, z1, w] = p;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / l2));
    if (Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t)) < w + 0.2) return true;
  }
  return false;
}
