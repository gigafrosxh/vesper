import type { DialogueGraph } from '../sim/dialogue';
import type { Sim } from '../sim/game';

// Dialogue graphs. Scripted core exchanges from the story bible are used verbatim.

const E = 'speaker.elian';
const M = 'speaker.mira';
const H = 'speaker.hesper';
const L = 'speaker.lamplighter';

const asked = (k: string) => (l: { has(f: string): boolean }) => !l.has(`asked.${k}`);
const mark = (k: string) => (s: Sim) => s.ledger.set(`asked.${k}`);

export const DIALOGUES: Record<string, DialogueGraph<Sim>> = {
  hesper: {
    id: 'hesper',
    start: (l) => (l.has('strike.done') ? 'after' : 'greet'),
    nodes: {
      greet: {
        id: 'greet',
        lines: [{ speaker: H, text: 'dlg.hesper.greet' }],
        choices: [
          { text: 'dlg.hesper.c_curious', next: 'curious', condition: asked('hesper.tone'), unavailableKey: 'dlg.unavail.asked', tone: 'curious' },
          { text: 'dlg.hesper.c_blunt', next: 'blunt', condition: asked('hesper.tone'), unavailableKey: 'dlg.unavail.asked', tone: 'blunt' },
          { text: 'dlg.hesper.c_orven', next: 'orven', condition: asked('hesper.orven'), unavailableKey: 'dlg.unavail.asked' },
          { text: 'dlg.common.leave', next: null },
        ],
      },
      curious: {
        id: 'curious',
        lines: [
          { speaker: H, text: 'dlg.hesper.curious1' },
          { speaker: E, text: 'dlg.hesper.curious2' },
          { speaker: H, text: 'dlg.hesper.curious3' },
        ],
        effect: (s) => {
          s.ledger.set('tone.hesper', 'curious');
          mark('hesper.tone')(s);
          s.bus.emit('journal.updated', { reason: 'tone' });
        },
        next: 'hub',
      },
      blunt: {
        id: 'blunt',
        lines: [{ speaker: H, text: 'dlg.hesper.blunt1' }],
        effect: (s) => {
          s.ledger.set('tone.hesper', 'blunt');
          mark('hesper.tone')(s);
          s.bus.emit('journal.updated', { reason: 'tone' });
        },
        next: 'hub',
      },
      orven: {
        id: 'orven',
        lines: [
          { speaker: H, text: 'dlg.hesper.orven1' },
          { speaker: E, text: 'dlg.hesper.orven2' },
        ],
        effect: mark('hesper.orven'),
        next: 'hub',
      },
      diary: {
        id: 'diary',
        lines: [{ speaker: H, text: 'dlg.hesper.diary1' }],
        effect: (s) => {
          mark('hesper.diary')(s);
          if (!s.ledger.evidence.includes('ev.diary')) s.setStage('q_hesper', 'diary');
        },
        next: 'hub',
      },
      hub: {
        id: 'hub',
        lines: [{ speaker: H, text: 'dlg.hesper.hub' }],
        choices: [
          { text: 'dlg.hesper.c_curious', next: 'curious', condition: asked('hesper.tone'), unavailableKey: 'dlg.unavail.asked', tone: 'curious' },
          { text: 'dlg.hesper.c_blunt', next: 'blunt', condition: asked('hesper.tone'), unavailableKey: 'dlg.unavail.asked', tone: 'blunt' },
          { text: 'dlg.hesper.c_orven', next: 'orven', condition: asked('hesper.orven'), unavailableKey: 'dlg.unavail.asked' },
          { text: 'dlg.hesper.c_diary', next: 'diary', condition: asked('hesper.diary'), unavailableKey: 'dlg.unavail.asked' },
          { text: 'dlg.common.leave', next: null },
        ],
      },
      after: {
        id: 'after',
        lines: [
          { speaker: H, text: 'dlg.hesper.after1' },
          { speaker: H, text: 'dlg.hesper.after2' },
        ],
        choices: [{ text: 'dlg.common.leave', next: null }],
      },
    },
  },

  // The dialogue wireframe from the UI/UX specification (§4).
  mira_workshop: {
    id: 'mira_workshop',
    start: 'm1',
    nodes: {
      m1: {
        id: 'm1',
        lines: [{ speaker: M, text: 'dlg.mira.prison' }],
        choices: [
          { text: 'dlg.mira.c_tell', next: 'tell', condition: asked('mira.tell'), unavailableKey: 'dlg.unavail.asked' },
          { text: 'dlg.mira.c_bell', next: 'bell', condition: asked('mira.bell'), unavailableKey: 'dlg.unavail.asked' },
          { text: 'dlg.common.leave_conv', next: 'm2' },
        ],
      },
      tell: {
        id: 'tell',
        lines: [
          { speaker: M, text: 'dlg.mira.tell1' },
          { speaker: E, text: 'dlg.mira.tell2' },
          { speaker: M, text: 'dlg.mira.tell3' },
        ],
        effect: (s) => {
          mark('mira.tell')(s);
          s.ledger.set('MIRA_MEMORIES', s.ledger.num('MIRA_MEMORIES') + 1);
          s.bus.emit('journal.updated', { reason: 'companion' });
        },
        next: 'hub',
      },
      bell: {
        id: 'bell',
        lines: [{ speaker: M, text: 'dlg.mira.bell1' }],
        effect: (s) => {
          mark('mira.bell')(s);
          s.ledger.set('mira.trust', true);
          s.bus.emit('journal.updated', { reason: 'companion' });
        },
        next: 'hub',
      },
      hub: {
        id: 'hub',
        lines: [{ speaker: M, text: 'dlg.mira.hub' }],
        choices: [
          { text: 'dlg.mira.c_tell', next: 'tell', condition: asked('mira.tell'), unavailableKey: 'dlg.unavail.asked' },
          { text: 'dlg.mira.c_bell', next: 'bell', condition: asked('mira.bell'), unavailableKey: 'dlg.unavail.asked' },
          { text: 'dlg.common.leave_conv', next: 'm2' },
        ],
      },
      m2: {
        id: 'm2',
        lines: [{ speaker: M, text: 'dlg.mira.below' }],
        next: null,
      },
    },
  },

  lamplighter: {
    id: 'lamplighter',
    start: (l) => (l.has('bell1.awake') ? (l.get('choice.bellcore') === 'take' ? 'after_take' : 'after') : 'loop'),
    nodes: {
      loop: {
        id: 'loop',
        lines: [{ speaker: L, text: 'dlg.lamp.loop' }],
        choices: [
          { text: 'dlg.lamp.c_how', next: 'how', condition: asked('lamp.how'), unavailableKey: 'dlg.unavail.asked' },
          { text: 'dlg.lamp.c_watch', next: 'watch', condition: asked('lamp.watch'), unavailableKey: 'dlg.unavail.asked' },
          { text: 'dlg.common.leave', next: null },
        ],
      },
      how: { id: 'how', lines: [{ speaker: L, text: 'dlg.lamp.how' }], effect: mark('lamp.how'), next: 'loop' },
      watch: {
        id: 'watch',
        lines: [{ speaker: L, text: 'dlg.lamp.watch' }],
        effect: (s) => {
          mark('lamp.watch')(s);
          s.ledger.set('knows.resonance');
          s.bus.emit('journal.updated', { reason: 'clue' });
        },
        next: 'loop',
      },
      after: { id: 'after', lines: [{ speaker: L, text: 'dlg.lamp.after' }], next: null },
      after_take: {
        id: 'after_take',
        lines: [
          { speaker: L, text: 'dlg.lamp.after' },
          { speaker: L, text: 'dlg.lamp.after_take' },
        ],
        next: null,
      },
    },
  },

  // Irreversible choice with clear consequences (UX §4, FR-004). A checkpoint is written before it.
  bellcore: {
    id: 'bellcore',
    start: 'core',
    nodes: {
      core: {
        id: 'core',
        lines: [
          { speaker: M, text: 'dlg.core.1' },
          { speaker: E, text: 'dlg.core.2' },
          { speaker: M, text: 'dlg.core.3' },
        ],
        choices: [
          {
            text: 'dlg.core.c_take',
            next: 'take',
            irreversible: true,
            consequenceKey: 'dlg.core.take_conseq',
            effect: (s) => {
              if (s.ledger.commit('choice.bellcore', 'take')) {
                s.player.maxHealth += 20;
                s.player.health = s.player.maxHealth;
              }
            },
          },
          {
            text: 'dlg.core.c_leave',
            next: 'leave',
            irreversible: true,
            consequenceKey: 'dlg.core.leave_conseq',
            effect: (s) => {
              s.ledger.commit('choice.bellcore', 'leave');
            },
          },
          { text: 'dlg.core.c_later', next: null },
        ],
      },
      take: { id: 'take', lines: [{ speaker: M, text: 'dlg.core.take' }], next: null },
      leave: { id: 'leave', lines: [{ speaker: M, text: 'dlg.core.leave' }], next: null },
    },
  },
};
