import { useEffect, useState } from 'react';
import type { OverviewView, SaveRootView, SlotView, StudioApi } from '../../shared/api.ts';

declare global {
  interface Window {
    studio: StudioApi;
  }
}

const hours = (s: number) => `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
const num = (s: string) => BigInt(s).toLocaleString();

// Temporary shell UI: proves the pipeline end to end. The chosen design direction replaces it.
export function App() {
  const [root, setRoot] = useState<SaveRootView | null>(null);
  const [slots, setSlots] = useState<SlotView[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [overview, setOverview] = useState<OverviewView | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.studio
      .listRoots()
      .then(async (roots) => {
        const first = roots[0] ?? null;
        setRoot(first);
        if (first) setSlots(await window.studio.listSlots(first.path));
      })
      .catch((e: Error) => setError(e.message));
    const poll = () => window.studio.gameRunning().then(setRunning).catch(() => {});
    poll();
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!root || selected === null) return;
    setOverview(null);
    window.studio.overview(root.path, selected).then(setOverview).catch((e: Error) => setError(e.message));
  }, [root, selected]);

  return (
    <div className="shell">
      <header className="titlebar">
        <span className="brand">NMS Save Studio</span>
        <span className={running ? 'status warn' : 'status ok'}>
          {running ? 'Game is running — writing is paused' : 'Game closed — safe to edit'}
        </span>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      {!root && !error && <p className="muted">Looking for your saves…</p>}
      <main className="columns">
        <section aria-label="Saves" className="saves">
          <h2>Your saves</h2>
          {slots.map((s) => (
            <button key={s.slot} className={selected === s.slot ? 'save active' : 'save'} onClick={() => setSelected(s.slot)}>
              <strong>{s.title || s.summary}</strong>
              <span className="muted">
                Slot {s.slot}
                {s.title ? ` · ${s.summary}` : ''}
              </span>
              <ul className="points">
                {s.restorePoints.map((p) => (
                  <li key={p.file}>
                    {p.kind === 'auto' ? 'Autosave' : 'Manual save'} · {new Date(p.savedAt).toLocaleString()} · {hours(p.playTimeSeconds)}
                    {p.loadsInGame && <em> · loads in game</em>}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </section>
        <section aria-label="Save details" className="detail">
          {!overview && selected === null && <p className="muted">Pick a save to see what's inside.</p>}
          {overview && (
            <>
              <h2>Overview</h2>
              <dl className="stats">
                <div><dt>Units</dt><dd>{num(overview.units)}</dd></div>
                <div><dt>Nanites</dt><dd>{num(overview.nanites)}</dd></div>
                <div><dt>Quicksilver</dt><dd>{num(overview.quicksilver)}</dd></div>
                <div><dt>Played</dt><dd>{hours(overview.playTimeSeconds)}</dd></div>
              </dl>
              <h3>Starships {overview.ships.length}/{overview.capacity.ships}</h3>
              <ul className="cards">
                {overview.ships.map((s) => (
                  <li key={s.index} className="card">
                    <strong>{s.name || s.kind}</strong>
                    <span className="muted">{s.kind} · Class {s.class ?? '?'}{s.primary ? ' · Current ship' : ''}</span>
                  </li>
                ))}
              </ul>
              <h3>Multi-tools {overview.multitools.length}/{overview.capacity.multitools}</h3>
              <ul className="cards">
                {overview.multitools.map((m) => (
                  <li key={m.index} className="card">
                    <strong>{m.name || 'Multi-tool'}</strong>
                    <span className="muted">Class {m.class ?? '?'}{m.active ? ' · Equipped' : ''}</span>
                  </li>
                ))}
              </ul>
              <h3>Companions {overview.companions.length}/{overview.capacity.companions}</h3>
              <p className="muted">{overview.companions.map((c) => c.name || c.species).join(', ') || 'None'}</p>
              <h3>Knowledge</h3>
              <p className="muted">
                {overview.knowledge.products} blueprints · {overview.knowledge.technology} technologies · {overview.knowledge.words} words ·{' '}
                {overview.knowledge.portalGlyphs}/16 portal glyphs
              </p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
