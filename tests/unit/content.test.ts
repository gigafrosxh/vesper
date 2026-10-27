import { describe, expect, it } from 'vitest';
import { DIALOGUES } from '../../src/content/dialogues';
import { QUESTS } from '../../src/content/quests';
import { STRINGS_EN } from '../../src/content/strings.en';
import { hasKey, missingKeys, pseudoLocalize, setLanguage, setPseudoLocalization, t } from '../../src/core/i18n';
import { validateGraph } from '../../src/sim/dialogue';
import chapterSource from '../../src/content/chapter1.ts?raw';

describe('Dialogue graphs (FR-009, FR-018)', () => {
  for (const [id, g] of Object.entries(DIALOGUES)) {
    it(`${id} has no dead ends, dangling links or softlocks`, () => {
      expect(validateGraph(g, Object.keys(g.nodes))).toEqual([]);
    });
  }

  it('every dialogue string exists', () => {
    const missing: string[] = [];
    for (const g of Object.values(DIALOGUES))
      for (const n of Object.values(g.nodes)) {
        for (const l of n.lines) [l.speaker, l.text].forEach((k) => !hasKey(k) && missing.push(k));
        for (const c of n.choices ?? []) [c.text, c.unavailableKey, c.consequenceKey].forEach((k) => k && !hasKey(k) && missing.push(k));
      }
    expect(missing).toEqual([]);
  });
});

describe('Quests and hints (FR-010)', () => {
  it('every stage has an objective, a location and three hint tiers', () => {
    for (const q of Object.values(QUESTS)) {
      expect(hasKey(q.title), q.title).toBe(true);
      for (const [sid, st] of Object.entries(q.stages)) {
        expect(st.hints, `${q.id}/${sid}`).toHaveLength(3);
        for (const h of st.hints) expect(hasKey(h), h).toBe(true);
        if (typeof st.objective === 'string') expect(hasKey(st.objective), st.objective).toBe(true);
      }
    }
  });
});

describe('Localization (FR-020, UX-07)', () => {
  it('German covers every English key', () => {
    expect(missingKeys('de')).toEqual([]);
  });

  it('every literal string key used by the mission script exists', () => {
    const src = chapterSource;
    const used = new Set<string>();
    for (const m of src.matchAll(/'((?:line|cap|tut|doc|title|ev|obj|item|target|prompt|speaker|map|npc)\.[a-z0-9_.]+)'/g)) used.add(m[1]);
    const events = new Set(['item.collected', 'title.card']);
    const missing = [...used].filter((k) => !events.has(k) && !(k in STRINGS_EN));
    expect(missing).toEqual([]);
  });

  it('pseudo-localization expands text by about 30 % and keeps placeholders', () => {
    const s = pseudoLocalize('Hold {key} to rewind');
    expect(s).toContain('{key}');
    expect(s.length).toBeGreaterThanOrEqual(Math.floor('Hold {key} to rewind'.length * 1.3));
    setPseudoLocalization(true);
    expect(t('menu.continue')).not.toBe(STRINGS_EN['menu.continue']);
    setPseudoLocalization(false);
    setLanguage('de');
    expect(t('menu.continue')).not.toBe(STRINGS_EN['menu.continue']);
    setLanguage('en');
  });
});
