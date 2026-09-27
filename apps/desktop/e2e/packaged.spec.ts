import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP = join(import.meta.dirname, '../dist-app/mac-arm64/NMS Save Studio.app/Contents/MacOS/NMS Save Studio');

test.skip(!existsSync(APP), 'packaged app not built (run dist:mac first)');

// The packaged app has debugger-attach fuses disabled, so it proves itself: NSS_SELFTEST_SHOT makes it
// wait for the saves list, screenshot its own window, and exit 0 (pass) or 1 (fail).
test('packaged Mac app launches, lists saves, and screenshots itself', async () => {
  const shot = join(mkdtempSync(join(tmpdir(), 'nss-packaged-')), 'packaged.png');
  const env = { ...process.env, NSS_SELFTEST_SHOT: shot };
  delete env.ELECTRON_RUN_AS_NODE;
  const { code, out } = await new Promise<{ code: number | null; out: string }>((resolve) => {
    const child = spawn(APP, [], { env });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('exit', (code) => resolve({ code, out }));
  });
  expect(out).toContain('selftest PASS');
  expect(code).toBe(0);
  expect(statSync(shot).size).toBeGreaterThan(10_000);
});
