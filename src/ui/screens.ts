import type { App } from '../app/app';
import { CLOCKFALL_EVIDENCE, CRITICAL_EVIDENCE, MAPS } from '../content/quests';
import { AREAS, LANDMARKS, POS } from '../content/level';
import { t } from '../core/i18n';
import { assignBinding, bindingLabel, deviceOf, GAMEPLAY_ACTIONS, unboundRequired, type GameplayAction } from '../input/actions';
import { PRESETS, type Settings } from '../settings/settings';
import { resolveText } from '../sim/quests';
import type { Sim } from '../sim/game';
import { h, Screen } from './widgets';

// Menu screens (UX §2, §5, §6). Every screen is fully usable with controller, keyboard or mouse.

export interface UiContext {
  app: App;
  /** Interpolates {action} placeholders with the current device's bindings. */
  keys(): Record<string, string>;
  openSettings(tab?: number): void;
  toast(text: string): void;
}

const pct = (v: number) => t('opt.percent', { n: Math.round(v * 100) });
const fmtTime = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

abstract class AppScreen extends Screen {
  constructor(
    protected ctx: UiContext,
    cls: string,
    testId: string,
  ) {
    super(cls, testId);
  }

  protected get settings(): Settings {
    return this.ctx.app.settings.get();
  }

  protected set(fn: (s: Settings) => void): void {
    this.ctx.app.settings.update(fn);
    this.render();
  }
}

// ------------------------------------------------------------------------------------------------ splash

export class SplashScreen extends AppScreen {
  closable = false;
  constructor(ctx: UiContext) {
    super(ctx, 'splash', 'screen-splash');
  }

  build(): void {
    this.root.append(
      h('div', { class: 'title-block' }, h('div', { class: 'game-title', text: t('game.title') }), h('div', { class: 'game-sub', text: t('game.subtitle') }), h('div', { class: 'game-slice', text: t('game.slice') })),
      h('div', { class: 'panel warning' }, h('h2', { text: t('splash.warning_title') }), h('p', { text: t('splash.warning_body') })),
    );
    const list = h('div', { class: 'list center' });
    this.root.append(list);
    list.append(
      this.button('ack', t('splash.continue'), () => {
        const s = this.settings;
        this.ctx.app.settings.update((d) => (d.flags.photosensitivityAcknowledged = true));
        this.host.replace(s.flags.firstLaunchDone ? new MainMenuScreen(this.ctx) : new QuickSetupScreen(this.ctx));
      }).el,
    );
  }
}

// ------------------------------------------------------------------------------------------------ quick setup

/** First-launch accessibility setup: subtitles and camera options before any mandatory dialogue (UX §2). */
export class QuickSetupScreen extends AppScreen {
  closable = false;
  private preset = 'none';
  constructor(ctx: UiContext) {
    super(ctx, 'quick', 'screen-quick');
  }

  build(): void {
    const s = this.settings;
    this.root.append(h('h1', { text: t('quick.title') }), h('p', { class: 'lead', text: t('quick.body') }));
    const list = h('div', { class: 'list' });
    this.root.append(list);
    const presets = ['none', 'lowVision', 'motionComfort', 'reducedDexterity'];
    list.append(
      this.cycle('preset', t('set.presets'), presets.map((p) => ({ value: p, label: t(`quick.preset_${p}`) })), this.preset, (v) => {
        this.preset = v;
        this.set((d) => {
          if (v !== 'none') PRESETS[v](d);
        });
      }).el,
      this.cycle('language', t('set.language'), [
        { value: 'en', label: t('lang.en') },
        { value: 'de', label: t('lang.de') },
      ], s.language, (v) => this.set((d) => (d.language = v as Settings['language']))).el,
      this.toggle('subs', t('set.subtitles'), s.subtitles.enabled, (v) => this.set((d) => (d.subtitles.enabled = v))).el,
      this.slider('subsize', t('set.subtitle_size'), s.subtitles.size, 0.75, 2, 0.25, pct, (v) => this.set((d) => (d.subtitles.size = v))).el,
      this.toggle('speakers', t('set.speaker_names'), s.subtitles.speakerNames, (v) => this.set((d) => (d.subtitles.speakerNames = v))).el,
      this.slider('text', t('set.text_scale'), s.accessibility.textScale, 1, 2, 0.25, pct, (v) => this.set((d) => (d.accessibility.textScale = v))).el,
      this.toggle('shake', t('set.shake'), s.camera.shake, (v) => this.set((d) => (d.camera.shake = v))).el,
      this.toggle('flash', t('set.flash'), s.accessibility.flashReduction, (v) => this.set((d) => (d.accessibility.flashReduction = v))).el,
      this.cycle('hold', t('set.hold_mode'), [
        { value: 'hold', label: t('opt.hold') },
        { value: 'toggle', label: t('opt.toggle') },
      ], s.accessibility.holdMode, (v) => this.set((d) => (d.accessibility.holdMode = v as 'hold' | 'toggle'))).el,
      this.button('start', t('quick.start'), () => {
        this.ctx.app.settings.update((d) => (d.flags.firstLaunchDone = true));
        this.host.replace(new MainMenuScreen(this.ctx));
      }).el,
    );
    this.root.append(subtitlePreview(s));
  }
}

