import { distXZ, v3, type Vec3 } from '../core/math';
import { ES, Hollow, Rootbound, Sentinel } from '../sim/enemies';
import type { Sim } from '../sim/game';
import { Counterweight, FallingProp, PulsingRoots } from '../sim/props';
import { buildLevel, POS, START } from './level';
import { COMPONENTS, MAPS } from './quests';

// Mission script for Chapter 01 "The Night That Refuses to End" (01.01–01.04) and the opening of 02.01.
// World state is always rebuilt from the story ledger, so a checkpoint reload reconstructs it (NFR-08).

const E = 'speaker.elian';
const M = 'speaker.mira';
const N = 'speaker.narrator';
const O = 'speaker.observer';
const ORV = 'speaker.orven';

export { START };

export function buildChapter(sim: Sim): void {
  buildLevel(sim);
  const L = sim.ledger;
  const bus = sim.bus;
  const once = (flag: string): boolean => {
    if (L.has(flag)) return false;
    L.set(flag);
    return true;
  };
  const doc = (titleKey: string, bodyKey: string) => bus.emit('document', { titleKey, bodyKey });
  const tut = (key: string) => bus.emit('tutorial', { key });
  const sfx = (id: string, p?: Vec3) => bus.emit('sound', { id, position: p ? [p.x, p.y, p.z] : undefined });

  /** A door that is a static collider until a ledger flag opens it. */
  const door = (id: string, min: Vec3, max: Vec3, flag: string, mat: 'wood' | 'iron' = 'wood') => {
    const b = sim.world.add({ id, min, max, mat, owner: id });
    b.enabled = !L.has(flag);
    b.ghost = !b.enabled;
    return {
      open() {
        L.set(flag);
        b.enabled = false;
        b.ghost = true;
      },
      box: b,
    };
  };

  const tonic = (id: string, pos: Vec3) =>
    sim.addInteractable({
      id,
      pos,
      radius: 1.8,
      prompt: 'prompt.take',
      label: 'item.tonic',
      marker: 'item',
      enabled: () => !L.isClaimed(id),
      onInteract: () => {
        if (!L.claim(id, 'tonic')) return;
        sim.player.heal(35);
        bus.emit('item.collected', { id: 'tonic' });
        sfx('pickup');
      },
    });

  // =====================================================================================
  // MISSION 01.01 — Ash on the Clockface
  // =====================================================================================

  const workshopDoor = door('door.workshopA', v3(-1.4, 0, 66), v3(1.4, 3, 66.4), 'door.workshop.open');

  const COMPONENT_POS: Record<string, Vec3> = {
    'comp.mainspring': v3(-5.2, 0.1, 69.8),
    'comp.balance': v3(-4.6, 2.2, 67.6), // on the loft: requires climbing
    'comp.crystal': v3(6.3, 1.25, 71.7),
  };
  for (const c of COMPONENTS) {
    sim.addInteractable({
      id: c,
      pos: COMPONENT_POS[c],
      radius: 2.0,
      prompt: 'prompt.take',
      label: `item.${c}`,
      marker: 'item',
      enabled: () => !L.isClaimed(c),
      onInteract: () => {
        if (!L.claim(c, c)) return;
        bus.emit('item.collected', { id: c });
        sfx('pickup');
        bus.emit('journal.updated', { reason: 'item' });
        const n = COMPONENTS.filter((k) => L.isClaimed(k)).length;
        if (n === 3) {
          sim.say(E, 'line.components_done');
          sim.setStage('q_ash', 'assemble');
        } else sim.say(E, `line.${c}`);
      },
    });
  }

  sim.addInteractable({
    id: 'workbench',
    pos: v3(3.9, 1.0, 76.4),
    radius: 2.2,
    prompt: 'prompt.assemble',
    label: 'obj.workbench',
    marker: 'device',
    enabled: () => sim.quests.isActive('q_ash', 'assemble'),
    onInteract: () => {
      sim.run(
        'assemble',
        (function* () {
          sfx('assemble');
          yield 1.2;
          L.commit('item.watch');
          bus.emit('item.collected', { id: 'watch' });
          sim.say(E, 'line.watch');
          sim.setStage('q_ash', 'door');
          yield 0.5;
        })(),
        { cinematic: false },
      );
    },
  });

  sim.addInteractable({
    id: 'ev.calendar',
    pos: v3(-6.2, 1.6, 72.5),
    radius: 2.2,
    prompt: 'prompt.inspect',
    label: 'ev.calendar',
    marker: 'evidence',
    onInteract: () => {
      sim.addEvidence('ev.calendar');
      doc('ev.calendar', 'doc.calendar');
    },
  });
  sim.addInteractable({
    id: 'ev.mantel',
    pos: v3(6.0, 1.4, 71),
    radius: 2.0,
    prompt: 'prompt.inspect',
    label: 'ev.mantel',
    marker: 'evidence',
    enabled: () => L.isClaimed('comp.crystal') || !sim.interactables.get('comp.crystal')?.enabled?.(),
    onInteract: () => {
      sim.addEvidence('ev.mantel');
      sim.say(E, 'line.mantel');
    },
  });
  sim.addInteractable({
    id: 'door.workshopA',
    pos: v3(0, 1.2, 66.6),
    radius: 2.2,
    prompt: 'prompt.open',
    label: 'obj.workshop_door',
    marker: 'door',
    enabled: () => !L.has('door.workshop.open'),
    onInteract: () => {
      if (!L.has('item.watch')) {
        sim.say(E, 'line.not_without_watch');
        return;
      }
      sim.run(
        'note',
        (function* () {
          sim.addEvidence('ev.warning');
          doc('ev.warning', 'doc.warning');
          yield 0.2;
          sim.say(E, 'line.note');
          yield 2.6;
          workshopDoor.open();
          sfx('door_open', v3(0, 1, 66));
          sim.setStage('q_ash', 'square');
        })(),
        { cinematic: false },
      );
    },
  });
  tonic('tonic.village', v3(-12.5, 0.1, 51.5));

  // Intro (UC-01: New game -> accessibility setup -> cinematic -> control).
  if (!L.has('intro.done')) {
    sim.run(
      'intro',
      (function* () {
        sim.cameraOverride = { pos: v3(-1, 3.4, 71.5), look: v3(-4.5, 0.6, 75.8) };
        sim.visual.introFade = 1;
        yield 0.8;
        for (let i = 1; i <= 13; i++) {
          sfx(i === 13 ? 'bell_strike_wrong' : 'bell_strike');
          if (i === 1) sim.say(N, 'cap.strikes');
          if (i === 13) sim.say(N, 'cap.thirteen');
          yield i === 12 ? 1.6 : 0.75;
          sim.visual.introFade = Math.max(0, 1 - i / 10);
        }
        yield 1.4;
        sim.say(E, 'line.wake1');
        yield 2.6;
        sim.say(E, 'line.wake2');
        yield 2.2;
        sim.cameraOverride = null;
        sim.visual.introFade = 0;
        L.set('intro.done');
        sim.setStage('q_ash', 'gather');
        sim.setCheckpoint('start', START.pos, START.yaw);
        tut('tut.move');
      })(),
      { cinematic: true },
    );
  }

  // Square: looping residents and Hesper (local witness).
  sim.addTrigger({
    id: 'square.enter',
    min: v3(-20, -1, 20),
    max: v3(20, 5, 60),
    once: true,
    onEnter: () => sim.say(E, 'line.loops'),
  });
  sim.addInteractable({
    id: 'npc.hesper',
    pos: v3(POS.hesper.x, 1.2, POS.hesper.z),
    radius: 2.6,
    prompt: 'prompt.talk',
    label: 'speaker.hesper',
    marker: 'npc',
    onInteract: () => sim.startDialogue('hesper'),
  });
  sim.addInteractable({
    id: 'ev.diary',
    pos: v3(12, 0.6, 51.4),
    radius: 2.0,
    prompt: 'prompt.read',
    label: 'ev.diary',
    marker: 'evidence',
    onInteract: () => {
      sim.addEvidence('ev.diary');
      doc('ev.diary', 'doc.diary');
      if (sim.quests.isActive('q_hesper')) sim.completeQuest('q_hesper');
    },
  });
  for (const [id, label] of [
    ['npc.sweeper', 'npc.sweeper'],
    ['npc.cup', 'npc.cup'],
  ] as const) {
    const pos = id === 'npc.sweeper' ? v3(-7, 1.2, 40) : v3(5.5, 1.2, 52.8);
    sim.addInteractable({ id, pos, radius: 2.2, prompt: 'prompt.talk', label, marker: 'npc', onInteract: () => sim.say(`speaker.${label.split('.')[1]}`, `line.${id}`) });
  }

  const villageHollows = ['v.hollow1', 'v.hollow2'];
  const spawnVillageHollows = (emerge: boolean) => {
    villageHollows.forEach((hid, i) => {
      const h = sim.addEnemy(new Hollow(hid, v3(i ? 2.2 : -2.2, 0, 35)));
      if (sim.enemies.has(hid)) {
        h.aggro = true;
        if (emerge) h.setState(ES.Emerge);
        h.leash = 40;
      }
    });
  };
  const strike = () => {
    if (L.has('strike.done')) return;
    L.set('strike.done');
    sim.run(
      'strike',
      (function* () {
        sim.cameraOverride = { pos: v3(sim.player.pos.x + 3, 3.5, sim.player.pos.z + 6), look: v3(0, 14, 30) };
        sfx('bell_strike_wrong', POS.tower);
        bus.emit('camera.shake', { strength: 0.35, duration: 0.8 });
        sim.say(N, 'cap.strike_again');
        yield 1.6;
        sim.say(E, 'line.again');
        yield 1.2;
        sim.cameraOverride = { pos: v3(sim.player.pos.x + 2, 2.6, sim.player.pos.z + 4), look: v3(0, 1.4, 34) };
        spawnVillageHollows(true);
        sfx('hollow_emerge', POS.towerDoor);
        yield 1.6;
        sim.cameraOverride = null;
        sim.setStage('q_ash', 'fight');
        tut('tut.combat');
      })(),
      { cinematic: true },
    );
  };
  bus.on('dialogue.ended', ({ dialogueId }) => {
    if (dialogueId === 'hesper' && sim.quests.isActive('q_ash', 'square')) strike();
  });
  sim.addTrigger({
    id: 'square.north',
    min: v3(-20, -1, 14),
    max: v3(20, 5, 25),
    when: () => sim.quests.isActive('q_ash', 'square'),
    onEnter: strike,
  });
  if (L.has('strike.done') && sim.quests.isActive('q_ash', 'fight')) spawnVillageHollows(false);

  bus.on('enemy.defeated', ({ id }) => {
    if (villageHollows.includes(id) && villageHollows.every((h) => L.has(`dead.${h}`) || h === id)) {
      if (!sim.quests.isActive('q_ash', 'fight')) return;
      sim.completeQuest('q_ash');
      sim.setStage('q_bridge', 'reach');
      sim.say(E, 'line.after_hollows');
      sim.setCheckpoint('square', v3(0, 0.02, 38), 0);
    }
  });

  // =====================================================================================
  // MISSION 01.02 — The Bridge That Remembers
  // =====================================================================================

  const lantern = (id: string, x: number, dir: number) =>
    sim.addProp(
      new FallingProp({
        id,
        kind: 'lantern',
        visual: 'lantern',
        rest: { pos: v3(x, 2.55, 0.6), rot: v3() },
        fallen: { pos: v3(x + dir * 0.5, 0.18, 1.5), rot: v3(1.45, 0, dir * 0.4) },
        arc: 0.2,
        accel: 4,
        nameKey: 'target.lantern',
        impactSound: 'lantern_crash',
      }),
    );
  const lanternL = lantern('lantern.l', -1.8, -1);
  const lanternR = lantern('lantern.r', 1.8, 1);
  lanternL.targetable = () => L.has('mira.demo');
  if (L.has('lantern.l.fallen') && !L.has('mira.demo')) lanternL.setFallen();
  if (L.has('lantern.r.fallen') && !L.has('lantern.r.restored')) lanternR.setFallen();

  const span = (id: string, z: number, dx: number) =>
    sim.addProp(
      new FallingProp({
        id,
        kind: 'span',
        visual: 'span',
        rest: { pos: v3(0, -0.25, z), rot: v3() },
        fallen: { pos: v3(dx, -29.4, z), rot: v3(0.25, 0.35 * Math.sign(dx), 0.85 * Math.sign(dx)) },
        accel: 1.3,
        size: v3(3.2, 0.5, 8),
        colliderMat: 'plank',
        solidAtRest: true,
        solidWhenFallen: false,
        nameKey: 'target.span',
        impactSound: 'span_crash',
        impactShake: 0.4,
        targetRange: 42,
        ignoreLos: true,
      }),
    );
  const span2 = span('bridge.span2', -14, 1.6);
  const span3 = span('bridge.span3', -22, -1.6);

  const collapse = () => {
    sim.run(
      'collapse',
      (function* () {
        sim.cameraOverride = { pos: v3(7, 5, 6), look: v3(0, -2, -14) };
        yield 0.6;
        sfx('rumble', v3(0, 0, -14));
        bus.emit('camera.shake', { strength: 0.5, duration: 1.4 });
        yield 0.8;
        span2.trigger();
        L.set('span2.fell');
        yield 2.6;
        sim.say(E, 'line.bridge_gone');
        yield 2.2;
        // Mira arrives over the toll house roof.
        sim.mira.visible = true;
        sim.mira.pos = v3(9, 4.4, 3.5);
        sim.mira.goTo(v3(-0.6, 0, 1.4));
        sfx('mira_appear', sim.mira.pos);
        sim.cameraOverride = { pos: v3(3, 2.6, 6.5), look: v3(-1.2, 1.4, 0.8) };
        sim.say(M, 'line.mira_hello');
        yield () => sim.mira.arrived();
        yield 1.4;
        sim.say(E, 'line.elian_cat');
        yield 2.2;
        // Demonstration: the left lantern falls and remembers its hook.
        lanternL.trigger();
        L.set('lantern.l.fallen');
        yield 1.2;
        sim.say(M, 'line.mira_broken');
        yield 2.4;
        lanternL.rewindItself(1.4);
        sfx('rewind_commit', lanternL.getPosition());
        yield 2.0;
        L.set('mira.demo');
        sim.say(E, 'line.elian_not_time');
        yield 2.0;
        sim.say(M, 'line.mira_neither');
        yield 2.4;
        sim.unlockAbility('rewind');
        sim.say(M, 'line.mira_your_turn');
        sim.mira.goTo(v3(2.2, 0, 1.8));
        yield 1.2;
        lanternR.trigger();
        L.set('lantern.r.fallen');
        yield 1.0;
        sim.cameraOverride = null;
        sim.mira.follow();
        sim.setStage('q_bridge', 'lantern');
        tut('tut.rewind');
      })(),
      { cinematic: true },
    );
  };
  sim.addTrigger({
    id: 'bridge.collapse',
    min: v3(-6, -1, 2),
    max: v3(6, 5, 14),
    once: true,
    when: () => sim.quests.isActive('q_bridge', 'reach'),
    onEnter: collapse,
  });

  const chaseHollows = ['b.hollow1', 'b.hollow2'];
  bus.on('rewind.commit', ({ targetId }) => {
    if (targetId === 'lantern.r' && lanternR.phase === 0 && sim.quests.isActive('q_bridge', 'lantern')) {
      L.set('lantern.r.restored');
      sim.say(M, 'line.mira_good');
      sim.setStage('q_bridge', 'span');
      sim.setCheckpoint('bridge', POS.bridgeCheckpoint, 0);
      tut('tut.span');
    }
    if (targetId === 'bridge.span2' && span2.phase === 0 && (sim.quests.isActive('q_bridge', 'span') || sim.quests.isActive('q_bridge', 'lantern'))) {
      sim.say(M, 'line.mira_span');
      sim.setStage('q_bridge', 'cross');
    }
    if (targetId === 'bridge.span3' && span3.phase === 0 && sim.quests.isActive('q_bridge', 'chase')) {
      sim.say(M, 'line.mira_run');
      sim.setStage('q_bridge', 'cross');
    }
  });
  sim.addTrigger({
    id: 'bridge.chase',
    min: v3(-1.7, -1, -17),
    max: v3(1.7, 4, -10.5),
    once: true,
    when: () => sim.quests.isActive('q_bridge', 'cross') && span2.phase === 0,
    onEnter: () => {
      chaseHollows.forEach((hid, i) => {
        const h = sim.addEnemy(new Hollow(hid, v3(i ? 1.2 : -1.2, 0.02, 6 + i * 1.5)));
        h.aggro = true;
        h.leash = 60;
        h.setState(ES.Emerge);
      });
      span3.trigger();
      sfx('rumble', v3(0, 0, -22));
      bus.emit('camera.shake', { strength: 0.4, duration: 1 });
      sim.say(M, 'line.mira_chase');
      sim.setStage('q_bridge', 'chase');
    },
  });
  sim.addTrigger({
    id: 'bridge.crossed',
    min: v3(-46, -1, -40),
    max: v3(46, 6, -27),
    once: true,
    onEnter: () => {
      if (span2.phase === 0) span2.trigger();
      sim.run(
        'crossed',
        (function* () {
          yield 1.4;
          sim.say(M, 'line.mira_bridge_memory');
          yield 0.5;
          sim.completeQuest('q_bridge');
          sim.setStage('q_workshop', 'find');
          for (const h of chaseHollows) {
            const e = sim.enemies.get(h);
            if (e && e.alive && e.pos.z > -2) sim.removeEnemy(h);
          }
          sim.setCheckpoint('north', v3(0, 0.02, -32), 0);
        })(),
      );
    },
  });
  // After reloading on the north side, the span the player crossed is already down again.
  if (L.has('trig.bridge.crossed') && span2.phase === 0) span2.setFallen();

  // =====================================================================================
  // MISSION 01.03 — The Empty Workshop
  // =====================================================================================

  sim.addInteractable({
    id: 'npc.lamplighter',
    pos: v3(POS.lamplighter.x, 1.2, POS.lamplighter.z),
    radius: 2.6,
    prompt: 'prompt.talk',
    label: 'speaker.lamplighter',
    marker: 'npc',
    onInteract: () => sim.startDialogue('lamplighter'),
  });
  tonic('tonic.oldquarter', v3(9.5, 0.1, -36));

  sim.addTrigger({
    id: 'orven.enter',
    min: v3(-7.6, -1, -63.6),
    max: v3(7.6, 5, -49),
    once: true,
    onEnter: () => {
      sim.setStage('q_workshop', 'door');
      sim.run(
        'orven.enter',
        (function* () {
          yield 0.8;
          sim.startDialogue('mira_workshop');
        })(),
      );
    },
  });

  const weight = sim.addProp(new Counterweight('cellar.weight', v3(2.8, 6.6, -63.1), 3.5, { min: v3(-1.2, 0, -64.2), max: v3(1.2, 3.4, -63.8), lift: 3.3 }, 0.35));
  sim.addInteractable({
    id: 'lever.outer',
    pos: v3(POS.lever.x, 1.0, POS.lever.z),
    radius: 1.9,
    prompt: 'prompt.pull',
    label: 'obj.lever',
    marker: 'lever',
    onInteract: () => {
      if (weight.pull()) {
        sfx('lever', POS.lever);
        if (once('lever.first')) sim.say(M, 'line.mira_lever');
      } else sfx('lever_stuck', POS.lever);
    },
  });
  sim.addInteractable({
    id: 'lever.inner',
    pos: v3(0.9, -0.2, -64.9),
    radius: 1.9,
    prompt: 'prompt.pull',
    label: 'obj.lever',
    marker: 'lever',
    onInteract: () => {
      if (weight.pull()) sfx('lever', v3(0.9, 0, -64.9));
    },
  });
  bus.on('rewind.commit', ({ targetId }) => {
    if (targetId === 'cellar.weight' && once('weight.rewound')) sim.say(M, 'line.mira_weight');
  });
  sim.addTrigger({
    id: 'cellar.entered',
    min: v3(-1.2, -3, -66.5),
    max: v3(1.2, 3, -64.7),
    once: true,
    onEnter: () => {
      sim.setStage('q_workshop', 'search');
      sim.setCheckpoint('cellar', v3(0, -4.5, -71), 0);
    },
  });

  const keyClock = sim.addProp(
    new FallingProp({
      id: 'cellar.keyclock',
      kind: 'keyclock',
      visual: 'keyclock',
      rest: { pos: v3(3.6, -3.5, -71), rot: v3() },
      fallen: { pos: v3(3.6, -3.5, -71), rot: v3() },
      linear: 1.6,
      anchorable: false,
      nameKey: 'target.keyclock',
      impactSound: 'glass_settle',
    }),
  );
  sim.addTrigger({
    id: 'cellar.floor',
    min: v3(-7, -5, -78),
    max: v3(7, -3, -70.5),
    once: true,
    onEnter: () => {
      keyClock.trigger();
      sfx('glass_shatter', keyClock.getPosition());
      sim.say(M, 'line.mira_shatter');
    },
  });
  if (L.has('trig.cellar.floor') && keyClock.phase === 0 && !L.has('keyclock.read')) keyClock.setFallen();

  const searchDone = () => {
    if (L.evidence.includes('ev.notebook') && L.evidence.includes('ev.portrait') && sim.quests.isActive('q_workshop', 'search')) sim.setStage('q_workshop', 'vault');
    else bus.emit('journal.updated', { reason: 'progress' });
  };
  sim.addInteractable({
    id: 'ev.notebook',
    pos: v3(POS.notebook.x, -3.5, POS.notebook.z),
    radius: 2.0,
    prompt: 'prompt.read',
    label: 'ev.notebook',
    marker: 'evidence',
    onInteract: () => {
      sim.addEvidence('ev.notebook');
      doc('ev.notebook', 'doc.notebook');
      searchDone();
    },
  });
  sim.addInteractable({
    id: 'ev.portrait',
    pos: v3(-6.3, -3.0, -71.5),
    radius: 2.2,
    prompt: 'prompt.inspect',
    label: 'ev.portrait',
    marker: 'evidence',
    onInteract: () => {
      sim.addEvidence('ev.portrait');
      sim.say(E, 'line.portrait');
      searchDone();
    },
  });
  sim.addInteractable({
    id: 'clock.bell',
    pos: v3(-6.3, -2.6, -75),
    radius: 2.2,
    prompt: 'prompt.inspect',
    label: 'obj.clock_bell',
    marker: 'device',
    onInteract: () => {
      L.set('read.bell');
      sim.say(E, 'line.clock_bell');
      bus.emit('journal.updated', { reason: 'clue' });
    },
  });
  sim.addInteractable({
    id: 'clock.moon',
    pos: v3(6.3, -2.6, -75),
    radius: 2.2,
    prompt: 'prompt.inspect',
    label: 'obj.clock_moon',
    marker: 'device',
    onInteract: () => {
      L.set('read.moon');
      sim.say(E, 'line.clock_moon');
      bus.emit('journal.updated', { reason: 'clue' });
    },
  });
  sim.addInteractable({
    id: 'clock.key',
    pos: v3(3.6, -3.2, -71),
    radius: 2.0,
    prompt: 'prompt.inspect',
    label: 'obj.clock_key',
    marker: 'device',
    onInteract: () => {
      if (keyClock.phase === 0 && keyClock.p < 0.05) {
        L.set('read.key');
        L.set('keyclock.read');
        sim.say(E, 'line.clock_key_whole');
      } else sim.say(E, 'line.clock_key_broken');
      bus.emit('journal.updated', { reason: 'clue' });
    },
  });
  bus.on('rewind.commit', ({ targetId }) => {
    if (targetId === 'cellar.keyclock' && keyClock.phase === 0 && once('keyclock.restored')) sim.say(M, 'line.mira_keyclock');
  });

  const vaultDoor = door('vault.door', v3(-1.2, -4.5, -78.4), v3(1.2, -1.4, -78), 'vault.open', 'iron');
  sim.addInteractable({
    id: 'dial',
    pos: v3(POS.dialLock.x, -3.0, POS.dialLock.z + 0.3),
    radius: 2.2,
    prompt: 'prompt.use',
    label: 'obj.dial',
    marker: 'device',
    enabled: () => !L.has('vault.open'),
    onInteract: () => bus.emit('ui.dial', {}),
  });
  sim.hooks.dial = (code: number[]) => {
    if (L.has('vault.open')) return true;
    if (code[0] === 4 && code[1] === 11 && code[2] === 7) {
      L.commit('vault.opened');
      vaultDoor.open();
      sfx('vault_open', POS.vault);
      sim.say(M, 'line.mira_vault');
      sim.setStage('q_workshop', 'inside');
      return true;
    }
    sfx('dial_wrong', POS.dialLock);
    sim.say(N, 'cap.dial_wrong');
    return false;
  };

  const vaultDone = () => {
    if (L.evidence.includes('ev.recording') && L.has('ability.anchor') && sim.quests.isActive('q_workshop', 'inside')) {
      sim.completeQuest('q_workshop');
      sim.setStage('q_gate', 'reach');
      sim.setCheckpoint('vault', v3(0, -4.5, -80.2), Math.PI);
    }
  };
  sim.addInteractable({
    id: 'ev.recording',
    pos: v3(POS.gramophone.x, -3.6, POS.gramophone.z),
    radius: 2.0,
    prompt: 'prompt.listen',
    label: 'ev.recording',
    marker: 'evidence',
    enabled: () => !sim.seq.isRunning('recording'),
    onInteract: () => {
      sim.run(
        'recording',
        (function* () {
          sfx('gramophone', POS.gramophone);
          yield 0.8;
          sim.say(ORV, 'line.orven1');
          yield 4.2;
          sim.say(ORV, 'line.orven2');
          yield 4.2;
          sim.say(ORV, 'line.orven3');
          yield 3.6;
          sim.addEvidence('ev.recording');
          sim.say(E, 'line.after_recording');
          yield 2.5;
          vaultDone();
        })(),
      );
    },
  });
  sim.addInteractable({
    id: 'prototype',
    pos: v3(POS.prototype.x, -3.4, POS.prototype.z),
    radius: 2.0,
    prompt: 'prompt.take',
    label: 'item.prototype',
    marker: 'item',
    enabled: () => !L.has('ability.anchor'),
    onInteract: () => {
      if (!L.claim('item.prototype', 'prototype')) return;
      sim.unlockAbility('anchor');
      sfx('pickup');
      sim.say(M, 'line.mira_prototype');
      tut('tut.anchor');
      vaultDone();
    },
  });

  // =====================================================================================
  // MISSION 01.04 — The Watchman at the Gate
  // =====================================================================================

  tonic('tonic.gate', v3(-3.2, 0.1, -88.6));
  const gateDoor = door('gate.door', v3(-4, 0, -122.8), v3(4, 8, -122), 'gate.open', 'iron');

  const bells = POS.bells.map((b, i) =>
    sim.addProp(
      new FallingProp({
        id: `bell.${i}`,
        kind: 'bell',
        visual: 'bell',
        rest: { pos: v3(b.x, 3.9, b.z), rot: v3() },
        fallen: { pos: v3(b.x + 0.4, 0.75, b.z + 0.3), rot: v3(0.25, 0.4, 1.25) },
        accel: 3.2,
        size: v3(1.6, 1.5, 1.6),
        colliderMat: 'invisible',
        solidAtRest: false,
        solidWhenFallen: true,
        nameKey: 'target.bell',
        impactSound: 'bell_crash',
        impactShake: 0.35,
      }),
    ),
  );

  let sentinel: Sentinel | null = null;
  if (!L.has('dead.sentinel')) {
    sentinel = sim.addEnemy(new Sentinel('sentinel', POS.sentinel));
    sentinel.yaw = 0;
    sentinel.aggroRadius = sim.quests.isActive('q_gate', 'fight') ? 16 : 0;
    sentinel.hooks = {
      onSlam: (_ctx, s) => {
        let best: FallingProp | null = null;
        let bd = 13;
        for (const b of bells) {
          if (b.phase !== 0) continue;
          const d = distXZ(b.getPosition(), s.pos);
          if (d < bd) {
            bd = d;
            best = b;
          }
        }
        if (best) {
          best.trigger();
          if (once('bell.first_fall')) sim.say(M, 'line.mira_bell_fell');
        }
      },
      onPhase: (_ctx, _s, phase) => {
        if (phase === 2) {
          sim.visual.observer = 1;
          L.set('observer.seen');
          sfx('observer_open');
          sim.say(M, 'line.mira_watching');
          const h = sim.addEnemy(new Hollow('g.hollow1', v3(-6, 0.02, -118)));
          h.aggro = true;
          h.setState(ES.Emerge);
        }
        if (phase === 3) {
          const h = sim.addEnemy(new Hollow('g.hollow2', v3(6, 0.02, -118)));
          h.aggro = true;
          h.setState(ES.Emerge);
          sim.say(E, 'line.elian_phase3');
        }
      },
    };
  }

  bus.on('rewind.commit', ({ targetId }) => {
    const bell = bells.find((b) => b.id === targetId);
    if (!bell || bell.phase !== 0) return;
    sfx('bell_lawful', bell.getPosition());
    bus.emit('flash', { color: '#66BFD4', strength: 0.5 });
    const s = sim.enemies.get('sentinel') as Sentinel | undefined;
    if (s && s.alive && distXZ(s.pos, bell.getPosition()) < 11) {
      s.resonate(sim.ctx);
      if (once('bell.first_resonance')) sim.say(M, 'line.mira_cracked');
    } else if (s && s.alive && once('bell.too_far')) sim.say(M, 'line.mira_too_far');
  });

  sim.addTrigger({
    id: 'gate.enter',
    min: v3(-18, -1, -100),
    max: v3(18, 6, -88.5),
    once: true,
    when: () => sim.quests.isActive('q_gate', 'reach') && !L.has('dead.sentinel'),
    onEnter: () => {
      sim.setStage('q_gate', 'fight');
      sim.setCheckpoint('courtyard', v3(0, 0.02, -90), 0);
      sim.run(
        'sentinel.wake',
        (function* () {
          sim.cameraOverride = { pos: v3(4, 3, -94), look: v3(0, 2.5, -110) };
          sfx('sentinel_wake', POS.sentinel);
          bus.emit('camera.shake', { strength: 0.3, duration: 1.2 });
          sim.visual.fold = 1;
          yield 1.4;
          sim.say(M, 'line.mira_watchman');
          yield 3.2;
          sim.say(E, 'line.elian_watchman');
          yield 2.2;
          sim.cameraOverride = null;
          if (sentinel) {
            sentinel.aggroRadius = 40;
            sentinel.aggro = true;
          }
          tut('tut.lockon');
        })(),
        { cinematic: true },
      );
    },
  });
  if (sim.quests.isActive('q_gate', 'fight')) sim.visual.fold = 1;
  if (L.has('observer.seen')) sim.visual.observer = 1;
  if (L.has('bell1.awake')) {
    sim.visual.observer = 1;
    sim.visual.bell1 = 1;
  }

  bus.on('enemy.defeated', ({ id }) => {
    if (id !== 'sentinel') return;
    for (const h of ['g.hollow1', 'g.hollow2']) {
      const e = sim.enemies.get(h);
      if (e?.alive) e.takeDamage(sim.ctx, 999);
    }
    sim.run(
      'sentinel.down',
      (function* () {
        yield 1.2;
        sim.cameraOverride = { pos: v3(sim.player.pos.x, sim.player.pos.y + 2, sim.player.pos.z + 4), look: v3(0, 60, -60) };
        sim.visual.observer = 1;
        sfx('observer_open');
        yield 1.6;
        sim.say(O, 'line.observer');
        yield 3.0;
        sim.say(M, 'line.mira_dont_look');
        yield 2.6;
        sim.cameraOverride = { pos: v3(0, 8, -96), look: v3(0, 16, 30) };
        L.commit('bell1.awake');
        sim.visual.bell1 = 1;
        sfx('bell_lawful_big');
        bus.emit('flash', { color: '#EEE9F6', strength: 0.8 });
        sim.say(N, 'cap.first_bell');
        yield 3.4;
        sim.say(M, 'line.mira_first_bell');
        yield 3.0;
        sim.cameraOverride = null;
        sim.setStage('q_gate', 'core');
        sim.setCheckpoint('sentinel', v3(0, 0.02, -104), 0);
      })(),
      { cinematic: true },
    );
  });

  const openGate = () => {
    sim.run(
      'gate.open',
      (function* () {
        sim.cameraOverride = { pos: v3(0, 3, -108), look: v3(0, 3, -124) };
        yield 0.6;
        gateDoor.open();
        sfx('gate_open', POS.gate);
        bus.emit('camera.shake', { strength: 0.3, duration: 1.5 });
        yield 1.8;
        bus.emit('title.card', { textKey: 'title.vesper', subKey: 'title.sub' });
        yield 4.5;
        sim.cameraOverride = null;
        sim.completeQuest('q_gate');
        sim.setStage('q_forest', 'enter');
        sim.setCheckpoint('gate', v3(0, 0.02, -118), 0);
      })(),
      { cinematic: true },
    );
  };
  sim.addInteractable({
    id: 'bellcore',
    pos: v3(POS.sentinel.x, 1.0, POS.sentinel.z),
    radius: 3.2,
    prompt: 'prompt.examine',
    label: 'item.bellcore',
    marker: 'item',
    enabled: () => sim.quests.isActive('q_gate', 'core') && !L.has('choice.bellcore') && !sim.seq.cinematicActive,
    onInteract: () => sim.startDialogue('bellcore'),
  });
  bus.on('dialogue.ended', ({ dialogueId }) => {
    if (dialogueId === 'bellcore' && L.has('choice.bellcore') && sim.quests.isActive('q_gate', 'core')) openGate();
  });
  if (L.has('choice.bellcore') && sim.quests.isActive('q_gate', 'core')) openGate();

  // =====================================================================================
  // MISSION 02.01 — A Road of Paper Stars (opening)
  // =====================================================================================

  sim.addTrigger({
    id: 'forest.edge',
    min: v3(-20, -1, -134),
    max: v3(20, 6, -124),
    once: true,
    onEnter: () => sim.say(M, 'line.mira_forest'),
  });
  tonic('tonic.forest', v3(-9.5, 0.1, -138.5));

  const mapPickup = (mapId: string, pos: Vec3) =>
    sim.addInteractable({
      id: mapId,
      pos,
      radius: 2.2,
      prompt: 'prompt.take',
      label: mapId,
      marker: 'evidence',
      enabled: () => !L.evidence.includes(mapId),
      onInteract: () => {
        sim.addEvidence(mapId);
        doc(mapId, `doc.${mapId}`);
        if (MAPS.every((m) => L.evidence.includes(m))) sim.say(M, 'line.mira_maps');
      },
    });
  mapPickup('map.merchant', v3(POS.signpost.x, 1.4, POS.signpost.z));
  mapPickup('map.child', v3(POS.pack.x, 0.5, POS.pack.z));
  mapPickup('map.lover', v3(POS.crossSign.x, 1.4, POS.crossSign.z));

  const roots1 = sim.addProp(
    new FallingProp({
      id: 'roots.1',
      kind: 'roots',
      visual: 'rootwall',
      rest: { pos: v3(0, -2.0, -153), rot: v3() },
      fallen: { pos: v3(0, 1.8, -153), rot: v3() },
      linear: 0.8,
      size: v3(9, 3.6, 1.6),
      colliderMat: 'invisible',
      solidAtRest: false,
      solidWhenFallen: true,
      nameKey: 'target.roots',
      impactSound: 'roots_settle',
    }),
  );
  if (!L.has('trig.forest.ambush')) {
    // Not grown yet: the wall waits underground.
  } else if (roots1.phase === 0 && !L.has('roots1.cleared')) roots1.setFallen();

  const rootbounds = ['f.root1', 'f.root2'];
  const spawnRootbounds = (emerge: boolean) => {
    const pts = [v3(-5, 0, -146), v3(6, 0, -148)];
    rootbounds.forEach((rid, i) => {
      const r = sim.addEnemy(new Rootbound(rid, pts[i]));
      if (sim.enemies.has(rid)) {
        r.aggro = true;
        if (emerge) r.setState(ES.Emerge);
      }
    });
  };
  sim.addTrigger({
    id: 'forest.ambush',
    min: v3(-14, -1, -150),
    max: v3(14, 6, -137),
    once: true,
    onEnter: () => {
      spawnRootbounds(true);
      roots1.trigger();
      sfx('roots_grow', roots1.getPosition());
      sim.say(M, 'line.mira_rootbound');
      sim.setStage('q_forest', 'roots');
    },
  });
  if (L.has('trig.forest.ambush')) spawnRootbounds(false);
  bus.on('rewind.commit', ({ targetId }) => {
    if (targetId === 'roots.1' && roots1.phase === 0) {
      L.set('roots1.cleared');
      if (sim.quests.isActive('q_forest', 'roots')) {
        sim.setStage('q_forest', 'maps');
        sim.say(M, 'line.mira_roots_clear');
        sim.setCheckpoint('clearing', v3(0, 0.02, -157), 0);
      }
    }
    if (targetId === 'roots.2' && once('roots2.rewound')) sim.say(M, 'line.mira_roots2');
  });
  bus.on('anchor.set', ({ targetId }) => {
    if (targetId === 'roots.2' && once('roots2.anchored')) sim.say(M, 'line.mira_anchor_roots');
  });

  // Wrong paths loop back to the crossroads: the forest grants the map-maker's wish, not the traveller's.
  const loopBack = (side: string) => {
    sim.run(
      `loop.${side}`,
      (function* () {
        bus.emit('fade', { dir: 'out', duration: 0.6 });
        sfx('forest_loop');
        yield 0.7;
        sim.teleport(v3(0, 0.02, -179), 0);
        bus.emit('fade', { dir: 'in', duration: 0.8 });
        const n = L.num('forest.loops') + 1;
        L.set('forest.loops', n);
        yield 0.6;
        sim.say(M, n === 1 ? 'line.mira_loop1' : n === 2 ? 'line.mira_loop2' : 'line.mira_loop3');
        bus.emit('journal.updated', { reason: 'clue' });
      })(),
      { cinematic: true, skippable: false },
    );
  };
  sim.addTrigger({ id: 'forest.left', min: v3(-30, -1, -200), max: v3(-21, 6, -192), onEnter: () => loopBack('left') });
  sim.addTrigger({ id: 'forest.right', min: v3(21, -1, -200), max: v3(30, 6, -192), onEnter: () => loopBack('right') });
  sim.addTrigger({
    id: 'forest.startree',
    min: v3(-6, -1, -201),
    max: v3(6, 6, -193),
    once: true,
    onEnter: () => {
      sim.say(M, 'line.mira_startree');
      if (!sim.quests.isActive('q_forest', 'fair')) sim.setStage('q_forest', 'fair');
      sim.setCheckpoint('startree', v3(0, 0.02, -202), 0);
    },
  });
  // If the player skipped the roots objective via the maps, keep the quest consistent.
  sim.addTrigger({
    id: 'forest.crossroads',
    min: v3(-9, -1, -185),
    max: v3(9, 6, -168),
    once: true,
    onEnter: () => {
      if (sim.quests.isActive('q_forest', 'roots')) sim.setStage('q_forest', 'maps');
    },
  });

  sim.addProp(new PulsingRoots('roots.2', v3(0, 0, -214), v3(8, 3.6, 1.6)));
  sim.addTrigger({
    id: 'forest.guard',
    min: v3(-6, -1, -212),
    max: v3(6, 6, -204),
    once: true,
    onEnter: () => {
      const r = sim.addEnemy(new Rootbound('f.root3', v3(-3, 0, -222)));
      if (sim.enemies.has('f.root3')) {
        r.aggro = true;
        r.setState(ES.Emerge);
      }
      sim.say(M, 'line.mira_pulse');
    },
  });
  if (L.has('trig.forest.guard')) {
    const r = sim.addEnemy(new Rootbound('f.root3', v3(-3, 0, -222)));
    r.aggro = true;
  }

  sim.addTrigger({
    id: 'forest.end',
    min: v3(-10, -1, -242),
    max: v3(10, 6, -232),
    once: true,
    onEnter: () => {
      sim.run(
        'ending',
        (function* () {
          sim.cameraOverride = { pos: v3(0, 4, -236), look: v3(0, 4, -300) };
          sfx('fair_music');
          yield 1.2;
          sim.say(M, 'line.mira_fair');
          yield 3.6;
          sim.say(E, 'line.elian_fair');
          yield 2.8;
          sim.say(M, 'line.mira_bells');
          yield 4.2;
          sim.say(E, 'line.elian_responsible');
          yield 3.6;
          sim.completeQuest('q_forest');
          bus.emit('title.card', { textKey: 'title.end', subKey: 'title.end_sub' });
          yield 5;
          sim.completeGame();
        })(),
        { cinematic: true, skippable: false },
      );
    },
  });
}
