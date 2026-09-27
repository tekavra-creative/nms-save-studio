import { _electron as electron, expect, test } from '@playwright/test';
import { join } from "node:path";
import type {} from "../src/renderer/src/App.tsx";

test('merge session: plan, apply, undo, redo through the real bridge (no write)', async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined)) as Record<string, string>;
  const app = await electron.launch({ args: [join(import.meta.dirname, '../out/main/index.js')], env });
  const win = await app.firstWindow();
  const result = await win.evaluate(async () => {
    const [root] = await window.studio.listRoots();
    const slots = await window.studio.listSlots(root!.path);
    const byName = (s: string) => slots.find((x) => x.summary.includes(s) && !x.title)!.slot;
    const state = await window.studio.openMerge(root!.path, byName('Ralfar'), byName('Space Anomaly'));
    const shipsBefore = state.target.ships.length;
    const shipIds = state.changes.filter((c) => c.group === 'Starships').map((c) => c.id);
    const applied = await window.studio.applyChanges(state.mergeId, shipIds);
    const undone = await window.studio.undo(state.mergeId);
    const redone = await window.studio.redo(state.mergeId);
    const reverted = await window.studio.revertChange(state.mergeId, shipIds[0]!);
    const units = state.changes.find((c) => c.ref.kind === 'currency' && c.ref.field === 'Units')!;
    const summed = await window.studio.applyChanges(state.mergeId, [units.id]);
    const kept = await window.studio.setCurrencyMode(state.mergeId, 'Units', 'keep-target');
    const back = await window.studio.undo(state.mergeId);
    await window.studio.closeMerge(state.mergeId);
    return {
      changes: state.changes.length,
      shipsBefore,
      shipsAfter: applied.target.ships.length,
      afterUndo: undone.target.ships.length,
      afterRedo: redone.target.ships.length,
      canUndo: redone.canUndo,
      afterRevert: reverted.target.ships.length,
      revertedStillApplied: reverted.changes.find((c) => c.id === shipIds[0])!.applied,
      unitsBefore: state.target.units,
      unitsSummed: summed.target.units,
      unitsKept: kept.target.units,
      unitsAfterUndo: back.target.units,
    };
  });
  expect(result.changes).toBeGreaterThan(0);
  expect(result.shipsAfter).toBe(result.shipsBefore + 2);
  expect(result.afterUndo).toBe(result.shipsBefore); // one action = one undo step
  expect(result.afterRedo).toBe(result.shipsBefore + 2);
  expect(result.canUndo).toBe(true);
  expect(result.afterRevert).toBe(result.shipsBefore + 1);
  expect(result.revertedStillApplied).toBe(false);
  expect(BigInt(result.unitsSummed)).toBeGreaterThan(BigInt(result.unitsBefore));
  expect(result.unitsKept).toBe(result.unitsBefore);
  expect(result.unitsAfterUndo).toBe(result.unitsSummed);
  await app.close();
});
