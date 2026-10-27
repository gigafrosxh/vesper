import type { App } from '../app/app';
import type { EventMap, EventName } from '../core/events';
import { t } from '../core/i18n';
import { ES, type Enemy } from '../sim/enemies';
import type { Sim } from '../sim/game';
import { Prop } from '../sim/props';
import { objectiveText } from './screens';
import { h } from './widgets';

// In-game HUD (UX §3): survival upper-left, time resource top-centre, objective upper-right,
// context prompts near the interaction, subtitles and dialogue at the bottom.

interface Subtitle {
  speaker: string;
  text: string;
  remaining: number;
}

const SYMBOL = { eligible: '◇', blocked: '✕', unsafe: '⚠' } as const;

export class Hud {
  readonly root = h('div', { class: 'hud', 'data-testid': 'hud' });
  private health = h('div', { class: 'hud-health', 'data-testid': 'hud-health' });
  private rewind = h('div', { class: 'hud-rewind', 'data-testid': 'hud-rewind' });
  private objective = h('div', { class: 'hud-objective', 'data-testid': 'hud-objective' });
  private boss = h('div', { class: 'hud-boss' });
  private toasts = h('div', { class: 'hud-toasts', 'aria-live': 'polite' });
  private prompt = h('div', { class: 'hud-prompt', 'data-testid': 'hud-prompt' });
  private target = h('div', { class: 'hud-target', 'data-testid': 'hud-target' });
  private lock = h('div', { class: 'hud-lock', 'aria-hidden': 'true', text: '◎' });
  private actions = h('div', { class: 'hud-actions' });
  private subtitles = h('div', { class: 'subtitles', 'data-testid': 'subtitles', 'aria-live': 'polite' });
  private dialogue = h('div', { class: 'dialogue', 'data-testid': 'dialogue' });
  private tutorial = h('div', { class: 'tutorial', 'data-testid': 'tutorial', role: 'note' });
  private hint = h('div', { class: 'hint-panel', 'data-testid': 'hint', role: 'status' });
  private banner = h('div', { class: 'area-banner' });
  private titleCard = h('div', { class: 'title-card', 'data-testid': 'title-card' });
  private death = h('div', { class: 'death', 'data-testid': 'death', role: 'alert' });
  private fade = h('div', { class: 'fade' });
  private flash = h('div', { class: 'flash' });
  private skip = h('div', { class: 'skip' });
  private failMsg = h('div', { class: 'hud-fail', role: 'status', 'data-testid': 'hud-fail' });

  private subs: Subtitle[] = [];
  private toastList: Array<{ el: HTMLElement; t: number }> = [];
  private tutorialT = 0;
  private hintT = 0;
  private bannerT = 0;
  private titleT = 0;
  private failT = 0;
  private fadeTarget = 0;
  private fadeSpeed = 1;
  private fadeV = 0;
  private flashV = 0;
  private quiet = 0;
  private lastHealth = -1;
  private lastEnergy = -1;
  private dialogueFocus = 0;
  skipHold = 0;
  sim: Sim | null = null;

  constructor(private app: App, private keys: () => Record<string, string>) {
    const top = h('div', { class: 'hud-top' }, this.health, h('div', { class: 'hud-center' }, this.rewind, this.boss), h('div', { class: 'hud-right' }, this.objective, this.hint, this.toasts));
    this.root.append(top, this.banner, this.target, this.lock, this.prompt, this.actions, this.failMsg, this.tutorial, this.subtitles, this.dialogue, this.titleCard, this.death, this.skip, this.fade, this.flash);
  }

  attach(sim: Sim | null): void {
    this.sim = sim;
    this.subs = [];
    this.dialogueFocus = 0;
    this.death.classList.remove('show');
    this.titleCard.classList.remove('show');
    this.tutorial.classList.remove('show');
    this.hint.classList.remove('show');
    this.fadeV = this.fadeTarget = 0;
    this.root.style.display = sim ? '' : 'none';
  }

  toast(text: string, kind = ''): void {
    const el = h('div', { class: `toast ${kind}`, text });
    this.toasts.append(el);
    this.toastList.push({ el, t: 4 });
    while (this.toastList.length > 4) this.toastList.shift()!.el.remove();
  }