function subtitlePreview(s: Settings): HTMLElement {
  return h(
    'div',
    { class: 'preview' },
    h('div', { class: 'preview-label', text: t('set.preview') }),
    h('div', { class: 'subtitle-line', style: `font-size:${s.subtitles.size}em;background:rgba(10,8,22,${s.subtitles.background})` }, s.subtitles.speakerNames ? h('span', { class: 'speaker', text: `${t('speaker.mira')}: ` }) : null, t('set.preview_text')),
  );
}

// ------------------------------------------------------------------------------------------------ main menu

export class MainMenuScreen extends AppScreen {
  closable = false;
  constructor(ctx: UiContext) {
    super(ctx, 'main-menu', 'screen-main');
  }

  build(): void {
    const app = this.ctx.app;
    const latest = app.saves.latest();
    this.root.append(h('div', { class: 'title-block left' }, h('div', { class: 'game-title', text: t('game.title') }), h('div', { class: 'game-sub', text: t('game.subtitle') })));
    const list = h('div', { class: 'list right' });
    this.root.append(list);
    // Continue only appears with a valid save (UX §2).
    if (latest) list.append(this.button('continue', t('menu.continue'), () => this.ctx.app.continueGame() || this.ctx.toast(t('slot.load_failed')), { sub: latest.meta ? `${t(latest.meta.region)} · ${new Date(latest.meta.timestamp).toLocaleString()}` : undefined }).el);
    list.append(
      this.button('new', t('menu.new'), () => this.host.push(new SlotScreen(this.ctx, 'new'))).el,
      this.button('load', t('menu.load'), () => this.host.push(new SlotScreen(this.ctx, 'load'))).el,
      this.button('settings', t('menu.settings'), () => this.ctx.openSettings(0)).el,
      this.button('accessibility', t('menu.accessibility'), () => this.ctx.openSettings(5)).el,
      this.button('credits', t('menu.credits'), () => this.host.push(new CreditsScreen(this.ctx))).el,
      this.button('quit', t('menu.quit'), () => {
        const native = (window as unknown as { vesperNative?: { quit?: () => void } }).vesperNative;
        if (native?.quit) native.quit();
        else this.ctx.toast(t('menu.quit_hint'));
      }).el,
    );
  }

  onShow(): void {
    this.render();
  }
}

// ------------------------------------------------------------------------------------------------ save slots

export class SlotScreen extends AppScreen {
  constructor(
    ctx: UiContext,
    private mode: 'new' | 'load',
  ) {
    super(ctx, 'slots', `screen-slots-${mode}`);
  }

  build(): void {
    const app = this.ctx.app;
    this.root.append(h('h1', { text: this.mode === 'new' ? t('menu.new') : t('menu.load') }), h('p', { class: 'lead', text: t('menu.choose_slot') }));
    const list = h('div', { class: 'list wide' });
    this.root.append(list);
    for (const info of app.slots()) {
      const n = info.slot;
      const label = t('slot.label', { n });
      let sub = t('slot.empty');
      if (info.meta) sub = `${t(info.meta.region)} · ${new Date(info.meta.timestamp).toLocaleString()} · ${t('slot.playtime', { time: fmtTime(info.meta.playTime) })}`;
      if (info.status === 'corrupt') sub = t('slot.corrupt');
      if (info.status === 'recovered') sub = `${sub} — ${t('slot.recovered')}`;
      const occupied = info.status !== 'empty';
      list.append(
        this.button(`slot${n}`, label, () => {
          if (this.mode === 'load') {
            const res = app.loadSlot(n);
            if (!res.envelope) this.ctx.toast(t('slot.load_failed'));
            return;
          }
          if (occupied) {
            this.host.push(
              new ConfirmScreen(this.ctx, t('menu.new_overwrite_title'), t('menu.new_overwrite_body', { slot: n, region: info.meta ? t(info.meta.region) : '—', time: info.meta ? new Date(info.meta.timestamp).toLocaleString() : '—' }), () => {
                app.saves.delete(n);
                app.newGame(n);
              }),
            );
          } else app.newGame(n);
        }, { disabled: this.mode === 'load' && (info.status === 'empty' || info.status === 'corrupt'), sub }).el,
      );
      if (occupied) {
        list.append(
          this.button(`delete${n}`, `${t('slot.delete')} · ${label}`, () =>
            this.host.push(new ConfirmScreen(this.ctx, t('slot.delete'), t('slot.delete_confirm', { n }), () => {
              app.saves.delete(n);
              this.render();
            })),
          { danger: true }).el,
        );
      }
    }
    list.append(this.button('back', t('menu.back'), () => this.back()).el);
  }

  onShow(): void {
    this.render();
  }
}

export class ConfirmScreen extends AppScreen {
  constructor(
    ctx: UiContext,
    private title: string,
    private body: string,
    private onYes: () => void,
  ) {
    super(ctx, 'confirm', 'screen-confirm');
  }

