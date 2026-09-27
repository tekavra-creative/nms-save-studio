import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CurrencyField, CurrencyMode, MergeStateView, WriteResultView } from '../../../shared/api.ts';
import type { SkinManifest } from '../skins/types.ts';
import { BackIcon, CheckIcon, LockIcon, RedoIcon, RevertIcon, UndoIcon, Use } from '../ui/icons.tsx';
import { CommandPalette, type Command } from '../ui/CommandPalette.tsx';
import { DragEngine } from './drag.ts';
import {
  bays,
  capacity,
  catById,
  CATS,
  changeRows,
  currencyRows,
  knowledgeRows,
  shortNumber,
  sourceItems,
  type Cat,
  type CatId,
  type ValueRow,
} from './model.ts';
import { useMerge } from './useMerge.ts';

interface Props {
  root: string;
  targetSlot: number;
  sourceSlot: number;
  skin: SkinManifest;
  skinCommands: Command[];
  onBack: () => void;
}

const MODES: { id: CurrencyMode; label: string }[] = [
  { id: 'sum', label: 'Sum' },
  { id: 'keep-target', label: 'Keep' },
  { id: 'take-source', label: 'Replace' },
];

const fmt = (n: bigint) => n.toLocaleString();

export function MergeStudio({ root, targetSlot, sourceSlot, skin, skinCommands, onBack }: Props) {
  const merge = useMerge(root, targetSlot, sourceSlot);
  const { state } = merge;
  const w = skin.words;
  const [catId, setCatId] = useState<CatId>('ships');
  const [phase, setPhase] = useState<'edit' | 'writing' | 'written'>('edit');
  const [written, setWritten] = useState<WriteResultView | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [running, setRunning] = useState(false);
  const [palette, setPalette] = useState(false);
  const [arriving, setArriving] = useState<number | null>(null);
  const [fresh, setFresh] = useState<number | null>(null);
  const [live, setLive] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const engine = useRef<DragEngine | null>(null);
  const tether = useRef<{ svg: SVGSVGElement | null; path: SVGPathElement | null; ox: number; oy: number }>({ svg: null, path: null, ox: 0, oy: 0 });
  const stateRef = useRef<MergeStateView | null>(null);
  stateRef.current = state;

  const cat = catById(catId);
  const say = useCallback((msg: string) => {
    setLive('');
    setTimeout(() => setLive(msg), 30);
  }, []);

  useEffect(() => {
    if (state && !name) setName(`${state.targetTitle} + ${state.sourceTitle}`.slice(0, 100));
  }, [state, name]);

  useEffect(() => {
    const poll = () => window.studio.gameRunning().then(setRunning).catch(() => {});
    poll();
    const t = setInterval(poll, 2500);
    return () => clearInterval(t);
  }, []);

  // Drag engine: one instance, reads the latest state through refs.
  useEffect(() => {
    if (!rootRef.current) return;
    const e = new DragEngine(rootRef.current, {
      ghost: (src) => {
        const el = document.createElement('div');
        el.className = 'card is-staged';
        const art = src.dataset['art'] ?? 'g-starship';
        el.innerHTML = `<svg class="art" aria-hidden="true"><use href="#${art}"/></svg><b></b><span class="s"></span><span class="pip"></span>`;
        el.querySelector('b')!.textContent = src.dataset['name'] ?? '';
        el.querySelector('.s')!.textContent = src.dataset['sub'] ?? '';
        el.querySelector('.pip')!.textContent = w.staged;
        return el;
      },
      copy: (src) => {
        const cid = Number(src.dataset['changeId']);
        if (Number.isNaN(cid)) return;
        const s = stateRef.current;
        const ch = s?.changes.find((c) => c.id === cid);
        if (ch?.ref.kind === 'asset') setArriving(ch.ref.targetSlot);
        setFresh(cid);
        void merge.apply([cid]);
        say(`${src.dataset['name']} staged. Nothing is written until you press Write.`);
      },
      landed: () => setTimeout(() => setArriving(null), 1200),
      refuse: (src, why) => say(why === 'full' ? `No free ${cat.place || 'space'} left in this save.` : `${src.dataset['name']}: ${src.dataset['reason'] ?? 'already staged.'}`),
      cancelled: () => say('Drag cancelled. Nothing changed.'),
      tether: {
        start: (r) => {
          const t = tether.current;
          t.ox = r.left + r.width / 2;
          t.oy = r.top + 10;
          t.svg?.classList.add('on');
        },
        move: (x, y) => {
          const t = tether.current;
          const cx = (t.ox + x) / 2;
          const cy = Math.min(t.oy, y) - 40;
          t.path?.setAttribute('d', `M${t.ox},${t.oy} Q${cx},${cy} ${x},${y}`);
        },
        end: () => tether.current.svg?.classList.remove('on'),
      },
    });
    engine.current = e;
    return () => e.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state !== null]);

  const lastAssetFly = useCallback((cid: number | undefined) => {
    const s = stateRef.current;
    const ch = s?.changes.find((c) => c.id === cid);
    if (!ch || ch.ref.kind !== 'asset' || !rootRef.current) return;
    const bay = rootRef.current.querySelector<HTMLElement>(`[data-bay="${ch.ref.targetSlot}"]`);
    const src = rootRef.current.querySelector<HTMLElement>(`[data-src-item="${ch.ref.asset}:${ch.ref.sourceSlot}"]`);
    if (bay) engine.current?.flyBack(bay, src);
  }, []);

  const undo = useCallback(() => {
    if (!state?.canUndo || phase !== 'edit') return;
    lastAssetFly(state.appliedOrder[state.appliedOrder.length - 1]);
    void merge.undo();
    say('Undone.');
  }, [state, phase, merge, lastAssetFly, say]);

  const redo = useCallback(() => {
    if (!state?.canRedo || phase !== 'edit') return;
    void merge.redo();
    say('Redone.');
  }, [state, phase, merge, say]);

  const revert = useCallback(
    (cid: number) => {
      lastAssetFly(cid);
      void merge.revert(cid);
      say('Change reverted.');
    },
    [merge, lastAssetFly, say],
  );

  const applied = state?.appliedOrder.length ?? 0;
  const writeBlocked = !state ? 'Opening…' : running ? 'Quit No Man’s Sky to write.' : state.newSlot === null ? 'Every save slot is full — delete one in the game first.' : applied === 0 ? null : null;

  const write = useCallback(async () => {
    if (!state || applied === 0 || writeBlocked || phase !== 'edit') return;
    setPhase('writing');
    setWriteError(null);
    try {
      const res = await merge.write(name);
      setWritten(res);
      setPhase('written');
      say(`Written to slot ${res.slot}.`);
    } catch (e) {
      setWriteError((e as Error).message);
      setPhase('edit');
    }
  }, [state, applied, writeBlocked, phase, merge, name, say]);

  // Keyboard: ⌘Z / ⇧⌘Z / ⌘S / ⌘K / 1–5
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest('input, textarea');
      if (e.metaKey || e.ctrlKey) {
        const k = e.key.toLowerCase();
        if (k === 'k') {
          e.preventDefault();
          setPalette((p) => !p);
        } else if (k === 'z' && !typing) {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        } else if (k === 's') {
          e.preventDefault();
          void write();
        }
        return;
      }
      if (typing || palette) return;
      const c = CATS.find((x) => x.key === e.key);
      if (c) setCatId(c.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, write, palette]);

  const commands: Command[] = useMemo(() => {
    const list: Command[] = CATS.map((c) => ({ id: `cat:${c.id}`, label: `Go to ${c.label}`, hint: c.key, run: () => setCatId(c.id) }));
    if (state) {
      const ready = state.changes.filter((c) => !c.applied && c.ref.kind === 'asset');
      if (ready.length) list.push({ id: 'bring-all', label: `Bring everything that fits (${ready.length})`, run: () => void merge.apply(ready.map((c) => c.id)) });
      const rest = state.changes.filter((c) => !c.applied && c.ref.kind !== 'asset');
      if (rest.length) list.push({ id: 'learn-all', label: 'Merge all currencies and knowledge', run: () => void merge.apply(rest.map((c) => c.id)) });
    }
    list.push({ id: 'undo', label: 'Undo', hint: '⌘Z', run: undo }, { id: 'redo', label: 'Redo', hint: '⇧⌘Z', run: redo });
    list.push({ id: 'write', label: 'Write changes', hint: '⌘S', run: () => void write() });
    list.push({ id: 'back', label: 'Back to your saves', run: onBack });
    return [...list, ...skinCommands];
  }, [state, merge, undo, redo, write, onBack, skinCommands]);

  if (merge.error && !state) {
    return (
      <div className="app" ref={rootRef}>
        <TopBar skin={skin} cat={cat} setCat={setCatId} onBack={onBack} onPalette={() => setPalette(true)} />
        <p className="studio-error" role="alert">{merge.error}</p>
      </div>
    );
  }

  return (
    <>
    <div className="app" ref={rootRef}>
      <TopBar skin={skin} cat={cat} setCat={setCatId} onBack={onBack} onPalette={() => setPalette(true)} />
      <main className="stage" aria-busy={!state}>
        {state ? (
          <>
            <Hero state={state} cat={cat} skin={skin} arriving={arriving} onStage={(ids) => void merge.apply(ids)} />
            <Orbit state={state} cat={cat} skin={skin} />
            <Changes
              state={state}
              skin={skin}
              phase={phase}
              written={written}
              fresh={fresh}
              name={name}
              setName={setName}
              blocked={writeBlocked}
              error={writeError ?? merge.error}
              onRevert={revert}
              onMode={(f, m) => void merge.setMode(f, m)}
              onUndo={undo}
              onRedo={redo}
              onWrite={() => void write()}
              onBack={onBack}
            />
          </>
        ) : (
          <p className="studio-loading">Reading both saves…</p>
        )}
      </main>
    </div>
    <svg className="tether" ref={(el) => void (tether.current.svg = el)} aria-hidden="true">
      <path ref={(el) => void (tether.current.path = el)} d="" />
    </svg>
    <p className="sr-only" aria-live="polite">{live}</p>
    <CommandPalette open={palette} onClose={() => setPalette(false)} commands={commands} />
    </>
  );
}

