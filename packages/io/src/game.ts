import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** True when No Man's Sky is running. Writes are refused while it is. */
export async function isGameRunning(): Promise<boolean> {
  if (process.platform === 'win32') {
    const { stdout } = await run('tasklist', ['/FO', 'CSV', '/NH', '/FI', 'IMAGENAME eq NMS.exe']);
    return /"NMS\.exe"/i.test(stdout);
  }
  const { stdout } = await run('/bin/ps', ['-axo', 'comm=']);
  return stdout
    .split('\n')
    .some((line) => /No Man's Sky\.app\/Contents\/MacOS\/No Man's Sky$/.test(line.trim()) || /\/NMS\.exe$/i.test(line.trim()));
}
