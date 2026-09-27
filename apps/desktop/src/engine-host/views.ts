import { readOverview, type SaveReader } from '@nss/engine';
import type { OverviewView } from '../shared/api.ts';

export function toOverviewView(r: SaveReader): OverviewView {
  const o = readOverview(r);
  return {
    platform: o.platform ?? null,
    playTimeSeconds: o.playTimeSeconds,
    units: o.currencies.units.toString(),
    nanites: o.currencies.nanites.toString(),
    quicksilver: o.currencies.quicksilver.toString(),
    ships: o.ships.map((s) => ({
      index: s.index,
      name: s.name,
      kind: s.kind,
      class: s.class ?? null,
      primary: s.primary,
      cargoUsed: s.cargo.used,
      cargoCapacity: s.cargo.capacity,
    })),
    multitools: o.multitools.map((m) => ({ index: m.index, name: m.name, class: m.class ?? null, active: m.active })),
    companions: o.companions.map((c) => ({ index: c.index, name: c.name, species: c.species })),
    knowledge: {
      technology: o.knowledge.technology,
      products: o.knowledge.products,
      specials: o.knowledge.specials,
      refinerRecipes: o.knowledge.refinerRecipes,
      words: o.knowledge.words,
      portalGlyphs: o.knowledge.portalGlyphs,
    },
    capacity: o.capacity,
  };
}
