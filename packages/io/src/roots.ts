import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type Store = 'steam' | 'gog';

export interface SaveRoot {
  path: string;
  store: Store;
  accountId: string;
}

function nmsBase(): string[] {
  if (process.platform === 'darwin') return [join(homedir(), 'Library/Application Support/HelloGames/NMS')];
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? join(homedir(), 'AppData/Roaming');
    return [join(appData, 'HelloGames/NMS')];
  }
  return [join(homedir(), '.local/share/Steam/steamapps/compatdata/275850/pfx/drive_c/users/steamuser/AppData/Roaming/HelloGames/NMS')];
}

/** Every save folder the game uses on this machine (Steam `st_<id>`, GOG `DefaultUser`). */
export function findSaveRoots(bases: string[] = nmsBase()): SaveRoot[] {
  const out: SaveRoot[] = [];
  for (const base of bases) {
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const path = join(base, name);
      if (!statSync(path).isDirectory()) continue;
      if (name.startsWith('st_')) out.push({ path, store: 'steam', accountId: name.slice(3) });
      else if (name === 'DefaultUser') out.push({ path, store: 'gog', accountId: 'DefaultUser' });
    }
  }
  return out;
}
