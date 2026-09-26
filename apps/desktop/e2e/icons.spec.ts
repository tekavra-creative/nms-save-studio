import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('nms-icon:// serves real game icons and refuses other paths', async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined)) as Record<string, string>;
  const app = await electron.launch({ args: [join(import.meta.dirname, '../out/main/index.js')], env });
  const win = await app.firstWindow();
  const result = await win.evaluate(async () => {
    const load = (src: string) =>
      new Promise<{ ok: boolean; w: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ ok: true, w: img.naturalWidth });
        img.onerror = () => resolve({ ok: false, w: 0 });
        img.src = src;
      });
    return {
      real: await load('nms-icon://icon/textures/ui/frontend/icons/u4substances/substance.exred.2.dds'),
      outside: await load('nms-icon://icon/metadata/reality/tables/nms_reality_gcproducttable.mbin'),
      traversal: await load('nms-icon://icon/textures/ui/frontend/icons/../../../../metadata/x.dds'),
    };
  });
  expect(result.real).toEqual({ ok: true, w: 256 });
  expect(result.outside.ok).toBe(false);
  expect(result.traversal.ok).toBe(false);
  await app.close();
});