  onEvent<K extends EventName>(type: K, payload: EventMap[K]): void {
    const sim = this.sim;
    const s = this.app.settings.get();
    switch (type) {
      case 'subtitle': {
        const e = payload as EventMap['subtitle'];
        this.subs.push({ speaker: e.speaker, text: t(e.textKey, { ...this.keys(), ...(e.params ?? {}) }), remaining: e.duration });
        if (this.subs.length > 3) this.subs.shift();
        break;
      }
      case 'evidence.found':
        this.toast(`✦ ${t('hud.new_evidence', { name: t((payload as EventMap['evidence.found']).id) })}`, 'evidence');
        break;
      case 'item.collected': {
        const id = (payload as EventMap['item.collected']).id;
        this.toast(`+ ${t('hud.item', { name: t(id === 'watch' ? 'item.watch' : id === 'tonic' ? 'item.tonic' : `item.${id}`) })}`);
        break;
      }
      case 'journal.updated':
        if ((payload as EventMap['journal.updated']).reason === 'objective') this.quiet = 0;
        else if ((payload as EventMap['journal.updated']).reason !== 'evidence') this.toast(`✎ ${t('hud.journal_updated')}`);
        break;
      case 'checkpoint.reached':
        this.toast(`⟲ ${t('hud.checkpoint')}`);
        break;
      case 'save.completed': {
        const e = payload as EventMap['save.completed'];
        if (!e.ok) this.toast(`⚠ ${t('hud.save_failed')}`, 'warn');
        break;
      }
      case 'save.recovered':
        this.toast(`⚠ ${t('hud.save_recovered')}`, 'warn');
        break;
      case 'ability.unlocked':
        this.toast(`✧ ${t('hud.ability', { name: t(`ability.${(payload as EventMap['ability.unlocked']).id}`) })}`, 'ability');
        break;
      case 'landmark.discovered':
        this.toast(`● ${t('hud.landmark', { name: t((payload as EventMap['landmark.discovered']).id) })}`);
        break;
      case 'region.entered':
        this.banner.textContent = t((payload as EventMap['region.entered']).regionId);
        this.banner.classList.add('show');
        this.bannerT = 3;
        break;
      case 'tutorial':
        this.tutorial.replaceChildren(h('div', { class: 'tut-title', text: '✧' }), h('p', { text: t((payload as EventMap['tutorial']).key, this.keys()) }));
        this.tutorial.classList.add('show');
        this.tutorialT = 14;
        break;
      case 'hint.shown': {
        const e = payload as EventMap['hint.shown'];
        const tr = sim?.quests.tracked();
        if (tr) {
          this.hint.replaceChildren(h('strong', { text: t('hud.hint_label', { tier: e.tier }) }), h('span', { text: ` ${t(tr.stage.hints[e.tier - 1], this.keys())}` }));
          this.hint.classList.add('show');
          this.hintT = 12;
        }
        break;
      }
      case 'title.card': {
        const e = payload as EventMap['title.card'];
        this.titleCard.replaceChildren(h('div', { class: 'tc-main', text: t(e.textKey) }), e.subKey ? h('div', { class: 'tc-sub', text: t(e.subKey) }) : '');
        this.titleCard.classList.add('show');
        this.titleT = 4.5;
        break;
      }
      case 'fade': {
        const e = payload as EventMap['fade'];
        this.fadeTarget = e.dir === 'out' ? 1 : 0;
        this.fadeSpeed = 1 / Math.max(0.05, e.duration);
        break;
      }
      case 'flash': {
        const e = payload as EventMap['flash'];
        // Flash reduction keeps the cue but removes the strobe (UX-05).
        this.flash.style.background = e.color;
        this.flashV = s.accessibility.flashReduction ? Math.min(0.12, e.strength * 0.15) : e.strength * 0.7;
        break;
      }
      case 'rewind.failed':
      case 'anchor.failed': {
        const e = payload as EventMap['rewind.failed'];
        this.failMsg.textContent = `✕ ${t(`fail.${e.reason}`)}`;
        this.failMsg.classList.add('show');
        this.failT = 2.2;
        break;
      }
      case 'player.damaged':
        this.quiet = 0;
        break;
      case 'player.respawned':
        this.toast(`⟲ ${t('hud.checkpoint')}`);
        break;
      case 'dialogue.started':
        this.dialogueFocus = 0;
        break;
    }
  }

