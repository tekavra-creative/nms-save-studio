import { drydock } from './drydock/manifest.tsx';
import { parhelion } from './parhelion/manifest.tsx';
import { portolan } from './portolan/manifest.tsx';
import type { SkinManifest } from './types.ts';

// Order = order shown in the switcher. The first entry is the default.
export const SKINS: readonly SkinManifest[] = [parhelion, drydock, portolan];

const KEY = 'nss.skin';

export function skinById(id: string | null | undefined): SkinManifest {
  return SKINS.find((s) => s.id === id) ?? SKINS[0]!;
}

export function loadSkinId(): string {
  try {
    return skinById(localStorage.getItem(KEY)).id;
  } catch {
    return SKINS[0]!.id;
  }
}

export function saveSkinId(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // preference only — the app works without storage
  }
}

export function applySkin(skin: SkinManifest): void {
  document.documentElement.dataset['skin'] = skin.id;
  document.documentElement.style.colorScheme = skin.colorScheme;
}
