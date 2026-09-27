import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('survival check: pick two saves, run the check, see a real report', async () => {
  test.setTimeout(60000);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined)) as Record<string, string>;
  const app = await electron.launch({ args: [join(import.meta.dirname, '../out/main/index.js')], env });
  const win = await app.firstWindow();
  await win.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  win.on('pageerror', (e) => errors.push(e.message));

  const saves = win.getByRole('list', { name: 'Saves' });
  await expect(saves.getByRole('button').first()).toBeVisible({ timeout: 15000 });

  await saves.getByRole('button', { name: /Ralfar system/ }).first().click();
  await saves.getByRole('button', { name: /Space Anomaly/ }).first().click();

  const check = win.getByRole('button', { name: 'Check survival' });
  await expect(check).toBeEnabled();
  await check.click();

  const panel = win.locator('.survival-panel');
  await expect(panel).toBeVisible({ timeout: 15000 });
  await expect(panel.locator('h3')).toContainText('/');
  const rows = panel.locator('li');
  expect(await rows.count()).toBeGreaterThan(0);
  // every row is a real check: a group label and either a ✓ or ✗ mark, never blank
  const marks = await panel.locator('.mark').allTextContents();
  expect(marks.every((m) => m === '✓' || m === '✗')).toBe(true);

  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toHaveCount(0);

  expect(errors).toEqual([]);
  await app.close();
});