function TopBar({ skin, cat, setCat, onBack, onPalette }: { skin: SkinManifest; cat: Cat; setCat: (c: CatId) => void; onBack: () => void; onPalette: () => void }) {
  return (
    <header className="top">
      <div className="brand">
        <button type="button" className="back" onClick={onBack} aria-label="Back to your saves" title="Back to your saves">
          <BackIcon />
        </button>
        <skin.Mark />
        <h1 className="word" translate="no">{skin.name.toLowerCase()}</h1>
        <span className="sub">for No Man’s Sky</span>
      </div>
      <nav className="cats glass" aria-label="What to merge">
        {CATS.map((c) => (
          <button key={c.id} type="button" className="cat" aria-current={cat.id === c.id} aria-keyshortcuts={c.key} onClick={() => setCat(c.id)}>
            <Use id={c.glyph} />
            {c.label}
          </button>
        ))}
      </nav>
      <button type="button" className="search glass" onClick={onPalette} aria-haspopup="dialog" aria-keyshortcuts="Meta+K" aria-label="Search or run a command">
        <span className="long">Search or run a command</span>
        <kbd>⌘K</kbd>
      </button>
    </header>
  );
}

function Ring({ state, cat, arriving }: { state: MergeStateView; cat: Cat; arriving: number | null }) {
  const k = capacity(state, cat);
  const N = k.cap;
  const R = 50;
  const C = 56;
  const gap = N > 12 ? 5 : 9;
  const segs = [];
  for (let i = 0; i < N; i++) {
    const a0 = -90 + (i * 360) / N + gap / 2;
    const a1 = -90 + ((i + 1) * 360) / N - gap / 2;
    const p = (a: number) => [C + R * Math.cos((a * Math.PI) / 180), C + R * Math.sin((a * Math.PI) / 180)] as const;
    const [x0, y0] = p(a0);
    const [x1, y1] = p(a1);
    const cls = i < k.own ? 'on' : i < k.used ? 'staged' : '';
    const isNew = arriving !== null && i === k.used - 1 && i >= k.own;
    segs.push(<path key={i} className={`seg ${cls}${isNew ? ' is-new' : ''}`} d={`M${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`} />);
  }
  return (
    <div className="ring" role="meter" aria-label={cat.label} aria-valuemin={0} aria-valuemax={N} aria-valuenow={k.used} aria-valuetext={`${k.used} of ${N}${k.staged ? `, ${k.staged} staged` : ''}`}>
      <svg viewBox="0 0 112 112" aria-hidden="true">{segs}</svg>
      <div className="c">
        <span className="big num">{k.used}</span>
        <span className="of">of {N}</span>
      </div>
    </div>
  );
}