  build(): void {
    this.root.append(h('div', { class: 'panel warning' }, h('h2', { text: `⚠ ${this.title}` }), h('p', { text: this.body })));
    const list = h('div', { class: 'list center row-buttons' });
    this.root.append(list);
    // Safe default: focus starts on "No".
    list.append(
      this.button('no', t('menu.no'), () => this.host.pop()).el,
      this.button('yes', t('menu.yes'), () => {
        this.host.pop();
        this.onYes();
      }, { danger: true }).el,
    );
  }
}

export class CreditsScreen extends AppScreen {
  constructor(ctx: UiContext) {
    super(ctx, 'credits', 'screen-credits');
  }

  build(): void {
    this.root.append(
      h('h1', { text: t('credits.title') }),
      h('div', { class: 'panel scroll' }, h('p', { class: 'lead', text: t('credits.thanks') }), ...t('credits.body').split('\n').map((l) => h('p', { text: l })), h('p', { class: 'muted', text: t('credits.slice_end') })),
    );
    const list = h('div', { class: 'list center' });
    this.root.append(list);
    list.append(this.button('back', t('menu.back'), () => this.back()).el);
  }
}

// ------------------------------------------------------------------------------------------------ settings

const TABS = ['set.tab.audio', 'set.tab.display', 'set.tab.camera', 'set.tab.controls', 'set.tab.gameplay', 'set.tab.access'];

export class SettingsScreen extends AppScreen {
  private message = '';
  private capturing: { action: GameplayAction; slot: number; device: 'keyboard' | 'gamepad' } | null = null;

  constructor(
    ctx: UiContext,
    private tabIndex = 0,
  ) {
    super(ctx, 'settings', 'screen-settings');
  }

  tab(dir: -1 | 1): void {
    if (this.capturing) return;
    this.tabIndex = (this.tabIndex + dir + TABS.length) % TABS.length;
    this.message = '';
    this.focus = 0;
    this.items = [];
    this.render();
    this.host.sound('ui_move');
  }

  update(): void {
    // Escape cancels a pending capture inside the input router.
    if (this.capturing && !this.ctx.app.input.capturing) {
      this.capturing = null;
      this.render();
    }
  }

  back(): void {
    if (this.capturing) return;
    super.back();
  }