  /** Dialogue input: choices keep stable positions; nothing auto-advances (UX §4). */
  dialogueInput(p: Set<string>): void {
    const sim = this.sim;
    if (!sim?.dialogue.active) return;
    const v = sim.dialogue.view();
    if (!v) return;
    if (v.kind === 'line') {
      if (p.has('uiConfirm')) sim.dialogue.advance();
      return;
    }
    const n = v.choices.length;
    if (p.has('uiUp')) this.dialogueFocus = (this.dialogueFocus - 1 + n) % n;
    if (p.has('uiDown')) this.dialogueFocus = (this.dialogueFocus + 1) % n;
    if (p.has('uiConfirm') && v.choices[this.dialogueFocus]?.available) {
      sim.dialogue.choose(this.dialogueFocus);
      this.dialogueFocus = 0;
    }
  }

  private renderDialogue(sim: Sim, s: ReturnType<App['settings']['get']>): void {
    const v = sim.dialogue.active ? sim.dialogue.view() : null;
    this.dialogue.classList.toggle('show', !!v);
    if (!v) return;
    const key = JSON.stringify([v.nodeId, v.kind === 'line' ? v.lineIndex : 'c', this.dialogueFocus, v.kind === 'choice' ? v.choices.map((c) => c.available) : 0, s.language]);
    if (this.dialogue.dataset.key === key) return;
    this.dialogue.dataset.key = key;
    const box = h('div', { class: 'dlg-box', style: `background:rgba(10,8,22,${Math.max(0.55, s.subtitles.background)})` });
    if (v.speaker && t(v.speaker)) box.append(h('div', { class: 'dlg-speaker', text: t(v.speaker) }));
    box.append(h('div', { class: 'dlg-text', text: t(v.text, this.keys()) }));
    if (v.kind === 'choice') {
      const list = h('div', { class: 'dlg-choices', role: 'listbox' });
      v.choices.forEach((c, i) => {
        const el = h(
          'div',
          { class: `dlg-choice${i === this.dialogueFocus ? ' focused' : ''}${c.available ? '' : ' unavailable'}${c.irreversible ? ' irreversible' : ''}`, role: 'option', 'data-testid': `choice-${i}`, 'aria-selected': i === this.dialogueFocus ? 'true' : 'false' },
          h('span', { class: 'marker', text: i === this.dialogueFocus ? '▸' : ' ' }),
          h('span', { class: 'n', text: `${i + 1}.` }),
          h('span', { text: t(c.text) }),
          c.irreversible ? h('span', { class: 'irrev', text: `⚠ ${t('dlg.irreversible')}` }) : null,
          !c.available && c.unavailableKey ? h('span', { class: 'why', text: `(${t(c.unavailableKey)})` }) : null,
        );
        el.addEventListener('mouseenter', () => {
          this.dialogueFocus = i;
        });
        el.addEventListener('click', () => {
          if (c.available) sim.dialogue.choose(i);
        });
        list.append(el);
        if (i === this.dialogueFocus && c.irreversible && c.consequenceKey) list.append(h('div', { class: 'consequence', text: t(c.consequenceKey) }));
      });
      box.append(list);
    } else {
      box.append(h('div', { class: 'dlg-next', text: `${this.keys().uiConfirm} ▸` }));
      box.addEventListener('click', () => sim.dialogue.advance());
    }
    this.dialogue.replaceChildren(box);
  }

