import { GAMEPLAY_ACTIONS, UI_ACTIONS, UI_BINDINGS, type Action, type BindingMap, type DeviceKind, type GameplayAction } from './actions';

/** One immutable sample of player intent per simulation tick. The simulation only ever sees this. */
export interface InputFrame {
  moveX: number; // -1..1 strafe
  moveY: number; // -1..1 forward
  lookX: number; // radians this tick
  lookY: number;
  held: ReadonlySet<Action>;
  pressed: ReadonlySet<Action>;
  released: ReadonlySet<Action>;
  /** Logical state after hold/toggle preference is applied (sprint, rewind). */
  active: ReadonlySet<GameplayAction>;
}

export const EMPTY_FRAME: InputFrame = {
  moveX: 0,
  moveY: 0,
  lookX: 0,
  lookY: 0,
  held: new Set(),
  pressed: new Set(),
  released: new Set(),
  active: new Set(),
};

export function makeFrame(partial: Partial<Omit<InputFrame, 'held' | 'pressed' | 'released' | 'active'>> & {
  held?: Action[];
  pressed?: Action[];
  released?: Action[];
  active?: GameplayAction[];
}): InputFrame {
  return {
    moveX: partial.moveX ?? 0,
    moveY: partial.moveY ?? 0,
    lookX: partial.lookX ?? 0,
    lookY: partial.lookY ?? 0,
    held: new Set(partial.held ?? []),
    pressed: new Set(partial.pressed ?? []),
    released: new Set(partial.released ?? []),
    active: new Set(partial.active ?? partial.held?.filter((a): a is GameplayAction => (GAMEPLAY_ACTIONS as readonly string[]).includes(a)) ?? []),
  };
}

export interface InputPreferences {
  bindings: BindingMap;
  holdMode: 'hold' | 'toggle';
  mouseSensitivity: number; // 0.1..3
  stickSensitivity: number; // 0.1..3
  invertY: boolean;
  deadzone: number;
}

/** Actions affected by the hold/toggle accessibility preference. */
export const TOGGLEABLE: GameplayAction[] = ['sprint', 'rewind'];

/**
 * Pure mapper from raw device state to InputFrames (unit-testable without a DOM).
 */
export class InputMapper {
  private prevHeld = new Set<Action>();
  private toggles = new Set<GameplayAction>();

  constructor(private prefs: () => InputPreferences) {}

  clearToggle(action: GameplayAction): void {
    this.toggles.delete(action);
  }

  reset(): void {
    this.prevHeld.clear();
    this.toggles.clear();
  }

