import { useState } from 'react';
import type { ContainerListEntryView, ContainerView, InvSlotView, ItemSearchHitView } from '../../../shared/api.ts';

interface Props {
  containers: ContainerListEntryView[];
  activeKey: string | null;
  view: ContainerView | null;
  onPick: (key: string) => void;
  onSetAmount: (arrayIndex: number, amount: number) => void;
  onSetItem: (arrayIndex: number, itemId: string, amount: number) => void;
  onFill: (x: number, y: number, itemId: string, amount: number) => void;
  onClear: (arrayIndex: number) => void;
}

const iconUrl = (path?: string) => (path ? `nms-icon://icon/${path}` : undefined);

/** Search + pick an item, then hand back (id, amount) — used both to fill an empty cell and to swap an occupied one. */
function ItemPicker({ onPick, onCancel, initialAmount }: { onPick: (id: string, amount: number) => void; onCancel: () => void; initialAmount: number }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ItemSearchHitView[]>([]);
  const [picked, setPicked] = useState<ItemSearchHitView | null>(null);
  const [amount, setAmount] = useState(String(initialAmount));

  const search = (q: string) => {
    setQuery(q);
    if (!q.trim()) return setHits([]);
    window.studio.itemSearch(q).then(setHits).catch(() => setHits([]));
  };

  return (
    <div className="inv-editor" role="dialog" aria-label="Choose an item">
      {!picked ? (
        <>
          <input autoFocus type="search" placeholder="Search items…" value={query} onChange={(e) => search(e.target.value)} aria-label="Search items" />
          <ul className="inv-picker-hits">
            {hits.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => setPicked(h)}>
                  {iconUrl(h.iconPath) && <img src={iconUrl(h.iconPath)} alt="" />}
                  <span className="name">{h.name}</span>
                  <span className="kind">{h.kind}</span>
                </button>
              </li>
            ))}
            {query && hits.length === 0 && <li className="inv-empty">No items match.</li>}
          </ul>
          <div className="row">
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <h3>
            {iconUrl(picked.iconPath) && <img src={iconUrl(picked.iconPath)} alt="" />}
            {picked.name}
          </h3>
          <label>
            Amount
            <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </label>
          <div className="row">
            <button type="button" onClick={() => setPicked(null)}>
              Back
            </button>
            <button type="button" className="primary" onClick={() => onPick(picked.id, Math.max(1, Number(amount) || 1))}>
              Set
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function InventoryGrid({ containers, activeKey, view, onPick, onSetAmount, onSetItem, onFill, onClear }: Props) {
  const [selected, setSelected] = useState<{ mode: 'slot'; slot: InvSlotView } | { mode: 'empty'; x: number; y: number } | { mode: 'swap'; slot: InvSlotView } | null>(null);
  const [amountDraft, setAmountDraft] = useState('');

  const bySlot = new Map<string, InvSlotView>();
  if (view) for (const s of view.slots) bySlot.set(`${s.x},${s.y}`, s);
  const validSet = new Set(view?.validCells.map(([x, y]) => `${x},${y}`) ?? []);

  const openSlot = (slot: InvSlotView) => {
    setSelected({ mode: 'slot', slot });
    setAmountDraft(String(slot.amount));
  };

  return (
    <div className="inv-layout">
      <ul className="inv-containers" aria-label="Inventory containers">
        {containers.map((c) => (
          <li key={c.key}>
            <button type="button" className={c.key === activeKey ? 'is-active' : ''} onClick={() => onPick(c.key)}>
              <span className="name">{c.label}</span>
              <span className="cap">
                {c.used}/{c.capacity}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {view && (
        <div className="inv-grid-wrap">
          <div className="inv-grid" style={{ gridTemplateColumns: `repeat(${view.width}, 1fr)`, gridTemplateRows: `repeat(${view.height}, auto)` }}>
            {Array.from({ length: view.height }, (_, y) =>
              Array.from({ length: view.width }, (_, x) => {
                const key = `${x},${y}`;
                const slot = bySlot.get(key);
                const valid = validSet.has(key);
                if (!valid) return <div key={key} className="inv-cell is-locked" />;
                if (slot) {
                  return (
                    <button key={key} type="button" className="inv-cell is-full" onClick={() => openSlot(slot)} title={slot.item.name}>
                      {iconUrl(slot.item.iconPath) ? <img src={iconUrl(slot.item.iconPath)} alt="" /> : <span className="fallback">{slot.item.name.slice(0, 2)}</span>}
                      <span className="amt">{slot.amount}</span>
                    </button>
                  );
                }
                return (
                  <button key={key} type="button" className="inv-cell is-empty" onClick={() => setSelected({ mode: 'empty', x, y })}>
                    +
                  </button>
                );
              }),
            )}
          </div>
        </div>
      )}

      {selected?.mode === 'slot' && (
        <div className="inv-editor" role="dialog" aria-label={selected.slot.item.name}>
          <h3>
            {iconUrl(selected.slot.item.iconPath) && <img src={iconUrl(selected.slot.item.iconPath)} alt="" />}
            {selected.slot.item.name}
          </h3>
          <p className="meta">
            {selected.slot.item.kind} · at {selected.slot.x},{selected.slot.y}
          </p>
          <label>
            Amount (max {selected.slot.maxAmount})
            <input
              type="number"
              min={0}
              max={selected.slot.maxAmount}
              value={amountDraft}
              onChange={(e) => setAmountDraft(e.target.value)}
              autoFocus
            />
          </label>
          <div className="row">
            <button type="button" onClick={() => setSelected(null)}>
              Close
            </button>
            <button type="button" onClick={() => setSelected({ mode: 'swap', slot: selected.slot })}>
              Change item
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                onClear(selected.slot.arrayIndex);
                setSelected(null);
              }}
            >
              Remove
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                onSetAmount(selected.slot.arrayIndex, Math.max(0, Math.min(selected.slot.maxAmount, Number(amountDraft) || 0)));
                setSelected(null);
              }}
            >
              Set
            </button>
          </div>
        </div>
      )}

      {selected?.mode === 'swap' && (
        <ItemPicker
          initialAmount={selected.slot.amount}
          onCancel={() => setSelected(null)}
          onPick={(id, amount) => {
            onSetItem(selected.slot.arrayIndex, id, amount);
            setSelected(null);
          }}
        />
      )}

      {selected?.mode === 'empty' && (
        <ItemPicker
          initialAmount={1}
          onCancel={() => setSelected(null)}
          onPick={(id, amount) => {
            onFill(selected.x, selected.y, id, amount);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
