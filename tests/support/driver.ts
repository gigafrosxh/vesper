import { buildChapter, START } from '../../src/content/chapter1';
import { DIALOGUES } from '../../src/content/dialogues';
import { QUESTS } from '../../src/content/quests';
import { distXZ, v3, type Vec3 } from '../../src/core/math';
import { EMPTY_FRAME, makeFrame, type InputFrame } from '../../src/input/inputRouter';
import { Sim, type SavePayload } from '../../src/sim/game';

// Headless driver: plays the slice through the same input frames the presentation layer produces.

export function newSim(save?: SavePayload): Sim {
  return new Sim({ content: buildChapter, quests: QUESTS, dialogues: DIALOGUES, start: START, save });
}

export function run(sim: Sim, seconds: number, frame: InputFrame = EMPTY_FRAME): void {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) sim.step(frame);
}

/** Steps until cinematics and dialogue are over (or fails after `max` seconds). */
export function settle(sim: Sim, max = 60): void {
  for (let i = 0; i < max * 60; i++) {
    if (!sim.seq.cinematicActive && !sim.dialogue.active && !sim.player.locked) return;
    sim.step();
  }
  throw new Error(`still in a cinematic after ${max}s`);
}

export function yawTo(from: Vec3, to: Vec3): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

export function place(sim: Sim, pos: Vec3, lookAt?: Vec3): void {
  const y = sim.world.groundHeight(pos.x, pos.z, 0.4, pos.y + 1.0);
  const p = v3(pos.x, Number.isFinite(y) ? y + 0.02 : pos.y, pos.z);
  sim.teleport(p, lookAt ? yawTo(p, lookAt) : sim.player.yaw);
  sim.player.camPitch = -0.1;
}

/** Walks up to an interactable (trying several sides) and presses interact. */
export function interact(sim: Sim, id: string, floorY?: number): void {
  const it = sim.interactables.get(id);
  if (!it) throw new Error(`no interactable ${id}`);
  const baseY = floorY ?? it.pos.y - 1;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const r = Math.min(it.radius - 0.4, 1.1);
    place(sim, v3(it.pos.x + Math.sin(a) * r, baseY, it.pos.z + Math.cos(a) * r), it.pos);
    sim.step();
    sim.step();
    if (sim.focusInteract?.id === id) {
      sim.step(makeFrame({ pressed: ['interact'], held: ['interact'] }));
      return;
    }
  }
  throw new Error(`could not focus ${id} (enabled=${it.enabled?.() ?? true})`);
}

/** Plays a dialogue to its end, choosing via `pick` (default: the last available choice, i.e. leave). */
export function talk(sim: Sim, pick: (nodeId: string, texts: string[]) => number = (_, t) => t.length - 1): string[] {
  const seen: string[] = [];
  for (let i = 0; i < 200 && sim.dialogue.active; i++) {
    const v = sim.dialogue.view()!;
    seen.push(v.text);
    if (v.kind === 'choice') {
      const avail = v.choices.map((c, idx) => ({ c, idx })).filter((x) => x.c.available);
      const want = pick(v.nodeId, v.choices.map((c) => c.text));
      const choice = v.choices[want]?.available ? want : avail[avail.length - 1].idx;
      sim.dialogue.choose(choice);
    } else sim.dialogue.advance();
    sim.step();
  }
  if (sim.dialogue.active) throw new Error('dialogue did not end');
  return seen;
}

/** Aims at a temporal target from `from` and performs a full hold-and-release rewind. */
export function rewind(sim: Sim, targetId: string, from: Vec3, holdSeconds = 3, until?: (ghost: number[]) => boolean): void {
  const t = sim.temporal.get(targetId);
  if (!t) throw new Error(`no temporal target ${targetId}`);
  place(sim, from, t.getPosition());
  sim.player.camPitch = 0;
  sim.step();
  if (sim.target?.target.id !== targetId) throw new Error(`aimed at ${sim.target?.target.id ?? 'nothing'} instead of ${targetId} (${sim.target?.status.kind})`);
  sim.step(makeFrame({ pressed: ['rewind'], held: ['rewind'] }));
  if (!sim.temporal.preview) throw new Error(`rewind did not start: ${JSON.stringify(sim.bus.getLog('rewind.failed').at(-1)?.payload)}`);
  const hold = makeFrame({ held: ['rewind'] });
  for (let i = 0; i < holdSeconds * 60 && sim.temporal.preview; i++) {
    if (until && until(sim.temporal.preview.ghost)) break;
    sim.step(hold);
  }
  sim.step(makeFrame({ released: ['rewind'] }));
}

export function kill(sim: Sim, ...ids: string[]): void {
  for (const id of ids) {
    const e = sim.enemies.get(id);
    if (!e) throw new Error(`no enemy ${id}`);
    for (let i = 0; i < 10 && e.alive; i++) e.takeDamage(sim.ctx, 999);
  }
  sim.step();
}

export function near(a: Vec3, b: Vec3, r: number): boolean {
  return distXZ(a, b) < r;
}

/** Simulates a save + reload through the checkpoint payload (as the app does). */
export function reload(sim: Sim): Sim {
  const json = JSON.stringify(sim.serialize());
  return newSim(JSON.parse(json));
}
