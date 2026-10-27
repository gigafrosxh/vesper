import { describe, expect, it } from 'vitest';
import { POS } from '../../src/content/level';
import { CRITICAL_EVIDENCE, COMPONENTS, MAPS } from '../../src/content/quests';
import { v3 } from '../../src/core/math';
import type { FallingProp } from '../../src/sim/props';
import type { Sim } from '../../src/sim/game';
import { interact, kill, newSim, place, reload, rewind, run, settle, talk } from '../support/driver';

// Headless critical-path playthrough of the vertical slice (01.01 → 02.01), with checkpoint reloads in between.

const stage = (sim: Sim, q: string) => sim.quests.entries.get(q)?.stage;
const done = (sim: Sim, q: string) => sim.quests.entries.get(q)?.completed === true;
const prop = (sim: Sim, id: string) => sim.props.get(id) as FallingProp;

function play0101(sim: Sim) {
  settle(sim);
  expect(stage(sim, 'q_ash')).toBe('gather');
  expect(sim.checkpoint.id).toBe('start');
  for (const c of COMPONENTS) interact(sim, c);
  expect(stage(sim, 'q_ash')).toBe('assemble');
  interact(sim, 'workbench', 0);
  run(sim, 2);
  expect(sim.ledger.has('item.watch')).toBe(true);
  interact(sim, 'ev.calendar', 0);
  interact(sim, 'door.workshopA', 0);
  run(sim, 3.5);
  expect(stage(sim, 'q_ash')).toBe('square');
  expect(sim.ledger.evidence).toContain('ev.warning');
  interact(sim, 'ev.diary', 0);
  interact(sim, 'npc.hesper', 0);
  expect(sim.dialogue.active).toBe(true);
  talk(sim, (node, texts) => (node === 'greet' ? texts.indexOf('dlg.hesper.c_curious') : texts.length - 1));
  expect(sim.ledger.get('tone.hesper')).toBeDefined();
  settle(sim);
  expect(stage(sim, 'q_ash')).toBe('fight');
  kill(sim, 'v.hollow1', 'v.hollow2');
  expect(done(sim, 'q_ash')).toBe(true);
  expect(stage(sim, 'q_bridge')).toBe('reach');
  expect(sim.checkpoint.id).toBe('square');
}

function play0102(sim: Sim) {
  place(sim, v3(0, 0, 8), v3(0, 0, -14));
  run(sim, 0.2);
  settle(sim);
  expect(sim.temporal.enabled.rewind).toBe(true);
  expect(stage(sim, 'q_bridge')).toBe('lantern');
  expect(prop(sim, 'lantern.r').phase).toBe(2);
  rewind(sim, 'lantern.r', v3(0.5, 0, 5));
  expect(prop(sim, 'lantern.r').phase).toBe(0);
  expect(stage(sim, 'q_bridge')).toBe('span');
  expect(sim.checkpoint.id).toBe('bridge');
  run(sim, 4); // energy regen
  rewind(sim, 'bridge.span2', v3(0, 0, -1.5));
  expect(prop(sim, 'bridge.span2').phase).toBe(0);
  expect(stage(sim, 'q_bridge')).toBe('cross');
}

function play0102chase(sim: Sim) {
  place(sim, v3(0, 0, -13), v3(0, 0, -30));
  run(sim, 0.2);
  expect(stage(sim, 'q_bridge')).toBe('chase');
  run(sim, 3);
  expect(prop(sim, 'bridge.span3').phase).toBe(2);
  rewind(sim, 'bridge.span3', v3(0, 0, -16.5));
  expect(prop(sim, 'bridge.span3').phase).toBe(0);
  place(sim, v3(0, 0, -30), v3(0, 0, -40));
  run(sim, 3);
  expect(done(sim, 'q_bridge')).toBe(true);
  expect(stage(sim, 'q_workshop')).toBe('find');
  expect(sim.checkpoint.id).toBe('north');
}

