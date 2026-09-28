// Runs in an Electron utilityProcess: all save parsing/writing happens here, off the UI thread.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkSurvival, KeyMap, SaveFile, SaveReader, type MappingFile } from '@nss/engine';
import mappingFallback from '../../../../packages/engine/src/keys/mapping.fallback.json' with { type: 'json' };
import { findSaveRoots, isGameRunning, listSlots } from '@nss/io';
import type { EngineRequest, OverviewView, SlotView, SurvivalReportView } from '../shared/api.ts';
import { applyChanges, closeMerge, openMerge, redo, revertChange, setCurrencyMode, shortPlace, undo, writeMerge } from './merge.ts';
import {
  closeExplorer,
  explorerDuplicateItem,
  explorerGetLeaf,
  explorerList,
  explorerRedo,
  explorerRemoveItem,
  explorerSearch,
  explorerSetLeaf,
  explorerUndo,
  inventoryClearSlot,
  inventoryContainers,
  inventoryFillSlot,
  inventoryOpen,
  inventorySetAmount,
  inventorySetItem,
  itemSearch,
  openExplorer,
  writeExplorer,
} from './explorer.ts';
import { closeStoryPreview, openStoryPreview, storyPresets, writeStoryPreset } from './story.ts';
import { iconPng } from './icons.ts';
import { toOverviewView } from './views.ts';

const USER_DATA = process.env['NSS_USER_DATA'] ?? '';

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

function openSlot(root: string, slot: number): SaveFile {
  const info = listSlots(root)[slot - 1];
  const e = info?.latest;
  if (!e) throw new Error(`slot ${slot} is empty`);
  return new SaveFile(new Uint8Array(readFileSync(join(root, e.ref.dataName))), new Uint8Array(readFileSync(join(root, e.ref.manifestName))), e.ref.manifestSlotIndex);
}

function titleOf(root: string, slot: number): string {
  const e = listSlots(root)[slot - 1]?.latest;
  return e?.manifest?.saveName || shortPlace(e?.manifest?.saveSummary) || `Slot ${slot}`;
}

/** Compares a save the game has re-saved after loading against the pre-merge save it came from. */
function survivalCheck(root: string, mergedSlot: number, sourceSlot: number): SurvivalReportView {
  const merged = openSlot(root, mergedSlot);
  const source = openSlot(root, sourceSlot);
  const report = checkSurvival(new SaveReader(merged.doc, KeyMap.forDoc(mapping, merged.doc)), new SaveReader(source.doc, KeyMap.forDoc(mapping, source.doc)));
  return { mergedTitle: titleOf(root, mergedSlot), sourceTitle: titleOf(root, sourceSlot), ...report };
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
  return toOverviewView(new SaveReader(save.doc, KeyMap.forDoc(mapping, save.doc)));
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
    case 'openMerge':
      return openMerge(mapping, req.root, req.targetSlot, req.sourceSlot);
    case 'applyChanges':
      return applyChanges(req.mergeId, req.changeIds);
    case 'revertChange':
      return revertChange(req.mergeId, req.changeId);
    case 'setCurrencyMode':
      return setCurrencyMode(req.mergeId, req.field, req.mode);
    case 'undo':
      return undo(req.mergeId);
    case 'redo':
      return redo(req.mergeId);
    case 'writeMerge':
      if (await isGameRunning()) throw new Error("No Man's Sky is running — quit the game before writing.");
      return writeMerge(req.mergeId, req.name);
    case 'closeMerge':
      return closeMerge(req.mergeId);
    case 'openExplorer':
      return openExplorer(mapping, req.root, req.slot);
    case 'explorerList':
      return explorerList(req.explorerId, req.path);
    case 'explorerGetLeaf':
      return explorerGetLeaf(req.explorerId, req.path);
    case 'explorerSetLeaf':
      return explorerSetLeaf(req.explorerId, req.path, req.kind, req.raw);
    case 'explorerDuplicateItem':
      return explorerDuplicateItem(req.explorerId, req.arrayPath, req.index);
    case 'explorerRemoveItem':
      return explorerRemoveItem(req.explorerId, req.arrayPath, req.index);
    case 'explorerSearch':
      return explorerSearch(req.explorerId, req.query);
    case 'explorerUndo':
      return explorerUndo(req.explorerId);
    case 'explorerRedo':
      return explorerRedo(req.explorerId);
    case 'writeExplorer':
      if (await isGameRunning()) throw new Error("No Man's Sky is running — quit the game before writing.");
      return writeExplorer(req.explorerId);
    case 'closeExplorer':
      return closeExplorer(req.explorerId);
    case 'survivalCheck':
      return survivalCheck(req.root, req.mergedSlot, req.sourceSlot);
    case 'inventoryContainers':
      return inventoryContainers(req.explorerId);
    case 'inventoryOpen':
      return inventoryOpen(req.explorerId, req.containerKey);
    case 'inventorySetAmount':
      return inventorySetAmount(req.explorerId, req.containerKey, req.arrayIndex, req.amount);
    case 'inventorySetItem':
      return inventorySetItem(req.explorerId, req.containerKey, req.arrayIndex, req.itemId, req.amount);
    case 'inventoryFillSlot':
      return inventoryFillSlot(req.explorerId, req.containerKey, req.x, req.y, req.itemId, req.amount);
    case 'inventoryClearSlot':
      return inventoryClearSlot(req.explorerId, req.containerKey, req.arrayIndex);
    case 'itemSearch':
      return itemSearch(req.query);
    case 'storyPresets':
      return storyPresets();
    case 'openStoryPreview':
      return openStoryPreview(mapping, req.root, req.sourceSlot, req.presetId);
    case 'writeStoryPreset':
      if (await isGameRunning()) throw new Error("No Man's Sky is running — quit the game before writing.");
      return writeStoryPreset(req.storyId, req.name);
    case 'closeStoryPreview':
      return closeStoryPreview(req.storyId);
    case 'icon':
      return iconPng(req.path, USER_DATA);
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
