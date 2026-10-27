import type { QuestDef } from '../sim/quests';
import { POS } from './level';

// Quest graph for Chapter 01 (missions 01.01–01.04) and the opening of Mission 02.01.

export const COMPONENTS = ['comp.mainspring', 'comp.balance', 'comp.crystal'];
export const MAPS = ['map.merchant', 'map.child', 'map.lover'];

export const QUESTS: Record<string, QuestDef> = {
  q_ash: {
    id: 'q_ash',
    title: 'quest.ash',
    main: true,
    stages: {
      gather: {
        objective: 'obj.gather',
        params: (l) => ({ n: COMPONENTS.filter((c) => l.isClaimed(c)).length, total: 3 }),
        detail: 'detail.gather',
        location: POS.workbench,
        hints: ['hint.gather.1', 'hint.gather.2', 'hint.gather.3'],
      },
      assemble: { objective: 'obj.assemble', location: POS.workbench, hints: ['hint.assemble.1', 'hint.assemble.2', 'hint.assemble.3'] },
      door: { objective: 'obj.door', location: POS.workshopDoor, hints: ['hint.door.1', 'hint.door.2', 'hint.door.3'] },
      square: {
        objective: 'obj.square',
        detail: 'detail.square',
        location: POS.hesper,
        hints: ['hint.square.1', 'hint.square.2', 'hint.square.3'],
      },
      fight: { objective: 'obj.fight_hollows', hints: ['hint.fight.1', 'hint.fight.2', 'hint.fight.3'] },
    },
  },
  q_bridge: {
    id: 'q_bridge',
    title: 'quest.bridge',
    main: true,
    stages: {
      reach: {
        objective: (l) => (l.get('tone.hesper') === 'blunt' ? 'obj.reach_bridge_blunt' : 'obj.reach_bridge'),
        location: POS.bridgeStart,
        hints: ['hint.reach.1', 'hint.reach.2', 'hint.reach.3'],
      },
      lantern: { objective: 'obj.lantern', location: POS.lanternPostR, hints: ['hint.lantern.1', 'hint.lantern.2', 'hint.lantern.3'] },
      span: { objective: 'obj.span', location: POS.span2, hints: ['hint.span.1', 'hint.span.2', 'hint.span.3'] },
      cross: { objective: 'obj.cross', location: POS.northLanding, hints: ['hint.cross.1', 'hint.cross.2', 'hint.cross.3'] },
      chase: { objective: 'obj.chase', location: POS.span3, hints: ['hint.chase.1', 'hint.chase.2', 'hint.chase.3'] },
    },
  },
  q_workshop: {
    id: 'q_workshop',
    title: 'quest.workshop',
    main: true,
    stages: {
      find: { objective: 'obj.find_orven', location: POS.orvenDoor, hints: ['hint.find.1', 'hint.find.2', 'hint.find.3'] },
      door: { objective: 'obj.cellar_door', location: POS.cellarDoor, hints: ['hint.cellar.1', 'hint.cellar.2', 'hint.cellar.3'] },
      search: {
        objective: 'obj.search_cellar',
        params: (l) => ({ n: ['ev.notebook', 'ev.portrait'].filter((e) => l.evidence.includes(e)).length, total: 2 }),
        location: POS.cellarFloor,
        hints: ['hint.search.1', 'hint.search.2', 'hint.search.3'],
      },
      vault: { objective: 'obj.vault', location: POS.dialLock, hints: ['hint.vault.1', 'hint.vault.2', 'hint.vault.3'] },
      inside: { objective: 'obj.vault_inside', location: POS.vault, hints: ['hint.inside.1', 'hint.inside.2', 'hint.inside.3'] },
    },
  },
  q_gate: {
    id: 'q_gate',
    title: 'quest.gate',
    main: true,
    stages: {
      reach: { objective: 'obj.reach_gate', location: POS.courtyardEntry, hints: ['hint.gate.1', 'hint.gate.2', 'hint.gate.3'] },
      fight: { objective: 'obj.sentinel', location: POS.sentinel, hints: ['hint.sentinel.1', 'hint.sentinel.2', 'hint.sentinel.3'] },
      core: { objective: 'obj.bellcore', location: POS.sentinel, hints: ['hint.core.1', 'hint.core.2', 'hint.core.3'] },
    },
  },
  q_forest: {
    id: 'q_forest',
    title: 'quest.forest',
    main: true,
    stages: {
      enter: { objective: 'obj.forest_enter', location: POS.clearing, hints: ['hint.fenter.1', 'hint.fenter.2', 'hint.fenter.3'] },
      roots: { objective: 'obj.roots', location: POS.rootWall1, hints: ['hint.roots.1', 'hint.roots.2', 'hint.roots.3'] },
      maps: {
        objective: 'obj.maps',
        params: (l) => ({ n: MAPS.filter((m) => l.evidence.includes(m)).length, total: 3 }),
        location: POS.crossroads,
        hints: ['hint.maps.1', 'hint.maps.2', 'hint.maps.3'],
      },
      fair: { objective: 'obj.fair', location: POS.overlook, hints: ['hint.fair.1', 'hint.fair.2', 'hint.fair.3'] },
    },
  },
  q_hesper: {
    id: 'q_hesper',
    title: 'quest.hesper',
    main: false,
    stages: {
      diary: { objective: 'obj.hesper_diary', location: POS.hesper, hints: ['hint.diary.1', 'hint.diary.2', 'hint.diary.3'] },
    },
  },
};

/** Evidence shown in the journal for Clockfall (UX §5: "Evidence: n/7"). */
export const CLOCKFALL_EVIDENCE = ['ev.warning', 'ev.calendar', 'ev.mantel', 'ev.diary', 'ev.notebook', 'ev.portrait', 'ev.recording'];
export const CRITICAL_EVIDENCE = new Set(['ev.warning', 'ev.notebook', 'ev.portrait', 'ev.recording']);
