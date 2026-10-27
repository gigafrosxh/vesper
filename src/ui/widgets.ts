import { t } from '../core/i18n';
import type { InputFrame } from '../input/inputRouter';

// Menu building blocks with one focus model for controller, keyboard and mouse (FR-014, UX-01, UX-04).

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | number | boolean | undefined> = {}, ...children: Array<Node | string | null | undefined | false>): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export interface Item {
  id: string;
  el: HTMLElement;
  activate?: () => void;
  adjust?: (dir: -1 | 1) => void;
  disabled?: boolean;
}

/** Repeats held navigation directions like a native list (first delay, then fixed rate). */
/** Only directions auto-repeat; confirm, back and tab switches fire once per press. */
const REPEATING = new Set(['uiUp', 'uiDown', 'uiLeft', 'uiRight']);

export class NavRepeater {
  private held = new Map<string, number>();

  pulses(frame: InputFrame, dt: number, actions: readonly string[]): Set<string> {
    const out = new Set<string>();
    for (const a of actions) {
      if (frame.pressed.has(a as never)) {
        out.add(a);
        this.held.set(a, -0.38);
      } else if (frame.held.has(a as never) && REPEATING.has(a)) {
        const v = (this.held.get(a) ?? 0) + dt;
        if (v >= 0.11) {
          out.add(a);
          this.held.set(a, 0);
        } else this.held.set(a, v);
      } else this.held.delete(a);
    }
    return out;
  }
}

export abstract class Screen {
  readonly root: HTMLElement;
  items: Item[] = [];
  focus = 0;
  /** Screens that pause the simulation (all menus do). */
  modal = true;
  /** Screens that close on back; the root of a stack (main menu) does not. */
  closable = true;
  host!: ScreenHost;

  constructor(cls: string, readonly testId: string) {
    this.root = h('div', { class: `screen ${cls}`, 'data-testid': testId, role: 'dialog', 'aria-modal': 'true' });
  }

  abstract build(): void;

  /** Rebuilds the content while keeping focus on the same item. */
  render(): void {
    const prevId = this.items[this.focus]?.id;
    this.items = [];
    this.root.replaceChildren();
    this.build();
    const idx = this.items.findIndex((i) => i.id === prevId);
    this.focus = idx >= 0 ? idx : this.firstEnabled();
    this.applyFocus();
  }

  protected firstEnabled(): number {
    const i = this.items.findIndex((x) => !x.disabled);
    return i < 0 ? 0 : i;
  }

  add(item: Item): Item {
    const index = this.items.length;
    this.items.push(item);
    item.el.classList.add('item');
    item.el.setAttribute('data-item', item.id);
    if (item.disabled) item.el.classList.add('disabled');
    item.el.addEventListener('mouseenter', () => {
      if (item.disabled) return;
      this.focus = index;
      this.applyFocus();
    });
    item.el.addEventListener('click', (e) => {
      if (item.disabled) return;
      const target = e.target as HTMLElement;
      this.focus = index;
      this.applyFocus();
      if (target.closest('[data-dir]')) item.adjust?.(Number(target.closest('[data-dir]')!.getAttribute('data-dir')) as -1 | 1);
      else if (item.activate) item.activate();
      else item.adjust?.(1);
    });
    return item;
  }

  applyFocus(): void {
    this.items.forEach((it, i) => {
      const f = i === this.focus;
      it.el.classList.toggle('focused', f);
      it.el.setAttribute('aria-selected', f ? 'true' : 'false');
      if (f) it.el.scrollIntoView?.({ block: 'nearest' });
    });
  }

  move(dir: -1 | 1): void {
    if (!this.items.length) return;
    let i = this.focus;
    for (let n = 0; n < this.items.length; n++) {
      i = (i + dir + this.items.length) % this.items.length;
      if (!this.items[i].disabled) break;
    }
    this.focus = i;
    this.applyFocus();
    this.host.sound('ui_move');
  }