function play0103(sim: Sim) {
  interact(sim, 'npc.lamplighter', 0);
  talk(sim, (node, texts) => (node === 'loop' ? texts.indexOf('dlg.lamp.c_watch') : texts.length - 1));
  expect(sim.ledger.has('knows.resonance')).toBe(true);
  place(sim, v3(0, 0, -56), v3(0, 0, -64));
  run(sim, 1.5);
  expect(sim.dialogue.active).toBe(true);
  talk(sim);
  settle(sim);
  expect(stage(sim, 'q_workshop')).toBe('door');
  interact(sim, 'lever.outer', 0);
  run(sim, 0.8);
  const weight = sim.props.get('cellar.weight')!;
  expect(weight.capture()[0]).toBeGreaterThan(0.5);
  // The door slams shut long before Elian can reach it from the lever …
  run(sim, 2.5);
  expect(weight.capture()[0]).toBe(0);
  // … so he rewinds the weight from the doorway, scrubbing back to the moment it hung at the top.
  rewind(sim, 'cellar.weight', v3(0, 0, -61), 4, (g) => g[0] >= 0.99);
  expect(weight.capture()[0]).toBeGreaterThan(0.95);
  place(sim, v3(0, 0, -65.6), v3(0, -4, -72));
  run(sim, 0.3);
  expect(stage(sim, 'q_workshop')).toBe('search');
  expect(sim.checkpoint.id).toBe('cellar');
  place(sim, v3(0, -4.5, -73), v3(3.6, -4.5, -71));
  run(sim, 2.5);
  expect(prop(sim, 'cellar.keyclock').phase).toBe(2);
  interact(sim, 'ev.notebook', -4.5);
  interact(sim, 'ev.portrait', -4.5);
  expect(stage(sim, 'q_workshop')).toBe('vault');
  interact(sim, 'clock.bell', -4.5);
  interact(sim, 'clock.moon', -4.5);
  run(sim, 3);
  rewind(sim, 'cellar.keyclock', v3(0.5, -4.5, -72));
  interact(sim, 'clock.key', -4.5);
  expect(sim.ledger.has('keyclock.read')).toBe(true);
  expect(sim.hooks.dial!([1, 2, 3])).toBe(false);
  expect(sim.hooks.dial!([4, 11, 7])).toBe(true);
  expect(stage(sim, 'q_workshop')).toBe('inside');
  interact(sim, 'prototype', -4.5);
  expect(sim.temporal.enabled.anchor).toBe(true);
  interact(sim, 'ev.recording', -4.5);
  run(sim, 18);
  expect(done(sim, 'q_workshop')).toBe(true);
  expect(stage(sim, 'q_gate')).toBe('reach');
  for (const ev of CRITICAL_EVIDENCE) expect(sim.ledger.evidence, ev).toContain(ev);
}

function play0104(sim: Sim, choice: 'take' | 'leave') {
  place(sim, v3(0, 0, -92), v3(0, 0, -110));
  run(sim, 0.2);
  settle(sim);
  expect(stage(sim, 'q_gate')).toBe('fight');
  expect(sim.checkpoint.id).toBe('courtyard');
  const s = sim.enemies.get('sentinel')!;
  // A bell knocked down by a slam is rewound next to the Sentinel: it rings and cracks the armor.
  const bell = prop(sim, 'bell.2');
  bell.trigger();
  run(sim, 2.5);
  s.pos = v3(-6, 0, -110);
  rewind(sim, 'bell.2', v3(-4, 0, -104), 2);
  expect(bell.phase).toBe(0);
  expect(s.armor).toBeGreaterThan(1);
  kill(sim, 'sentinel');
  settle(sim, 40);
  expect(sim.ledger.get('bell1.awake')).toBeTruthy();
  expect(stage(sim, 'q_gate')).toBe('core');
  interact(sim, 'bellcore', 0);
  talk(sim, (node, texts) => (node === 'core' ? texts.indexOf(`dlg.core.c_${choice}`) : texts.length - 1));
  expect(sim.ledger.get('choice.bellcore')).toBe(choice);
  settle(sim, 20);
  expect(done(sim, 'q_gate')).toBe(true);
  expect(stage(sim, 'q_forest')).toBe('enter');
}

