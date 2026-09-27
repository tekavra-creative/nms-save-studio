import type { SkinManifest } from '../types.ts';
import { DRYDOCK_SPRITE } from './sprite.ts';
import './skin.css';

export const drydock: SkinManifest = {
  id: 'drydock',
  name: 'Drydock',
  tagline: 'A night cockpit console. Dense, calm, colour-coded.',
  colorScheme: 'dark',
  words: {
    hangar: 'Hangar',
    bay: 'bay',
    free: 'free',
    from: 'Source',
    into: 'Target',
    readOnly: 'Read-only',
    changes: 'Changes',
    changesHint: 'Held in memory. Nothing is written until you press Write.',
    revert: 'Revert',
    write: (n) => (n ? `Write ${n} change${n === 1 ? '' : 's'}` : 'Write'),
    lift: 'Copy',
    staged: 'Staged',
    aboard: 'Aboard',
  },
  Mark: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6 3.5H3.5v17H6M18 3.5h2.5v17H18" />
      <path d="M7.5 12h6.5l3-2.4v4.8L14 12" fill="currentColor" strokeLinejoin="round" />
    </svg>
  ),
  Sprite: () => (
    <svg
      aria-hidden="true"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      dangerouslySetInnerHTML={{ __html: DRYDOCK_SPRITE }}
    />
  ),
};
