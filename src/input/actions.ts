// Logical actions (FR-012): gameplay code asks for actions, never for physical keys.

export const GAMEPLAY_ACTIONS = [
  'moveForward',
  'moveBack',
  'moveLeft',
  'moveRight',
  'jump',
  'sprint',
  'dodge',
  'attack',
  'interact',
  'lockOn',
  'rewind',
  'anchor',
  'hint',
  'journal',
  'map',
  'pause',
] as const;

export const UI_ACTIONS = ['uiUp', 'uiDown', 'uiLeft', 'uiRight', 'uiConfirm', 'uiBack', 'uiTabPrev', 'uiTabNext'] as const;

export type GameplayAction = (typeof GAMEPLAY_ACTIONS)[number];
export type UiAction = (typeof UI_ACTIONS)[number];
export type Action = GameplayAction | UiAction;

/**
 * A binding is a physical input id:
 *  - keyboard: KeyboardEvent.code, e.g. "KeyW", "Space"
 *  - mouse:    "Mouse0".."Mouse4"
 *  - gamepad:  "Pad0".."Pad16" (standard mapping button index)
 */
export type Binding = string;

export interface ActionBindings {
  keyboard: Binding[]; // keyboard and mouse, up to two
  gamepad: Binding[]; // up to one (array for symmetry)
}

export type BindingMap = Record<GameplayAction, ActionBindings>;

export const DEFAULT_BINDINGS: BindingMap = {
  moveForward: { keyboard: ['KeyW', 'ArrowUp'], gamepad: [] },
  moveBack: { keyboard: ['KeyS', 'ArrowDown'], gamepad: [] },
  moveLeft: { keyboard: ['KeyA', 'ArrowLeft'], gamepad: [] },
  moveRight: { keyboard: ['KeyD', 'ArrowRight'], gamepad: [] },
  jump: { keyboard: ['Space'], gamepad: ['Pad0'] },
  sprint: { keyboard: ['ShiftLeft'], gamepad: ['Pad10'] },
  dodge: { keyboard: ['KeyC', 'ControlLeft'], gamepad: ['Pad1'] },
  attack: { keyboard: ['Mouse0'], gamepad: ['Pad2'] },
  interact: { keyboard: ['KeyF'], gamepad: ['Pad3'] },
  lockOn: { keyboard: ['Mouse2', 'KeyT'], gamepad: ['Pad6'] },
  rewind: { keyboard: ['KeyQ'], gamepad: ['Pad4'] },
  anchor: { keyboard: ['KeyE'], gamepad: ['Pad5'] },
  hint: { keyboard: ['KeyH'], gamepad: ['Pad14'] },
  journal: { keyboard: ['KeyJ', 'Tab'], gamepad: ['Pad8'] },
  map: { keyboard: ['KeyM'], gamepad: ['Pad12'] },
  pause: { keyboard: ['Escape', 'KeyP'], gamepad: ['Pad9'] },
};

/** UI navigation is fixed so menus always stay reachable (FR-014), regardless of remapping. */
export const UI_BINDINGS: Record<UiAction, Binding[]> = {
  uiUp: ['ArrowUp', 'KeyW', 'Pad12'],
  uiDown: ['ArrowDown', 'KeyS', 'Pad13'],
  uiLeft: ['ArrowLeft', 'KeyA', 'Pad14'],
  uiRight: ['ArrowRight', 'KeyD', 'Pad15'],
  uiConfirm: ['Enter', 'Space', 'NumpadEnter', 'Pad0'],
  uiBack: ['Escape', 'Backspace', 'Pad1'],
  uiTabPrev: ['KeyQ', 'PageUp', 'Pad4'],
  uiTabNext: ['KeyE', 'PageDown', 'Pad5'],
};

/** Actions that may never be left without any binding. */
export const REQUIRED_ACTIONS: GameplayAction[] = ['moveForward', 'moveBack', 'moveLeft', 'moveRight', 'jump', 'interact', 'pause', 'rewind', 'attack'];

export function cloneBindings(b: BindingMap): BindingMap {
  const out = {} as BindingMap;
  for (const k of GAMEPLAY_ACTIONS) out[k] = { keyboard: [...b[k].keyboard], gamepad: [...b[k].gamepad] };
  return out;
}

export interface BindingConflict {
  binding: Binding;
  actions: GameplayAction[];
}

/** Movement keys may share with nothing; every physical input should drive at most one gameplay action. */
export function findConflicts(b: BindingMap): BindingConflict[] {
  const owners = new Map<Binding, GameplayAction[]>();
  for (const action of GAMEPLAY_ACTIONS) {
    for (const bind of [...b[action].keyboard, ...b[action].gamepad]) {
      const list = owners.get(bind) ?? [];
      list.push(action);
      owners.set(bind, list);
    }
  }
  const out: BindingConflict[] = [];
  for (const [binding, actions] of owners) if (actions.length > 1) out.push({ binding, actions });
  return out;
}

export type DeviceKind = 'keyboard' | 'gamepad';

export function deviceOf(binding: Binding): DeviceKind {
  return binding.startsWith('Pad') ? 'gamepad' : 'keyboard';
}

/**
 * Assign a binding to an action slot. If the binding is used elsewhere it is removed there
 * (swap semantics) and the displaced action is reported so the UI can show a conflict warning.
 */
export function assignBinding(
  b: BindingMap,
  action: GameplayAction,
  slot: number,
  binding: Binding,
): { bindings: BindingMap; displaced: GameplayAction[] } {
  const next = cloneBindings(b);
  const device = deviceOf(binding);
  const displaced: GameplayAction[] = [];
  for (const other of GAMEPLAY_ACTIONS) {
    if (other === action) continue;
    const list = next[other][device];
    const idx = list.indexOf(binding);
    if (idx >= 0) {
      list.splice(idx, 1);
      displaced.push(other);
    }
  }
  const list = next[action][device];
  const existing = list.indexOf(binding);
  if (existing >= 0) list.splice(existing, 1);
  const max = device === 'keyboard' ? 2 : 1;
  const s = Math.min(slot, max - 1, list.length);
  list[s] = binding;
  if (list.length > max) list.length = max;
  return { bindings: next, displaced };
}

/** Returns required actions left without any binding after a change (shown as a warning; reset possible). */
export function unboundRequired(b: BindingMap): GameplayAction[] {
  return REQUIRED_ACTIONS.filter((a) => b[a].keyboard.length === 0 && b[a].gamepad.length === 0);
}

const KEY_LABELS: Record<string, string> = {
  Space: 'Space',
  ShiftLeft: 'L-Shift',
  ShiftRight: 'R-Shift',
  ControlLeft: 'L-Ctrl',
  ControlRight: 'R-Ctrl',
  AltLeft: 'L-Alt',
  Escape: 'Esc',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Mouse0: 'LMB',
  Mouse1: 'MMB',
  Mouse2: 'RMB',
  Mouse3: 'Mouse4',
  Mouse4: 'Mouse5',
};

const PAD_LABELS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', 'D-Up', 'D-Down', 'D-Left', 'D-Right', 'Home'];

export function bindingLabel(binding: Binding): string {
  if (binding.startsWith('Pad')) return PAD_LABELS[Number(binding.slice(3))] ?? binding;
  if (KEY_LABELS[binding]) return KEY_LABELS[binding];
  if (binding.startsWith('Key')) return binding.slice(3);
  if (binding.startsWith('Digit')) return binding.slice(5);
  return binding;
}
