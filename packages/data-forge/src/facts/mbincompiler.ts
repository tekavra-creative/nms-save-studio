// MBINCompiler (monkeyman192, LGPL-3.0) as an EXTERNAL build-time tool. We download the pinned
// release binary into the user's cache, verify its sha256, and run it as a separate process. None of
// its code is linked, copied or shipped in this repository.
//
// The release binaries are framework-dependent .NET 8 builds. When no .NET 8+ runtime is installed,
// a pinned, sha512-verified runtime from Microsoft is unpacked next to it (cache only, no admin).
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { arch, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Pinned MBINCompiler release. Its libMBIN must understand the installed game's MBIN templates. */
export const MBINCOMPILER_VERSION = 'v7.04.1-pre3';
const MBINC_BASE = `https://github.com/monkeyman192/MBINCompiler/releases/download/${MBINCOMPILER_VERSION}/`;

interface Asset {
  file: string;
  /** Hex digest (sha256 for MBINCompiler, as GitHub publishes it; sha512 for .NET, as Microsoft does). */
  hash: string;
  /** Executable path relative to the unpack folder. */
  exe: string;
  archive: boolean;
}

// Digests from the GitHub release API (`assets[].digest`) for MBINCOMPILER_VERSION.
const MBINC_ASSETS: Record<string, Asset> = {
  'darwin-arm64': {
    file: 'MBINCompiler-macOS.zip',
    hash: '24129576a2aa5a11a63b3fc58e68ea7f894b66e0baa3c440b0e295fff7095b12',
    exe: 'MBINCompiler-macOS/MBINCompiler',
    archive: true,
  },
  'win32-x64': {
    file: 'MBINCompiler.exe',
    hash: '4179dddb665f7cddbe9dddddf6e529172abdd98b0097f65fdd224467d5bb3ea4',
    exe: 'MBINCompiler.exe',
    archive: false,
  },
  'linux-x64': {
    file: 'MBINCompiler-linux',
    hash: 'f65d5bbd36cc841ec82ee50cec13c99e0f0f6ac433b9135f92e2ad4582d0288d',
    exe: 'MBINCompiler-linux',
    archive: false,
  },
};

/** Pinned .NET runtime used only when the machine has no .NET 8+ of its own. */
export const DOTNET_VERSION = '8.0.31';
const DOTNET_BASE = `https://builds.dotnet.microsoft.com/dotnet/Runtime/${DOTNET_VERSION}/`;
// sha512 from https://builds.dotnet.microsoft.com/dotnet/release-metadata/8.0/releases.json
const DOTNET_ASSETS: Record<string, Asset> = {
  'darwin-arm64': {
    file: `dotnet-runtime-${DOTNET_VERSION}-osx-arm64.tar.gz`,
    hash: '1963d2ab3798efdc2b33034ef57d4252849a066a2313ce62a574e556d19e5e981afe13c9545eb6d59437849723e1c8350f10f8068bcfa6b7a2815a07263bb8b3',
    exe: 'dotnet',
    archive: true,
  },
  'win32-x64': {
    file: `dotnet-runtime-${DOTNET_VERSION}-win-x64.zip`,
    hash: '9c55c58694676ee64b0eed2cd6d8cbf58b9aa8288420acc66841e15ca0099c75d4af0182d23a641c2342e5a151a325df4a12fa0bde2e47c0fb7e9a33e7b09896',
    exe: 'dotnet.exe',
    archive: true,
  },
  'linux-x64': {
    file: `dotnet-runtime-${DOTNET_VERSION}-linux-x64.tar.gz`,
    hash: 'f336bdec58d54bf50d74a1b38efa82f7290d976bd2ed98b845ebcbac42cf0d8cef504684fc088d4b05f98737b996bf3302e52bd9c23005deae7c60780b2652fb',
    exe: 'dotnet',
    archive: true,
  },
};

export class ToolError extends Error {
  override name = 'ToolError';
}

export interface MbinCompiler {
  exe: string;
  version: string;
  /** Extra environment (DOTNET_ROOT) needed to start it. */
  env: Record<string, string>;
  /** Where the .NET runtime came from. */
  runtime: 'system' | 'cached';
}

export type Log = (msg: string) => void;

function platformKey(): string {
  return `${platform()}-${arch()}`;
}

async function download(url: string, algo: 'sha256' | 'sha512', expected: string, dest: string, log: Log): Promise<void> {
  log(`downloading ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new ToolError(`download failed (${res.status} ${res.statusText}): ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const got = createHash(algo).update(bytes).digest('hex');
  if (got !== expected) throw new ToolError(`${algo} mismatch for ${url}\n  expected ${expected}\n  got      ${got}`);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, bytes);
}

/** Unpack a .zip or .tar.gz with the system `tar` (bsdtar on macOS and Windows 10+, GNU tar on Linux). */
async function unpack(archive: string, into: string): Promise<void> {
  await mkdir(into, { recursive: true });
  if (archive.endsWith('.zip') && platform() !== 'win32') await run('unzip', ['-q', '-o', archive, '-d', into]);
  else await run('tar', ['-xf', archive, '-C', into]);
}

/** A .NET 8+ runtime on PATH, if any. */
async function systemDotnetOk(): Promise<boolean> {
  try {
    const { stdout } = await run('dotnet', ['--list-runtimes']);
    return /Microsoft\.NETCore\.App (\d+)\./.test(stdout) && [...stdout.matchAll(/Microsoft\.NETCore\.App (\d+)\./g)].some((m) => Number(m[1]) >= 8);
  } catch {
    return false;
  }
}

async function ensureDotnet(cacheRoot: string, log: Log): Promise<{ env: Record<string, string>; runtime: 'system' | 'cached' }> {
  const dir = join(cacheRoot, 'dotnet', DOTNET_VERSION);
  const asset = DOTNET_ASSETS[platformKey()];
  if (asset && existsSync(join(dir, asset.exe))) return { env: { DOTNET_ROOT: dir }, runtime: 'cached' };
  if (await systemDotnetOk()) return { env: {}, runtime: 'system' };
  if (!asset) throw new ToolError(`no pinned .NET runtime for ${platformKey()}; install the .NET 8 runtime and retry`);
  const tmp = join(cacheRoot, 'dotnet', `.${DOTNET_VERSION}.partial`);
  await rm(tmp, { recursive: true, force: true });
  const archive = join(cacheRoot, 'dotnet', asset.file);
  await download(DOTNET_BASE + asset.file, 'sha512', asset.hash, archive, log);
  await unpack(archive, tmp);
  await rm(archive, { force: true });
  await rename(tmp, dir);
  return { env: { DOTNET_ROOT: dir }, runtime: 'cached' };
}

/**
 * Make sure the pinned MBINCompiler is in `<cacheRoot>/mbincompiler/<version>/` and can start.
 * Downloads (hash-verified) only what is missing.
 */
export async function ensureMbinCompiler(cacheRoot: string, log: Log = () => {}): Promise<MbinCompiler> {
  const key = platformKey();
  const asset = MBINC_ASSETS[key];
  if (!asset) {
    throw new ToolError(
      `MBINCompiler ${MBINCOMPILER_VERSION} has no release binary for ${key} ` +
        `(published: ${Object.keys(MBINC_ASSETS).join(', ')})`,
    );
  }
  const dir = join(cacheRoot, 'mbincompiler', MBINCOMPILER_VERSION);
  const exe = join(dir, asset.exe);
  if (!existsSync(exe)) {
    const target = join(dir, asset.file);
    await download(MBINC_BASE + asset.file, 'sha256', asset.hash, target, log);
    if (asset.archive) {
      await unpack(target, dir);
      await rm(target, { force: true });
    }
  }
  if (platform() !== 'win32') chmodSync(exe, 0o755);
  if (platform() === 'darwin') await run('xattr', ['-dr', 'com.apple.quarantine', dir]).catch(() => undefined);

  const { env, runtime } = await ensureDotnet(cacheRoot, log);
  let version: string;
  try {
    const { stdout } = await run(exe, ['version', '-q'], { env: { ...process.env, ...env } });
    version = stdout.trim();
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message: string };
    throw new ToolError(`MBINCompiler failed to start: ${(e.stderr || e.stdout || e.message).trim()}`);
  }
  if (!version) throw new ToolError('MBINCompiler printed no version');
  return { exe, version, env, runtime };
}

/**
 * Convert MBIN files to MXML next to themselves. Paths are passed explicitly (MBINCompiler's folder
 * mode skips lower-case `.mbin` and anything under `LANGUAGE\` by default).
 */
export async function convertToMxml(tool: MbinCompiler, cwd: string, files: readonly string[]): Promise<void> {
  if (files.length === 0) return;
  try {
    await run(tool.exe, ['convert', '-y', '-f', '-q', '--input-format=MBIN', ...files], {
      cwd,
      env: { ...process.env, ...tool.env },
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message: string };
    throw new ToolError(`MBINCompiler convert failed: ${(e.stderr || e.stdout || e.message).trim()}`);
  }
}