  build(): void {
    const s = this.settings;
    const tabs = h('div', { class: 'tabs', role: 'tablist' }, h('span', { class: 'tab-key', text: this.host.keyLabel('uiTabPrev') }));
    TABS.forEach((k, i) => {
      const b = h('button', { class: `tab${i === this.tabIndex ? ' active' : ''}`, role: 'tab', 'aria-selected': i === this.tabIndex ? 'true' : 'false', 'data-testid': `tab-${k}`, text: t(k) });
      b.addEventListener('click', () => this.tab((i - this.tabIndex) as -1 | 1));
      tabs.append(b);
    });
    tabs.append(h('span', { class: 'tab-key', text: this.host.keyLabel('uiTabNext') }));
    this.root.append(h('h1', { text: t('menu.settings') }), tabs);
    const list = h('div', { class: 'list wide scroll' });
    this.root.append(list);
    const add = (...els: HTMLElement[]) => list.append(...els);
    const sl = (id: string, label: string, v: number, min: number, max: number, step: number, fmt: (x: number) => string, fn: (d: Settings, v: number) => void) =>
      this.slider(id, label, v, min, max, step, fmt, (x) => this.set((d) => fn(d, x))).el;
    const tg = (id: string, label: string, v: boolean, fn: (d: Settings, v: boolean) => void) => this.toggle(id, label, v, (x) => this.set((d) => fn(d, x))).el;
    const cy = <T,>(id: string, label: string, opts: Array<{ value: T; label: string }>, v: T, fn: (d: Settings, v: T) => void) => this.cycle(id, label, opts, v, (x) => this.set((d) => fn(d, x))).el;
    const accessItems = () => {
      add(
        sl('text', t('set.text_scale'), s.accessibility.textScale, 1, 2, 0.25, pct, (d, v) => (d.accessibility.textScale = v)),
        sl('uiscale', t('set.ui_scale'), s.accessibility.uiScale, 0.8, 1.5, 0.1, pct, (d, v) => (d.accessibility.uiScale = v)),
        tg('contrast', t('set.high_contrast'), s.accessibility.highContrast, (d, v) => (d.accessibility.highContrast = v)),
        tg('colorcues', t('set.color_cues'), s.accessibility.colorIndependentCues, (d, v) => (d.accessibility.colorIndependentCues = v)),
        tg('subs', t('set.subtitles'), s.subtitles.enabled, (d, v) => (d.subtitles.enabled = v)),
        sl('subsize', t('set.subtitle_size'), s.subtitles.size, 0.75, 2, 0.25, pct, (d, v) => (d.subtitles.size = v)),
        sl('subbg', t('set.subtitle_bg'), s.subtitles.background, 0, 1, 0.1, pct, (d, v) => (d.subtitles.background = v)),
        tg('speakers', t('set.speaker_names'), s.subtitles.speakerNames, (d, v) => (d.subtitles.speakerNames = v)),
      );
    };
    switch (this.tabIndex) {
      case 0:
        add(
          sl('master', t('set.master'), s.audio.master, 0, 1, 0.1, pct, (d, v) => (d.audio.master = v)),
          sl('music', t('set.music'), s.audio.music, 0, 1, 0.1, pct, (d, v) => (d.audio.music = v)),
          sl('sfx', t('set.sfx'), s.audio.sfx, 0, 1, 0.1, pct, (d, v) => (d.audio.sfx = v)),
          sl('ambience', t('set.ambience'), s.audio.ambience, 0, 1, 0.1, pct, (d, v) => (d.audio.ambience = v)),
          sl('voice', t('set.voice'), s.audio.voice, 0, 1, 0.1, pct, (d, v) => (d.audio.voice = v)),
          tg('mono', t('set.mono'), s.audio.mono, (d, v) => (d.audio.mono = v)),
        );
        break;
      case 1:
        add(
          cy('language', t('set.language'), [
            { value: 'en', label: t('lang.en') },
            { value: 'de', label: t('lang.de') },
          ], s.language, (d, v) => (d.language = v as Settings['language'])),
        );
        accessItems();
        add(
          tg('pseudo', t('set.pseudo'), s.pseudoLocalization, (d, v) => (d.pseudoLocalization = v)),
          cy('quality', t('set.quality'), [
            { value: 'low', label: t('opt.low') },
            { value: 'medium', label: t('opt.medium') },
            { value: 'high', label: t('opt.high') },
          ], s.graphics.quality, (d, v) => (d.graphics.quality = v as Settings['graphics']['quality'])),
          cy('fps', t('set.fps'), [
            { value: 30, label: t('opt.fps', { n: 30 }) },
            { value: 60, label: t('opt.fps', { n: 60 }) },
          ], s.graphics.fpsCap, (d, v) => (d.graphics.fpsCap = v as 30 | 60)),
          sl('brightness', t('set.brightness'), s.graphics.brightness, 0.6, 1.6, 0.1, pct, (d, v) => (d.graphics.brightness = v)),
        );
        list.append(subtitlePreview(s));
        break;
      case 2:
        add(
          sl('mouse', t('set.mouse_sens'), s.camera.mouseSensitivity, 0.1, 3, 0.1, pct, (d, v) => (d.camera.mouseSensitivity = v)),
          sl('stick', t('set.stick_sens'), s.camera.stickSensitivity, 0.1, 3, 0.1, pct, (d, v) => (d.camera.stickSensitivity = v)),
          tg('invert', t('set.invert_y'), s.camera.invertY, (d, v) => (d.camera.invertY = v)),
          tg('shake', t('set.shake'), s.camera.shake, (d, v) => (d.camera.shake = v)),
          tg('blur', t('set.motion_blur'), s.camera.motionBlur, (d, v) => (d.camera.motionBlur = v)),
          sl('fov', t('set.fov'), s.camera.fov, 50, 90, 5, (v) => `${v}°`, (d, v) => (d.camera.fov = v)),
        );
        break;
      case 3:
        this.buildControls(list, s);
        break;
      case 4:
        add(
          cy('hold', t('set.hold_mode'), [
            { value: 'hold', label: t('opt.hold') },
            { value: 'toggle', label: t('opt.toggle') },
          ], s.accessibility.holdMode, (d, v) => (d.accessibility.holdMode = v as 'hold' | 'toggle')),
          cy('hints', t('set.hints'), [
            { value: 'off', label: t('opt.off') },
            { value: 'manual', label: t('opt.manual') },
            { value: 'escalating', label: t('opt.escalating') },
          ], s.accessibility.hintMode, (d, v) => (d.accessibility.hintMode = v as Settings['accessibility']['hintMode'])),
          cy('aim', t('set.aim_assist'), [
            { value: 'off', label: t('opt.off') },
            { value: 'low', label: t('opt.low') },
            { value: 'high', label: t('opt.high') },
          ], s.accessibility.aimAssist, (d, v) => (d.accessibility.aimAssist = v as Settings['accessibility']['aimAssist'])),
          cy('hud', t('set.hud_mode'), [
            { value: 'dynamic', label: t('opt.dynamic') },
            { value: 'persistent', label: t('opt.persistent') },
          ], s.accessibility.hudMode, (d, v) => (d.accessibility.hudMode = v as 'dynamic' | 'persistent')),
          tg('tracking', t('set.tracking'), s.accessibility.objectiveTracking, (d, v) => (d.accessibility.objectiveTracking = v)),
          sl('window', t('set.rewind_window'), s.gameplay.rewindWindow, 3, 10, 1, (v) => t('opt.seconds', { n: v }), (d, v) => (d.gameplay.rewindWindow = v)),
        );
        break;
      case 5:
        list.append(h('div', { class: 'heading', text: t('set.presets') }));
        for (const p of ['lowVision', 'motionComfort', 'reducedDexterity'])
          add(this.button(`preset-${p}`, t(`quick.preset_${p}`), () => this.set((d) => PRESETS[p](d))).el);
        accessItems();
        add(
          cy('hold', t('set.hold_mode'), [
            { value: 'hold', label: t('opt.hold') },
            { value: 'toggle', label: t('opt.toggle') },
          ], s.accessibility.holdMode, (d, v) => (d.accessibility.holdMode = v as 'hold' | 'toggle')),
          tg('shake', t('set.shake'), s.camera.shake, (d, v) => (d.camera.shake = v)),
          tg('blur', t('set.motion_blur'), s.camera.motionBlur, (d, v) => (d.camera.motionBlur = v)),
          tg('flash', t('set.flash'), s.accessibility.flashReduction, (d, v) => (d.accessibility.flashReduction = v)),
          cy('aim', t('set.aim_assist'), [
            { value: 'off', label: t('opt.off') },
            { value: 'low', label: t('opt.low') },
            { value: 'high', label: t('opt.high') },
          ], s.accessibility.aimAssist, (d, v) => (d.accessibility.aimAssist = v as Settings['accessibility']['aimAssist'])),
          cy('hints', t('set.hints'), [
            { value: 'off', label: t('opt.off') },
            { value: 'manual', label: t('opt.manual') },
            { value: 'escalating', label: t('opt.escalating') },
          ], s.accessibility.hintMode, (d, v) => (d.accessibility.hintMode = v as Settings['accessibility']['hintMode'])),
          sl('master', t('set.master'), s.audio.master, 0, 1, 0.1, pct, (d, v) => (d.audio.master = v)),
          sl('voice', t('set.voice'), s.audio.voice, 0, 1, 0.1, pct, (d, v) => (d.audio.voice = v)),
          this.button('remap', t('menu.controls'), () => this.tab((3 - this.tabIndex) as -1 | 1)).el,
        );
        list.append(subtitlePreview(s));
        break;
    }
    list.append(this.button('reset', t('menu.reset'), () => this.host.push(new ConfirmScreen(this.ctx, t('menu.reset'), t('menu.reset'), () => this.ctx.app.settings.resetToDefaults()))).el);
    list.append(this.button('back', t('menu.back'), () => this.back()).el);
    if (this.message) this.root.append(h('div', { class: 'message', role: 'status', text: this.message }));
  }

