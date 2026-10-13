import { schedulePersist } from '@/services/persist';
import type { Case, Change } from '@/types';
import type { AppState } from './app-store';

// ---------------------------------------------------------------------------
// Undo / redo history for case content edits (Ctrl+Z / Ctrl+Y). Encapsulates
// the undo/redo stacks + edit coalescing in a controller created once inside
// the store, with the store's case-write helpers injected as dependencies.
// ---------------------------------------------------------------------------

type Get = () => AppState;
type Set = (partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void;

/** The store helpers the history controller composes with (injected to avoid a cycle). */
export interface CaseHistoryDeps {
  get: Get;
  set: Set;
  casePath: (c: Case) => string;
  upsertChange: (change: Change) => void;
  writeCaseNow: (id: string) => Promise<void> | void;
}

type HistoryEntry = { caseId: string; field: string; snapshot: Case };

const HISTORY_LIMIT = 200;
const COALESCE_MS = 700;

/** The edited field a patch represents (ignoring the always-present `modified` flag). */
const primaryField = (patch: Partial<Case>): string => Object.keys(patch).find((k) => k !== 'modified') ?? 'title';

export interface CaseHistory {
  /** Snapshot a case's pre-edit state for undo, coalescing a rapid burst of same-field edits. */
  recordEdit: (id: string, patch: Partial<Case>) => void;
  /** Drop any history entries for a case (e.g. after delete) so undo can't resurrect it. */
  pruneHistory: (id: string) => void;
  /** Wipe all history when leaving a repo, so it can't replay one repo's edits into another. */
  resetHistory: () => void;
  undo: () => void;
  redo: () => void;
}

export function createCaseHistory({ get, set, casePath, upsertChange, writeCaseNow }: CaseHistoryDeps): CaseHistory {
  const undoStack: HistoryEntry[] = [];
  const redoStack: HistoryEntry[] = [];
  let coalesceKey: string | null = null;
  let coalesceAt = 0;

  const recordEdit = (id: string, patch: Partial<Case>) => {
    const field = primaryField(patch);
    const c = get().cases.find((x) => x.id === id);
    if (!c) return;
    const now = Date.now();
    const key = `${id}:${field}`;
    const top = undoStack[undoStack.length - 1];
    const coalesce =
      !!top && top.caseId === id && top.field === field && key === coalesceKey && now - coalesceAt < COALESCE_MS;
    coalesceKey = key;
    coalesceAt = now;
    if (coalesce) return; // same burst → the existing entry already snapshots the pre-burst state
    undoStack.push({ caseId: id, field, snapshot: { ...c } });
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0; // a fresh edit forks history — drop the redo branch
  };

  /** Restore a snapshot (from undo/redo) without recording new history, and navigate to it. */
  const applyHistory = (entry: HistoryEntry) => {
    coalesceKey = null; // never coalesce across an undo/redo boundary
    set((s) => ({
      cases: s.cases.map((x) => (x.id === entry.caseId ? { ...entry.snapshot, modified: true } : x)),
      sel: { ...s.sel, kind: 'case', id: entry.caseId, runId: null },
      view: 'editor',
      editorFocus: { field: entry.field, nonce: (s.editorFocus?.nonce ?? 0) + 1 },
    }));
    const c = get().cases.find((x) => x.id === entry.caseId);
    if (c) upsertChange({ kind: 'case', refId: entry.caseId, path: casePath(c), status: 'M', label: c.title });
    schedulePersist('case:' + entry.caseId, () => writeCaseNow(entry.caseId));
  };

  const pruneHistory = (id: string) => {
    for (let i = undoStack.length - 1; i >= 0; i--) if (undoStack[i].caseId === id) undoStack.splice(i, 1);
    for (let i = redoStack.length - 1; i >= 0; i--) if (redoStack[i].caseId === id) redoStack.splice(i, 1);
  };

  const resetHistory = () => {
    undoStack.length = 0;
    redoStack.length = 0;
    coalesceKey = null;
    coalesceAt = 0;
  };

  const undo = () => {
    const entry = undoStack.pop();
    if (!entry) return;
    const cur = get().cases.find((x) => x.id === entry.caseId);
    if (cur) redoStack.push({ caseId: entry.caseId, field: entry.field, snapshot: { ...cur } });
    applyHistory(entry);
  };

  const redo = () => {
    const entry = redoStack.pop();
    if (!entry) return;
    const cur = get().cases.find((x) => x.id === entry.caseId);
    if (cur) undoStack.push({ caseId: entry.caseId, field: entry.field, snapshot: { ...cur } });
    applyHistory(entry);
  };

  return { recordEdit, pruneHistory, resetHistory, undo, redo };
}
