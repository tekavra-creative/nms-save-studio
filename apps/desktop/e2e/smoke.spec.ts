import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

const SHOTS = process.env.NSS_SHOTS ?? join(import.meta.dirname, '../../../.cache/shots');

test('app lists real saves and opens an overview', async () => {
  // VS Code sets ELECTRON_RUN_AS_NODE for child processes, which turns Electron into plain Node.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined)) as Record<string, string>;
  const app = await electron.launch({ args: [join(import.meta.dirname, '../out/main/index.js')], env });
  const win = await app.firstWindow();
  await win.setViewportSize({ width: 1440, height: 900 });
  const saves = win.getByRole('region', { name: 'Saves' });
  await expect(saves.getByRole('button').first()).toBeVisible({ timeout: 15000 });
  await win.screenshot({ path: join(SHOTS, 'home.png') });
  await saves.getByRole('button').first().click();
  await expect(win.getByRole('heading', { name: /Starships/ })).toBeVisible({ timeout: 15000 });
  await win.screenshot({ path: join(SHOTS, 'overview.png') });
  const errors: string[] = [];
  win.on('pageerror', (e) => errors.push(e.message));
  expect(errors).toEqual([]);
  await app.close();
});
