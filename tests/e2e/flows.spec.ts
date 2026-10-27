import { expect, test } from '@playwright/test';
import { choose, press, toMainMenu, trackErrors } from './helpers';

declare global {
  interface Window {
    __vesper: any;
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-init')) {
      localStorage.clear();
      sessionStorage.setItem('e2e-init', '1');
    }
  });
});

test('first launch: photosensitivity warning, quick setup and a new game with keyboard only (UX §2)', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await toMainMenu(page);
  // No valid save yet, so "Continue" is not offered.
  await expect(page.getByTestId('btn-continue')).toHaveCount(0);
  await choose(page, 'new');
  await expect(page.getByTestId('screen-slots-new')).toBeVisible();
  await choose(page, 'slot1');
  await expect(page.locator('.screens .screen')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__vesper.state)).toBe('game');
  // The intro plays and the simulation advances.
  const t0 = await page.evaluate(() => window.__vesper.sim.time);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__vesper.sim.time)).toBeGreaterThan(t0);
  // Pause menu opens and pauses the simulation; resume with the back key.
  await press(page, 'Escape');
  await expect(page.getByTestId('screen-pause')).toBeVisible();
  const paused = await page.evaluate(() => window.__vesper.sim.time);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__vesper.sim.time)).toBe(paused);
  await choose(page, 'resume');
  await expect(page.getByTestId('screen-pause')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('settings persist and the main menu is navigable with the mouse too', async ({ page }) => {
  await page.goto('/');
  await toMainMenu(page);
  await page.getByTestId('btn-settings').click();
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  await page.getByTestId('btn-back').click();
  await expect(page.getByTestId('screen-main')).toBeVisible();
  await page.reload();
  // After the first launch the quick setup is skipped.
  await expect(page.getByTestId('screen-splash')).toBeVisible({ timeout: 30_000 });
  await press(page, 'Enter');
  await expect(page.getByTestId('screen-main')).toBeVisible();
});

test('a corrupt save is recovered from its backup and never crashes the game (NFR-02, TC-SAVE)', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await toMainMenu(page);
  await choose(page, 'new');
  await choose(page, 'slot1');
  await expect.poll(() => page.evaluate(() => window.__vesper.state)).toBe('game');
  // Two checkpoints so a backup copy exists, then damage the main file.
  await page.evaluate(() => {
    window.__vesper.writeCheckpoint();
    window.__vesper.writeCheckpoint();
    const raw = localStorage.getItem('vesper:slot1')!;
    localStorage.setItem('vesper:slot1', raw.slice(0, raw.length / 2));
  });
  expect(await page.evaluate(() => localStorage.getItem('vesper:slot1.bak'))).not.toBeNull();
  await page.reload();
  await toMainMenu(page);
  await choose(page, 'load');
  await expect(page.getByTestId('btn-slot1')).toContainText(/recovered|wiederhergestellt/i);
  await choose(page, 'slot1');
  await expect.poll(() => page.evaluate(() => window.__vesper.state)).toBe('game');
  await expect(page.locator('.hud')).toContainText(/recovered|wiederhergestellt/i);
  // The slot was repaired.
  expect(await page.evaluate(() => window.__vesper.saves.load(1).status)).toBe('ok');
  expect(errors).toEqual([]);
});

test('a save without any valid copy is reported as corrupt and cannot be loaded', async ({ page }) => {
  await page.goto('/');
  await toMainMenu(page);
  await page.evaluate(() => localStorage.setItem('vesper:slot2', '{"broken":'));
  await page.reload();
  await toMainMenu(page);
  await choose(page, 'load');
  await expect(page.getByTestId('btn-slot2')).toContainText(/damaged|beschädigt/i);
  await expect(page.getByTestId('btn-slot2')).toBeDisabled();
});

test('pseudo-localization shows every UI string through the localization layer (UX-07)', async ({ page }) => {
  await page.goto('/');
  await toMainMenu(page);
  await page.evaluate(() => window.__vesper.settings.update((d: any) => (d.pseudoLocalization = true)));
  await choose(page, 'settings');
  const screens = page.locator('.screens');
  for (let tab = 0; tab < 6; tab++) {
    const texts = await page.locator('.screen:not(.hidden) .item .label, .screen:not(.hidden) h1').allInnerTexts();
    for (const s of texts) {
      if (!s.trim()) continue;
      expect(s, `string "${s}" is not localized`).toMatch(/^\[.*\]$/s);
    }
    // No raw keys leak into the UI.
    expect(await screens.innerText()).not.toMatch(/\b[a-z]+\.[a-z_]+[a-z]\b(?!\.)/);
    await press(page, 'KeyE');
  }
});
