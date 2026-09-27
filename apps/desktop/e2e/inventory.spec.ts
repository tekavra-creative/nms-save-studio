import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('inventory grid: browse containers, edit an existing slot, fill an empty one, clear it, undo — never writes', async () => {
  test.setTimeout(60000);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined)) as Record<string, string>;
  const app = await electron.launch({ args: [join(import.meta.dirname, '../out/main/index.js')], env });
  const win = await app.firstWindow();
  await win.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  win.on('pageerror', (e) => errors.push(e.message));

  const saves = win.getByRole('list', { name: 'Saves' });
  await expect(saves.getByRole('button').first()).toBeVisible({ timeout: 15000 });
  await win.getByRole('button', { name: /Browse every field/ }).first().click();
  await expect(win.getByRole('list', { name: 'Fields' }).getByRole('button').first()).toBeVisible({ timeout: 15000 });

  await win.getByRole('tab', { name: 'Inventories' }).click();
  const containers = win.getByRole('list', { name: 'Inventory containers' });
  await expect(containers.getByRole('button').first()).toBeVisible({ timeout: 15000 });
  // real containers for this save, not a hardcoded fixed list
  expect(await containers.getByRole('button').count()).toBeGreaterThan(5);

  await containers.getByRole('button', { name: /Exosuit — General/ }).click();
  const full = win.locator('.inv-cell.is-full');
  await expect(full.first()).toBeVisible({ timeout: 10000 });
  const before = await full.count();

  // 1) change an existing slot's amount (server clamps to the item's real max stack)
  const beforeAmt = await full.first().locator('.amt').textContent();
  await full.first().click();
  const amountInput = win.locator('.inv-editor input[type="number"]');
  await expect(amountInput).toBeVisible();
  await amountInput.fill('1');
  await win.getByRole('button', { name: 'Set', exact: true }).click();
  await expect(full.first().locator('.amt')).toHaveText('1');
  expect(await full.first().locator('.amt').textContent()).not.toBe(beforeAmt);
  await expect(win.locator('.explorer-foot button', { hasText: 'Undo' })).toBeEnabled();

  // 2) fill an empty unlocked cell with a real item, found via the real search index
  await win.locator('.inv-cell.is-empty').first().click();
  await win.getByPlaceholder('Search items…').fill('carbon');
  const hit = win.locator('.inv-picker-hits button').first();
  await expect(hit).toBeVisible({ timeout: 5000 });
  await hit.click();
  await win.locator('.inv-editor input[type="number"]').fill('250');
  await win.getByRole('button', { name: 'Set', exact: true }).click();
  await expect(full).toHaveCount(before + 1);

  // 3) clear a slot back out
  await full.first().click();
  await win.getByRole('button', { name: 'Remove' }).click();
  await expect(full).toHaveCount(before);

  // 4) undo everything — exactly 3 edits were made above. Never presses Write, which would
  // commit into the real save.
  const undoBtn = win.locator('.explorer-foot button', { hasText: 'Undo' });
  for (let i = 0; i < 3; i++) {
    await expect(undoBtn).toBeEnabled();
    await undoBtn.click();
  }
  await expect(undoBtn).toBeDisabled();

  expect(errors).toEqual([]);
  await app.close();
});
