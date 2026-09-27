// Builds (or reuses a cached) facts pack from the user's OWN game install and checks it end to end.
// Skipped entirely when there is no install and no pre-built cache — CI and other machines.
// Nothing this test reads or writes ever lands inside the repository.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countItems, lookupItem, lookupText } from '@nss/gamedata';
import { nssCacheDir } from '@nss/gamedata/node';
import { buildFacts } from '../src/facts/build.ts';
import { defaultBanksDir } from '../src/install.ts';

const banksDir = defaultBanksDir();
const hasInstall = existsSync(join(banksDir, 'NMSARC.Precache.pak')) && existsSync(join(banksDir, 'NMSARC.Language.pak'));
const cacheRoot = nssCacheDir();
const hasCache = existsSync(join(cacheRoot, 'gamedata'));

describe.skipIf(!hasInstall && !hasCache)('real install: facts pack', () => {
  it('builds (or reuses) a pack with thousands of real items that resolve', async () => {
    const result = await buildFacts({ log: () => {} });
    const { pack } = result;

    expect(pack.version).toBe(1);
    const total = Object.values(countItems(pack)).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(3000);
    expect(Object.keys(pack.items).length).toBe(total);

    // A handful of ids that have been stable across NMS updates for years.
    for (const id of ['FUEL1', 'OXYGEN', 'CARBON_SEAL']) {
      const hit = lookupItem(pack, id);
      expect(hit.known, `${id} should resolve`).toBe(true);
      expect(hit.item?.name.length ?? 0).toBeGreaterThan(0);
    }

    // Every id actually in the pack must resolve through the public lookup, not just by direct index.
    const sampleIds = Object.keys(pack.items).slice(0, 25);
    for (const id of sampleIds) {
      const hit = lookupItem(pack, `^${id}`);
      expect(hit.known, id).toBe(true);
      expect(hit.item?.id).toBe(id);
    }

    // Pet species localisation text seen in saves (`^UI_GLOWPET_SPECIES`) must resolve to real text.
    expect(lookupText(pack, '^UI_GLOWPET_SPECIES')).toBeTruthy();
  }, 60_000);
});
