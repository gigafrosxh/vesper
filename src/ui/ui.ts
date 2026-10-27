import type { App, UiLayer } from '../app/app';
import type { EventMap, EventName } from '../core/events';
import { t } from '../core/i18n';
import { bindingLabel, GAMEPLAY_ACTIONS, UI_ACTIONS, UI_BINDINGS, type UiAction } from '../input/actions';
import type { InputFrame } from '../input/inputRouter';
import type { Settings } from '../settings/settings';
import type { Sim } from '../sim/game';
import { Hud } from './hud';
import { CreditsScreen, DialScreen, DocumentScreen, JournalScreen, MainMenuScreen, PauseScreen, SettingsScreen, SplashScreen, type UiContext } from './screens';
import { h, NavRepeater, type Screen, type ScreenHost } from './widgets';

// UI root: a screen stack for menus/modals plus the HUD. Owns the "is the game paused" decision.

export class Ui implements UiLayer, ScreenHost {
  private stack: Screen[] = [];
  private layer = h('div', { class: 'screens' });
  private toastEl = h('div', { class: 'ui-toast', role: 'status', 'aria-live': 'assertive' });
  private toastT = 0;
  private repeater = new NavRepeater();
  readonly hud: Hud;
  private ctx: UiContext;
  private endCreditsPending = false;

  constructor(
    private app: App,
    private root: HTMLElement,
  ) {
    this.ctx = {
      app,
      keys: () => this.keys(),
      openSettings: (tab = 0) => this.push(new SettingsScreen(this.ctx, tab)),
      toast: (text) => this.toast(text),
    };
    this.hud = new Hud(app, () => this.keys());
    this.root.append(this.hud.root, this.layer, this.toastEl);
    this.hud.attach(null);
    this.applySettings(app.settings.get());
    app.settings.subscribe((s) => {
      this.applySettings(s);
      this.stack.at(-1)?.render();
    });
    app.input.onDeviceChange(() => this.stack.at(-1)?.render());
  }

  get modal(): boolean {
    return this.stack.some((s) => s.modal);
  }

  start(): void {
    this.push(new SplashScreen(this.ctx));
  }

  private applySettings(s: Settings): void {
    const st = document.documentElement.style;
    st.setProperty('--text-scale', String(s.accessibility.textScale));
    st.setProperty('--ui-scale', String(s.accessibility.uiScale));
    document.body.classList.toggle('high-contrast', s.accessibility.highContrast);
    document.body.classList.toggle('reduce-motion', s.accessibility.flashReduction || !s.camera.shake);
  }

  /** Labels of the current device's bindings, used to fill {action} placeholders in text. */
  keys(): Record<string, string> {
    const s = this.app.settings.get();
    const pad = this.app.input.lastDevice === 'gamepad';
    const out: Record<string, string> = {};
    for (const a of GAMEPLAY_ACTIONS) {
      const b = s.input.bindings[a];
      const list = pad ? b.gamepad : b.keyboard;
      out[a] = list.length ? `[${bindingLabel(list[0])}]` : `[${t('ctl.none')}]`;
    }
    for (const a of UI_ACTIONS) out[a] = this.keyLabel(a);
    out.move = pad ? '[L-Stick]' : `[${['moveForward', 'moveLeft', 'moveBack', 'moveRight'].map((a) => bindingLabel(s.input.bindings[a as 'jump'].keyboard[0] ?? '')).join('')}]`;
    out.key = out.interact;
    return out;
  }

  keyLabel(action: string): string {
    const pad = this.app.input.lastDevice === 'gamepad';
    if ((UI_ACTIONS as readonly string[]).includes(action)) {
      const list = UI_BINDINGS[action as UiAction].filter((b) => (pad ? b.startsWith('Pad') : !b.startsWith('Pad')));
      return `[${bindingLabel(list[0] ?? '')}]`;
    }
    const b = this.app.settings.get().input.bindings[action as 'jump'];
    if (!b) return action;
    const list = pad ? b.gamepad : b.keyboard;
    return `[${list.length ? bindingLabel(list[0]) : t('ctl.none')}]`;
  }

  // ---------------------------------------------------------------- screen stack

  push(s: Screen): void {
    s.host = this;
    this.stack.at(-1)?.root.classList.add('hidden');
    this.stack.push(s);
    this.layer.append(s.root);
    s.render();
    s.onShow();
    this.app.input.releaseAll();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  pop(): void {
    const s = this.stack.pop();
    s?.root.remove();
    const top = this.stack.at(-1);
    if (top) {
      top.root.classList.remove('hidden');
      top.render();
      top.onShow();
    }
    this.app.input.releaseAll();
  }

  replace(s: Screen): void {
    const old = this.stack.pop();
    old?.root.remove();
    this.push(s);
  }

  private clear(): void {
    for (const s of this.stack) s.root.remove();
    this.stack = [];
  }

  sound(id: string): void {
    this.app.audio?.onEvent('sound', { id });
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastT = 4;
  }

  // ---------------------------------------------------------------- UiLayer

  frame(input: InputFrame, dt: number): void {
    const pulses = this.repeater.pulses(input, dt, UI_ACTIONS);
    const top = this.stack.at(-1);
    const sim = this.app.sim;
    if (top) {
      top.update(dt);
      if (!this.app.input.capturing) top.handle(pulses);
    } else if (sim && this.app.state === 'game') {
      if (input.pressed.has('pause')) this.push(new PauseScreen(this.ctx));
      else if (input.pressed.has('journal') && !sim.dialogue.active) this.push(new JournalScreen(this.ctx, 0));
      else if (input.pressed.has('map') && !sim.dialogue.active) this.push(new JournalScreen(this.ctx, 4));
      else if (sim.dialogue.active) this.hud.dialogueInput(pulses);
      // Hold confirm (or interact) to skip a skippable cinematic.
      if (sim.seq.canSkip && (input.held.has('uiConfirm') || input.held.has('interact'))) {
        this.hud.skipHold += dt;
        if (this.hud.skipHold >= 1) {
          sim.seq.skip();
          this.hud.skipHold = 0;
        }
      } else this.hud.skipHold = 0;
    }
    this.app.input.gameplayFocus = this.app.state === 'game' && !this.modal;
    this.hud.update(dt);
    if ((this.toastT -= dt) <= 0) this.toastEl.classList.remove('show');
    if (this.endCreditsPending && sim && !sim.seq.cinematicActive) {
      this.endCreditsPending = false;
      this.app.quitToMenu();
      this.push(new CreditsScreen(this.ctx));
    }
  }

  onEvent<K extends EventName>(type: K, payload: EventMap[K]): void {
    this.hud.onEvent(type, payload);
    switch (type) {
      case 'document': {
        const e = payload as EventMap['document'];
        this.push(new DocumentScreen(this.ctx, e.titleKey, e.bodyKey));
        break;
      }
      case 'ui.dial':
        this.push(new DialScreen(this.ctx));
        break;
      case 'game.completed':
        this.endCreditsPending = true;
        break;
    }
  }

  onSimChanged(sim: Sim | null): void {
    this.hud.attach(sim);
    if (sim) this.clear();
    else if (!this.stack.length) this.push(new MainMenuScreen(this.ctx));
  }
}