  private buildControls(list: HTMLElement, s: Settings): void {
    list.append(h('div', { class: 'bind-head' }, h('span', { text: '' }), h('span', { text: t('ctl.keyboard') }), h('span', { text: '' }), h('span', { text: t('ctl.gamepad') })));
    for (const action of GAMEPLAY_ACTIONS) {
      const b = s.input.bindings[action];
      const cells: Array<{ device: 'keyboard' | 'gamepad'; slot: number; value?: string }> = [
        { device: 'keyboard', slot: 0, value: b.keyboard[0] },
        { device: 'keyboard', slot: 1, value: b.keyboard[1] },
        { device: 'gamepad', slot: 0, value: b.gamepad[0] },
      ];
      for (const c of cells) {
        const pending = this.capturing && this.capturing.action === action && this.capturing.slot === c.slot && this.capturing.device === c.device;
        const label = `${t(`act.${action}`)} · ${c.device === 'keyboard' ? `${t('ctl.keyboard')} ${c.slot + 1}` : t('ctl.gamepad')}`;
        list.append(
          this.button(`bind-${action}-${c.device}-${c.slot}`, label, () => this.startCapture(action, c.device, c.slot), {
            sub: pending ? t('ctl.press') : c.value ? bindingLabel(c.value) : t('ctl.none'),
          }).el,
        );
      }
    }
    const unbound = unboundRequired(s.input.bindings);
    if (unbound.length) list.append(h('div', { class: 'message warn', role: 'alert', text: `⚠ ${t('ctl.unbound', { actions: unbound.map((a) => t(`act.${a}`)).join(', ') })}` }));
  }

  private startCapture(action: GameplayAction, device: 'keyboard' | 'gamepad', slot: number): void {
    this.capturing = { action, device, slot };
    this.render();
    // Wait a moment so the confirming key/button press is not captured itself.
    setTimeout(() => {
      this.ctx.app.input.captureNext((binding) => {
        this.capturing = null;
        if (deviceOf(binding) !== device) {
          this.render();
          return;
        }
        const res = assignBinding(this.settings.input.bindings, action, slot, binding);
        this.ctx.app.settings.update((d) => (d.input.bindings = res.bindings));
        this.message = res.displaced.length ? `⚠ ${t('ctl.conflict', { key: bindingLabel(binding), action: res.displaced.map((a) => t(`act.${a}`)).join(', ') })}` : '';
        this.ctx.app.input.releaseAll();
        this.render();
      });
    }, 180);
  }
}

// ------------------------------------------------------------------------------------------------ pause

export class PauseScreen extends AppScreen {
  constructor(ctx: UiContext) {
    super(ctx, 'pause', 'screen-pause');
  }