  map(down: ReadonlySet<string>, mouseDX: number, mouseDY: number, axes: readonly number[], dt: number): InputFrame {
    const p = this.prefs();
    const held = new Set<Action>();
    for (const a of GAMEPLAY_ACTIONS) {
      const b = p.bindings[a];
      if (b.keyboard.some((k) => down.has(k)) || b.gamepad.some((k) => down.has(k))) held.add(a);
    }
    for (const a of UI_ACTIONS) if (UI_BINDINGS[a].some((k) => down.has(k))) held.add(a);

    const dz = p.deadzone;
    const shape = (v: number) => (Math.abs(v) < dz ? 0 : (Math.sign(v) * (Math.abs(v) - dz)) / (1 - dz));
    const lx = shape(axes[0] ?? 0);
    const ly = shape(axes[1] ?? 0);
    const rx = shape(axes[2] ?? 0);
    const ry = shape(axes[3] ?? 0);

    // Left stick also drives menu navigation so menus never need a pointing device (FR-014).
    if (ly < -0.6) held.add('uiUp');
    if (ly > 0.6) held.add('uiDown');
    if (lx < -0.6) held.add('uiLeft');
    if (lx > 0.6) held.add('uiRight');

    let moveX = (held.has('moveRight') ? 1 : 0) - (held.has('moveLeft') ? 1 : 0) + lx;
    let moveY = (held.has('moveForward') ? 1 : 0) - (held.has('moveBack') ? 1 : 0) - ly;
    const m = Math.hypot(moveX, moveY);
    if (m > 1) {
      moveX /= m;
      moveY /= m;
    }

    const inv = p.invertY ? -1 : 1;
    const lookX = mouseDX * 0.0025 * p.mouseSensitivity + rx * 3.2 * p.stickSensitivity * dt;
    const lookY = (mouseDY * 0.0025 * p.mouseSensitivity + ry * 2.4 * p.stickSensitivity * dt) * inv;

    const pressed = new Set<Action>();
    const released = new Set<Action>();
    for (const a of held) if (!this.prevHeld.has(a)) pressed.add(a);
    for (const a of this.prevHeld) if (!held.has(a)) released.add(a);
    this.prevHeld = new Set(held);

    // Hold/toggle preference: in toggle mode a tap switches the logical state on and the next tap off.
    // The logical pressed/released edges are reported so the simulation has one code path (release = commit).
    const active = new Set<GameplayAction>();
    for (const a of GAMEPLAY_ACTIONS) {
      if (p.holdMode === 'toggle' && TOGGLEABLE.includes(a)) {
        const wasActive = this.toggles.has(a);
        if (pressed.has(a)) {
          if (wasActive) this.toggles.delete(a);
          else this.toggles.add(a);
        }
        const isActive = this.toggles.has(a);
        pressed.delete(a);
        released.delete(a);
        held.delete(a);
        if (isActive) {
          active.add(a);
          held.add(a);
        }
        if (!wasActive && isActive) pressed.add(a);
        if (wasActive && !isActive) released.add(a);
      } else if (held.has(a)) active.add(a);
    }

    return { moveX, moveY, lookX, lookY, held, pressed, released, active };
  }
}

/**
 * DOM-facing router: listens to keyboard, mouse and gamepads and produces frames through InputMapper.
 */
export class InputRouter {
  readonly mapper: InputMapper;
  private down = new Set<string>();
  /** Inputs pressed since the last sample, so taps shorter than a frame are never lost. */
  private tapped = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private axes: number[] = [0, 0, 0, 0];
  private capture: ((binding: string) => void) | null = null;
  /** Inputs held during releaseAll(); ignored until physically released. */
  private suppressed = new Set<string>();
  lastDevice: DeviceKind = 'keyboard';
  private listeners: Array<() => void> = [];
  private deviceListeners = new Set<(d: DeviceKind) => void>();
  pointerLockTarget: HTMLElement | null = null;
  gameplayFocus = false;

  constructor(prefs: () => InputPreferences) {
    this.mapper = new InputMapper(prefs);
  }

  onDeviceChange(fn: (d: DeviceKind) => void): () => void {
    this.deviceListeners.add(fn);
    return () => this.deviceListeners.delete(fn);
  }

  private setDevice(d: DeviceKind) {
    if (d !== this.lastDevice) {
      this.lastDevice = d;
      for (const fn of this.deviceListeners) fn(d);
    }
  }

