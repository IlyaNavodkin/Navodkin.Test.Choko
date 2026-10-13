import type { Dispatch, SetStateAction } from 'react';
import { create, type StoreApi } from 'zustand';

import type { LintWarning } from '@/schemas';
import type {
  Case,
  Change,
  CheckState,
  Conflict,
  CreateRunArgs,
  DialogRequest,
  ModalKind,
  Recent,
  Renaming,
  Resolutions,
  Result,
  Run,
  RunRow,
  Screen,
  Selection,
  Toast,
  TreeNode,
  View,
  Workspace,
} from '@/types';
import { buildSuiteIndex } from './tree-helpers';
import { createStoreInternals } from './store-internals';
import { createRepoSlice } from './slices/repo-slice';
import { createCasesSlice } from './slices/cases-slice';
import { createRunsSlice } from './slices/runs-slice';
import { createGitSlice } from './slices/git-slice';
import { createDialogSlice } from './slices/dialog-slice';
import { createUpdatesSlice } from './slices/updates-slice';
import { createUiSlice } from './slices/ui-slice';

export interface AppState {
  /* data */
  cases: Case[];
  runs: Run[];
  tree: TreeNode[];
  workspace: Workspace | null;
  workspaces: Workspace[];

  /* repo / loading */
  repoPath: string;
  loading: boolean;
  error: string | null;
  warnings: LintWarning[];
  recents: Recent[];
  loadRecents: () => Promise<void>;
  /**
   * Startup hook: load the recents list and, in the desktop app, auto-reopen the most
   * recently used repository so the user lands back where they left off instead of on the
   * launcher. No-ops (just loads recents) outside NW.js or when there is no recent repo.
   */
  autoReopen: () => Promise<void>;
  /** Opened a Git repo that has no `.casewright/` yet — offer to scaffold it. */
  needsInit: boolean;
  /** Opened a `.casewright/` repo with zero workspaces — invite creating the first. */
  emptyRepo: boolean;
  initRepo: () => Promise<void>;

  /* navigation / selection */
  screen: Screen;
  view: View;
  sel: Selection;
  openRepo: (path?: string) => Promise<void>;
  goHome: () => void;
  setWorkspace: (w: Workspace) => Promise<void>;
  updateWorkspace: (wsId: string, patch: Partial<Workspace>) => void;
  /** Edit a suite's metadata (display name / prefix override / description) in its folder note. */
  updateSuite: (suiteId: string, patch: { name?: string; prefix?: string; description?: string }) => void;
  /** The display-ID prefix a suite resolves to (own override → nearest ancestor → 'CW'). */
  resolveSuitePrefix: (suiteId: string) => string;
  /** Pick a folder, declare it a workspace (in config.yaml + its folder note), then open the edit modal. */
  addWorkspace: () => Promise<void>;
  /** Open the workspace edit modal, pre-selecting the active workspace. */
  editWorkspace: () => void;
  /** Confirm, then drop the active workspace from config.yaml (leaving its files untouched). */
  removeWorkspace: () => Promise<void>;
  /** Workspace pre-selected in the edit modal's dropdown (set by add/edit). */
  wsModalId: string | null;
  openCase: (id: string) => void;
  openSuite: (suiteId: string) => void;
  openRunsList: () => void;
  openRun: (runId: string) => void;
  openCreateRun: () => void;
  startGuide: (runId: string, index?: number) => void;
  guideGo: (index: number) => void;
  exitGuide: () => void;

  /* case + suite mutations */
  updateCase: (id: string, patch: Partial<Case>) => void;
  /** Undo / redo the case content-edit history (Ctrl+Z / Ctrl+Y), navigating to the changed case + field. */
  undo: () => void;
  redo: () => void;
  /** A pulse asking the editor to scroll/focus a field after an undo/redo lands there (nonce retriggers). */
  editorFocus: { field: string; nonce: number } | null;
  duplicateCase: (id: string) => void;
  deleteCase: (id: string) => Promise<void>;
  createCase: (parentSuiteId: string | null) => void;
  createSuite: (parentId: string | null) => void;
  renameSuite: (id: string, name: string) => void;
  deleteSuite: (id: string) => Promise<void>;
  moveNodeToParent: (dragId: string, parentId: string | null, index: number) => void;
  regenerateDisplayIds: (nodeId: string) => Promise<void>;

