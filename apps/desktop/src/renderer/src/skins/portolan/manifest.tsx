import type { SkinManifest } from '../types.ts';
import { PORTOLAN_SPRITE } from './sprite.ts';
import './skin.css';

export const portolan: SkinManifest = {
  id: 'portolan',
  name: 'Portolan',
  tagline: 'An open atlas: warm paper, ink, a navigator’s ledger.',
  colorScheme: 'light',
  words: {
    hangar: 'The hangar',
    bay: 'berth',
    free: 'free',
    from: 'From the log of',
    into: 'Into the log of',
    readOnly: 'Read only',
    changes: 'Ledger',
    changesHint: 'Pencilled in, not yet written. Strike a line to undo it.',
    revert: 'Strike',
    write: (n) => (n ? `Seal & write ${n} entr${n === 1 ? 'y' : 'ies'}` : 'Seal & write'),
    lift: 'Take across →',
    staged: 'Entered',
    aboard: 'Aboard',
  },
  Mark: () => (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14.2" fill="none" stroke="currentColor" strokeWidth=".9" />
      <circle cx="16" cy="16" r="11.6" fill="none" stroke="currentColor" strokeWidth=".5" strokeDasharray=".6 1.6" />
      <path d="M16 3.2l1.9 10.9L28.8 16l-10.9 1.9L16 28.8l-1.9-10.9L3.2 16l10.9-1.9z" fill="currentColor" />
      <path
        d="M16 9.5l1 5.5 5.5 1-5.5 1-1 5.5-1-5.5-5.5-1 5.5-1z"
        transform="rotate(45 16 16)"
        style={{ fill: 'var(--paper)' }}
        stroke="currentColor"
        strokeWidth=".6"
      />
    </svg>
  ),
  Sprite: () => (
    <svg
      aria-hidden="true"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      dangerouslySetInnerHTML={{ __html: PORTOLAN_SPRITE }}
    />
  ),
};
