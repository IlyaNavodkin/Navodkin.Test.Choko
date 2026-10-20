import type { ReferenceIssue } from '@/schemas/reference-book';
import type { RunSnapshot, RunSnapshotMiss } from '@/schemas/run-snapshot';

/** The run-snapshot model is part of the domain surface (components/tests read it off `Run`). */
export type { RunArgumentsSnapshot, RunGlossaryEntry, RunSnapshot, RunSnapshotMiss } from '@/schemas/run-snapshot';

/* ============================================================
   Casewright — domain model
   ============================================================ */

export type Status = 'active' | 'draft' | 'deprecated';
export type Result = 'pass' | 'fail' | 'blocked' | 'in_progress' | 'skipped' | 'not_run';

/** A single (optionally nested) step in a case. */
export interface Step {
  text: string;
  depth: number;
}

/** A named setup item — a `###` heading plus a multi-line markdown body. */
export interface SetupItem {
  name: string;
  body: string;
}

/** A manual test case — one markdown file on disk. */
export interface Case {
  id: string; // stable hash, the internal key
  displayId: string; // human-facing ID, e.g. PAY-0042
  title: string;
  /** Explicit filename-stem override (frontmatter `slug`). Absent = derive from `title`.
   *  Lets long/similar titles avoid colliding on the same truncated auto-slug. */
  slug?: string;
  status: Status;
  tags: string[];
  suite: string; // owning suite id
  objective: string;
  systems: string[];
  setup: SetupItem[];
  steps: Step[];
  expected: string[];
  modified: boolean;
}

/* ---- suite tree (folders) ---- */
export interface SuiteNode {
  type: 'suite';
  id: string;
  /** Display name (from the optional folder note, else the folder basename). */
  name: string;
  path: string;
  /** This folder note's own display-ID prefix override (absent = inherit from an ancestor). */
  prefix?: string;
  /** This folder note's description (markdown body), when set. */
  description?: string;
  children: TreeNode[];
  /** True for a workspace root folder (top-level in the tree; not draggable/renamable). */
  isWorkspace?: boolean;
}
export interface CaseNode {
  type: 'case';
  id: string;
}
export type TreeNode = SuiteNode | CaseNode;

/* ---- workspace + launcher ---- */
export interface Workspace {
  id: string;
  name: string;
  path: string;
  description: string;
  prefix: string;
}

export interface Recent {
  path: string;
  name: string;
  branch: string;
  remote: string;
  /** ISO timestamp of when this repo was last opened. */
  lastOpened: string;
  workspaces: number;
  lastWorkspaceId: string | null;
}

/* ---- runs (folder of markdown sidecars) ---- */
/** Tri-state checklist mark: `[ ]` empty, `[x]` passed, `[-]` failed. */
export type CheckState = 'none' | 'pass' | 'fail';

/** Who approved a run, and when (saved to the run-details sidecar). */
export interface Approval {
  name: string;
  at: string;
}

export interface RunRow {
  case_id: string;
  display_id: string;
  title: string;
  result: Result;
  tester: string;
  executed_at: string;
  notes: string;
  /** Per-item check states, keyed `setup:i` / `step:i` / `accept:i`. */
  checks: Record<string, CheckState>;
  /** Failure descriptions for items marked `fail`, same keys as `checks`. */
  failNotes: Record<string, string>;
  /** Snapshot of each item's line text at record time (for deleted/diverged cases). */
  itemText?: Record<string, string>;
  /** Repo-relative path of this case's sidecar markdown file. */
  file: string;
  /** Per-case test-date override (ISO `YYYY-MM-DD`) for `{{today}}` resolution; absent/null = inherit the run's. */
  testDate?: string | null;
}

export interface Run {
  id: string;
  name: string;
  /** Repo-level folder path, `.casewright/runs/<stem>`. */
  file: string;
  created: string;
  /** The run's default test date (ISO `YYYY-MM-DD`) for `{{today}}` resolution; seeded to the creation date. */
  testDate?: string;
  status: 'open' | 'closed';
  scope: string;
  rows: RunRow[];
  /** Run-level summary prose (run-details sidecar `## Summary`). */
  summary: string;
  /** General run notes (run-details sidecar `## Notes`). */
  notes: string;
  testerApproval: Approval | null;
  reviewerApproval: Approval | null;
  /**
   * The reference book as frozen when the run was created (`glossary.json` / `arguments.json`
   * sidecars) — absent on runs created before the feature or without any referenced record.
   */
  snapshot?: RunSnapshot;
}

export interface CreateRunArgs {
  name: string;
  /** Explicit set of case ids to seed, chosen in the create-run tree. */
  caseIds: string[];
  /** Human-readable scope label for the run-details sidecar. */
  scopeLabel?: string;
  /** `arguments` record to freeze into the run, or `null`/absent for none (the default). */
  argsEntryId?: string | null;
  /**
   * Create the run even when some referenced records could not be frozen. The user chose this
   * after seeing exactly which references it affects; the run records them as unresolved.
   */
  allowIncomplete?: boolean;
}

/**
 * Outcome of `createRun`. The store does not create a run it cannot freeze honestly; on failure
 * it reports why so the create-run modal can show the problem while keeping the user's selection.
 */
export type CreateRunResult =
  | { ok: true }
  | { ok: false; reason: 'args'; message: string }
  | { ok: false; reason: 'snapshot'; issues: RunSnapshotMiss[] }
  | { ok: false; reason: 'io'; message: string };

