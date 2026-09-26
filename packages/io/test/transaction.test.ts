import { chmodSync, cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseManifest, prepareSlotCopy, SaveFile, slotFile, type MappingFile } from '@nss/engine';
import { fingerprint, firstEmptySlot, listSlots, WriteRefused, writeSlotFile } from '../src/index.ts';

const CORPUS = join(process.env.NMS_SAVE_CORPUS ?? join(homedir(), 'NMSCorpus'), 'steam-mac-2026-09-26');
const mapping = JSON.parse(
  readFileSync(new URL('../../engine/src/keys/mapping.fallback.json', import.meta.url), 'utf8'),
) as MappingFile;

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'nss-io-'));
  const root = join(base, 'st_0000');
  cpSync(CORPUS, root, { recursive: true });
  chmodSync(root, 0o755);
  for (const f of readdirSync(root)) chmodSync(join(root, f), 0o644);
  return { root, snapshots: join(base, 'snapshots') };
}

function copyRequest(root: string, snapshotDir: string, slot = 4) {
  const src = new SaveFile(new Uint8Array(readFileSync(join(root, 'save3.hg'))), new Uint8Array(readFileSync(join(root, 'mf_save3.hg'))), 4);
  const ref = slotFile(slot, 'auto');
  const { encoded } = prepareSlotCopy(src, mapping, { target: ref, name: 'Studio Test', universalId: 42n });
  return { root, ref, encoded, expect: { data: null, meta: null }, snapshotDir, reason: 'copy-slot', gameRunning: async () => false };
}

describe.skipIf(!existsSync(join(CORPUS, 'save3.hg')))('safe write (sandbox copies of real saves)', () => {
  it('lists slots with auto/manual pairs and finds the first empty slot', () => {
    const { root } = sandbox();
    const slots = listSlots(root);
    expect(slots[1]!.auto?.manifest?.saveSummary).toBe('In the Ralfar system');
    expect(slots[1]!.latest?.ref.dataName).toBe('save3.hg');
    expect(slots[2]!.latest?.manifest?.saveSummary).toBe('Aboard the Space Anomaly');
    expect(firstEmptySlot(slots)).toBe(4);
  });

  it('writes a copy into an empty slot, snapshots first, and verifies', async () => {
    const { root, snapshots } = sandbox();
    const res = await writeSlotFile(copyRequest(root, snapshots));
    expect(existsSync(join(res.snapshot, 'save3.hg'))).toBe(true);
    expect(existsSync(join(res.snapshot, 'save7.hg'))).toBe(false);
    const after = listSlots(root)[3]!;
    expect(after.auto?.manifest?.saveName).toBe('Studio Test');
    expect(after.auto?.manifest?.saveSummary).toBe('In the Ralfar system');
  });

  it('refuses while the game is running and touches nothing', async () => {
    const { root, snapshots } = sandbox();
    await expect(writeSlotFile({ ...copyRequest(root, snapshots), gameRunning: async () => true })).rejects.toBeInstanceOf(WriteRefused);
    expect(existsSync(join(root, 'save7.hg'))).toBe(false);
    expect(existsSync(snapshots)).toBe(false);
  });

  it('refuses when the target changed since it was read', async () => {
    const { root, snapshots } = sandbox();
    const req = copyRequest(root, snapshots, 2);
    const stale = { data: fingerprint(join(root, 'save3.hg')), meta: fingerprint(join(root, 'mf_save3.hg')) };
    writeFileSync(join(root, 'save3.hg'), 'game wrote this');
    await expect(writeSlotFile({ ...req, expect: stale })).rejects.toThrow(/changed since it was read/);
  });

  it('rolls back when verification fails', async () => {
    const { root, snapshots } = sandbox();
    const req = copyRequest(root, snapshots);
    const bad = { ...req, encoded: { ...req.encoded, data: req.encoded.data.slice(0, 100) } };
    await expect(writeSlotFile(bad)).rejects.toThrow();
    expect(existsSync(join(root, 'save7.hg'))).toBe(false);
    expect(existsSync(join(root, 'mf_save7.hg'))).toBe(false);
    expect(parseManifest(new Uint8Array(readFileSync(join(root, 'mf_save3.hg'))), 4).saveSummary).toBe('In the Ralfar system');
  });
});