  /* runs */
  updateRunRow: (runId: string, i: number, patch: Partial<RunRow>) => void;
  createRun: (args: CreateRunArgs) => void;
  /** Cycle one checklist item: none → pass → fail → none (persisted to the case sidecar). */
  cycleRunCheck: (runId: string, i: number, key: string) => void;
  setRunFailNote: (runId: string, i: number, key: string, note: string) => void;
  setRunGroupChecks: (runId: string, i: number, keys: string[], state: CheckState) => void;
  recordRunResult: (runId: string, i: number, patch: { result: Result; tester: string; notes: string }) => void;
  /** Set the run's default test date (ISO) used to resolve `{{today}}` in the runner. */
  setRunTestDate: (runId: string, date: string) => void;
  /** Override one case's test date (ISO), or clear the override with `null` to inherit the run's. */
  setRowTestDate: (runId: string, i: number, date: string | null) => void;
  /** Rename a run (display name only; the run folder/id is unchanged). */
  setRunName: (runId: string, name: string) => void;
  setRunNotes: (runId: string, notes: string) => void;
  /** Save (name + now) or clear (empty name → null) a tester/reviewer approval. */
  setRunApproval: (runId: string, who: 'tester' | 'reviewer', name: string) => void;
  /**
   * Move a run row from index `from` to `to` (splice semantics: `to` is the target index
   * *after* `from` is removed). Reorders the in-memory rows and persists the run folder's
   * `.order` file so the new order is honored on reload, in the runner, and in reports.
   */
  reorderRunRows: (runId: string, from: number, to: number) => void;
  /** Append cases to an existing run (skipping any already present); seeds fresh, not-run rows. */
  addRunCases: (runId: string, caseIds: string[]) => void;
  /** Remove a single case row from a run, deleting its sidecar; confirms if results were recorded. */
  removeRunRow: (runId: string, i: number) => Promise<void>;
  /** Duplicate a run: copy its cases into a fresh run with results/checks/approvals reset. */
  duplicateRun: (runId: string) => void;
  /** Delete a run — removes its whole folder from disk, after confirming. */
  deleteRun: (runId: string) => Promise<void>;
  /** Render a single run to a PDF report the user picks a destination for (NW.js only). */
  exportRunToPdf: (runId: string) => Promise<void>;
  /** Render this week's runs + test-progression matrix to a PDF report (NW.js only). */
  exportWeeklyReport: () => Promise<void>;
  /** Immediately rewrite a run's `_run.md` details sidecar from the current store state. */
  rewriteRunDetails: (runId: string) => Promise<void>;
  lastTester: string;
  setLastTester: (v: string) => void;

  /* tree ui state (React-style setters for component compatibility) */
  collapsed: Record<string, boolean>;
  setCollapsed: Dispatch<SetStateAction<Record<string, boolean>>>;
  renaming: Renaming | null;
  setRenaming: Dispatch<SetStateAction<Renaming | null>>;

  /* derived helpers */
  casePath: (c: Case) => string;
  casesInSuite: (suiteId: string) => string[];
  /** The workspace owning a case (derived from its suite path) — for repo-level run bucketing. */
  caseWorkspace: (caseId: string) => Workspace | null;
  toast: (msg: string) => void;
  toasts: Toast[];

  /* generic dialogs (shadcn) — replace native window.confirm/alert */
  dialog: DialogRequest | null;
  /** Ask the user to confirm; resolves true if they accept, false if they cancel/dismiss. */
  confirm: (opts: Omit<DialogRequest, 'kind'>) => Promise<boolean>;
  /** Show a message with a single acknowledge button; resolves when dismissed. */
  alert: (opts: { title: string; message?: string; okLabel?: string }) => Promise<void>;
  /** Resolve the open dialog (true = primary action). Called by the dialog host. */
  closeDialog: (result: boolean) => void;

