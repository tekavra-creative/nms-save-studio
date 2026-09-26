import { closeSync, cpSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, utimesSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { decompressSave, parseManifest, type EncodedSave, type SlotFileRef } from '@nss/engine';
import { isGameRunning } from './game.ts';
import { fingerprint, type Fingerprint } from './slots.ts';

export class WriteRefused extends Error {
  override name = 'WriteRefused';
}

export interface WriteRequest {
  root: string;
  ref: SlotFileRef;
  encoded: EncodedSave;
  /** What the target files looked like when we read them; `null` = must not exist (empty slot). */
  expect: { data: Fingerprint | null; meta: Fingerprint | null };
  snapshotDir: string;
  reason: string;
  /** Test hook — defaults to checking the real process list. */
  gameRunning?: () => Promise<boolean>;
}

export interface WriteResult {
  snapshot: string;
  dataPath: string;
  manifestPath: string;
  verified: { decompressedSize: number; manifestTimestamp: number };
}

function same(a: Fingerprint, b: Fingerprint): boolean {
  return a.size === b.size && a.sha256 === b.sha256;
}

function writeAtomic(path: string, bytes: Uint8Array): void {
  const tmp = `${path}.nss-tmp`;
  const fd = openSync(tmp, 'w');
  try {
    writeSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
}

export function snapshotRoot(root: string, snapshotDir: string, reason: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = join(snapshotDir, `${stamp}-${reason.replace(/[^a-z0-9-]+/gi, '-').slice(0, 40)}`);
  mkdirSync(snapshotDir, { recursive: true });
  cpSync(root, dest, { recursive: true, preserveTimestamps: true });
  return dest;
}

/**
 * Safe write of one save file pair:
 * preflight (game closed, files unchanged) → snapshot whole folder → atomic write (manifest, then data)
 * → set mtimes → read back and verify → restore snapshot on any failure.
 */
export async function writeSlotFile(req: WriteRequest): Promise<WriteResult> {
  const running = await (req.gameRunning ?? isGameRunning)();
  if (running) throw new WriteRefused("No Man's Sky is running — quit the game before writing.");

  const dataPath = join(req.root, req.ref.dataName);
  const manifestPath = join(req.root, req.ref.manifestName);
  for (const [path, want] of [
    [dataPath, req.expect.data],
    [manifestPath, req.expect.meta],
  ] as const) {
    const exists = existsSync(path);
    if (want === null && exists) throw new WriteRefused(`${path} appeared since it was read — reload first.`);
    if (want !== null && (!exists || !same(fingerprint(path), want))) {
      throw new WriteRefused(`${path} changed since it was read (the game or Steam Cloud wrote it) — reload first.`);
    }
  }

  const snapshot = snapshotRoot(req.root, req.snapshotDir, req.reason);
  const had = { data: existsSync(dataPath), meta: existsSync(manifestPath) };
  try {
    writeAtomic(manifestPath, req.encoded.manifest);
    writeAtomic(dataPath, req.encoded.data);
    const m = parseManifest(new Uint8Array(readFileSync(manifestPath)), req.ref.manifestSlotIndex);
    const when = new Date(m.timestamp * 1000);
    utimesSync(manifestPath, when, when);
    utimesSync(dataPath, when, when);

    const payload = decompressSave(new Uint8Array(readFileSync(dataPath)));
    if (payload.length !== m.decompressedSize) throw new Error('verify: decompressed size ≠ manifest');
    if (readFileSync(dataPath).length !== m.compressedSize) throw new Error('verify: file size ≠ manifest');
    return { snapshot, dataPath, manifestPath, verified: { decompressedSize: payload.length, manifestTimestamp: m.timestamp } };
  } catch (e) {
    for (const [path, existed, name] of [
      [manifestPath, had.meta, req.ref.manifestName],
      [dataPath, had.data, req.ref.dataName],
    ] as const) {
      if (existed) cpSync(join(snapshot, name), path, { preserveTimestamps: true });
      else rmSync(path, { force: true });
    }
    throw e;
  }
}
