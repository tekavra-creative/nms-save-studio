import { applySplices, JsonDoc, type Splice } from '../cst/doc.ts';
import { Kind } from '../cst/scan.ts';
import { appendArrayItem, batch, EditError, resolve, setNumber, type Op, type PathStep } from '../edit.ts';
import type { SaveReader } from '../domains/reader.ts';

/** Ship slot → CharacterCustomisationData index (see docs/format/linked-data.md). */
export function shipCustomisationIndex(slot: number): number {
  return slot < 6 ? slot + 3 : slot + 11;
}

export type AssetKind = 'ship' | 'multitool' | 'companion';

export interface MoveBlocked {
  reason: string;
}

function seedSet(r: SaveReader, path: readonly PathStep[], from: number): boolean {
  const n = r.node(path, from);
  if (n < 0) return false;
  const flag = r.doc.child(n, 0);
  return flag >= 0 && r.doc.kind(flag) === Kind.True;
}

export function isShipSlotEmpty(r: SaveReader, slot: number): boolean {
  const n = r.node(['ShipOwnership', slot], r.player);
  if (n < 0) return false;
  return !seedSet(r, ['Resource', 'Seed'], n) && !(r.text(['Resource', 'Filename'], n) ?? '');
}

export function isMultitoolSlotEmpty(r: SaveReader, slot: number): boolean {
  const n = r.node(['Multitools', slot], r.player);
  return n >= 0 && !seedSet(r, ['Seed'], n);
}

export function isCompanionSlotEmpty(r: SaveReader, slot: number): boolean {
  const n = r.node(['Pets', slot], r.player);
  return n >= 0 && !seedSet(r, ['CreatureSeed'], n);
}

export function companionSlotUnlocked(r: SaveReader, slot: number): boolean {
  const n = r.node(['UnlockedPetSlots', slot], r.player);
  return n >= 0 && r.doc.kind(n) === Kind.True;
}

/** First slot in the target that can receive this kind of asset, or a reason why none can. */
export function freeSlot(kind: AssetKind, target: SaveReader, taken: ReadonlySet<number> = new Set()): number | MoveBlocked {
  const p = target.player;
  const arr = kind === 'ship' ? 'ShipOwnership' : kind === 'multitool' ? 'Multitools' : 'Pets';
  const n = target.count([arr], p);
  for (let i = 0; i < n; i++) {
    if (taken.has(i)) continue;
    if (kind === 'ship' && isShipSlotEmpty(target, i)) return i;
    if (kind === 'multitool' && isMultitoolSlotEmpty(target, i)) return i;
    if (kind === 'companion' && isCompanionSlotEmpty(target, i) && companionSlotUnlocked(target, i)) return i;
  }
  const label = kind === 'ship' ? 'starship' : kind === 'multitool' ? 'multi-tool' : 'unlocked companion';
  return { reason: `No free ${label} slot in this save.` };
}

/** A corvette's ship record (`Resource.Filename` contains `BIGGS`) has a matching base entry that must move with it. */
export function isCorvette(r: SaveReader, slot: number): boolean {
  const n = r.node(['ShipOwnership', slot], r.player);
  return (r.text(['Resource', 'Filename'], n) ?? '').toUpperCase().includes('BIGGS');
}

/** The `PersistentPlayerBases` entry for a corvette in ship slot `slot`, or -1 if none is linked. */
export function findCorvetteBase(r: SaveReader, slot: number): number {
  const n = r.count(['PersistentPlayerBases'], r.player);
  for (let i = 0; i < n; i++) {
    const entry = r.node(['PersistentPlayerBases', i], r.player);
    if (r.text(['BaseType', 'PersistentBaseTypes'], entry) === 'PlayerShipBase' && Number(r.num(['UserData'], entry) ?? -1) === slot) {
      return entry;
    }
  }
  return -1;
}

