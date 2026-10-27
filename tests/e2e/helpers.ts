import { expect, type Page } from '@playwright/test';

// Software-rendered WebGL is slow in CI, so key presses are held long enough to span a frame.
export async function press(page: Page, key: string, hold = 220): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(hold);
  await page.keyboard.up(key);
  await page.waitForTimeout(380);
}

/** Moves the keyboard focus to an item of the visible screen (focus wraps around). */
export async function focusItem(page: Page, id: string, key = 'ArrowDown'): Promise<void> {
  await expect(page.locator(`.screen:not(.hidden) [data-item="${id}"]`)).toBeVisible({ timeout: 20_000 });
  for (let i = 0; i < 40; i++) {
    const focused = await page.locator('.screen:not(.hidden) .item.focused').getAttribute('data-item').catch(() => null);
    if (focused === id) return;
    await press(page, key);
  }
  throw new Error(`could not focus ${id}`);
}

export async function choose(page: Page, id: string): Promise<void> {
  await focusItem(page, id);
  await press(page, 'Enter');
}

/** Splash → (first launch) quick setup → main menu, keyboard only. */
export async function toMainMenu(page: Page): Promise<void> {
  await expect(page.getByTestId('screen-splash')).toBeVisible({ timeout: 30_000 });
  await press(page, 'Enter');
  const next = page.getByTestId('screen-quick').or(page.getByTestId('screen-main'));
  await expect(next).toBeVisible();
  if (await page.getByTestId('screen-quick').isVisible()) await choose(page, 'start');
  await expect(page.getByTestId('screen-main')).toBeVisible();
}

/** Collects uncaught page errors so every test can assert a clean console. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}
