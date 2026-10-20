import type { Dispatch, SetStateAction } from 'react';
import { create, type StoreApi } from 'zustand';

import type { LintWarning } from '@/schemas';
import type { AutomationArgDefinition } from '@/schemas/automation';
import type { AutomationBinding, AutomationProfile, CatalogEntry } from '@/schemas/automation-store';
import type { ArgValue, ReferenceEntry, ReferenceKind } from '@/schemas/reference-book';
import type { ReferenceDoc } from '@/services/reference-book';
import { setReferenceCatalog, setReferenceOpener, setReferenceSnapshot } from '@/utils/glossary-link';
import type {
  AutomationFilter,
  Case,
  Change,
  CheckState,
  Conflict,
  CreateRunArgs,
  CreateRunResult,
  DialogRequest,
  ModalKind,
  Recent,
  RefKindFilter,
  RefLeaveRequest,
  RefPickerRequest,
  RefSaveError,
  Renaming,
  Resolutions,
  Result,
  Run,
  RunRow,
  RunAutomationView,
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
import { createReferenceSlice } from './slices/reference-slice';
import { createAutomationSlice } from './slices/automation-slice';
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
  openRunAutomation: (runId: string) => void;
  openCreateRun: () => void;
  startGuide: (runId: string, index?: number) => void;
  guideGo: (index: number) => void;
  exitGuide: () => void;

  /* case + suite mutations */
  updateCase: (id: string, patch: Partial<Case>) => void;
  /**
   * Apply a reference-book insertion as its own undo step — a link dropped into Objective or a
   * setup body is undone on its own (Ctrl+Z), not merged with the typing before it.
   */
  insertCaseLink: (id: string, patch: Partial<Case>) => void;
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
  /**
   * Seed a run and freeze its reference snapshot. Resolves with a failure (instead of creating a
   * run) when the chosen argument set cannot be frozen, or when references are unresolved and the
   * caller has not accepted that yet — so the modal can show the problem with the selection intact.
   */
  createRun: (args: CreateRunArgs) => Promise<CreateRunResult>;
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

  /* reference book (`.casewright/glossary/`) — catalog + a draft that is only written on save */
  refs: ReferenceDoc[];
  /** Diagnostics from reading the catalog (an unreadable folder, skipped files). */
  refIssues: LintWarning[];
  /** The saved record open in the section, if any. */
  refSelId: string | null;
  /** Editor content: the saved copy, an edited copy, or a brand-new record. */
  refDraft: ReferenceEntry | null;
  /** The sha256 the draft is based on; `null` marks a record that has never been saved. */
  refDraftBase: string | null;
  refDirty: boolean;
  refSaveError: RefSaveError | null;
  /** Navigation parked until the user decides on the dirty draft (stay / save / discard). */
  refPendingLeave: RefLeaveRequest | null;
  refQuery: string;
  refKindFilter: RefKindFilter;
  refShowArchived: boolean;
  /** (Re)read the catalog — read-only: a repository without `.casewright/` stays untouched. */
  loadRefs: () => Promise<void>;
  openReferenceBook: () => void;
  selectRefEntry: (id: string) => void;
  /** Start a new record of the given kind (nothing is written until `saveRefEntry`). */
  createRefEntry: (kind: ReferenceKind) => void;
  editRefDraft: (patch: Partial<ReferenceEntry>) => void;
  addRefValue: () => void;
  editRefValue: (index: number, patch: Partial<ArgValue>) => void;
  removeRefValue: (index: number) => void;
  /** Validate and save the draft; `force` overwrites a file changed outside the app. */
  saveRefEntry: (opts?: { force?: boolean }) => Promise<boolean>;
  discardRefDraft: () => void;
  /** Adopt what is on disk now (the "reload" half of the conflict decision). */
  reloadRefEntry: () => Promise<void>;
  setRefArchived: (id: string, archived: boolean) => Promise<void>;
  /** Gate a navigation on a dirty draft; `false` means the decision prompt is now up. */
  guardRefLeave: (label: string, proceed: () => void) => boolean;
  resolveRefLeave: (choice: 'stay' | 'save' | 'discard') => Promise<void>;
  setRefQuery: (q: string) => void;
  setRefKindFilter: (kind: RefKindFilter) => void;
  setRefShowArchived: (show: boolean) => void;
  /** The open «From the reference book» picker, if any (rendered at the app root, like other modals). */
  refPicker: RefPickerRequest | null;
  openRefPicker: (req: RefPickerRequest) => void;
  closeRefPicker: () => void;
  /** Open the Reference section at one record — what a link chip in case text does. */
  openReferenceEntry: (id: string) => void;

  /* automation (`.casewright/automation/`) — catalog, bindings, trusted profile */
  automationCatalog: CatalogEntry[];
  automationBindings: AutomationBinding[];
  automationProfiles: AutomationProfile[];
  automationIssues: LintWarning[];
  automationQuery: string;
  automationFilter: AutomationFilter;
  automationProjectFilter: string;
  automationSelId: string | null;
  automationBusy: boolean;
  automationDiscoverError: string | null;
  /** Explicit trust acknowledgement: discovery runs the project's config, so it is never implicit. */
  automationTrusted: boolean;
  openAutomationSection: () => void;
  /** (Re)read the three automation stores — read-only, tolerant of missing/broken files. */
  loadAutomation: () => Promise<void>;
  setAutomationQuery: (q: string) => void;
  setAutomationFilter: (f: AutomationFilter) => void;
  setAutomationProjectFilter: (p: string) => void;
  selectAutomationEntry: (id: string | null) => void;
  setAutomationArchived: (automationId: string, archived: boolean) => Promise<void>;
  setAutomationArgs: (automationId: string, args: AutomationArgDefinition[]) => Promise<void>;
  setAutomationTrusted: (trusted: boolean) => void;
  /** Run discovery (explicit action, trusted profile) and replace the catalog. */
  discoverAutomation: () => Promise<void>;
  addAutomationBinding: (entry: CatalogEntry, caseId: string) => Promise<void>;
  assignAutomationCase: (entry: CatalogEntry, caseId: string | null) => Promise<void>;
  setAutomationArgumentSet: (entry: CatalogEntry, referenceId: string | null) => Promise<void>;
  removeAutomationBinding: (bindingId: string) => Promise<void>;
  setAutomationBindingEnabled: (bindingId: string, enabled: boolean) => Promise<void>;
  saveAutomationProfile: (profile: AutomationProfile) => Promise<void>;

  /* automation results inside a run */
  runAutomation: Record<string, RunAutomationView>;
  loadRunAutomation: (runId: string) => Promise<void>;
  /** Resolve the enabled bindings' values without starting anything (the pre-run preview). */
  previewRunAutomation: (runId: string) => Promise<void>;
  /** Plan + start the run's enabled bindings (requires the trusted profile and a profile). */
  startRunAutomation: (
    runId: string,
    opts?: { onlyAutomationIds?: string[]; onlyBindingIds?: string[]; parentExecutionId?: string },
  ) => Promise<void>;
  /** Start a new execution containing only the failed automated tests (parentExecutionId set). */
  rerunFailedAutomation: (runId: string) => Promise<void>;
  stopRunAutomation: (runId: string) => void;
  saveAutomationExecution: (runId: string, executionId: string) => Promise<void>;
  /** Explicit apply of one saved execution's results to the run summary (revision-checked). */
  applyAutomationExecution: (runId: string, executionId: string) => Promise<void>;
  /** Pick a Playwright JSON / JUnit report and preview its match against the run (no writes). */
  importAutomationReport: (runId: string) => Promise<void>;
  /** Persist the previewed import (idempotent by payload hash). */
  applyAutomationImport: (runId: string) => Promise<void>;

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
    ...createReferenceSlice(set, get),
    ...createAutomationSlice(set, get),
    ...createGitSlice(set, get, ctx),
    ...createDialogSlice(set),
    ...createUpdatesSlice(set, get),
    ...createUiSlice(set),
  };
});