  /** Handles one frame of navigation pulses. Returns true if the screen consumed back. */
  handle(p: Set<string>): void {
    if (p.has('uiUp')) this.move(-1);
    if (p.has('uiDown')) this.move(1);
    const it = this.items[this.focus];
    if (it && !it.disabled) {
      if (p.has('uiLeft') && it.adjust) {
        it.adjust(-1);
        this.host.sound('ui_move');
      }
      if (p.has('uiRight') && it.adjust) {
        it.adjust(1);
        this.host.sound('ui_move');
      }
      if (p.has('uiConfirm')) {
        if (it.activate) it.activate();
        else it.adjust?.(1);
        this.host.sound('ui_confirm');
      }
    }
    if (p.has('uiTabPrev')) this.tab(-1);
    if (p.has('uiTabNext')) this.tab(1);
    if (p.has('uiBack')) this.back();
  }

  tab(_dir: -1 | 1): void {}

  back(): void {
    if (this.closable) {
      this.host.sound('ui_back');
      this.host.pop();
    }
  }

  onShow(): void {}
  update(_dt: number): void {}

  // ---------------------------------------------------------------- widget factories

  button(id: string, label: string, onClick: () => void, opts: { disabled?: boolean; sub?: string; danger?: boolean } = {}): Item {
    const el = h('button', { class: `btn${opts.danger ? ' danger' : ''}`, type: 'button', 'data-testid': `btn-${id}`, disabled: opts.disabled }, h('span', { class: 'marker', 'aria-hidden': 'true', text: '▸' }), h('span', { class: 'label', text: label }), opts.sub ? h('span', { class: 'sub', text: opts.sub }) : null);
    return this.add({ id, el, activate: onClick, disabled: opts.disabled });
  }

  /** A row whose value cycles through options with left/right (or click). */
  cycle<T>(id: string, label: string, options: Array<{ value: T; label: string }>, current: T, onChange: (v: T) => void): Item {
    const idx = Math.max(0, options.findIndex((o) => o.value === current));
    const el = h(
      'div',
      { class: 'row cycle', 'data-testid': `opt-${id}`, role: 'group', 'aria-label': label },
      h('span', { class: 'marker', 'aria-hidden': 'true', text: '▸' }),
      h('span', { class: 'label', text: label }),
      h('span', { class: 'value' }, h('span', { class: 'arrow', 'data-dir': -1, text: '◀' }), h('span', { class: 'v', text: options[idx]?.label ?? '' }), h('span', { class: 'arrow', 'data-dir': 1, text: '▶' })),
    );
    return this.add({
      id,
      el,
      adjust: (dir) => {
        const n = (idx + dir + options.length) % options.length;
        onChange(options[n].value);
      },
    });
  }

  toggle(id: string, label: string, value: boolean, onChange: (v: boolean) => void): Item {
    return this.cycle(id, label, [
      { value: false, label: t('opt.off') },
      { value: true, label: t('opt.on') },
    ], value, onChange);
  }

  slider(id: string, label: string, value: number, min: number, max: number, step: number, fmt: (v: number) => string, onChange: (v: number) => void): Item {
    const pct = ((value - min) / (max - min)) * 100;
    const el = h(
      'div',
      { class: 'row slider', 'data-testid': `opt-${id}`, role: 'slider', 'aria-label': label, 'aria-valuenow': value, 'aria-valuemin': min, 'aria-valuemax': max },
      h('span', { class: 'marker', 'aria-hidden': 'true', text: '▸' }),
      h('span', { class: 'label', text: label }),
      h('span', { class: 'value' }, h('span', { class: 'arrow', 'data-dir': -1, text: '−' }), h('span', { class: 'track' }, h('span', { class: 'fill', style: `width:${pct}%` })), h('span', { class: 'v', text: fmt(value) }), h('span', { class: 'arrow', 'data-dir': 1, text: '+' })),
    );
    return this.add({
      id,
      el,
      adjust: (dir) => {
        const v = Math.round((value + dir * step) / step) * step;
        onChange(Math.min(max, Math.max(min, Number(v.toFixed(3)))));
      },
    });
  }

  heading(text: string, cls = 'heading'): HTMLElement {
    return h('div', { class: cls, text });
  }

  footer(text: string): HTMLElement {
    return h('div', { class: 'footer', text });
  }
}

export interface ScreenHost {
  push(s: Screen): void;
  pop(): void;
  replace(s: Screen): void;
  sound(id: string): void;
  keyLabel(action: string): string;
}