  update(dt: number): void {
    const sim = this.sim;
    if (!sim) return;
    const s = this.app.settings.get();
    const keys = this.keys();
    const p = sim.player;
    this.quiet += dt;

    // Health and status (upper-left).
    const hp = Math.max(0, Math.round((p.health / p.maxHealth) * 100));
    if (hp !== this.lastHealth) this.quiet = 0;
    this.lastHealth = hp;
    this.health.innerHTML = '';
    this.health.append(h('div', { class: 'label', text: `ELIAN | ${t('hud.health')} ${hp}%` }), h('div', { class: 'bar' }, h('div', { class: `fill${hp < 30 ? ' low' : ''}`, style: `width:${hp}%` })));

    // Rewind resource (top-centre).
    const temporal = sim.temporal;
    this.rewind.innerHTML = '';
    if (temporal.enabled.rewind) {
      const e = temporal.energy;
      if (Math.abs(e - this.lastEnergy) > 0.05) this.quiet = 0;
      this.lastEnergy = e;
      const max = temporal.config.maxEnergy;
      this.rewind.append(h('div', { class: 'label', text: `⟲ ${t('hud.rewind')} ${e.toFixed(1)}s` }), h('div', { class: 'bar cyan' }, h('div', { class: 'fill', style: `width:${(e / max) * 100}%` })));
      if (temporal.enabled.anchor) {
        const a = temporal.anchor;
        this.rewind.append(h('div', { class: 'sub', text: a ? `⚓ ${t('hud.anchor')} ${a.remaining.toFixed(1)}s` : `⚓ ${t('hud.anchor')}` }));
      }
    }
    const pv = temporal.preview;
    if (pv) {
      const sec = Math.floor(pv.offset) / 60;
      this.rewind.append(h('div', { class: 'preview-text', text: t('hud.preview', { s: sec.toFixed(1), c: Math.max(temporal.config.minCost, sec).toFixed(1) }) }));
    }

    // Objective (upper-right).
    const obj = s.accessibility.objectiveTracking ? objectiveText(sim, keys) : null;
    this.objective.innerHTML = '';
    if (obj) this.objective.append(h('div', { class: 'label', text: t('hud.objective') }), h('div', { class: 'text', text: obj }));

    // Dynamic HUD fades in quiet exploration; persistent mode keeps everything visible (UX §3).
    const combat = [...sim.enemies.values()].some((en) => en.alive && en.aggro);
    const fadeOut = s.accessibility.hudMode === 'dynamic' && this.quiet > 6 && !combat && !pv && !sim.target;
    this.health.style.opacity = this.rewind.style.opacity = fadeOut ? '0.25' : '1';
    this.objective.style.opacity = fadeOut ? '0.55' : '1';

    // Boss bar.
    const boss = [...sim.enemies.values()].find((en) => en.kind === 'sentinel' && en.alive && en.aggro);
    this.boss.innerHTML = '';
    if (boss) this.boss.append(h('div', { class: 'label', text: t('enemy.sentinel') }), h('div', { class: 'bar amber' }, h('div', { class: 'fill', style: `width:${(boss.hp / boss.maxHp) * 100}%` })));

    // Interaction prompt near the object.
    const fi = sim.focusInteract;
    if (fi && !sim.dialogue.active) {
      const sp = this.app.view.project(fi.pos);
      this.prompt.style.display = sp.visible ? '' : 'none';
      this.prompt.style.transform = `translate(${sp.x}px, ${sp.y}px)`;
      this.prompt.replaceChildren(h('span', { class: 'key', text: keys.interact }), h('span', { text: ` ${t(fi.prompt)} · ${t(fi.label)}` }));
    } else this.prompt.style.display = 'none';

    // Temporal target: symbol + text, not only colour (UX §3, interaction matrix).
    const tgt = sim.target;
    if (tgt && !sim.dialogue.active) {
      const pos = tgt.target.getPosition();
      const sp = this.app.view.project({ x: pos.x, y: pos.y + 0.8, z: pos.z });
      const status = tgt.status;
      const name = tgt.target instanceof Prop ? t(tgt.target.nameKey ?? 'target.lantern') : t((tgt.target as Enemy).nameKey);
      const track = temporal.track(tgt.target.id);
      const seconds = track ? (track.length - 1) / 60 : 0;
      let detail = '';
      if (temporal.anchor?.targetId === tgt.target.id) detail = t('hud.target.anchored', { s: temporal.anchor.remaining.toFixed(1) });
      else if (status.kind === 'eligible') detail = t('hud.target.eligible', { s: Math.min(seconds, temporal.energy).toFixed(1) });
      else detail = t(`fail.${status.reason}`);
      this.target.className = `hud-target ${status.kind}`;
      this.target.style.display = sp.visible ? '' : 'none';
      this.target.style.transform = `translate(${sp.x}px, ${sp.y}px)`;
      this.target.replaceChildren(h('span', { class: 'sym', text: SYMBOL[status.kind] }), h('span', { class: 'name', text: ` ${name}` }), ...(s.accessibility.colorIndependentCues || status.kind !== 'eligible' ? [h('div', { class: 'detail', text: detail })] : []));
      const acts: HTMLElement[] = [];
      if (temporal.enabled.rewind) acts.push(h('span', {}, h('span', { class: 'key', text: keys.rewind }), ` ${t('hud.rewind')}`));
      if (temporal.enabled.anchor && tgt.target.anchorable) acts.push(h('span', {}, h('span', { class: 'key', text: keys.anchor }), ` ${t('hud.anchor')}`));
      this.actions.replaceChildren(...acts);
      this.actions.style.display = acts.length ? '' : 'none';
    } else {
      this.target.style.display = 'none';
      this.actions.style.display = 'none';
    }

    // Lock-on reticle.
    const lockEnemy = p.lockTargetId ? sim.enemies.get(p.lockTargetId) : null;
    if (lockEnemy) {
      const sp = this.app.view.project({ x: lockEnemy.pos.x, y: lockEnemy.pos.y + (lockEnemy.kind === 'sentinel' ? 2.6 : 1.3), z: lockEnemy.pos.z });
      this.lock.style.display = sp.visible ? '' : 'none';
      this.lock.style.transform = `translate(${sp.x}px, ${sp.y}px)`;
      this.lock.classList.toggle('warn', lockEnemy.state === ES.Windup || lockEnemy.state === ES.SlamWindup || lockEnemy.state === ES.ChargeWindup);
    } else this.lock.style.display = 'none';

    // Subtitles (mandatory option, background opacity, speaker labels; UX §4).
    for (const sub of this.subs) sub.remaining -= dt;
    this.subs = this.subs.filter((x) => x.remaining > 0);
    this.subtitles.style.display = s.subtitles.enabled && !sim.dialogue.active ? '' : 'none';
    const subKey = JSON.stringify([this.subs.map((x) => x.text), s.subtitles]);
    if (this.subtitles.dataset.key !== subKey) {
      this.subtitles.dataset.key = subKey;
      this.subtitles.replaceChildren(
        ...this.subs.map((x) =>
          h('div', { class: 'subtitle-line', style: `font-size:${s.subtitles.size}em;background:rgba(10,8,22,${s.subtitles.background})` }, s.subtitles.speakerNames && x.speaker && t(x.speaker) ? h('span', { class: 'speaker', text: `${t(x.speaker)}: ` }) : null, x.text),
        ),
      );
    }
    this.renderDialogue(sim, s);

    // Timed panels.
    for (const ts of this.toastList) {
      ts.t -= dt;
      if (ts.t < 0.5) ts.el.style.opacity = String(Math.max(0, ts.t * 2));
    }
    this.toastList = this.toastList.filter((ts) => (ts.t > 0 ? true : (ts.el.remove(), false)));
    if ((this.tutorialT -= dt) <= 0) this.tutorial.classList.remove('show');
    if ((this.hintT -= dt) <= 0) this.hint.classList.remove('show');
    if ((this.bannerT -= dt) <= 0) this.banner.classList.remove('show');
    if ((this.titleT -= dt) <= 0) this.titleCard.classList.remove('show');
    if ((this.failT -= dt) <= 0) this.failMsg.classList.remove('show');

    // Death screen: readable failure, then checkpoint restore (UX §7).
    if (!p.alive) {
      if (!this.death.classList.contains('show')) {
        const cause = p.deathCause === 'fall' ? t('hud.dead_cause_fall') : t('hud.dead_cause_combat');
        this.death.replaceChildren(h('h2', { text: t('hud.dead_title') }), h('p', { text: cause }), h('p', { class: 'muted', text: t('hud.dead_body') }));
        this.death.classList.add('show');
      }
    } else this.death.classList.remove('show');

    // Fades: scripted fades and the intro's black screen.
    this.fadeV += Math.sign(this.fadeTarget - this.fadeV) * Math.min(Math.abs(this.fadeTarget - this.fadeV), dt * this.fadeSpeed);
    const fade = Math.max(this.fadeV, sim.visual.introFade ?? 0);
    this.fade.style.opacity = String(fade);
    this.flashV = Math.max(0, this.flashV - dt * (s.accessibility.flashReduction ? 0.6 : 2.5));
    this.flash.style.opacity = String(this.flashV);

    // Skip prompt for skippable cinematics.
    const canSkip = sim.seq.canSkip;
    this.skip.style.display = canSkip ? '' : 'none';
    if (canSkip) this.skip.replaceChildren(h('span', { text: t('hud.skip', { key: keys.uiConfirm }) }), h('span', { class: 'bar' }, h('span', { class: 'fill', style: `width:${Math.min(1, this.skipHold) * 100}%` })));
  }
}