/**
 * The renderer's read-only view of the reference book: link chips in prose resolve a record's
 * name and open its card, without every markdown call site threading the catalog through props.
 * Installed once here, kept current by the subscription below.
 */
setReferenceCatalog(useAppStore.getState().refs);
setReferenceOpener((id) => useAppStore.getState().openReferenceEntry(id));
useAppStore.subscribe((s) => setReferenceCatalog(s.refs));

/**
 * While a run (or its guide) is on screen, chips resolve against that run's frozen snapshot
 * first — a run keeps showing the definitions it recorded even after the reference book moved on.
 * Anywhere else (and under a modal, which edits live content), the live catalog is the truth.
 */
let installedSnapshot: Run['snapshot'] | null = null;
const syncRunSnapshot = (s: AppState): void => {
  const active =
    !s.modal && (s.view === 'run' || s.view === 'guide') ? (s.runs.find((r) => r.id === s.sel.runId)?.snapshot ?? null) : null;
  if (active === installedSnapshot) return;
  installedSnapshot = active;
  setReferenceSnapshot(active ? active.glossary : null);
};
syncRunSnapshot(useAppStore.getState());
useAppStore.subscribe(syncRunSnapshot);

/**
 * Read the whole store (re-renders on any change — matches the previous context
 * behavior). For finer-grained subscriptions, use `useAppStore(selector)` directly.
 */
export const useApp = (): AppState => useAppStore();
