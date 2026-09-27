import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';

const SHOTS = process.env.NSS_SHOTS ?? join(import.meta.dirname, '../test-results/shots');

async function launch() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined)) as Record<string, string>;
  const app = await electron.launch({ args: [join(import.meta.dirname, '../out/main/index.js')], env });
  const win = await app.firstWindow();
  await win.setViewportSize({ width: 1440, height: 900 });
  return { app, win };
}

async function openStudio(win: Page) {
  const saves = win.getByRole('list', { name: 'Saves' });
  await expect(saves.getByRole('button').first()).toBeVisible({ timeout: 15000 });
  await saves.getByRole('button', { name: /Ralfar system/ }).first().click();
  await saves.getByRole('button', { name: /Space Anomaly/ }).first().click();
  await win.getByRole('button', { name: /Open Merge Studio/ }).click();
  await expect(win.getByRole('heading', { name: /New save/ })).toBeVisible({ timeout: 15000 });
}

test('merge studio: pick saves, stage a ship with the keyboard, undo — writes nothing', async () => {
  const { app, win } = await launch();
  await win.screenshot({ path: join(SHOTS, 'home.png') });
  await openStudio(win);
  await win.screenshot({ path: join(SHOTS, 'studio.png') });
  const changesCount = win.locator('.c-head .n');
  await expect(changesCount).toHaveText('0');
  const tile = win.locator('[data-src-item]:not([aria-disabled="true"])').first();
  await tile.focus();
  await win.keyboard.press('Enter');
  await expect(changesCount).toHaveText('1', { timeout: 5000 });
  await win.waitForTimeout(900);
  await win.screenshot({ path: join(SHOTS, 'studio-staged.png') });
  await win.keyboard.press('Meta+z');
  await expect(changesCount).toHaveText('0', { timeout: 5000 });
  await app.close();
});