function Side({ state, cat }: { state: MergeStateView; cat: Cat }) {
  const units = BigInt(state.target.units);
  const unitsBefore = BigInt(state.targetBefore.units);
  const bp = state.target.knowledge.products;
  const bpBefore = state.targetBefore.knowledge.products;
  return (
    <div className="g-side">
      {CATS.filter((c) => c.asset && c.id !== cat.id).map((c) => {
        const k = capacity(state, c);
        return (
          <div className="g-row" key={c.id}>
            <Use id={c.glyph} />
            <span>{c.label}</span>
            <b className={`num${k.staged ? ' up' : ''}`}>
              {k.used} / {k.cap}
            </b>
          </div>
        );
      })}
      <div className="g-row">
        <Use id="g-currency" />
        <span>Units</span>
        <b className={`num${units !== unitsBefore ? ' up' : ''}`}>{shortNumber(units)}</b>
      </div>
      <div className="g-row">
        <Use id="g-blueprint" />
        <span>Blueprints</span>
        <b className={`num${bp !== bpBefore ? ' up' : ''}`}>{bp.toLocaleString()}</b>
      </div>
    </div>
  );
}

function Hero({ state, cat, skin, arriving, onStage }: { state: MergeStateView; cat: Cat; skin: SkinManifest; arriving: number | null; onStage: (ids: number[]) => void }) {
  const w = skin.words;
  const newSlot = state.newSlot;
  let body: React.ReactNode;
  let gauge: React.ReactNode;
  if (cat.asset) {
    const k = capacity(state, cat);
    const list = bays(state, cat);
    body = (
      <div className="bay-area">
        <div className="bay-cap">
          <span>{cat.id === 'ships' ? w.hangar : cat.id === 'tools' ? 'Your multi-tools' : 'Your companions'}</span>
          <span>
            {k.free} {w.free}
          </span>
        </div>
        <div className="berths" data-cat={cat.id}>
          {list.map((b) =>
            b.item ? (
              <div key={b.slot} className={`card${b.item.staged ? ' is-staged' : ''}${arriving === b.slot ? ' is-arriving' : ''}`} data-bay={b.slot}>
                <Use id={b.item.art} className="art" />
                <b>{b.item.name}</b>
                <span className="s">
                  {b.item.cls}
                  {b.item.rank ? ` · ${b.item.rank}` : ''}
                </span>
                {b.item.staged && <span className="pip">{w.staged}</span>}
              </div>
            ) : (
              <div key={b.slot} className="card is-empty" data-bay={b.slot} {...(b.next ? { 'data-next-slot': '' } : {})}>
                <span className="open">
                  {b.next && (
                    <>
                      <span className="nf">Next free</span>
                      <span className="here">Let go here</span>
                    </>
                  )}
                </span>
              </div>
            ),
          )}
        </div>
      </div>
    );
    gauge = (
      <div className="gauge">
        <Ring state={state} cat={cat} arriving={arriving} />
        <Side state={state} cat={cat} />
      </div>
    );
  } else {
    const rows = cat.id === 'currency' ? currencyRows(state) : knowledgeRows(state);
    body = (
      <div className="rows">
        {rows.map((r) => (
          <ValueRowView key={r.id} r={r} cat={cat} onStage={onStage} />
        ))}
      </div>
    );
    gauge = (
      <div className="gauge">
        <Side state={state} cat={cat} />
      </div>
    );
  }
  return (
    <section className="hero glass" data-dropzone aria-labelledby="dest-title">
      <div className="h-top">
        <div>
          <div className="eyebrow">
            {w.into}
            <span className="toggle" role="radiogroup" aria-label="Write to">
              <button type="button" role="radio" aria-checked={false} aria-disabled="true" title="Writing into the original save arrives in a later update — a new slot keeps it untouched.">
                This save
              </button>
              <button type="button" role="radio" aria-checked={true}>
                A new slot
              </button>
            </span>
          </div>
          <h2 className="name" id="dest-title" translate="no">
            {newSlot ? (
              <>
                New save <span className="dim">· slot {newSlot}</span>
              </>
            ) : (
              'No free slot'
            )}
          </h2>
          <p className="meta">
            <span>Starts as a copy of {state.targetTitle}</span>
            <span>{state.targetTitle} stays untouched</span>
          </p>
        </div>
        {gauge}
      </div>
      {body}
    </section>
  );
}

