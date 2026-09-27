import { _electron as electron, expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const APP = join(import.meta.dirname, '../dist-app/mac-arm64/NMS Save Studio.app/Contents/MacOS/NMS Save Studio');

test.skip(!existsSync(APP), 'packaged app not built');

test('packaged Mac app launches and lists saves', async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined)) as Record<string, string>;
  const app = await electron.launch({ executablePath: APP, env });
  const win = await app.firstWindow();
  await expect(win.getByRole('region', { name: 'Saves' }).getByRole('button').first()).toBeVisible({ timeout: 20000 });
  await app.close();
});
