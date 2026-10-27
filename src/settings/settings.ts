import { DEFAULT_BINDINGS, GAMEPLAY_ACTIONS, cloneBindings, type BindingMap } from '../input/actions';
import type { StorageAdapter } from '../persistence/storage';

// Settings persist independently of save slots (UX §6, FR-013) and always fall back to stable defaults.

export type Language = 'en' | 'de';
export type HintMode = 'off' | 'manual' | 'escalating';
export type AimAssist = 'off' | 'low' | 'high';
export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  version: 1;
  language: Language;
  pseudoLocalization: boolean;
  audio: { master: number; music: number; sfx: number; ambience: number; voice: number; mono: boolean };
  subtitles: { enabled: boolean; size: number; background: number; speakerNames: boolean };
  camera: { mouseSensitivity: number; stickSensitivity: number; invertY: boolean; shake: boolean; motionBlur: boolean; fov: number };
  accessibility: {
    textScale: number;
    uiScale: number;
    highContrast: boolean;
    colorIndependentCues: boolean;
    holdMode: 'hold' | 'toggle';
    flashReduction: boolean;
    aimAssist: AimAssist;
    hintMode: HintMode;
    hudMode: 'dynamic' | 'persistent';
    objectiveTracking: boolean;
  };
  gameplay: { rewindWindow: number };
  graphics: { quality: Quality; fpsCap: 30 | 60; brightness: number };
  input: { bindings: BindingMap };
  flags: { firstLaunchDone: boolean; photosensitivityAcknowledged: boolean };
}

export const SETTINGS_KEY = 'settings';

export function defaultSettings(): Settings {
  return {
    version: 1,
    language: 'en',
    pseudoLocalization: false,
    audio: { master: 0.8, music: 0.6, sfx: 0.8, ambience: 0.7, voice: 1, mono: false },
    subtitles: { enabled: true, size: 1, background: 0.6, speakerNames: true },
    camera: { mouseSensitivity: 1, stickSensitivity: 1, invertY: false, shake: true, motionBlur: false, fov: 65 },
    accessibility: {
      textScale: 1,
      uiScale: 1,
      highContrast: false,
      colorIndependentCues: true,
      holdMode: 'hold',
      flashReduction: false,
      aimAssist: 'low',
      hintMode: 'manual',
      hudMode: 'dynamic',
      objectiveTracking: true,
    },
    gameplay: { rewindWindow: 6 },
    graphics: { quality: 'medium', fpsCap: 60, brightness: 1 },
    input: { bindings: cloneBindings(DEFAULT_BINDINGS) },
    flags: { firstLaunchDone: false, photosensitivityAcknowledged: false },
  };
}