  build(): void {
    const app = this.ctx.app;
    const sim = app.sim;
    this.root.append(h('h1', { text: t('menu.paused') }));
    const list = h('div', { class: 'list center' });
    this.root.append(list);
    list.append(
      this.button('resume', t('menu.resume'), () => this.host.pop()).el,
      this.button('journal', t('menu.journal'), () => this.host.push(new JournalScreen(this.ctx, 0))).el,
      this.button('settings', t('menu.settings'), () => this.ctx.openSettings(0)).el,
      this.button('accessibility', t('menu.accessibility'), () => this.ctx.openSettings(5)).el,
      this.button('restart', t('menu.restart_checkpoint'), () => {
        this.host.pop();
        app.respawn();
      }).el,
      this.button('mainmenu', t('menu.main_menu'), () =>
        this.host.push(new ConfirmScreen(this.ctx, t('menu.quit_confirm_title'), t('menu.quit_confirm_body', { checkpoint: sim ? sim.checkpoint.id : '—' }), () => app.quitToMenu())),
      ).el,
    );
  }
}

// ------------------------------------------------------------------------------------------------ journal & map

const JTABS = ['journal.tab_quests', 'journal.tab_evidence', 'journal.tab_companions', 'journal.tab_anomalies', 'journal.tab_map'];
const DOCS: Record<string, string> = { 'ev.warning': 'doc.warning', 'ev.calendar': 'doc.calendar', 'ev.diary': 'doc.diary', 'ev.notebook': 'doc.notebook', 'map.merchant': 'doc.map.merchant', 'map.child': 'doc.map.child', 'map.lover': 'doc.map.lover' };

export function objectiveText(sim: Sim, keys: Record<string, string>): string | null {
  const tr = sim.quests.tracked();
  if (!tr) return null;
  const key = resolveText(tr.stage.objective, sim.ledger)!;
  return t(key, { ...keys, ...(tr.stage.params?.(sim.ledger) ?? {}) } as Record<string, string>);
}

export class JournalScreen extends AppScreen {
  constructor(
    ctx: UiContext,
    private tabIndex = 0,
  ) {
    super(ctx, 'journal', 'screen-journal');
  }

  tab(dir: -1 | 1): void {
    this.tabIndex = (this.tabIndex + dir + JTABS.length) % JTABS.length;
    this.items = [];
    this.focus = 0;
    this.render();
    this.host.sound('ui_page');
  }

