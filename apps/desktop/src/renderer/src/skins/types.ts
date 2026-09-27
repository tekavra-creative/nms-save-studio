import type { ReactNode } from 'react';

/**
 * A skin is a complete look: CSS scoped under [data-skin="<id>"], an art set, and the words it uses.
 * All skins render the same component tree; drag, state and data never change between skins.
 */
export interface SkinManifest {
  id: string;
  name: string;
  tagline: string;
  colorScheme: 'dark' | 'light';
  /** Words that carry the skin's voice. Everything else is shared copy. */
  words: {
    hangar: string;
    bay: string;
    free: string;
    from: string;
    into: string;
    readOnly: string;
    changes: string;
    changesHint: string;
    revert: string;
    write: (n: number) => string;
    lift: string;
    staged: string;
    aboard: string;
  };
  /** Brand mark shown in the title bar. */
  Mark: () => ReactNode;
  /** SVG <symbol> sprite: glyph ids g-starship, g-multitool, g-companion, g-currency, g-blueprint, g-words;
   *  ship ids s-explorer, s-fighter, s-hauler, s-shuttle, s-exotic, s-solar, s-living, s-sentinel, s-boundary, s-corvette. */
  Sprite: () => ReactNode;
}

export const SHIP_ART: Record<string, string> = {
  Explorer: 's-explorer',
  Fighter: 's-fighter',
  Hauler: 's-hauler',
  Shuttle: 's-shuttle',
  Exotic: 's-exotic',
  Solar: 's-solar',
  'Living Ship': 's-living',
  'Sentinel Interceptor': 's-sentinel',
  'Boundary Herald': 's-boundary',
  Corvette: 's-corvette',
};
