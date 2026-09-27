import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Every skin must pass the same flow and the same layout guards. Never presses Write.
const SHOTS = process.env.NSS_SHOTS ?? join(import.meta.dirname, '../test-results/skins');

let app: ElectronApplication;
let win: Page;
const errors: string[] = [];

test.beforeAll(async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined)) as Record<string, string>;
  app = await electron.launch({ args: [join(import.meta.dirname, '../out/main/index.js')], env });
  win = await app.firstWindow();
  await win.setViewportSize({ width: 1440, height: 900 });
  win.on('pageerror', (e) => errors.push(e.message));
  win.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
});

test.afterAll(async () => {
  await win.evaluate(() => localStorage.removeItem('nss.skin'));
  await app.close();
});

async function skinIds(): Promise<string[]> {
  await expect(win.getByRole('radiogroup', { name: 'Skin' })).toBeVisible({ timeout: 15000 });
  return win.getByRole('radiogroup', { name: 'Skin' }).getByRole('radio').evaluateAll((els) => els.map((e) => e.textContent!.trim().toLowerCase()));
}

/** Layout guards that catch whole classes of skin bugs. */
async function guard(label: string) {
  const bad = await win.evaluate(() => {
    const out: string[] = [];
    const vw = innerWidth;
    const vh = innerHeight;
    if (document.documentElement.scrollWidth > vw + 1) out.push(`horizontal overflow ${document.documentElement.scrollWidth}px`);
    for (const svg of document.querySelectorAll<SVGElement>('.ch svg, .cat svg, .g-row svg, .vrow svg, .val svg, .soft svg, .rev svg')) {
      const r = svg.getBoundingClientRect();
      if (r.width > 48 || r.height > 48) out.push(`oversized icon ${Math.round(r.width)}×${Math.round(r.height)} in ${svg.parentElement?.className}`);
    }
    for (const el of document.querySelectorAll<HTMLElement>('.top, .stage, .hero, .orbit, .changes, .home-stage')) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.bottom > vh + 1) out.push(`${el.className} extends off-screen (${Math.round(r.right)}×${Math.round(r.bottom)})`);
      if (r.height < 40) out.push(`${el.className} collapsed to ${Math.round(r.height)}px`);
    }
    return out;
  });
  expect(bad, label).toEqual([]);
}

test('every skin: home, merge studio, stage + undo, currencies, palette — clean layout, no errors', async () => {
  mkdirSync(SHOTS, { recursive: true });
  const ids = await skinIds();
  expect(ids.length).toBeGreaterThanOrEqual(2);
  for (const id of ids) {
    await win.evaluate((s) => localStorage.setItem('nss.skin', s), id);
    await win.reload();
    await expect(win.locator(`html[data-skin="${id}"]`)).toHaveCount(1);
    const saves = win.getByRole('list', { name: 'Saves' });
    await expect(saves.getByRole('button').first()).toBeVisible({ timeout: 15000 });
    await guard(`${id}: home`);
    await win.screenshot({ path: join(SHOTS, `${id}-home.png`) });

    await saves.getByRole('button', { name: /Ralfar system/ }).first().click();
    await saves.getByRole('button', { name: /Space Anomaly/ }).first().click();
    await win.getByRole('button', { name: /Open Merge Studio/ }).click();
    await expect(win.getByRole('heading', { name: /New save/ })).toBeVisible({ timeout: 15000 });
    await guard(`${id}: studio`);

    const count = win.locator('.c-head .n');
    await expect(count).toHaveText('0');
    await win.locator('[data-src-item]:not([aria-disabled="true"])').first().focus();
    await win.keyboard.press('Enter');
    await expect(count).toHaveText('1', { timeout: 5000 });
    await win.waitForTimeout(1000);
    await guard(`${id}: staged`);
    await win.screenshot({ path: join(SHOTS, `${id}-staged.png`) });

    await win.keyboard.press('4');
    await expect(win.locator('.vrow').first()).toBeVisible();
    await guard(`${id}: currencies`);
    await win.screenshot({ path: join(SHOTS, `${id}-currencies.png`) });

    await win.keyboard.press('Meta+k');
    const box = win.locator('.cmdk-box');
    await expect(box).toBeVisible();
    const r = (await box.boundingBox())!;
    expect(r.x >= 0 && r.y >= 0 && r.x + r.width <= 1440 && r.y + r.height <= 900, `${id}: palette on screen`).toBe(true);
    await win.screenshot({ path: join(SHOTS, `${id}-palette.png`) });
    await win.keyboard.press('Escape');
    await expect(box).toHaveCount(0);

    await win.keyboard.press('Meta+z');
    await expect(count).toHaveText('0', { timeout: 5000 });
    await win.locator('.back').click();
    await expect(saves.getByRole('button').first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});
