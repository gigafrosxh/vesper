import { expect, test, type Page } from '@playwright/test';

// TC-INPUT-02 / UX-01: every primary flow works with a controller only. A virtual standard-mapping
// gamepad replaces navigator.getGamepads(); the keyboard and mouse are never touched.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const pad = {
      id: 'Virtual Xbox Controller (STANDARD GAMEPAD)',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    (window as any).__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad, null, null, null] });
  });
});

/** Presses a button until the game has polled it, then releases it (frames are slow with software GL). */
async function button(page: Page, index: number): Promise<void> {
  const seen = (down: boolean) =>
    page.waitForFunction(
      ([i, d]) => {
        const input = (window as any).__vesper.input;
        // A press that opens a screen moves the button to the suppressed set until it is polled up.
        const held = input.down.has(`Pad${i}`) || input.suppressed.has(`Pad${i}`);
        return d ? held : !held;
      },
      [index, down] as const,
      { timeout: 10_000 },
    );
  await page.evaluate((i) => Object.assign((window as any).__pad.buttons[i], { pressed: true, value: 1 }), index);
  await seen(true);
  await page.evaluate((i) => Object.assign((window as any).__pad.buttons[i], { pressed: false, value: 0 }), index);
  await seen(false);
  await page.waitForTimeout(150);
}

const A = 0;
const START = 9;
const DOWN = 13;

async function padChoose(page: Page, id: string): Promise<void> {
  await expect(page.locator(`.screen:not(.hidden) [data-item="${id}"]`)).toBeVisible({ timeout: 20_000 });
  for (let i = 0; i < 40; i++) {
    const focused = await page.locator('.screen:not(.hidden) .item.focused').getAttribute('data-item').catch(() => null);
    if (focused === id) return button(page, A);
    await button(page, DOWN);
  }
  throw new Error(`could not focus ${id}`);
}

test('controller only: setup, menus, new game, pause and readable button prompts (TC-INPUT-02, UX-01)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await expect(page.getByTestId('screen-splash')).toBeVisible({ timeout: 30_000 });
  await button(page, A);
  await expect(page.getByTestId('screen-quick')).toBeVisible();
  await padChoose(page, 'start');
  await expect(page.getByTestId('screen-main')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__vesper.input.lastDevice)).toBe('gamepad');
  await padChoose(page, 'settings');
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  await button(page, 1); // B = back
  await expect(page.getByTestId('screen-main')).toBeVisible();
  await padChoose(page, 'new');
  await padChoose(page, 'slot1');
  await expect.poll(() => page.evaluate(() => (window as any).__vesper.state)).toBe('game');
  // Prompts name controller buttons, not keyboard keys.
  const keys = await page.evaluate(() => (window as any).__vesper.ui.keys());
  expect(keys.interact).toBe('[Y]');
  expect(keys.uiConfirm).toBe('[A]');
  expect(keys.move).toBe('[L-Stick]');
  await button(page, START);
  await expect(page.getByTestId('screen-pause')).toBeVisible();
  await padChoose(page, 'resume');
  await expect(page.getByTestId('screen-pause')).toHaveCount(0);
  expect(errors).toEqual([]);
});