  /* git */
  branch: string;
  ahead: number;
  behind: number;
  changes: Change[];
  gitBusy: boolean;
  /** Set when a pull produced conflicts (structured resolver deferred — resolve via Git or abort). */
  mergeBanner: string | null;
  /** Populated by the (deferred) structured 3-way merge engine; null until then. */
  conflict: Conflict | null;
  refreshStatus: () => Promise<void>;
  /** Background `git fetch` + status refresh so the Pull badge shows the real commits-behind count. */
  fetchRemote: () => Promise<void>;
  /** Unified diff (vs HEAD, untracked included) for one change row — a case file or a run folder. */
  changeDiff: (change: Change) => Promise<string>;
  /** Discard a change row's working-tree edits (restore from HEAD / delete new files), after confirming. */
  revertChange: (change: Change) => Promise<void>;
  doCommit: (selectedKeys: string[], msg: string) => void;
  doPush: () => Promise<void>;
  doPull: () => Promise<void>;
  abortMerge: () => Promise<void>;
  completeMerge: (resolutions: Resolutions) => void;

  /* updates (GitHub release auto-update; Windows/NW.js only) */
  updateStatus: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'unsupported' | 'error';
  /** Newer version available (tag without `v`), or null. */
  updateVersion: string | null;
  /** Background-download progress, 0..100. */
  updateProgress: number;
  /** The release page URL, shown to portable builds that can't self-apply. */
  updateReleaseUrl: string | null;
  /** Poll GitHub for a newer release; auto-downloads the installer for installed builds. */
  checkForUpdate: () => Promise<void>;
  /** Launch the downloaded installer and quit so it can replace + relaunch the app. */
  relaunchToUpdate: () => void;
  /** Open the release page in the browser (portable / unsupported builds). */
  openReleasePage: () => void;

  /* modals */
  modal: ModalKind;
  setModal: (modal: ModalKind) => void;
}

/** The store's `set`/`get`, shared by the slice factories in `./slices/*`. */
export type StoreSet = StoreApi<AppState>['setState'];
export type StoreGet = StoreApi<AppState>['getState'];

/** Shared store helpers injected into the bigger slices (`./slices/*`). */
export interface StoreCtx {
  upsertChange: (change: Change) => void;
  scheduleRefresh: () => void;
  onWriteError: (e: unknown) => void;
  casePath: (c: Case) => string;
  lastCasePath: Map<string, string>;
  reloadFromDisk: () => Promise<void>;
}

// The store is assembled from focused slices. Cross-cutting private helpers (path
// derivation, optimistic disk persistence, the external-change watcher, undo/redo)
// live in `store-internals`; each slice receives only what it needs. `useApp()`
// reads the whole store, so the composition is behavior-identical to the previous
// single-closure store — no change to subscription granularity or runtime work.
export const useAppStore = create<AppState>()((set, get) => {
  const internals = createStoreInternals(set, get);
  const { casePath, caseWorkspace } = internals;
  const ctx: StoreCtx = {
    upsertChange: internals.upsertChange,
    scheduleRefresh: internals.scheduleRefresh,
    onWriteError: internals.onWriteError,
    casePath: internals.casePath,
    lastCasePath: internals.lastCasePath,
    reloadFromDisk: internals.reloadFromDisk,
  };

  return {
    /* ---- initial state ---- */
    cases: [],
    tree: [],
    runs: [],
    workspace: null,
    workspaces: [],
    repoPath: '',
    loading: false,
    error: null,
    warnings: [],
    recents: [],
    needsInit: false,
    emptyRepo: false,
    screen: 'launcher',
    view: 'editor',
    sel: { kind: 'case', id: undefined, runId: null },
    editorFocus: null,
    wsModalId: null,

    /* ---- derived helpers ---- */
    casePath,
    casesInSuite: (suiteId) => buildSuiteIndex(get().tree).inSuite(suiteId),
    resolveSuitePrefix: (suiteId) => buildSuiteIndex(get().tree).resolvedPrefix[suiteId] ?? 'CW',
    caseWorkspace,

    /* ---- slices (each owns its state + actions) ---- */
    ...createRepoSlice(set, get, internals),
    ...createCasesSlice(set, get, internals),
    ...createRunsSlice(set, get, ctx),
    ...createGitSlice(set, get, ctx),
    ...createDialogSlice(set),
    ...createUpdatesSlice(set, get),
    ...createUiSlice(set),
  };
});

/**
 * Read the whole store (re-renders on any change — matches the previous context
 * behavior). For finer-grained subscriptions, use `useAppStore(selector)` directly.
 */
export const useApp = (): AppState => useAppStore();
