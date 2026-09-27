import type { SkinManifest } from '../types.ts';
import { PARHELION_SPRITE } from './sprite.ts';
import './skin.css';

export const parhelion: SkinManifest = {
  id: 'parhelion',
  name: 'Parhelion',
  tagline: 'Quiet, dark and calm. The default.',
  colorScheme: 'dark',
  words: {
    hangar: 'Your hangar',
    bay: 'bay',
    free: 'open',
    from: 'From',
    into: 'Into',
    readOnly: 'Only read, never changed',
    changes: 'Changes',
    changesHint: 'Held in memory. Nothing is written until you press Write.',
    revert: 'Revert',
    write: (n) => (n ? `Write ${n} Change${n === 1 ? '' : 's'}` : 'Write'),
    lift: '↑ Lift',
    staged: 'Staged',
    aboard: 'Aboard',
  },
  Mark: () => (
    <svg viewBox="0 0 34 20" aria-hidden="true">
      <path d="M4 15C8.5 5 25.5 5 30 15" fill="none" stroke="oklch(80% 0.135 75 / .4)" strokeWidth="1" />
      <circle cx="11" cy="10" r="6.4" fill="var(--gold)" />
      <circle cx="26" cy="10" r="3.8" fill="none" stroke="var(--cool)" strokeWidth="1.4" />
    </svg>
  ),
  Sprite: () => (
    <svg
      aria-hidden="true"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      dangerouslySetInnerHTML={{ __html: PARHELION_SPRITE }}
    />
  ),
};
