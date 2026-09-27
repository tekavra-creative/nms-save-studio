import { useEffect, useMemo, useState } from 'react';
import type { SaveRootView, SlotView, SurvivalReportView } from '../../../shared/api.ts';
import type { SkinManifest } from '../skins/types.ts';
import { CommandPalette, type Command } from '../ui/CommandPalette.tsx';

const hours = (s: number) => `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} m`;
const when = (ms: number) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

interface Props {
  skin: SkinManifest;
  skins: readonly SkinManifest[];
  setSkin: (id: string) => void;
  skinCommands: Command[];
  onOpen: (root: string, target: number, source: number) => void;
  onExplore: (root: string, slot: number) => void;
}

/** Pick the save to build on ("Into") and the save to take from ("From"), then open Merge Studio. */
export function SavesHome({ skin, skins, setSkin, skinCommands, onOpen, onExplore }: Props) {
  const [root, setRoot] = useState<SaveRootView | null>(null);
  const [slots, setSlots] = useState<SlotView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [into, setInto] = useState<number | null>(null);
  const [from, setFrom] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [palette, setPalette] = useState(false);
  const [survival, setSurvival] = useState<SurvivalReportView | null>(null);
  const [survivalError, setSurvivalError] = useState<string | null>(null);
  const [checkingSurvival, setCheckingSurvival] = useState(false);

  useEffect(() => {
    window.studio
      .listRoots()
      .then(async (roots) => {
        const first = roots[0] ?? null;
        setRoot(first);
        if (!first) return setError('No No Man’s Sky saves were found on this computer.');
        setSlots(await window.studio.listSlots(first.path));
      })
      .catch((e: Error) => setError(e.message));
    const poll = () => window.studio.gameRunning().then(setRunning).catch(() => {});
    poll();
    const t = setInterval(poll, 2500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = (slot: number) => {
    if (into === null || (into !== null && from !== null)) {
      setInto(slot);
      setFrom(null);
    } else if (slot === into) setInto(null);
    else setFrom(slot);
  };

  const canOpen = root && into !== null && from !== null;
  const open = () => canOpen && onOpen(root.path, into, from);

  const runSurvivalCheck = () => {
    if (!canOpen) return;
    setCheckingSurvival(true);
    setSurvivalError(null);
    window.studio
      .survivalCheck(root.path, into, from)
      .then((r) => {
        setSurvival(r);
        setCheckingSurvival(false);
      })
      .catch((e: Error) => {
        setSurvivalError(e.message);
        setCheckingSurvival(false);
      });
  };

  const commands = useMemo<Command[]>(
    () => [
      ...(canOpen ? [{ id: 'open', label: 'Open Merge Studio', run: open }] : []),
      ...(canOpen ? [{ id: 'survival', label: 'Check survival (did the game keep everything?)', run: runSurvivalCheck }] : []),
      ...skinCommands,
    ],
    [canOpen, skinCommands],
  );

  const titleOf = (s: SlotView) => s.title || s.summary || `Slot ${s.slot}`;
  const intoSlot = slots.find((s) => s.slot === into);
  const fromSlot = slots.find((s) => s.slot === from);

  return (
    <>
    <div className="app home">
      <header className="top">
        <div className="brand">
          <skin.Mark />
          <h1 className="word" translate="no">{skin.name.toLowerCase()}</h1>
          <span className="sub">for No Man’s Sky</span>
        </div>
        <div className="skins" role="radiogroup" aria-label="Skin">
          {skins.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={s.id === skin.id} onClick={() => setSkin(s.id)} title={s.tagline}>
              {s.name}
            </button>
          ))}
        </div>
        <button type="button" className="search glass" onClick={() => setPalette(true)} aria-haspopup="dialog" aria-keyshortcuts="Meta+K">
          <span className="long">Search or run a command</span>
          <kbd>⌘K</kbd>
        </button>
      </header>
      <main className="home-stage">
        <section className="home-intro">
          <h2 className="name">Your saves</h2>
          <p className="meta">
            {into === null
              ? 'First, pick the save to build on. Nothing is changed until you press Write, and even then your originals stay untouched.'
              : from === null
                ? `Building on ${titleOf(intoSlot!)}. Now pick the save to bring things from.`
                : `Bringing things from ${titleOf(fromSlot!)} into a copy of ${titleOf(intoSlot!)}.`}
          </p>
          <p className={`game-state${running ? ' is-running' : ''}`} role="status">
            {running ? 'No Man’s Sky is running — you can look around, but writing waits until you quit the game.' : 'Game closed — safe to edit.'}
          </p>
        </section>
        {error && (
          <p className="studio-error" role="alert">
            {error}
          </p>
        )}
        <ul className="save-grid" aria-label="Saves">
          {slots.map((s) => {
            const role = s.slot === into ? 'into' : s.slot === from ? 'from' : null;
            const latest = s.restorePoints.find((p) => p.loadsInGame) ?? s.restorePoints[0];
            return (
              <li key={s.slot}>
                <button type="button" className={`save-card${role ? ` is-${role}` : ''}`} aria-pressed={!!role} onClick={() => pick(s.slot)}>
                  {role && <span className="role">{role === 'into' ? 'Into' : 'From'}</span>}
                  <span className="slot num">Slot {s.slot}</span>
                  <b>{titleOf(s)}</b>
                  {s.title && <span className="where">{s.summary}</span>}
                  {latest && (
                    <span className="stats num">
                      {hours(latest.playTimeSeconds)} played · save version {latest.saveVersion}
                    </span>
                  )}
                  <span className="points">
                    {s.restorePoints.map((p) => (
                      <span key={p.file}>
                        {p.kind === 'auto' ? 'Autosave' : 'Manual save'} · {when(p.savedAt)}
                        {p.loadsInGame ? ' · loads in game' : ''}
                      </span>
                    ))}
                  </span>
                </button>
                {root && (
                  <button
                    type="button"
                    className="explore-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      onExplore(root.path, s.slot);
                    }}
                  >
                    Browse every field →
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <div className="home-foot-wrap">
          <div className="home-foot">
            <button type="button" className="write" disabled={!canOpen} onClick={open}>
              <span>
                Open Merge Studio
                <small>{canOpen ? `${titleOf(fromSlot!)} → a copy of ${titleOf(intoSlot!)}` : 'pick two saves'}</small>
              </span>
            </button>
            <button type="button" className="survival-btn" disabled={!canOpen || checkingSurvival} onClick={runSurvivalCheck} title="After you've loaded the merged save in-game and it auto-saved, check that everything you brought over is still there.">
              <span>{checkingSurvival ? 'Checking…' : 'Check survival'}</span>
            </button>
          </div>
          {survivalError && (
            <p className="studio-error" role="alert">
              {survivalError}
            </p>
          )}
          {survival && (
            <div className="survival-panel" role="dialog" aria-label="Survival check">
              <div className="survival-head">
                <h3>
                  {survival.survived}/{survival.total} survived — {titleOf(intoSlot!)} vs {titleOf(fromSlot!)}
                </h3>
                <button type="button" onClick={() => setSurvival(null)}>
                  Close
                </button>
              </div>
              <ul>
                {survival.checks.map((c, i) => (
                  <li key={i} className={c.survived ? 'ok' : 'lost'}>
                    <span className="mark">{c.survived ? '✓' : '✗'}</span>
                    <span className="grp">{c.group}</span>
                    <span className="txt">{c.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>
    </div>
    <CommandPalette open={palette} onClose={() => setPalette(false)} commands={commands} />
    </>
  );
}