const num = (v: unknown, lo: number, hi: number, d: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const pick = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

function sanitizeBindings(v: unknown): BindingMap {
  const src = obj(v);
  const out = cloneBindings(DEFAULT_BINDINGS);
  for (const a of GAMEPLAY_ACTIONS) {
    const entry = obj(src[a]);
    const kb = Array.isArray(entry.keyboard) ? entry.keyboard.filter((x): x is string => typeof x === 'string' && x.length < 32).slice(0, 2) : null;
    const gp = Array.isArray(entry.gamepad) ? entry.gamepad.filter((x): x is string => typeof x === 'string' && /^Pad\d{1,2}$/.test(x)).slice(0, 1) : null;
    if (kb) out[a].keyboard = kb;
    if (gp) out[a].gamepad = gp;
  }
  return out;
}

/** Validates untrusted persisted data field-by-field; unknown or broken fields take defaults. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  const r = obj(raw);
  const audio = obj(r.audio);
  const sub = obj(r.subtitles);
  const cam = obj(r.camera);
  const acc = obj(r.accessibility);
  const gp = obj(r.gameplay);
  const gfx = obj(r.graphics);
  const flags = obj(r.flags);
  return {
    version: 1,
    language: pick(r.language, ['en', 'de'] as const, d.language),
    pseudoLocalization: bool(r.pseudoLocalization, false),
    audio: {
      master: num(audio.master, 0, 1, d.audio.master),
      music: num(audio.music, 0, 1, d.audio.music),
      sfx: num(audio.sfx, 0, 1, d.audio.sfx),
      ambience: num(audio.ambience, 0, 1, d.audio.ambience),
      voice: num(audio.voice, 0, 1, d.audio.voice),
      mono: bool(audio.mono, false),
    },
    subtitles: {
      enabled: bool(sub.enabled, true),
      size: num(sub.size, 0.75, 2, 1),
      background: num(sub.background, 0, 1, d.subtitles.background),
      speakerNames: bool(sub.speakerNames, true),
    },
    camera: {
      mouseSensitivity: num(cam.mouseSensitivity, 0.1, 3, 1),
      stickSensitivity: num(cam.stickSensitivity, 0.1, 3, 1),
      invertY: bool(cam.invertY, false),
      shake: bool(cam.shake, true),
      motionBlur: bool(cam.motionBlur, false),
      fov: num(cam.fov, 50, 90, 65),
    },
    accessibility: {
      textScale: num(acc.textScale, 1, 2, 1),
      uiScale: num(acc.uiScale, 0.8, 1.5, 1),
      highContrast: bool(acc.highContrast, false),
      colorIndependentCues: bool(acc.colorIndependentCues, true),
      holdMode: pick(acc.holdMode, ['hold', 'toggle'] as const, 'hold'),
      flashReduction: bool(acc.flashReduction, false),
      aimAssist: pick(acc.aimAssist, ['off', 'low', 'high'] as const, 'low'),
      hintMode: pick(acc.hintMode, ['off', 'manual', 'escalating'] as const, 'manual'),
      hudMode: pick(acc.hudMode, ['dynamic', 'persistent'] as const, 'dynamic'),
      objectiveTracking: bool(acc.objectiveTracking, true),
    },
    gameplay: { rewindWindow: num(gp.rewindWindow, 3, 10, 6) },
    graphics: {
      quality: pick(gfx.quality, ['low', 'medium', 'high'] as const, 'medium'),
      fpsCap: gfx.fpsCap === 30 ? 30 : 60,
      brightness: num(gfx.brightness, 0.6, 1.6, 1),
    },
    input: { bindings: sanitizeBindings(obj(r.input).bindings) },
    flags: {
      firstLaunchDone: bool(flags.firstLaunchDone, false),
      photosensitivityAcknowledged: bool(flags.photosensitivityAcknowledged, false),
    },
  };
}

export type SettingsListener = (s: Settings) => void;

export class SettingsService {
  private current: Settings;
  private listeners = new Set<SettingsListener>();

  constructor(private storage: StorageAdapter) {
    this.current = this.load();
  }

  private load(): Settings {
    const raw = this.storage.read(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    try {
      return sanitizeSettings(JSON.parse(raw));
    } catch {
      return defaultSettings();
    }
  }

  get(): Settings {
    return this.current;
  }

  /** Apply a change, persist immediately and notify listeners (live preview, UC-06). */
  update(mutator: (draft: Settings) => void): Settings {
    const draft = structuredClone(this.current);
    mutator(draft);
    this.current = sanitizeSettings(draft);
    this.persist();
    for (const fn of this.listeners) fn(this.current);
    return this.current;
  }

  replace(next: Settings): void {
    this.current = sanitizeSettings(next);
    this.persist();
    for (const fn of this.listeners) fn(this.current);
  }

  resetToDefaults(keepFlags = true): void {
    const flags = this.current.flags;
    const d = defaultSettings();
    if (keepFlags) d.flags = { ...flags };
    this.replace(d);
  }

  subscribe(fn: SettingsListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private persist(): void {
    try {
      this.storage.write(SETTINGS_KEY, JSON.stringify(this.current));
    } catch {
      /* settings write failure must never crash the game */
    }
  }
}

/** Accessibility presets assist but never replace granular settings (UX §6). */
export const PRESETS: Record<string, (s: Settings) => void> = {
  lowVision: (s) => {
    s.accessibility.textScale = 1.5;
    s.subtitles.size = 1.5;
    s.subtitles.background = 0.9;
    s.accessibility.highContrast = true;
    s.accessibility.hudMode = 'persistent';
  },
  motionComfort: (s) => {
    s.camera.shake = false;
    s.camera.motionBlur = false;
    s.accessibility.flashReduction = true;
    s.camera.fov = 75;
  },
  reducedDexterity: (s) => {
    s.accessibility.holdMode = 'toggle';
    s.accessibility.aimAssist = 'high';
    s.accessibility.hintMode = 'escalating';
  },
};
