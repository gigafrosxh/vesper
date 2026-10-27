import { describe, expect, it, vi } from 'vitest';
import { assignBinding, cloneBindings, DEFAULT_BINDINGS, findConflicts, unboundRequired } from '../../src/input/actions';
import { InputMapper, InputRouter, type InputPreferences } from '../../src/input/inputRouter';
import { MemoryStorage } from '../../src/persistence/storage';
import { defaultSettings, PRESETS, sanitizeSettings, SettingsService } from '../../src/settings/settings';

const prefs = (over: Partial<InputPreferences> = {}): InputPreferences => ({
  bindings: cloneBindings(DEFAULT_BINDINGS),
  holdMode: 'hold',
  mouseSensitivity: 1,
  stickSensitivity: 1,
  invertY: false,
  deadzone: 0.2,
  ...over,
});

describe('Input remapping (FR-012)', () => {
  it('default bindings have no conflicts', () => {
    expect(findConflicts(DEFAULT_BINDINGS)).toEqual([]);
  });

  it('assigning a used key swaps it away and reports the displaced action', () => {
    const { bindings, displaced } = assignBinding(DEFAULT_BINDINGS, 'rewind', 0, 'KeyF');
    expect(bindings.rewind.keyboard[0]).toBe('KeyF');
    expect(bindings.interact.keyboard).not.toContain('KeyF');
    expect(displaced).toEqual(['interact']);
    expect(findConflicts(bindings)).toEqual([]);
    expect(bindings.interact.keyboard).toEqual([]);
    expect(unboundRequired(bindings)).toEqual([]); // still reachable via gamepad
    const noPad = assignBinding({ ...bindings, interact: { keyboard: [], gamepad: [] } }, 'jump', 0, 'Space').bindings;
    expect(unboundRequired(noPad)).toEqual(['interact']);
  });

  it('gamepad bindings are kept per device', () => {
    const { bindings } = assignBinding(DEFAULT_BINDINGS, 'jump', 0, 'Pad3');
    expect(bindings.jump.gamepad).toEqual(['Pad3']);
    expect(bindings.jump.keyboard).toEqual(['Space']);
    expect(bindings.interact.gamepad).toEqual([]);
  });

  it('maps keys, sticks and edges to actions', () => {
    const p = prefs();
    const m = new InputMapper(() => p);
    let f = m.map(new Set(['KeyW', 'Space']), 0, 0, [0, 0, 0, 0], 1 / 60);
    expect(f.moveY).toBe(1);
    expect(f.pressed.has('jump')).toBe(true);
    f = m.map(new Set(['KeyW', 'Space']), 0, 0, [0, 0, 0, 0], 1 / 60);
    expect(f.pressed.has('jump')).toBe(false);
    expect(f.held.has('jump')).toBe(true);
    f = m.map(new Set(), 0, 0, [0.9, 0, 0, 0], 1 / 60);
    expect(f.released.has('jump')).toBe(true);
    expect(f.moveX).toBeGreaterThan(0.8);
    expect(f.held.has('uiRight')).toBe(true);
    f = m.map(new Set(['Pad0']), 0, 0, [0.1, 0, 0, 0], 1 / 60);
    expect(f.moveX).toBe(0); // inside the dead zone
    expect(f.held.has('uiConfirm')).toBe(true);
  });

  it('toggle mode turns taps into a held state with release on the second tap', () => {
    const p = prefs({ holdMode: 'toggle' });
    const m = new InputMapper(() => p);
    let f = m.map(new Set(['KeyQ']), 0, 0, [], 1 / 60);
    expect(f.pressed.has('rewind')).toBe(true);
    f = m.map(new Set(), 0, 0, [], 1 / 60);
    expect(f.active.has('rewind')).toBe(true);
    expect(f.released.has('rewind')).toBe(false);
    f = m.map(new Set(['KeyQ']), 0, 0, [], 1 / 60);
    expect(f.active.has('rewind')).toBe(false);
    expect(f.released.has('rewind')).toBe(true);
  });
});

describe('Settings (FR-013, UC-06)', () => {
  it('persists and reloads independently of save slots', () => {
    const st = new MemoryStorage();
    const a = new SettingsService(st);
    a.update((s) => {
      s.accessibility.textScale = 1.25;
      s.camera.shake = false;
      s.input.bindings.jump.keyboard = ['KeyX'];
    });
    const b = new SettingsService(st);
    expect(b.get().accessibility.textScale).toBe(1.25);
    expect(b.get().camera.shake).toBe(false);
    expect(b.get().input.bindings.jump.keyboard).toEqual(['KeyX']);
    expect(st.keys()).toEqual(['settings']);
  });

  it('falls back to stable defaults on garbage', () => {
    const st = new MemoryStorage();
    st.write('settings', '{not json');
    expect(new SettingsService(st).get()).toEqual(defaultSettings());
    const s = sanitizeSettings({ accessibility: { textScale: 99, holdMode: 'x' }, audio: { master: -3 } });
    expect(s.accessibility.textScale).toBe(2);
    expect(s.accessibility.holdMode).toBe('hold');
    expect(s.audio.master).toBe(0);
  });

  it('presets change granular settings but never remove them', () => {
    const s = defaultSettings();
    PRESETS.motionComfort(s);
    expect(s.camera.shake).toBe(false);
    expect(s.accessibility.flashReduction).toBe(true);
    expect(sanitizeSettings(s)).toEqual(s);
  });
});

describe('InputRouter releaseAll (UX-06)', () => {
  it('a button held while a screen opens must be released before it counts again', () => {
    const s = defaultSettings();
    const pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const r = new InputRouter(() => ({ bindings: s.input.bindings, holdMode: 'hold', mouseSensitivity: 1, stickSensitivity: 1, invertY: false, deadzone: 0.2 }));
    pad.buttons[0] = { pressed: true, value: 1 };
    expect(r.sample(1 / 60).pressed.has('uiConfirm')).toBe(true);
    r.releaseAll();
    expect(r.sample(1 / 60).held.has('uiConfirm')).toBe(false);
    pad.buttons[0] = { pressed: false, value: 0 };
    r.sample(1 / 60);
    pad.buttons[0] = { pressed: true, value: 1 };
    expect(r.sample(1 / 60).pressed.has('uiConfirm')).toBe(true);
    vi.unstubAllGlobals();
  });
});
