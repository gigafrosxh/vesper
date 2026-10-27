import { STRINGS_EN } from '../content/strings.en';
import { STRINGS_DE } from '../content/strings.de';
import type { Language } from '../settings/settings';

// Externalized localization tables (FR-020 prepared) with a pseudo-localization mode for UX-07.

export type StringKey = keyof typeof STRINGS_EN;
type Table = Partial<Record<StringKey, string>>;

const TABLES: Record<Language, Table> = { en: STRINGS_EN, de: STRINGS_DE };

let language: Language = 'en';
let pseudo = false;

export function setLanguage(lang: Language): void {
  language = lang;
}

export function getLanguage(): Language {
  return language;
}

export function setPseudoLocalization(on: boolean): void {
  pseudo = on;
}

const ACCENTS: Record<string, string> = {
  a: 'á', e: 'é', i: 'í', o: 'ö', u: 'ü', c: 'ç', n: 'ñ', A: 'Å', E: 'É', I: 'Î', O: 'Ø', U: 'Û', y: 'ý',
};

/** Accents letters and pads the string by ~30% so clipping shows up in tests (UX-07). */
export function pseudoLocalize(s: string): string {
  let out = '';
  let inParam = false;
  for (const ch of s) {
    if (ch === '{') inParam = true;
    out += inParam ? ch : (ACCENTS[ch] ?? ch);
    if (ch === '}') inParam = false;
  }
  const pad = Math.ceil(s.length * 0.3);
  return `[${out}${'·'.repeat(pad)}]`;
}

export function hasKey(key: string): key is StringKey {
  return key in STRINGS_EN;
}

export function t(key: StringKey | string, params?: Record<string, string | number>): string {
  const table = TABLES[language];
  let s: string = (table as Record<string, string>)[key] ?? (STRINGS_EN as Record<string, string>)[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return pseudo ? pseudoLocalize(s) : s;
}

/** Keys present in English but missing in another table (used by a unit test to keep tables complete). */
export function missingKeys(lang: Language): string[] {
  const table = TABLES[lang] as Record<string, string>;
  return Object.keys(STRINGS_EN).filter((k) => !(k in table));
}
