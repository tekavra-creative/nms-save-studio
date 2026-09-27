import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

// Runs against the real save folder. Browses and edits IN MEMORY only — never presses Write,
// which (unlike Merge Studio) writes back into the ORIGINAL file, not a new slot.
const SHOTS = process.env.NSS_SHOTS ?? join(import.meta.dirname, '../../../.cache/shots');

test('Raw Explorer: browse any field, edit a leaf, undo — never writes', async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined)) as Record<string, string>;
  const app = await electron.launch({ args: [join(import.meta.dirname, '../out/main/index.js')], env });
  const win = await app.firstWindow();
  await win.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  win.on('pageerror', (e) => errors.push(e.message));

  const saves = win.getByRole('list', { name: 'Saves' });
  await expect(saves.getByRole('button').first()).toBeVisible({ timeout: 15000 });

  await win.getByRole('button', { name: /Browse every field/ }).first().click();
  const rows = win.getByRole('list', { name: 'Fields' });
  await expect(rows.getByRole('button').first()).toBeVisible({ timeout: 15000 });
  await win.screenshot({ path: join(SHOTS, 'explorer-root.png') });
  const rootCount = await rows.getByRole('button').count();
  expect(rootCount).toBeGreaterThan(5);

  // Walk into the first container row (object or array), whatever it happens to be — proves
  // this isn't hardcoded to one known field name.
  let containerIndex = -1;
  for (let i = 0; i < rootCount; i++) {
    const cls = await rows.getByRole('button').nth(i).getAttribute('class');
    if (cls?.includes('kind-object') || cls?.includes('kind-array')) {
      containerIndex = i;
      break;
    }
  }
  expect(containerIndex).toBeGreaterThanOrEqual(0);
  const containerName = (await rows.getByRole('button').nth(containerIndex).locator('.name').textContent())!.trim();
  await rows.getByRole('button').nth(containerIndex).click();
  await expect(win.locator('.explorer-crumbs')).toContainText(containerName);
  await win.screenshot({ path: join(SHOTS, 'explorer-nested.png') });

  // Back out via the breadcrumb, then find a leaf at the root and edit it in memory.
  await win.locator('.explorer-crumbs button').first().click();
  let leafIndex = -1;
  const rootRows = rows.getByRole('button');
  const n2 = await rootRows.count();
  for (let i = 0; i < n2; i++) {
    const cls = await rootRows.nth(i).getAttribute('class');
    if (cls?.includes('kind-number') || cls?.includes('kind-string') || cls?.includes('kind-boolean')) {
      leafIndex = i;
      break;
    }
  }
  expect(leafIndex).toBeGreaterThanOrEqual(0);
  await rootRows.nth(leafIndex).click();
  const editor = win.locator('.explorer-editor');
  await expect(editor).toBeVisible();
  await win.screenshot({ path: join(SHOTS, 'explorer-editor.png') });

  const kindText = (await editor.locator('.meta').textContent())!.trim();
  if (kindText !== 'boolean' && kindText !== 'null') {
    const input = editor.locator('input');
    const before = await input.inputValue();
    await input.fill(kindText === 'number' ? '424242' : 'nms-save-studio-e2e');
    await editor.getByRole('button', { name: 'Set' }).click();
    await expect(editor).toHaveCount(0);
    await expect(win.locator('.explorer-foot button', { hasText: 'Undo' })).toBeEnabled();
    await win.locator('.explorer-foot button', { hasText: 'Undo' }).click();
    await expect(win.locator('.explorer-foot button', { hasText: 'Undo' })).toBeDisabled();
    void before; // read for clarity only; the undo assertion above is the real proof
  } else {
    await editor.getByRole('button', { name: 'Cancel' }).click();
  }

  // Never press Write in this test — it commits in place into the real save file.
  await expect(win.locator('.explorer-foot button.write')).toBeVisible();

  await win.locator('.explorer .back').click();
  await expect(saves.getByRole('button').first()).toBeVisible();

  expect(errors).toEqual([]);
  await app.close();
});
