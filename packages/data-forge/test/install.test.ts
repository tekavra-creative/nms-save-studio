// Smoke tests against the user's own game install. Skipped when it is absent (CI, other machines).
// Nothing read here is written to disk.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeDds } from '../src/dds.ts';
import { HgPak } from '../src/hgpak.ts';
import { defaultBanksDir } from '../src/install.ts';

const banks = defaultBanksDir();
const texUi = join(banks, 'NMSARC.TexUI.pak');
const precache = join(banks, 'NMSARC.Precache.pak');
const MBIN_MAGIC = new Uint8Array(8).fill(0xcc);

describe.skipIf(!existsSync(texUi))('real install: UI icons', () => {
  it('opens the TexUI index and decodes a frontend icon', async () => {
    const pak = await HgPak.open(texUi);
    try {
      const icon = pak.entries.find((e) => e.path.startsWith('textures/ui/frontend/icons/') && e.path.endsWith('.dds'));
      expect(icon).toBeDefined();
      expect(pak.verifyHash(icon!)).toBe(true);
      const img = decodeDds(await pak.read(icon!));
      expect(img.width).toBeGreaterThan(0);
      expect(img.data.length).toBe(img.width * img.height * 4);
    } finally {
      await pak.close();
    }
  });
});

describe.skipIf(!existsSync(precache))('real install: item tables', () => {
  it('finds the product, technology and substance tables as MBINs', async () => {
    const pak = await HgPak.open(precache);
    try {
      for (const name of ['gcproducttable', 'gctechnologytable', 'gcsubstancetable']) {
        const entry = pak.get(`metadata/reality/tables/nms_reality_${name}.mbin`);
        expect(entry, name).toBeDefined();
        const bytes = await pak.read(entry!);
        expect(bytes.subarray(0, 8)).toEqual(MBIN_MAGIC);
      }
    } finally {
      await pak.close();
    }
  });
});
