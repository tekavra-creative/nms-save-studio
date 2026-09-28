import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

// Real preview against a real save — never presses Write, which commits to a NEW slot (never the
// original), but still touches disk.
test('story skip: preview shows real mission-progress data, never writes', async () => {
  test.setTimeout(60000);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined)) as Record<string, string>;
  const app = await electron.launch({ args: [join(import.meta.dirname, '../out/main/index.js')], env });
  const win = await app.firstWindow();
  await win.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  win.on('pageerror', (e) => errors.push(e.message));

  const saves = win.getByRole('list', { name: 'Saves' });
  await expect(saves.getByRole('button').first()).toBeVisible({ timeout: 15000 });

  await win.getByRole('button', { name: /Skip the story/ }).first().click();
  const panel = win.locator('.survival-panel');
  await expect(panel).toBeVisible({ timeout: 10000 });

  // real data, not placeholders: some steps to fill, a real from/to mission id pair, a real slot number
  const text = await panel.innerText();
  expect(text).toMatch(/Fills \d+ steps? —/);
  expect(text).toMatch(/Moves the story from \^\S+ to \^\S+/);
  expect(text).toMatch(/Write to slot \d+/);

  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toHaveCount(0);

  expect(errors).toEqual([]);
  await app.close();
});