function play0201(sim: Sim) {
  place(sim, v3(0, 0, -128), v3(0, 0, -140));
  run(sim, 0.3);
  interact(sim, 'map.merchant', 0);
  place(sim, v3(0, 0, -142), v3(0, 0, -153));
  run(sim, 2.5);
  expect(stage(sim, 'q_forest')).toBe('roots');
  expect(sim.enemies.has('f.root1')).toBe(true);
  kill(sim, 'f.root1', 'f.root2');
  run(sim, 2);
  rewind(sim, 'roots.1', v3(0, 0, -147));
  expect(prop(sim, 'roots.1').phase).toBe(0);
  expect(stage(sim, 'q_forest')).toBe('maps');
  interact(sim, 'map.child', 0);
  interact(sim, 'map.lover', 0);
  for (const m of MAPS) expect(sim.ledger.evidence).toContain(m);
  // A wrong path loops back to the crossroads.
  place(sim, v3(-25, 0, -196));
  run(sim, 2);
  settle(sim);
  expect(sim.player.pos.z).toBeCloseTo(-179, 0);
  expect(sim.ledger.num('forest.loops')).toBe(1);
  place(sim, v3(0, 0, -197));
  run(sim, 0.3);
  expect(stage(sim, 'q_forest')).toBe('fair');
  place(sim, v3(0, 0, -206), v3(0, 0, -214));
  run(sim, 0.3);
  kill(sim, 'f.root3');
  // The pulsing wall is passed by anchoring it while open (or simply teleport past in this test).
  place(sim, v3(0, 0, -236));
  run(sim, 0.2);
  settle(sim, 60);
  run(sim, 1);
  expect(done(sim, 'q_forest')).toBe(true);
  expect(sim.completed).toBe(true);
}

describe('Vertical slice playthrough (TC-CORE)', () => {
  it('plays the critical path from the first bell to the fair, reloading at checkpoints', () => {
    let sim = newSim();
    play0101(sim);
    sim = reload(sim);
    expect(sim.enemies.has('v.hollow1')).toBe(false);
    expect(stage(sim, 'q_bridge')).toBe('reach');
    play0102(sim);
    sim = reload(sim);
    // Reload keeps puzzle state: the restored span is still standing and the chase hasn't started.
    expect(prop(sim, 'bridge.span2').phase).toBe(0);
    play0102chase(sim);
    sim = reload(sim);
    // After reloading north of the ravine, the crossed span is down again and the Hollows are gone.
    expect(prop(sim, 'bridge.span2').phase).toBe(2);
    play0103(sim);
    sim = reload(sim);
    expect(sim.temporal.enabled.anchor).toBe(true);
    play0104(sim, 'take');
    expect(sim.player.maxHealth).toBe(120);
    sim = reload(sim);
    expect(sim.enemies.has('sentinel')).toBe(false);
    expect(sim.player.maxHealth).toBe(120);
    play0201(sim);
    expect(sim.ledger.serialize().claimed.length).toBeGreaterThan(0);
  });

  it('a fallen puzzle object stays rewindable after reloading (no softlock)', () => {
    let sim = newSim();
    play0101(sim);
    play0102(sim);
    play0102chase(sim);
    sim = reload(sim);
    // span2 fell again behind the player; its history is synthesized on load.
    expect(sim.temporal.statusFor(sim.props.get('bridge.span2')!).kind).toBe('eligible');
  });

  it('respawns at the last checkpoint with full health after death', () => {
    const sim = newSim();
    play0101(sim);
    sim.player.damage(sim.ctx, 9999, sim.player.pos);
    run(sim, 3);
    expect(sim.respawnRequested).toBe(true);
    const next = newSim(Object.assign(sim.serialize(), {}));
    expect(next.checkpoint.id).toBe('square');
    expect(next.player.alive).toBe(true);
  });

  it('a wrong dial code never opens the vault', () => {
    const sim = newSim();
    const L = sim.ledger;
    expect(sim.hooks.dial!([7, 11, 4])).toBe(false);
    expect(L.has('vault.open')).toBe(false);
    void POS;
  });
});