export function transferBlockedReason(kind: AssetKind, source: SaveReader, slot: number): string | undefined {
  if (kind !== 'ship' || !isCorvette(source, slot)) return undefined;
  const primary = Number(source.num(['PrimaryShip'], source.player) ?? -1);
  if (primary === slot) return 'Moving your primary corvette risks corrupting its build record — make another ship primary first.';
  if (findCorvetteBase(source, slot) < 0) return "Can't find this corvette's build record — moving it isn't safe.";
  return undefined;
}

interface Piece {
  path: PathStep[];
  bytes: Uint8Array;
}

function copyPiece(source: SaveReader, from: PathStep[], to: PathStep[]): Piece {
  const n = source.node(from, source.player);
  if (n < 0) throw new EditError(`source is missing ${from.join('.')}`);
  return { path: to, bytes: source.doc.span(n).slice() };
}

function replaceAll(label: string, playerPath: readonly PathStep[], pieces: Piece[], guard?: (doc: import('../cst/doc.ts').JsonDoc, keys: import('../keys/mapping.ts').KeyMap) => void): Op {
  return {
    label,
    compile(doc, keys) {
      guard?.(doc, keys);
      return pieces.map((pc): Splice => {
        const node = resolve(doc, keys, [...playerPath, ...pc.path]);
        return { start: doc.tree.start[node]!, end: doc.tree.end[node]!, bytes: pc.bytes };
      });
    },
  };
}

/**
 * Copy one asset from `source` slot into an empty `target` slot, moving every linked piece
 * with it. The source file is never modified.
 */
export function transferAsset(kind: AssetKind, source: SaveReader, sourceSlot: number, target: SaveReader, targetSlot: number, label: string): Op {
  const blocked = transferBlockedReason(kind, source, sourceSlot);
  if (blocked) throw new EditError(blocked);
  if (source.keys.style !== target.keys.style) throw new EditError('saves use different key styles');
  let pieces: Piece[];
  if (kind === 'ship') {
    if (isShipSlotEmpty(source, sourceSlot)) throw new EditError('source ship slot is empty');
    pieces = [
      copyPiece(source, ['ShipOwnership', sourceSlot], ['ShipOwnership', targetSlot]),
      copyPiece(source, ['ShipUsesLegacyColours', sourceSlot], ['ShipUsesLegacyColours', targetSlot]),
      copyPiece(
        source,
        ['CharacterCustomisationData', shipCustomisationIndex(sourceSlot)],
        ['CharacterCustomisationData', shipCustomisationIndex(targetSlot)],
      ),
    ];
    if (isCorvette(source, sourceSlot)) {
      const baseNode = findCorvetteBase(source, sourceSlot);
      if (baseNode < 0) throw new EditError("corvette build record not found — this shouldn't happen after transferBlockedReason passed");
      const rawBytes = source.doc.span(baseNode).slice();
      const patchSplices = setNumber('patch UserData', ['UserData'], targetSlot).compile(new JsonDoc(rawBytes), target.keys);
      const patchedBytes = applySplices(rawBytes, patchSplices);
      const shipOp = replaceAll(label, target.playerPath, pieces);
      const baseAppendOp = appendArrayItem(label, [...target.playerPath, 'PersistentPlayerBases'], patchedBytes);
      return batch(label, [shipOp, baseAppendOp]);
    }
  } else if (kind === 'multitool') {
    if (isMultitoolSlotEmpty(source, sourceSlot)) throw new EditError('source multi-tool slot is empty');
    pieces = [copyPiece(source, ['Multitools', sourceSlot], ['Multitools', targetSlot])];
  } else {
    if (isCompanionSlotEmpty(source, sourceSlot)) throw new EditError('source companion slot is empty');
    pieces = [
      copyPiece(source, ['Pets', sourceSlot], ['Pets', targetSlot]),
      copyPiece(source, ['PetAccessoryCustomisation', sourceSlot], ['PetAccessoryCustomisation', targetSlot]),
    ];
  }
  return replaceAll(label, target.playerPath, pieces);
}