function ValueRowView({ r, cat, onStage }: { r: ValueRow; cat: Cat; onStage: (ids: number[]) => void }) {
  const up = r.staged && r.result !== r.a;
  let action: React.ReactNode;
  if (r.staged) action = <span className="pill is-staged">Staged</span>;
  else if (r.changeId === null) action = <span className="pill is-none">{cat.id === 'currency' ? 'Nothing to add' : 'Nothing new'}</span>;
  else
    action = (
      <button type="button" className="pill" onClick={() => onStage([r.changeId!])}>
        {cat.id === 'currency' ? `Merge ${r.label}` : `Learn ${r.gain.toLocaleString()}`}
      </button>
    );
  return (
    <div className="vrow">
      <Use id={r.glyph} />
      <span className="k">{r.label}</span>
      <span className="v num">
        {fmt(r.a)}
        <small>yours now</small>
      </span>
      <span className={`v num${up ? ' up' : ''}`}>
        {fmt(r.result)}
        <small>after Write</small>
      </span>
      {action}
    </div>
  );
}

function Orbit({ state, cat, skin }: { state: MergeStateView; cat: Cat; skin: SkinManifest }) {
  const w = skin.words;
  let body: React.ReactNode;
  if (cat.asset) {
    const items = sourceItems(state, cat);
    body = items.length ? (
      <div className="tiles" style={{ gridTemplateColumns: `repeat(${Math.max(6, items.length)}, minmax(0, 1fr))` }}>
        {items.map((it) => {
          const disabled = it.status !== 'ready';
          const sub = `${it.cls}${it.rank ? ` · ${it.rank}` : ''}`;
          const label = `${it.name}, ${it.cls}${it.rank ? `, class ${it.rank}` : ''}. ${
            it.status === 'staged' ? 'Already staged.' : it.status === 'ready' ? `Press Enter to bring it into the new save, or drag it up.` : (it.reason ?? '')
          }`;
          return (
            <button
              key={it.id}
              type="button"
              className="tile"
              data-src-item={it.id}
              data-change-id={it.changeId ?? undefined}
              data-art={it.art}
              data-name={it.name}
              data-sub={sub}
              data-reason={it.reason ?? undefined}
              aria-label={label}
              aria-disabled={disabled ? 'true' : undefined}
              title={it.status === 'blocked' || it.status === 'present' ? (it.reason ?? undefined) : undefined}
            >
              <Use id={it.art} className="art" />
              <b>{it.name}</b>
              <span className="s">{sub}</span>
              {it.status === 'staged' ? (
                <span className="tag staged">{w.staged}</span>
              ) : it.status === 'present' ? (
                <span className="tag present">{w.aboard}</span>
              ) : it.status === 'blocked' ? (
                <span className="tag present">Can’t move</span>
              ) : (
                <span className="lift" aria-hidden="true">
                  {w.lift}
                </span>
              )}
            </button>
          );
        })}
      </div>
    ) : (
      <p className="o-note">Nothing here in {state.sourceTitle}.</p>
    );
  } else {
    const rows = cat.id === 'currency' ? currencyRows(state) : knowledgeRows(state);
    body = (
      <div className="vals">
        {rows.map((r) => (
          <div className="val" key={r.id}>
            <span className="k">
              <Use id={r.glyph} />
              {r.label}
            </span>
            <span className="v num">{fmt(r.b)}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <section className="orbit glass" aria-labelledby="src-title">
      <div className="o-head">
        <span className="from">{w.from}</span>
        <h2 id="src-title" translate="no">{state.sourceTitle}</h2>
        <span className="from">{state.sourceMeta}</span>
        <span className="ro">
          <LockIcon />
          {w.readOnly}
        </span>
      </div>
      {body}
    </section>
  );
}

interface ChangesProps {
  state: MergeStateView;
  skin: SkinManifest;
  phase: 'edit' | 'writing' | 'written';
  written: WriteResultView | null;
  fresh: number | null;
  name: string;
  setName: (s: string) => void;
  blocked: string | null;
  error: string | null;
  onRevert: (id: number) => void;
  onMode: (f: CurrencyField, m: CurrencyMode) => void;
  onUndo: () => void;
  onRedo: () => void;
  onWrite: () => void;
  onBack: () => void;
}

function Changes(p: ChangesProps) {
  const w = p.skin.words;
  const rows = changeRows(p.state);
  const n = rows.length;
  let mid: React.ReactNode;
  if (p.phase === 'written' && p.written) {
    mid = (
      <div className="done" role="status">
        <div className="orb">
          <CheckIcon />
        </div>
        <h3>Written</h3>
        <p>
          “{p.written.name}” is now slot {p.written.slot}. Your original saves were not touched.
        </p>
        <p>Open No Man’s Sky and load it. If Steam asks about cloud files, choose Local.</p>
        <p className="small">A backup of every save came first: {p.written.snapshot.split('/').slice(-1)[0]}</p>
        <button type="button" className="soft" onClick={p.onBack}>
          Back to your saves
        </button>
      </div>
    );
  } else if (!n) {
    mid = (
      <div className="c-empty">
        Nothing yet. Lift something from {p.state.sourceTitle} up into the new save and it will appear here, one line per change.
      </div>
    );
  } else {
    mid = (
      <ol className="clist">
        {rows.map((d) => (
          <li key={d.id} className={`ch${p.fresh === d.id ? ' is-new' : ''}`} data-change={d.id}>
            <span className="gl">
              <Use id={d.glyph} />
            </span>
            <div>
              <p className="line">
                <span className="verb">{d.verb}</span>
                {d.subject}
              </p>
              {d.detail && <p className="det">{d.detail}</p>}
              {d.currency && (
                <fieldset className="seg3">
                  <legend className="sr-only">{d.subject}: how should the two balances combine?</legend>
                  {MODES.map((m) => (
                    <label key={m.id}>
                      <input type="radio" name={`ch-${d.id}`} value={m.id} checked={d.currency!.mode === m.id} onChange={() => p.onMode(d.currency!.field, m.id)} />
                      <span>{m.label}</span>
                    </label>
                  ))}
                </fieldset>
              )}
            </div>
            <button type="button" className="rev" onClick={() => p.onRevert(d.id)} aria-label={`${w.revert}: ${d.verb} ${d.subject}`} title={w.revert}>
              <RevertIcon />
            </button>
          </li>
        ))}
      </ol>
    );
  }
  const writing = p.phase === 'writing';
  const disabled = !n || writing || !!p.blocked || p.phase === 'written';
  return (
    <aside className="changes glass" aria-labelledby="ch-title">
      <div className="c-head">
        <h2 id="ch-title">
          {w.changes} <span className={`n num${n ? '' : ' zero'}`}>{n}</span>
        </h2>
        <p>{p.phase === 'written' ? 'Everything is safely on disk.' : w.changesHint}</p>
      </div>
      {mid}
      {p.phase !== 'written' && (
        <div className="c-foot">
          <div className="ur">
            <button type="button" className="soft" onClick={p.onUndo} disabled={!p.state.canUndo}>
              <UndoIcon />
              Undo <kbd>⌘Z</kbd>
            </button>
            <button type="button" className="soft" onClick={p.onRedo} disabled={!p.state.canRedo}>
              <RedoIcon />
              Redo <kbd>⇧⌘Z</kbd>
            </button>
          </div>
          <label className="save-as">
            <span>Save as</span>
            <input value={p.name} onChange={(e) => p.setName(e.target.value)} maxLength={100} spellCheck={false} />
          </label>
          <p className="calm">{p.error ? <span role="alert">{p.error}</span> : (p.blocked ?? 'A backup is made first, every time.')}</p>
          <button type="button" className={`write${writing ? ' is-writing' : ''}`} onClick={p.onWrite} disabled={disabled} aria-keyshortcuts="Meta+S">
            <span>
              {writing ? 'Writing…' : w.write(n)}
              <small>
                {p.state.newSlot ? `to a new save in slot ${p.state.newSlot}` : 'no free slot'} · ⌘S
              </small>
            </span>
          </button>
        </div>
      )}
    </aside>
  );
}
