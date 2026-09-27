import { binaryToBytes, concatBytes, encodeJsonString } from '../cst/doc.ts';
import { appendArrayItem, EditError, literal, removeArrayItem, resolve, type Op, type PathStep } from '../edit.ts';
import type { KeyMap } from '../keys/mapping.ts';
import type { SaveReader } from './reader.ts';

/**
 * Generic reader/editor for any of a save's inventory containers (the exosuit's three, a ship's,
 * a multi-tool's, the freighter's three, any of the ten base chests, ...). They all share the
 * same shape — verified against a real save, see packages/engine/test/inventory.test.ts.
 */

export interface SlotView {
  /** Position of this slot within the container's `Slots` array — pass back to set/clear it. */
  arrayIndex: number;
  x: number;
  y: number;
  /** Raw item id as stored (e.g. `^FUEL1`) — resolve to a name via @nss/gamedata. */
  id: string;
  invType: string;
  amount: number;
  maxAmount: number;
}

export interface ContainerView {
  width: number;
  height: number;
  /** Grid cells the player has unlocked, in (x,y) form. Cells not in this list can't hold items. */
  validCells: [number, number][];
  slots: SlotView[];
}

function child(r: SaveReader, path: readonly PathStep[], from: number): number {
  return r.doc.at(path.map((s) => (typeof s === 'number' ? s : r.keys.key(s))), from);
}

/**
 * `containerPath` is always a FULL path from the document root (e.g. `[...target.playerPath,
 * 'Inventory']`) — the same convention `merge/assets.ts` uses, so read and write agree on what a
 * path means and a caller never has to guess which functions want a player-relative path.
 */
export function readContainer(r: SaveReader, containerPath: readonly PathStep[]): ContainerView {
  const c = r.node(containerPath);
  if (c < 0) throw new EditError(`no such container: ${containerPath.join('/')}`);
  const width = Number(r.num(['Width'], c) ?? 0);
  const height = Number(r.num(['Height'], c) ?? 0);
  const validNode = child(r, ['ValidSlotIndices'], c);
  const validCells: [number, number][] = [];
  if (validNode >= 0) {
    for (const idx of r.doc.children(validNode)) {
      const x = r.num(['X'], idx);
      const y = r.num(['Y'], idx);
      if (x !== undefined && y !== undefined) validCells.push([Number(x), Number(y)]);
    }
  }
  const slots: SlotView[] = [];
  const slotsNode = child(r, ['Slots'], c);
  if (slotsNode >= 0) {
    let i = 0;
    for (const s of r.doc.children(slotsNode)) {
      const arrayIndex = i++;
      const x = Number(r.num(['Index', 'X'], s) ?? 0);
      const y = Number(r.num(['Index', 'Y'], s) ?? 0);
      const id = r.text(['Id'], s) ?? '';
      const invType = r.text(['Type', 'InventoryType'], s) ?? '';
      const amount = Number(r.num(['Amount'], s) ?? 0);
      const maxAmount = Number(r.num(['MaxAmount'], s) ?? 0);
      slots.push({ arrayIndex, x, y, id, invType, amount, maxAmount });
    }
  }
  return { width, height, validCells, slots };
}

/** Change just the quantity in an existing slot (clamped by the caller against maxAmount). */
export function setSlotAmount(label: string, containerPath: readonly PathStep[], arrayIndex: number, amount: number): Op {
  return {
    label,
    compile(doc, keys) {
      const node = resolve(doc, keys, [...containerPath, 'Slots', arrayIndex, 'Amount']);
      return [{ start: doc.tree.start[node]!, end: doc.tree.end[node]!, bytes: literal.number(amount) }];
    },
  };
}

/** Replace an existing slot's item entirely, keeping its position. */
export function setSlotItem(label: string, containerPath: readonly PathStep[], arrayIndex: number, id: string, invType: string, amount: number, maxAmount: number): Op {
  return {
    label,
    compile(doc, keys) {
      const base = [...containerPath, 'Slots', arrayIndex] as const;
      const idNode = resolve(doc, keys, [...base, 'Id']);
      const typeNode = resolve(doc, keys, [...base, 'Type', 'InventoryType']);
      const amtNode = resolve(doc, keys, [...base, 'Amount']);
      const maxNode = resolve(doc, keys, [...base, 'MaxAmount']);
      return [
        { start: doc.tree.start[idNode]!, end: doc.tree.end[idNode]!, bytes: literal.string(id) },
        { start: doc.tree.start[typeNode]!, end: doc.tree.end[typeNode]!, bytes: literal.string(invType) },
        { start: doc.tree.start[amtNode]!, end: doc.tree.end[amtNode]!, bytes: literal.number(amount) },
        { start: doc.tree.start[maxNode]!, end: doc.tree.end[maxNode]!, bytes: literal.number(maxAmount) },
      ];
    },
  };
}

/** Remove whatever is in a slot — the cell stays unlocked and empty, ready to fill again. */
export function clearSlot(label: string, containerPath: readonly PathStep[], arrayIndex: number): Op {
  return removeArrayItem(label, [...containerPath, 'Slots'], arrayIndex);
}

/** Serialize one full slot object with the save's actual (obfuscated or plain) key style. */
function slotBytes(keys: KeyMap, x: number, y: number, id: string, invType: string, amount: number, maxAmount: number): Uint8Array {
  const k = (name: string) => encodeJsonString(keys.style === 'plain' ? name : keys.key(name));
  const part = (name: string, valueBytes: Uint8Array) => concatBytes([k(name), binaryToBytes(':'), valueBytes]);
  const obj = (pairs: Uint8Array[]) => concatBytes([binaryToBytes('{'), ...pairs.flatMap((p, i) => (i ? [binaryToBytes(','), p] : [p])), binaryToBytes('}')]);
  return obj([
    part('Type', obj([part('InventoryType', literal.string(invType))])),
    part('Id', literal.string(id)),
    part('Amount', literal.number(amount)),
    part('MaxAmount', literal.number(maxAmount)),
    part('DamageFactor', literal.number(0)),
    part('FullyInstalled', literal.boolean(true)),
    part('AddedAutomatically', literal.boolean(false)),
    part('Index', obj([part('X', literal.number(x)), part('Y', literal.number(y))])),
  ]);
}

/** Put an item into a currently-empty (but unlocked) grid cell — appends a new slot entry. */
export function fillSlot(label: string, containerPath: readonly PathStep[], x: number, y: number, id: string, invType: string, amount: number, maxAmount: number): Op {
  return {
    label,
    compile(doc, keys) {
      return appendArrayItem(label, [...containerPath, 'Slots'], slotBytes(keys, x, y, id, invType, amount, maxAmount)).compile(doc, keys);
    },
  };
}
