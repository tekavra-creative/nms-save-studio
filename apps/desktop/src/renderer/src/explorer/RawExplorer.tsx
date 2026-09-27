import { useCallback, useEffect, useState } from 'react';
import type { ContainerListEntryView, ContainerView, ExplorerStateView, LeafKindView, LeafValueView, NodeSummaryView, PathStepView, SearchHitView, WriteResultView } from '../../../shared/api.ts';
import type { SkinManifest } from '../skins/types.ts';
import './explorer.css';
import { InventoryGrid } from './InventoryGrid.tsx';

interface Props {
  skin: SkinManifest;
  root: string;
  slot: number;
  onBack: () => void;
}

interface Crumb {
  path: PathStepView[];
  label: string;
}

/**
 * Full editing, no fixed feature list: this browses and edits whatever is actually IN the save —
 * any field, any category, any save version — instead of a hand-built screen per domain that goes
 * stale the moment the game adds something new.
 */
export function RawExplorer({ skin, root, slot, onBack }: Props) {
  const [explorerId, setExplorerId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ path: [], label: 'Save' }]);
  const [children, setChildren] = useState<NodeSummaryView[]>([]);
  const [isArray, setIsArray] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ row: NodeSummaryView; leaf: LeafValueView; draft: string } | null>(null);
  const [writeStage, setWriteStage] = useState<'idle' | 'confirm' | 'busy'>('idle');
  const [written, setWritten] = useState<WriteResultView | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHitView[] | null>(null);
  const [tab, setTab] = useState<'fields' | 'inventory'>('fields');
  const [containers, setContainers] = useState<ContainerListEntryView[]>([]);
  const [activeContainer, setActiveContainer] = useState<string | null>(null);
  const [containerView, setContainerView] = useState<ContainerView | null>(null);

  const path = crumbs[crumbs.length - 1]!.path;

  const applyState = (s: ExplorerStateView) => {
    setChildren(s.children);
    setIsArray(s.isArray);
    setCanUndo(s.canUndo);
    setCanRedo(s.canRedo);
  };

  useEffect(() => {
    window.studio
      .openExplorer(root, slot)
      .then((s) => {
        setExplorerId(s.explorerId);
        setTitle(s.title);
        applyState(s);
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      // fire and forget: closing is best-effort cleanup, the host GCs orphaned sessions on app quit
    };
  }, [root, slot]);

  useEffect(() => () => {
    if (explorerId) void window.studio.closeExplorer(explorerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explorerId]);

  const go = useCallback(
    (nextPath: PathStepView[], label: string, atIndex?: number) => {
      if (!explorerId) return;
      window.studio
        .explorerList(explorerId, nextPath)
        .then((s) => {
          applyState(s);
          setCrumbs((cs) => (atIndex !== undefined ? [...cs.slice(0, atIndex + 1)] : [...cs, { path: nextPath, label }]));
          setEditing(null);
        })
        .catch((e: Error) => setError(e.message));
    },
    [explorerId],
  );

  const openRow = (row: NodeSummaryView) => {
    if (!explorerId) return;
    const nextPath = [...path, row.key];
    if (row.kind === 'object' || row.kind === 'array') {
      go(nextPath, row.name);
      return;
    }
    window.studio
      .explorerGetLeaf(explorerId, nextPath)
      .then((leaf) => setEditing({ row, leaf, draft: leaf.value === null ? 'null' : String(leaf.value) }))
      .catch((e: Error) => setError(e.message));
  };

  const saveLeaf = () => {
    if (!explorerId || !editing) return;
    const kind: LeafKindView = editing.leaf.kind;
    window.studio
      .explorerSetLeaf(explorerId, [...path, editing.row.key], kind, editing.draft)
      .then((s) => {
        applyState(s);
        setEditing(null);
      })
      .catch((e: Error) => setError(e.message));
  };

  const duplicateItem = (index: number) => {
    if (!explorerId) return;
    window.studio.explorerDuplicateItem(explorerId, path, index).then(applyState).catch((e: Error) => setError(e.message));
  };

  const removeItem = (index: number) => {
    if (!explorerId) return;
    window.studio.explorerRemoveItem(explorerId, path, index).then(applyState).catch((e: Error) => setError(e.message));
  };

  const runSearch = (q: string) => {
    setQuery(q);
    if (!explorerId) return;
    if (!q.trim()) {
      setHits(null);
      return;
    }
    window.studio
      .explorerSearch(explorerId, q)
      .then(setHits)
      .catch((e: Error) => setError(e.message));
  };

  const jumpToHit = (hit: SearchHitView) => {
    if (!explorerId) return;
    const isLeaf = hit.kind !== 'object' && hit.kind !== 'array';
    const containerPath = isLeaf ? hit.path.slice(0, -1) : hit.path;
    window.studio
      .explorerList(explorerId, containerPath)
      .then((s) => {
        applyState(s);
        setCrumbs([{ path: [], label: 'Save' }, ...(containerPath.length ? [{ path: containerPath, label: '…' }] : [])]);
        setHits(null);
        setQuery('');
        if (isLeaf) {
          window.studio
            .explorerGetLeaf(explorerId, hit.path)
            .then((leaf) => setEditing({ row: { key: hit.path[hit.path.length - 1]!, name: hit.name, kind: hit.kind, childCount: -1, preview: hit.preview }, leaf, draft: leaf.value === null ? 'null' : String(leaf.value) }))
            .catch((e: Error) => setError(e.message));
        }
      })
      .catch((e: Error) => setError(e.message));
  };

  const refreshContainer = useCallback(
    (key: string) => {
      if (!explorerId) return;
      window.studio.inventoryOpen(explorerId, key).then(setContainerView).catch((e: Error) => setError(e.message));
    },
    [explorerId],
  );

  useEffect(() => {
    if (!explorerId || tab !== 'inventory') return;
    window.studio.inventoryContainers(explorerId).then(setContainers).catch((e: Error) => setError(e.message));
  }, [explorerId, tab]);

  const pickContainer = (key: string) => {
    setActiveContainer(key);
    refreshContainer(key);
  };

  const applyContainer = (v: ContainerView) => {
    setContainerView(v);
    setContainers((cs) => cs.map((c) => (c.key === v.key ? { ...c, used: v.slots.length } : c)));
    // the footer's Undo/Redo reflect the tree session, which this edit also just changed
    if (explorerId) window.studio.explorerList(explorerId, path).then(applyState).catch(() => {});
  };
  const onInventoryError = (e: Error) => setError(e.message);

  const setSlotAmountOp = (arrayIndex: number, amount: number) => {
    if (!explorerId || !activeContainer) return;
    window.studio.inventorySetAmount(explorerId, activeContainer, arrayIndex, amount).then(applyContainer).catch(onInventoryError);
  };
  const setSlotItemOp = (arrayIndex: number, itemId: string, amount: number) => {
    if (!explorerId || !activeContainer) return;
    window.studio.inventorySetItem(explorerId, activeContainer, arrayIndex, itemId, amount).then(applyContainer).catch(onInventoryError);
  };
  const fillSlotOp = (x: number, y: number, itemId: string, amount: number) => {
    if (!explorerId || !activeContainer) return;
    window.studio.inventoryFillSlot(explorerId, activeContainer, x, y, itemId, amount).then(applyContainer).catch(onInventoryError);
  };
  const clearSlotOp = (arrayIndex: number) => {
    if (!explorerId || !activeContainer) return;
    window.studio.inventoryClearSlot(explorerId, activeContainer, arrayIndex).then(applyContainer).catch(onInventoryError);
  };

  const undo = () =>
    explorerId &&
    window.studio
      .explorerUndo(explorerId)
      .then(applyState)
      .then(() => activeContainer && refreshContainer(activeContainer))
      .catch((e: Error) => setError(e.message));
  const redo = () =>
    explorerId &&
    window.studio
      .explorerRedo(explorerId)
      .then(applyState)
      .then(() => activeContainer && refreshContainer(activeContainer))
      .catch((e: Error) => setError(e.message));

  const write = () => {
    if (!explorerId) return;
    if (writeStage !== 'confirm') {
      setWriteStage('confirm');
      return;
    }
    setWriteStage('busy');
    window.studio
      .writeExplorer(explorerId)
      .then((res) => {
        setWritten(res);
        setWriteStage('idle');
      })
      .catch((e: Error) => {
        setError(e.message);
        setWriteStage('idle');
      });
  };

  return (
    <div className="app explorer">
      <header className="top">
        <div className="brand">
          <skin.Mark />
          <h1 className="word">Raw Explorer</h1>
          <span className="sub">{title || `Slot ${slot}`}</span>
        </div>
        <button type="button" className="back" onClick={onBack}>
          ← Saves
        </button>
      </header>

      <div className="explorer-shell">
      {error && (
        <p className="studio-error" role="alert">
          {error}
        </p>
      )}
      {written && (
        <p className="explorer-written" role="status">
          Written to slot {written.slot}. Backed up first at <code>{written.snapshot}</code>.
        </p>
      )}

      <div className="explorer-toolbar">
        <div className="explorer-tabs" role="tablist" aria-label="View">
          <button type="button" role="tab" aria-selected={tab === 'fields'} onClick={() => setTab('fields')}>
            Fields
          </button>
          <button type="button" role="tab" aria-selected={tab === 'inventory'} onClick={() => setTab('inventory')}>
            Inventories
          </button>
        </div>
        {tab === 'fields' && (
          <nav className="explorer-crumbs" aria-label="Path">
            {crumbs.map((c, i) => (
              <span key={i}>
                {i > 0 && <span className="sep">/</span>}
                <button type="button" disabled={i === crumbs.length - 1} onClick={() => go(c.path, c.label, i)}>
                  {c.label}
                </button>
              </span>
            ))}
          </nav>
        )}
        {tab === 'fields' && (
          <div className="explorer-search">
            <input
              type="search"
              placeholder="Search every field in this save…"
              value={query}
              onChange={(e) => runSearch(e.target.value)}
              aria-label="Search"
            />
            {hits && (
              <ul className="explorer-hits" aria-label="Search results">
                {hits.length === 0 && <li className="explorer-empty">No matches.</li>}
                {hits.map((h, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => jumpToHit(h)}>
                      <span className="hit-main">
                        <span className="name">{h.name}</span>
                        <span className="preview">{h.preview}</span>
                      </span>
                      <span className="hit-path">{h.path.map(String).join(' / ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {tab === 'fields' ? (
        <main className="explorer-body">
          <ul className="explorer-rows" aria-label="Fields">
            {children.map((row, i) => (
              <li key={String(row.key)}>
                <button type="button" className={`explorer-row kind-${row.kind}`} onClick={() => openRow(row)}>
                  <span className="name">{row.name}</span>
                  <span className="kind">{row.kind === 'object' || row.kind === 'array' ? row.kind : ''}</span>
                  <span className="preview">{row.preview}</span>
                </button>
                {isArray && (
                  <span className="explorer-row-actions">
                    <button type="button" title="Duplicate this item" onClick={() => duplicateItem(i)}>
                      Duplicate
                    </button>
                    <button type="button" title="Remove this item" onClick={() => removeItem(i)}>
                      Remove
                    </button>
                  </span>
                )}
              </li>
            ))}
            {children.length === 0 && <li className="explorer-empty">Nothing here.</li>}
          </ul>

          {editing && (
            <div className="explorer-editor" role="dialog" aria-label={`Edit ${editing.row.name}`}>
              <h3>{editing.row.name}</h3>
              <p className="meta">{editing.leaf.kind}</p>
              {editing.leaf.kind === 'boolean' ? (
                <select value={editing.draft} onChange={(e) => setEditing({ ...editing, draft: e.target.value })}>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  autoFocus
                  value={editing.draft}
                  onChange={(e) => setEditing({ ...editing, draft: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && saveLeaf()}
                  disabled={editing.leaf.kind === 'null'}
                />
              )}
              <div className="row">
                <button type="button" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button type="button" className="primary" onClick={saveLeaf} disabled={editing.leaf.kind === 'null'}>
                  Set
                </button>
              </div>
            </div>
          )}
        </main>
      ) : (
        <InventoryGrid
          containers={containers}
          activeKey={activeContainer}
          view={containerView}
          onPick={pickContainer}
          onSetAmount={setSlotAmountOp}
          onSetItem={setSlotItemOp}
          onFill={fillSlotOp}
          onClear={clearSlotOp}
        />
      )}

      <div className="explorer-foot">
        <button type="button" onClick={undo} disabled={!canUndo}>
          Undo
        </button>
        <button type="button" onClick={redo} disabled={!canRedo}>
          Redo
        </button>
        <button type="button" className="write" onClick={write} disabled={!canUndo || writeStage === 'busy'}>
          <span>{writeStage === 'confirm' ? 'Click again to write into this slot' : 'Write'}</span>
        </button>
      </div>
      </div>
    </div>
  );
}
