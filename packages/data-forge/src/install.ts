// Where the game keeps its packs. Only the user's own install is ever read; nothing is copied into
// the repo.
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const MAC_STEAM_BANKS = [
  'Library/Application Support/Steam/steamapps/common/No Man\'s Sky',
  'No Man\'s Sky.app/Contents/Resources/GAMEDATA/MACOSBANKS',
];

const WIN_STEAM_BANKS = 'C:/Program Files (x86)/Steam/steamapps/common/No Man\'s Sky/GAMEDATA/PCBANKS';

/** Best-guess banks folder for a default Steam install. `NMS_BANKS_DIR` overrides it. */
export function defaultBanksDir(): string {
  const override = process.env['NMS_BANKS_DIR'];
  if (override) return override;
  if (platform() === 'win32') return WIN_STEAM_BANKS;
  return join(homedir(), ...MAC_STEAM_BANKS);
}