  build(): void {
    const sim = this.ctx.app.sim;
    const tabs = h('div', { class: 'tabs', role: 'tablist' }, h('span', { class: 'tab-key', text: this.host.keyLabel('uiTabPrev') }));
    JTABS.forEach((k, i) => {
      const b = h('button', { class: `tab${i === this.tabIndex ? ' active' : ''}`, role: 'tab', 'data-testid': `jtab-${i}`, text: t(k) });
      b.addEventListener('click', () => this.tab((i - this.tabIndex) as -1 | 1));
      tabs.append(b);
    });
    tabs.append(h('span', { class: 'tab-key', text: this.host.keyLabel('uiTabNext') }));
    this.root.append(h('h1', { text: t('journal.title') }), tabs);
    const body = h('div', { class: 'panel journal-body scroll' });
    const list = h('div', { class: 'list wide' });
    this.root.append(body, list);
    if (!sim) return;
    const L = sim.ledger;
    const keys = this.ctx.keys();
    switch (this.tabIndex) {
      case 0: {
        const tr = sim.quests.tracked();
        if (tr) {
          body.append(h('h2', { class: 'active-quest', text: t('journal.active', { name: t(tr.quest.title) }) }));
          body.append(h('p', { class: 'objective', text: `◆ ${objectiveText(sim, keys)}` }));
          const detail = resolveText(tr.stage.detail, L);
          if (detail) body.append(h('p', { text: t(detail) }));
          body.append(h('p', { class: 'muted', text: t('journal.evidence_count', { n: L.evidence.filter((e) => CLOCKFALL_EVIDENCE.includes(e)).length, total: CLOCKFALL_EVIDENCE.length }) }));
          if (tr.entry.hintTier > 0) {
            body.append(h('h3', { text: t('journal.hints') }));
            for (let i = 0; i < tr.entry.hintTier; i++) body.append(h('p', { class: 'hint', text: `${t('hud.hint_label', { tier: i + 1 })}: ${t(tr.stage.hints[i], keys)}` }));
          }
        } else body.append(h('p', { text: t('hud.no_objective') }));
        const clues: string[] = [];
        if (L.has('read.bell')) clues.push(t('journal.clue.bell'));
        if (L.has('read.moon')) clues.push(t('journal.clue.moon'));
        if (L.has('keyclock.read')) clues.push(t('journal.clue.key'));
        else if (L.has('trig.cellar.floor')) clues.push(t('journal.clue.key_broken'));
        if (L.has('knows.resonance')) clues.push(t('journal.clue.resonance'));
        if (MAPS.every((m) => L.evidence.includes(m))) clues.push(t('journal.maps_compare') + ': ' + MAPS.map((m) => t(`doc.${m}`).split('\n')[0]).join(' / '));
        if (clues.length) body.append(h('h3', { text: '✦' }), ...clues.map((c) => h('p', { class: 'clue', text: c })));
        const side = sim.quests.activeQuests().filter((q) => !q.main);
        for (const q of side) body.append(h('p', { class: 'muted', text: `○ ${t(q.title)}` }));
        const done = sim.quests.completedQuests();
        if (done.length) body.append(h('h3', { text: t('journal.completed') }), ...done.map((q) => h('p', { class: 'done', text: `✓ ${t(q.title)}` })));
        body.append(h('h3', { text: t('journal.region_status') }), h('p', { text: `${t('journal.region.clockfall')}: ${L.has('bell1.awake') ? t('journal.status.bell') : t('journal.status.night')}` }));
        if (L.has('trig.forest.edge')) body.append(h('p', { text: `${t('journal.region.forest')}: ${t('journal.status.wishing')}` }));
        const s = this.settings;
        list.append(
          this.button('hint', t('journal.request_hint', { key: this.host.keyLabel('hint') }), () => {
            if (s.accessibility.hintMode === 'off') this.ctx.toast(t('hud.no_hints'));
            else sim.requestHint();
            this.render();
          }).el,
          this.button('tracking', s.accessibility.objectiveTracking ? t('journal.track_on') : t('journal.track_off'), () => this.set((d) => (d.accessibility.objectiveTracking = !d.accessibility.objectiveTracking))).el,
        );
        break;
      }
      case 1: {
        const all = [...CLOCKFALL_EVIDENCE, ...MAPS];
        body.append(h('p', { class: 'muted', text: t('journal.evidence_count', { n: L.evidence.filter((e) => CLOCKFALL_EVIDENCE.includes(e)).length, total: CLOCKFALL_EVIDENCE.length }) }));
        for (const ev of all) {
          const found = L.evidence.includes(ev);
          const crit = CRITICAL_EVIDENCE.has(ev);
          const label = found ? t(ev) : t('journal.unknown');
          const tag = crit ? ` · ${t('journal.critical')}` : MAPS.includes(ev) ? '' : ` · ${t('journal.optional')}`;
          if (found && DOCS[ev]) list.append(this.button(`ev-${ev}`, `${crit ? '★' : '•'} ${label}`, () => this.host.push(new DocumentScreen(this.ctx, ev, DOCS[ev])), { sub: t('prompt.read') + tag }).el);
          else body.append(h('p', { class: found ? '' : 'muted', text: `${crit ? '★' : '•'} ${label}${tag}` }));
        }
        break;
      }
      case 2: {
        body.append(h('h2', { text: t('journal.mira_title') }));
        if (!L.has('mira.demo') && !L.has('span2.fell')) body.append(h('p', { class: 'muted', text: t('journal.mira_unknown') }));
        else {
          body.append(h('p', { text: t('journal.mira_1') }));
          if (L.has('ability.anchor')) body.append(h('p', { text: t('journal.mira_2') }));
          if (L.has('bell1.awake')) body.append(h('p', { text: t('journal.mira_3') }));
        }
        break;
      }
      case 3: {
        const anomalies: Array<[string, boolean]> = [
          ['journal.anom.thirteen', L.has('intro.done')],
          ['journal.anom.loops', L.has('trig.square.enter')],
          ['journal.anom.bridge', L.has('span2.fell')],
          ['journal.anom.keyclock', L.has('keyclock.read')],
          ['journal.anom.observer', L.has('observer.seen') || L.has('bell1.awake')],
          ['journal.anom.forest', L.num('forest.loops') > 0],
        ];
        const known = anomalies.filter(([, k]) => k);
        if (!known.length) body.append(h('p', { class: 'muted', text: t('journal.unknown') }));
        for (const [k] of known) body.append(h('p', { text: `✧ ${t(k)}` }));
        break;
      }
      case 4:
        body.append(drawMap(sim, this.settings.accessibility.objectiveTracking));
        body.append(
          h('div', { class: 'legend' }, h('strong', { text: t('map.legend') }), h('span', { text: `▲ ${t('map.legend_you')}` }), h('span', { text: `◆ ${t('map.legend_objective')}` }), h('span', { text: `● ${t('map.legend_landmark')}` }), h('span', { text: `▒ ${t('map.legend_unknown')}` })),
        );
        break;
    }
    list.append(this.button('close', t('menu.back'), () => this.back()).el);
  }
}

