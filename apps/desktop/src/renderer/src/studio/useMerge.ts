import { useCallback, useEffect, useRef, useState } from 'react';
import type { CurrencyField, CurrencyMode, MergeStateView, WriteResultView } from '../../../shared/api.ts';

export interface MergeApi {
  state: MergeStateView | null;
  error: string | null;
  apply: (ids: number[]) => Promise<void>;
  revert: (id: number) => Promise<void>;
  setMode: (field: CurrencyField, mode: CurrencyMode) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  write: (name: string) => Promise<WriteResultView>;
}

/** One merge session in the engine process. Calls are serialised so rapid input never races. */
export function useMerge(root: string, targetSlot: number, sourceSlot: number): MergeApi {
  const [state, setState] = useState<MergeStateView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const idRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    setState(null);
    setError(null);
    window.studio
      .openMerge(root, targetSlot, sourceSlot)
      .then((s) => {
        if (!alive) return void window.studio.closeMerge(s.mergeId);
        idRef.current = s.mergeId;
        setState(s);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
      if (idRef.current) void window.studio.closeMerge(idRef.current);
      idRef.current = null;
    };
  }, [root, targetSlot, sourceSlot]);

  const run = useCallback(<T,>(f: (id: string) => Promise<T>): Promise<T> => {
    const next = queue.current.then(() => {
      const id = idRef.current;
      if (!id) throw new Error('The merge is still opening.');
      return f(id);
    });
    queue.current = next.catch(() => {});
    return next;
  }, []);

  const step = useCallback(
    (f: (id: string) => Promise<MergeStateView>) =>
      run(f).then(setState, (e: Error) => setError(e.message)),
    [run],
  );

  return {
    state,
    error,
    apply: (ids) => step((id) => window.studio.applyChanges(id, ids)),
    revert: (cid) => step((id) => window.studio.revertChange(id, cid)),
    setMode: (field, mode) => step((id) => window.studio.setCurrencyMode(id, field, mode)),
    undo: () => step((id) => window.studio.undo(id)),
    redo: () => step((id) => window.studio.redo(id)),
    write: (name) => run((id) => window.studio.writeMerge(id, name)),
  };
}
