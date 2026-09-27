import { useEffect, useMemo, useState } from 'react';
import type { StudioApi } from '../../shared/api.ts';
import { RawExplorer } from './explorer/RawExplorer.tsx';
import { SavesHome } from './home/SavesHome.tsx';
import { applySkin, loadSkinId, saveSkinId, skinById, SKINS } from './skins/registry.ts';
import { MergeStudio } from './studio/MergeStudio.tsx';
import type { Command } from './ui/CommandPalette.tsx';

declare global {
  interface Window {
    studio: StudioApi;
  }
}

type Screen = { kind: 'home' } | { kind: 'merge'; root: string; target: number; source: number } | { kind: 'explorer'; root: string; slot: number };

export function App() {
  const [skinId, setSkinId] = useState(loadSkinId);
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
  const skin = skinById(skinId);

  useEffect(() => {
    applySkin(skin);
    saveSkinId(skin.id);
  }, [skin]);

  const skinCommands = useMemo<Command[]>(
    () => SKINS.filter((s) => s.id !== skin.id).map((s) => ({ id: `skin:${s.id}`, label: `Switch skin to ${s.name}`, run: () => setSkinId(s.id) })),
    [skin.id],
  );

  return (
    <>
      <skin.Sprite />
      {screen.kind === 'home' ? (
        <SavesHome
          skin={skin}
          skins={SKINS}
          setSkin={setSkinId}
          skinCommands={skinCommands}
          onOpen={(root, target, source) => setScreen({ kind: 'merge', root, target, source })}
          onExplore={(root, slot) => setScreen({ kind: 'explorer', root, slot })}
        />
      ) : screen.kind === 'merge' ? (
        <MergeStudio
          key={`${screen.target}:${screen.source}`}
          root={screen.root}
          targetSlot={screen.target}
          sourceSlot={screen.source}
          skin={skin}
          skinCommands={skinCommands}
          onBack={() => setScreen({ kind: 'home' })}
        />
      ) : (
        <RawExplorer key={`explore:${screen.slot}`} root={screen.root} slot={screen.slot} skin={skin} onBack={() => setScreen({ kind: 'home' })} />
      )}
    </>
  );
}