  attach(win: Window): void {
    const onKeyDown = (e: KeyboardEvent) => {
      this.setDevice('keyboard');
      if (this.capture && e.code !== 'Escape') {
        e.preventDefault();
        const cb = this.capture;
        this.capture = null;
        cb(e.code);
        return;
      }
      if (this.capture && e.code === 'Escape') {
        this.capture = null;
      }
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) || this.gameplayFocus) {
        const target = e.target as HTMLElement | null;
        const typing = target && (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text');
        if (!typing) e.preventDefault();
      }
      // Auto-repeat of a key that was held across releaseAll() stays ignored until it is released.
      if (e.repeat && this.suppressed.has(e.code)) return;
      this.suppressed.delete(e.code);
      this.down.add(e.code);
      this.tapped.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      this.down.delete(e.code);
      this.suppressed.delete(e.code);
    };
    const onMouseDown = (e: MouseEvent) => {
      this.setDevice('keyboard');
      if (this.capture) {
        e.preventDefault();
        const cb = this.capture;
        this.capture = null;
        cb(`Mouse${e.button}`);
        return;
      }
      if (this.gameplayFocus) {
        this.suppressed.delete(`Mouse${e.button}`);
        this.down.add(`Mouse${e.button}`);
        this.tapped.add(`Mouse${e.button}`);
        if (this.pointerLockTarget && document.pointerLockElement !== this.pointerLockTarget) {
          this.pointerLockTarget.requestPointerLock?.();
        }
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      this.down.delete(`Mouse${e.button}`);
      this.suppressed.delete(`Mouse${e.button}`);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    };
    const onContext = (e: Event) => {
      if (this.gameplayFocus) e.preventDefault();
    };
    const onBlur = () => this.releaseAll();
    win.addEventListener('keydown', onKeyDown);
    win.addEventListener('keyup', onKeyUp);
    win.addEventListener('mousedown', onMouseDown);
    win.addEventListener('mouseup', onMouseUp);
    win.addEventListener('mousemove', onMouseMove);
    win.addEventListener('contextmenu', onContext);
    win.addEventListener('blur', onBlur);
    this.listeners.push(
      () => win.removeEventListener('keydown', onKeyDown),
      () => win.removeEventListener('keyup', onKeyUp),
      () => win.removeEventListener('mousedown', onMouseDown),
      () => win.removeEventListener('mouseup', onMouseUp),
      () => win.removeEventListener('mousemove', onMouseMove),
      () => win.removeEventListener('contextmenu', onContext),
      () => win.removeEventListener('blur', onBlur),
    );
  }

  detach(): void {
    for (const off of this.listeners) off();
    this.listeners = [];
  }

  /** Clears all held inputs, e.g. after death/reload or focus loss so nothing stays stuck (UX-06). */
  releaseAll(): void {
    // Buttons still physically held must be released before they count again, so a confirm press
    // that opens a screen is not seen as a fresh press by that screen.
    for (const b of this.down) this.suppressed.add(b);
    this.down.clear();
    this.tapped.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mapper.reset();
  }

  /** Next physical input is delivered to cb instead of producing actions (remapping UI). */
  captureNext(cb: (binding: string) => void): void {
    this.capture = cb;
  }

  cancelCapture(): void {
    this.capture = null;
  }

  get capturing(): boolean {
    return this.capture !== null;
  }

  private pollGamepads(): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const axes = [0, 0, 0, 0];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      pad.buttons.forEach((b, i) => {
        const id = `Pad${i}`;
        const isDown = b.pressed || b.value > 0.5;
        if (this.suppressed.has(id)) {
          if (!isDown) this.suppressed.delete(id);
          return;
        }
        if (isDown) {
          if (!this.down.has(id)) {
            this.setDevice('gamepad');
            if (this.capture) {
              const cb = this.capture;
              this.capture = null;
              cb(id);
              return;
            }
          }
          this.down.add(id);
        } else this.down.delete(id);
      });
      for (let i = 0; i < 4; i++) {
        const v = pad.axes[i] ?? 0;
        if (Math.abs(v) > Math.abs(axes[i])) axes[i] = v;
      }
      if (axes.some((v) => Math.abs(v) > 0.35)) this.setDevice('gamepad');
      break; // first connected pad drives the game
    }
    this.axes = axes;
  }

  sample(dt: number): InputFrame {
    this.pollGamepads();
    if (this.capture) {
      this.mouseDX = 0;
      this.mouseDY = 0;
      return EMPTY_FRAME;
    }
    const down = this.tapped.size ? new Set([...this.down, ...this.tapped]) : this.down;
    this.tapped.clear();
    const frame = this.mapper.map(down, this.mouseDX, this.mouseDY, this.axes, dt);
    this.mouseDX = 0;
    this.mouseDY = 0;
    return frame;
  }
}
