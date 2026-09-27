import { useEffect, useMemo, useRef, useState } from 'react';

export interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

/** ⌘K palette — the only overlay in the app. Esc or a click outside closes it. */
export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return commands;
    const words = t.split(/\s+/);
    return commands.filter((c) => words.every((w) => c.label.toLowerCase().includes(w)));
  }, [q, commands]);

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);
  useEffect(() => setSel(0), [q]);

  if (!open) return null;
  const run = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };
  return (
    <div className="cmdk is-open" role="presentation" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdk-box" role="dialog" aria-modal="true" aria-label="Commands">
        <div className="cmdk-field">
          <span className="cmdk-k">⌘K</span>
          <input
            ref={input}
            className="cmdk-input"
            placeholder="Type a command"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={list[sel] ? `cmd-${list[sel].id}` : undefined}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((s) => Math.min(list.length - 1, s + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                run(list[sel]);
              }
            }}
          />
        </div>
        <ul className="cmdk-list" id="cmdk-list" role="listbox">
          {list.length ? (
            list.map((c, i) => (
              <li
                key={c.id}
                id={`cmd-${c.id}`}
                role="option"
                aria-selected={i === sel}
                className={`cmdk-item${i === sel ? ' is-sel' : ''}`}
                onPointerMove={() => setSel(i)}
                onClick={() => run(c)}
              >
                <span>{c.label}</span>
                {c.hint && <kbd>{c.hint}</kbd>}
              </li>
            ))
          ) : (
            <li className="cmdk-empty">No matching command.</li>
          )}
        </ul>
        <p className="cmdk-foot">
          <kbd>↑</kbd>
          <kbd>↓</kbd> to move · <kbd>↵</kbd> to run · <kbd>esc</kbd> to close
        </p>
      </div>
    </div>
  );
}
