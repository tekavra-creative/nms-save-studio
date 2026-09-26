// Runs in an Electron utilityProcess: all save parsing/writing happens here, off the UI thread.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KeyMap, readOverview, SaveFile, SaveReader, type MappingFile } from '@nss/engine';
import mappingFallback from '../../../../packages/engine/src/keys/mapping.fallback.json' with { type: 'json' };
import { findSaveRoots, isGameRunning, listSlots } from '@nss/io';
import type { EngineRequest, OverviewView, SlotView } from '../shared/api.ts';

const mapping = mappingFallback as MappingFile;

function slots(root: string): SlotView[] {
  return listSlots(root)
    .filter((s) => s.auto || s.manual)
    .map((s) => {
      const points = [s.auto, s.manual].flatMap((e) =>
        e?.manifest
          ? [
              {
                kind: e.ref.kind,
                file: e.ref.dataName,
                name: e.manifest.saveName,
                summary: e.manifest.saveSummary,
                playTimeSeconds: Number(e.manifest.totalPlayTime),
                savedAt: e.manifest.timestamp * 1000,
                saveVersion: e.manifest.baseVersion,
                loadsInGame: e === s.latest,
              },
            ]
          : [],
      );
      const latest = s.latest?.manifest;
      return { slot: s.slot, title: latest?.saveName || '', summary: latest?.saveSummary ?? '', restorePoints: points };
    });
}

function overview(root: string, slot: number): OverviewView {
  const info = listSlots(root)[slot - 1];
  const e = info?.latest;
  if (!e) throw new Error(`slot ${slot} is empty`);
  const save = new SaveFile(
    new Uint8Array(readFileSync(join(root, e.ref.dataName))),
    new Uint8Array(readFileSync(join(root, e.ref.manifestName))),
    e.ref.manifestSlotIndex,
  );
  const o = readOverview(new SaveReader(save.doc, KeyMap.forDoc(mapping, save.doc)));
  return {
    platform: o.platform ?? null,
    playTimeSeconds: o.playTimeSeconds,
    units: o.currencies.units.toString(),
    nanites: o.currencies.nanites.toString(),
    quicksilver: o.currencies.quicksilver.toString(),
    ships: o.ships.map((s) => ({
      index: s.index,
      name: s.name,
      kind: s.kind,
      class: s.class ?? null,
      primary: s.primary,
      cargoUsed: s.cargo.used,
      cargoCapacity: s.cargo.capacity,
    })),
    multitools: o.multitools.map((m) => ({ index: m.index, name: m.name, class: m.class ?? null, active: m.active })),
    companions: o.companions.map((c) => ({ index: c.index, name: c.name, species: c.species })),
    knowledge: { technology: o.knowledge.technology, products: o.knowledge.products, words: o.knowledge.words, portalGlyphs: o.knowledge.portalGlyphs },
    capacity: o.capacity,
  };
}

async function handle(req: EngineRequest): Promise<unknown> {
  switch (req.op) {
    case 'listRoots':
      return findSaveRoots();
    case 'listSlots':
      return slots(req.root);
    case 'overview':
      return overview(req.root, req.slot);
    case 'gameRunning':
      return isGameRunning();
  }
}

process.parentPort.on('message', async (event) => {
  const { id, request } = event.data as { id: number; request: EngineRequest };
  try {
    process.parentPort.postMessage({ id, ok: true, value: await handle(request) });
  } catch (e) {
    process.parentPort.postMessage({ id, ok: false, error: (e as Error).message });
  }
});
