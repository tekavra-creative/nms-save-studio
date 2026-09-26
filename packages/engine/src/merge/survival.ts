import { readMultitools, readShips, readCompanions } from '../domains/assets.ts';
import type { SaveReader } from '../domains/reader.ts';
import type { KnownList } from './known.ts';

export interface SurvivalCheck {
  group: 'Starships' | 'Multi-tools' | 'Companions' | 'Knowledge';
  text: string;
  survived: boolean;
}

export interface SurvivalReport {
  checks: SurvivalCheck[];
  survived: number;
  total: number;
}

const shipKey = (r: SaveReader, slot: number) => {
  const n = r.node(['ShipOwnership', slot], r.player);
  return `${r.text(['Resource', 'Filename'], n)}|${r.seed(['Resource', 'Seed'], n)}`;
};

/**
 * After the game has loaded and re-saved a merged save, confirm everything that came from `source`
 * is still present in `merged`. The game silently drops data it rejects, so this is the real proof.
 */
export function checkSurvival(merged: SaveReader, source: SaveReader): SurvivalReport {
  const checks: SurvivalCheck[] = [];

  const mergedShips = new Set(readShips(merged).map((s) => shipKey(merged, s.index)));
  for (const s of readShips(source)) {
    if (/BIGGS/i.test(shipKey(source, s.index))) continue;
    checks.push({ group: 'Starships', text: s.name || s.kind, survived: mergedShips.has(shipKey(source, s.index)) });
  }

  const mergedTools = new Set(readMultitools(merged).map((m) => m.seed));
  for (const m of readMultitools(source)) {
    checks.push({ group: 'Multi-tools', text: `${m.name || 'Multi-tool'} (class ${m.class ?? '?'})`, survived: mergedTools.has(m.seed) });
  }

  const petSeed = (r: SaveReader, slot: number) => r.seed(['Pets', slot, 'CreatureSeed'], r.player);
  const mergedPets = new Set(readCompanions(merged).map((c) => petSeed(merged, c.index)));
  for (const c of readCompanions(source)) {
    checks.push({ group: 'Companions', text: c.name || c.species, survived: mergedPets.has(petSeed(source, c.index)) });
  }

  const lists: [KnownList, string][] = [
    ['KnownTech', 'technologies'],
    ['KnownProducts', 'blueprints'],
    ['KnownSpecials', 'special items'],
    ['KnownRefinerRecipes', 'refiner recipes'],
  ];
  for (const [list, noun] of lists) {
    const have = new Set(merged.items([list], merged.player).map((n) => merged.doc.raw(n)));
    const want = source.items([list], source.player).map((n) => source.doc.raw(n));
    const missing = want.filter((w) => !have.has(w)).length;
    checks.push({ group: 'Knowledge', text: `${want.length - missing}/${want.length} ${noun}`, survived: missing === 0 });
  }
  const mask = (r: SaveReader) => Number(r.num(['KnownPortalRunes'], r.player) ?? 0) >>> 0;
  const want = mask(source);
  checks.push({ group: 'Knowledge', text: 'Portal glyphs', survived: ((mask(merged) & want) >>> 0) === want });

  const survived = checks.filter((c) => c.survived).length;
  return { checks, survived, total: checks.length };
}