/** The map shows discovered landmarks and areas with a legend, not a wall of markers (UX §5). */
function drawMap(sim: Sim, tracking: boolean): HTMLElement {
  const W = 520;
  const H = 700;
  const c = h('canvas', { width: W, height: H, class: 'map-canvas', 'data-testid': 'map', 'aria-label': t('map.title') });
  const g = c.getContext('2d');
  if (!g) return c;
  // Window around the explored part of the world (north is up = -Z).
  const L = sim.ledger;
  const zMax = 96;
  const zMin = L.has('trig.forest.edge') ? -245 : L.has('trig.bridge.crossed') ? -125 : -30;
  const xMin = -46;
  const xMax = 46;
  const sx = (x: number) => ((x - xMin) / (xMax - xMin)) * (W - 40) + 20;
  const sz = (z: number) => ((zMax - z) / (zMax - zMin)) * (H - 40) + 20;
  g.fillStyle = '#17152B';
  g.fillRect(0, 0, W, H);
  // Unexplored hatch.
  g.strokeStyle = 'rgba(138,131,150,0.18)';
  for (let i = -H; i < W; i += 12) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + H, H);
    g.stroke();
  }
  const visited = new Set<string>([sim.area]);
  for (const lm of LANDMARKS) if (L.landmarks.includes(lm.id)) for (const a of AREAS) if (lm.pos.x >= a.min.x && lm.pos.x <= a.max.x && lm.pos.z >= a.min.z && lm.pos.z <= a.max.z) visited.add(a.id);
  for (const a of AREAS) {
    if (!visited.has(a.id) || a.min.z > zMax || a.max.z < zMin) continue;
    g.fillStyle = a.region === 'forest' ? 'rgba(44,70,64,0.85)' : 'rgba(62,49,100,0.85)';
    const x0 = sx(Math.max(a.min.x, -30));
    const x1 = sx(Math.min(a.max.x, 30));
    const y0 = sz(Math.min(a.max.z, zMax));
    const y1 = sz(Math.max(a.min.z, zMin));
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = '#EEE9F6';
    g.font = '15px Georgia';
    g.fillText(t(a.id), x0 + 6, y0 + 18);
  }
  // The ravine.
  if (zMin < -2) {
    g.fillStyle = 'rgba(10,8,20,0.9)';
    g.fillRect(sx(-46), sz(-2), sx(46) - sx(-46), sz(-26) - sz(-2));
  }
  for (const lm of LANDMARKS) {
    if (!L.landmarks.includes(lm.id)) continue;
    g.fillStyle = '#D7A35C';
    g.beginPath();
    g.arc(sx(lm.pos.x), sz(lm.pos.z), 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#EEE9F6';
    g.font = '13px Georgia';
    g.fillText(t(lm.name), sx(lm.pos.x) + 9, sz(lm.pos.z) + 4);
  }
  const tr = sim.quests.tracked();
  if (tracking && tr?.stage.location) {
    const p = tr.stage.location;
    g.fillStyle = '#66BFD4';
    g.beginPath();
    g.moveTo(sx(p.x), sz(p.z) - 9);
    g.lineTo(sx(p.x) + 8, sz(p.z));
    g.lineTo(sx(p.x), sz(p.z) + 9);
    g.lineTo(sx(p.x) - 8, sz(p.z));
    g.closePath();
    g.fill();
  }
  // Player arrow (north = up).
  const px = sx(sim.player.pos.x);
  const pz = sz(sim.player.pos.z);
  g.save();
  g.translate(px, pz);
  g.rotate(-sim.player.yaw);
  g.fillStyle = '#EEE9F6';
  g.beginPath();
  g.moveTo(0, -11);
  g.lineTo(7, 8);
  g.lineTo(-7, 8);
  g.closePath();
  g.fill();
  g.restore();
  g.fillStyle = '#EEE9F6';
  g.font = 'bold 18px Georgia';
  g.fillText(t('map.north'), W - 34, 30);
  void POS;
  return c;
}

// ------------------------------------------------------------------------------------------------ documents & dial lock

export class DocumentScreen extends AppScreen {
  constructor(
    ctx: UiContext,
    private titleKey: string,
    private bodyKey: string,
  ) {
    super(ctx, 'document', 'screen-document');
  }

  build(): void {
    this.root.append(h('div', { class: 'paper' }, h('h2', { text: t(this.titleKey) }), ...t(this.bodyKey).split('\n').map((l) => h('p', { text: l }))));
    const list = h('div', { class: 'list center' });
    this.root.append(list);
    list.append(this.button('close', t('doc.close'), () => this.back()).el);
  }
}

export class DialScreen extends AppScreen {
  private values = [1, 1, 1];
  private wrong = false;
  constructor(ctx: UiContext) {
    super(ctx, 'dial', 'screen-dial');
  }

  build(): void {
    this.root.append(h('div', { class: 'panel' }, h('h2', { text: t('dial.title') }), h('p', { text: t('dial.body') })));
    const list = h('div', { class: 'list' });
    this.root.append(list);
    const names = ['dial.bell', 'dial.moon', 'dial.key'];
    const icons = ['🔔', '☾', '⚷'];
    names.forEach((n, i) => {
      list.append(
        this.cycle(`dial${i}`, `${icons[i]} ${t(n)}`, Array.from({ length: 13 }, (_, k) => ({ value: k + 1, label: String(k + 1) })), this.values[i], (v) => {
          this.values[i] = v;
          this.wrong = false;
          this.host.sound('dial_tick');
          this.render();
        }).el,
      );
    });
    list.append(
      this.button('try', t('dial.try'), () => {
        const ok = this.ctx.app.sim?.hooks.dial?.(this.values) ?? false;
        if (ok) this.host.pop();
        else {
          this.wrong = true;
          this.render();
        }
      }).el,
      this.button('close', t('menu.back'), () => this.back()).el,
    );
    if (this.wrong) this.root.append(h('div', { class: 'message warn', role: 'status', text: `✕ ${t('dial.wrong')}` }));
  }
}