/* ---- reference book (`.casewright/glossary/`) ---- */
export type RefKindFilter = 'all' | 'link' | 'arguments';
/** Automation catalog filter (see utils/automation-catalog.ts). */
export type AutomationFilter = 'all' | 'runnable' | 'archived';

/** Live/observable state of one automation execution shown in a run (design §Наблюдаемость). */
export interface AutomationExecutionView {
  executionId: string;
  project: string;
  state: import('@/schemas/automation').ExecutionState;
  completed: number;
  total: number | null;
  currentLine: string | null;
  logTail: string;
  error: string | null;
  startedAt: string;
}

/** The automation panel state of one run. */
export interface RunAutomationView {
  executions: AutomationExecutionView[];
  results: import('@/services/automation/run-results').RunAutomationResult[];
  issues: string[];
  busy: boolean;
  /** Resolved values of the enabled bindings, shown before starting. */
  preview?: import('@/schemas/automation').ResolvedAutomationArg[];
  previewProblems?: string[];
  /** A report chosen for import, previewed before anything is written. */
  importPreview?: import('@/services/automation/import').ImportPreview;
}

/**
 * Why the last reference-book save did not happen. The draft is always kept: `fields` and
 * `io` are retried after fixing, `conflict` needs an explicit decision (reload or overwrite).
 */
export type RefSaveError =
  | { kind: 'fields'; issues: ReferenceIssue[] }
  | { kind: 'conflict'; message: string }
  | { kind: 'io'; message: string };

/** Navigation waiting on a dirty-draft decision (stay / save / discard). */
export interface RefLeaveRequest {
  /** What the user was about to open — shown in the prompt. */
  label: string;
  proceed: () => void;
}

/**
 * An open «From the reference book» picker: which document is being edited (so the inserted
 * link is relative to it) and where the built Markdown link goes.
 */
export interface RefPickerRequest {
  baseRel: string;
  insert: (markdown: string) => void;
}

/* ---- git working state ---- */
export type ChangeStatus = 'A' | 'M' | 'D';
export interface Change {
  kind: 'case' | 'run';
  refId: string;
  path: string;
  status: ChangeStatus;
  label: string;
}

/* ---- ui selection + ephemera ---- */
export interface Selection {
  kind: 'case' | 'run' | 'suite';
  id?: string;
  runId?: string | null;
  suiteId?: string | null;
  guideIndex?: number;
}

export type View = 'editor' | 'runs' | 'run' | 'guide' | 'suite' | 'glossary' | 'automation';
export type Screen = 'launcher' | 'main';
export type ModalKind = 'commit' | 'createRun' | 'addCases' | 'merge' | 'workspace' | 'about' | 'refPicker' | null;

export interface Toast {
  id: number;
  msg: string;
}

/** A pending generic dialog (replaces native window.confirm/alert). */
export interface DialogRequest {
  kind: 'confirm' | 'alert';
  title: string;
  message?: string;
  /** Primary-button label (confirm action, or "OK" for an alert). */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Render the primary action as destructive. */
  danger?: boolean;
}

export interface Renaming {
  id: string;
  value: string;
}

/* ============================================================
   Structured 3-way merge model
   ============================================================ */
export type MergeAuto = 'same' | 'ours' | 'theirs' | 'merge';

interface MergeElementBase {
  key: string;
  label: string;
  conflict?: boolean;
  auto?: MergeAuto;
  reason?: string;
}
export interface FieldElement extends MergeElementBase {
  kind: 'field';
  base: string;
  ours: string;
  theirs: string;
}
export interface ProseElement extends MergeElementBase {
  kind: 'prose';
  base: string;
  ours: string;
  theirs: string;
}
export interface TagsElement extends MergeElementBase {
  kind: 'tags';
  base: string[];
  ours: string[];
  theirs: string[];
  merged?: string[];
}
export interface ListElement extends MergeElementBase {
  kind: 'list';
  base: string[];
  ours: string[];
  theirs: string[];
}
export interface StepsElement extends MergeElementBase {
  kind: 'steps';
  base: Step[];
  ours: Step[];
  theirs: Step[];
}
export type MergeElement =
  | FieldElement
  | ProseElement
  | TagsElement
  | ListElement
  | StepsElement;

export interface CaseMergeFile {
  kind: 'case';
  path: string;
  displayId: string;
  caseId: string;
  title: string;
  elements: MergeElement[];
}

export interface RunRowValue {
  result: Result;
  tester: string;
  notes: string;
}
export interface CsvMergeRow {
  case_id: string;
  display_id: string;
  auto?: MergeAuto;
  reason?: string;
  value?: RunRowValue;
  conflict?: boolean;
  base?: RunRowValue;
  ours?: RunRowValue;
  theirs?: RunRowValue;
}
export interface RunMergeFile {
  kind: 'run';
  path: string;
  title: string;
  rows: CsvMergeRow[];
}
export type MergeFile = CaseMergeFile | RunMergeFile;

export interface Conflict {
  branch: string;
  behind: number;
  ahead: number;
  files: MergeFile[];
}

export type ResolutionChoice = 'ours' | 'theirs' | 'edit';
export interface Resolution {
  choice: ResolutionChoice;
  text?: string;
}
export type Resolutions = Record<string, Resolution>;

/* ---- diff tokens ---- */
export type DiffKind = 'same' | 'add' | 'del';
export interface DiffToken {
  v: string;
  t: DiffKind;
}
