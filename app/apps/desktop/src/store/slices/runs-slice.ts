import { isNwjs } from '@/lib/nwjs';
import { isEmptyRunSnapshot } from '@/schemas/run-snapshot';
import { runCaseFileName, runFileStem } from '@/services/format/filename';
import { serializeOrder } from '@/services/format/order';
import { serializeRunCase, serializeRunDetails, type RunCaseFile, type RunCaseItem } from '@/services/format/run';
import { serializeRunArgumentsSnapshot, serializeRunGlossarySnapshot } from '@/services/format/run-snapshot';
import { schedulePersist } from '@/services/persist';
import { loadRunAutomationExecutions } from '@/services/automation/run-results';
import { deletePath, makeDir, orderFileRel, relJoin, writeFileAt } from '@/services/repo';
import { previewReportHtml, previewRunReport } from '@/services/report/run-report';
import type { RunReportModel } from '@/services/report/run-report-html';
import { groupRunBySuite } from '@/services/report/suite-grouping';
import { buildWeeklyReportHtml, weekLabel } from '@/services/report/weekly-report-html';
import { planRunSnapshot, type RunSnapshotPlan } from '@/services/run-snapshot';
import type { Approval, Case, CheckState, CreateRunResult, Run, RunRow } from '@/types';
import { buildWeeklyData } from '@/utils/run-dashboard';
import { nowStamp } from '@/utils/ids';
import { buildRunSummary, deriveItems, serializeRunSummary } from '@/utils/run-items';
import { baseName } from '../tree-helpers';
import type { AppState, StoreCtx, StoreGet, StoreSet } from '../app-store';

// ---------------------------------------------------------------------------
// Test runs: seeding, per-row check/result recording, approvals, duplicate /
// delete, and PDF export. Run files (`_run.md` + one `NNN-<id>.md` sidecar per
// case) are persisted here; the write helpers are runs-exclusive.
// ---------------------------------------------------------------------------

/** Repo-level runs live flat under `.ch/runs/` (PRD §4 req 16). */
const RUNS_REL = '.ch/runs';

/** Sidecar file names of the frozen reference snapshot (extension data, ignored by the loader). */
const GLOSSARY_SNAPSHOT_FILE = 'glossary.json';
const ARGUMENTS_SNAPSHOT_FILE = 'arguments.json';

type RunsSlice = Pick<
  AppState,
  | 'updateRunRow'
  | 'setRunTestDate'
  | 'setRowTestDate'
  | 'createRun'
  | 'cycleRunCheck'
  | 'setRunFailNote'
  | 'setRunGroupChecks'
  | 'recordRunResult'
  | 'setRunName'
  | 'setRunNotes'
  | 'setRunApproval'
  | 'reorderRunRows'
  | 'addRunCases'
  | 'removeRunRow'
  | 'duplicateRun'
  | 'deleteRun'
  | 'exportRunToPdf'
  | 'exportWeeklyReport'
  | 'rewriteRunDetails'
>;

export function createRunsSlice(set: StoreSet, get: StoreGet, ctx: StoreCtx): RunsSlice {
  const { upsertChange, scheduleRefresh, onWriteError } = ctx;

  /**
   * Build a per-case sidecar from a run row. The row's `itemText` snapshot — captured
   * when the run was seeded — is authoritative, so editing a case after a run exists never
   * silently rewrites that run's recorded checklist (PRD: runs are immune to later case
   * edits). We only fall back to deriving from the live `kase` for a brand-new run whose
   * snapshot hasn't been populated yet.
   */
  const buildRunCaseFile = (row: RunRow, kase: Case | undefined): RunCaseFile => {
    const overlay = (key: string, text: string): RunCaseItem => ({
      key,
      text,
      state: row.checks[key] ?? 'none',
      failNote: row.failNotes[key] ?? '',
    });
    const snapshot = row.itemText ?? {};
    const hasSnapshot = Object.keys(snapshot).length > 0;
    const group = (prefix: string): RunCaseItem[] => {
      if (hasSnapshot) {
        return Object.keys(snapshot)
          .filter((k) => k.startsWith(`${prefix}:`))
          .sort((a, b) => Number(a.split(':')[1]) - Number(b.split(':')[1]))
          .map((k) => overlay(k, snapshot[k]));
      }
      if (!kase) return [];
      const d = deriveItems(kase);
      const arr = prefix === 'setup' ? d.setup : prefix === 'step' ? d.steps : d.accept;
      return arr.map((it) => overlay(it.key, it.text));
    };
    const setup = group('setup');
    const steps = group('step');
    const accept = group('accept');
    return {
      caseId: row.case_id,
      displayId: row.display_id,
      title: row.title,
      result: row.result,
      tester: row.tester,
      executedAt: row.executed_at,
      testDate: row.testDate ?? undefined,
      notes: row.notes,
      setup,
      steps,
      accept,
    };
  };

  /** Snapshot a case's current checklist item text, keyed by position — frozen into a new run. */
  const snapshotItemText = (caseId: string): Record<string, string> => {
    const kase = get().cases.find((c) => c.id === caseId);
    const text: Record<string, string> = {};
    if (!kase) return text;
    const { setup, steps, accept } = deriveItems(kase);
    [...setup, ...steps, ...accept].forEach((it) => (text[it.key] = it.text));
    return text;
  };

  const runDetailsOf = (run: Run) => ({
    name: run.name,
    status: run.status,
    created: run.created,
    testDate: run.testDate,
    scope: run.scope,
    testerApproval: run.testerApproval,
    reviewerApproval: run.reviewerApproval,
    // The Summary (pass rate + Needs-attention, generated from results) is only filled out once the
    // run is "done" — i.e. closed (both approvals in). While the run is open we leave it empty so
    // `_run.md` carries just the notes and isn't churned with a regenerated summary on every edit;
    // closing the run writes the complete file. A reopened run drops back to notes-only.
    summary: run.status === 'closed' ? serializeRunSummary(buildRunSummary(run, get().cases)) : '',
    notes: run.notes,
  });

  const writeRunDetailsNow = async (runId: string) => {
    const { repoPath } = get();
    const run = get().runs.find((r) => r.id === runId);
    if (!repoPath || !run) return;
    try {
      await writeFileAt(repoPath, relJoin(run.file, '_run.md'), serializeRunDetails(runDetailsOf(run)));
      scheduleRefresh();
    } catch (e) {
      onWriteError(e);
    }
  };

  const writeRunCaseNow = async (runId: string, i: number) => {
    const { repoPath } = get();
    const run = get().runs.find((r) => r.id === runId);
    const row = run?.rows[i];
    if (!repoPath || !run || !row) return;
    const kase = get().cases.find((c) => c.id === row.case_id);
    try {
      await writeFileAt(repoPath, row.file, serializeRunCase(buildRunCaseFile(row, kase)));
      scheduleRefresh();
    } catch (e) {
      onWriteError(e);
    }
  };

  /**
   * Persist the run folder's `.order` — the sidecar filename stems in current row order.
   * Reused by the explicit reorder action; the loader honors it over the seed-order prefix.
   */
  const writeRunOrderNow = async (runId: string) => {
    const { repoPath } = get();
    const run = get().runs.find((r) => r.id === runId);
    if (!repoPath || !run) return;
    const keys = run.rows.map((row) => baseName(row.file).replace(/\.md$/, ''));
    try {
      await writeFileAt(repoPath, orderFileRel(run.file), serializeOrder(keys));
      scheduleRefresh();
    } catch (e) {
      onWriteError(e);
    }
  };

  /**
   * The run's frozen reference snapshot as sidecar files. Written once, at creation, and never
   * rewritten: an empty snapshot writes nothing at all, so a run that references no record (or
   * predates the feature) keeps the exact folder layout it always had.
   */
  const snapshotFiles = (run: Run): [string, string][] => {
    const snap = run.snapshot;
    if (!snap || isEmptyRunSnapshot(snap)) return [];
    const files: [string, string][] = [];
    if (snap.glossary.length || snap.unresolved.length) {
      files.push([relJoin(run.file, GLOSSARY_SNAPSHOT_FILE), serializeRunGlossarySnapshot(snap.glossary, snap.unresolved)]);
    }
    if (snap.arguments) {
      files.push([relJoin(run.file, ARGUMENTS_SNAPSHOT_FILE), serializeRunArgumentsSnapshot(snap.arguments)]);
    }
    return files;
  };

  /** Fan-out write of a brand-new run folder: `_run.md` + every case sidecar + the snapshot. */
  const writeWholeRun = (run: Run) => {
    const rp = get().repoPath;
    if (!rp) return;
    void makeDir(rp, run.file)
      .then(() =>
        Promise.all([
          writeFileAt(rp, relJoin(run.file, '_run.md'), serializeRunDetails(runDetailsOf(run))),
          ...run.rows.map((row) =>
            writeFileAt(rp, row.file, serializeRunCase(buildRunCaseFile(row, get().cases.find((c) => c.id === row.case_id)))),
          ),
          ...snapshotFiles(run).map(([rel, text]) => writeFileAt(rp, rel, text)),
        ]),
      )
      .then(scheduleRefresh)
      .catch(onWriteError);
  };

  /** Persist one case sidecar (debounced) + flag the run as modified. Also refreshes the
   *  run-details sidecar, whose generated Summary depends on this row's result/failures. */
  const persistRunCase = (runId: string, i: number) => {
    const run = get().runs.find((r) => r.id === runId);
    if (run) upsertChange({ kind: 'run', refId: runId, path: run.file, status: 'M', label: run.name });
    schedulePersist(`runcase:${runId}:${i}`, () => writeRunCaseNow(runId, i));
    schedulePersist(`rundetails:${runId}`, () => writeRunDetailsNow(runId));
  };

  /** Persist the run-details sidecar (debounced) + flag the run as modified. */
  const persistRunDetails = (runId: string) => {
    const run = get().runs.find((r) => r.id === runId);
    if (run) upsertChange({ kind: 'run', refId: runId, path: run.file, status: 'M', label: run.name });
    schedulePersist(`rundetails:${runId}`, () => writeRunDetailsNow(runId));
  };

  /** Replace one row in a run, immutably. */
  const patchRow = (runId: string, i: number, patch: Partial<RunRow>) =>
    set((s) => ({
      runs: s.runs.map((r) => (r.id !== runId ? r : { ...r, rows: r.rows.map((row, j) => (j === i ? { ...row, ...patch } : row)) })),
    }));

  return {
    updateRunRow: (runId, i, patch) => {
      patchRow(runId, i, patch);
      persistRunCase(runId, i);
    },

    setRunTestDate: (runId, date) => {
      set((s) => ({ runs: s.runs.map((r) => (r.id === runId ? { ...r, testDate: date } : r)) }));
      persistRunDetails(runId);
    },

    setRowTestDate: (runId, i, date) => {
      patchRow(runId, i, { testDate: date });
      persistRunCase(runId, i);
    },

    createRun: async ({ name, caseIds, scopeLabel, argsEntryId, allowIncomplete }) => {
      const { cases, repoPath } = get();
      if (!repoPath) return { ok: false, reason: 'io', message: 'Open a repository first.' };

      // Freeze the reference book *before* anything is written: the snapshot must record the
      // revisions actually on disk, and a run that cannot be frozen honestly is not created.
      const seeded = caseIds.map((id) => cases.find((c) => c.id === id)).filter((c): c is Case => !!c);
      let plan: RunSnapshotPlan;
      try {
        plan = await planRunSnapshot(repoPath, seeded, argsEntryId ?? null);
      } catch (e) {
        return { ok: false, reason: 'io', message: `Could not read the reference book: ${e instanceof Error ? e.message : String(e)}` };
      }
      if (plan.argsError) return { ok: false, reason: 'args', message: plan.argsError };
      // An unresolved reference is never hidden: the user decides, and the run records what it
      // could not freeze (`snapshot.unresolved`) either way.
      if (plan.snapshot.unresolved.length && !allowIncomplete) {
        return { ok: false, reason: 'snapshot', issues: plan.snapshot.unresolved };
      }

      const date = new Date().toISOString().slice(0, 10);
      const dir = relJoin(RUNS_REL, runFileStem(name, date));
      const rows: RunRow[] = caseIds.map((id, i) => {
        const c = cases.find((x) => x.id === id);
        const display_id = c?.displayId ?? id;
        const title = c?.title ?? '';
        return {
          case_id: id,
          display_id,
          title,
          result: 'not_run',
          tester: '',
          executed_at: '',
          notes: '',
          checks: {},
          failNotes: {},
          itemText: snapshotItemText(id),
          file: relJoin(dir, runCaseFileName(i, { display_id, title })),
        };
      });
      const run: Run = {
        id: dir,
        name,
        file: dir,
        created: date,
        testDate: date,
        status: 'open',
        scope: scopeLabel ?? '',
        rows,
        summary: '',
        notes: '',
        testerApproval: null,
        reviewerApproval: null,
        snapshot: plan.snapshot,
      };
      set((s) => ({ runs: [run, ...s.runs], modal: null, sel: { ...s.sel, kind: 'run', runId: run.id, guideIndex: 0 }, view: 'run' }));
      upsertChange({ kind: 'run', refId: run.id, path: run.file, status: 'A', label: run.name });
      writeWholeRun(run);
      get().toast(`Created run · ${rows.length} cases seeded`);
      return { ok: true } satisfies CreateRunResult;
    },

    cycleRunCheck: (runId, i, key) => {
      const row = get().runs.find((r) => r.id === runId)?.rows[i];
      if (!row) return;
      const cur = row.checks[key] ?? 'none';
      const next: CheckState = cur === 'none' ? 'pass' : cur === 'pass' ? 'fail' : 'none';
      const checks = { ...row.checks, [key]: next };
      const failNotes = { ...row.failNotes };
      if (next !== 'fail') delete failNotes[key]; // a note only belongs to a failed item
      patchRow(runId, i, { checks, failNotes });
      persistRunCase(runId, i);
    },

    setRunFailNote: (runId, i, key, note) => {
      const row = get().runs.find((r) => r.id === runId)?.rows[i];
      if (!row) return;
      patchRow(runId, i, { failNotes: { ...row.failNotes, [key]: note } });
      persistRunCase(runId, i);
    },

    setRunGroupChecks: (runId, i, keys, state) => {
      const row = get().runs.find((r) => r.id === runId)?.rows[i];
      if (!row) return;
      const checks = { ...row.checks };
      const failNotes = { ...row.failNotes };
      for (const k of keys) {
        checks[k] = state;
        if (state !== 'fail') delete failNotes[k];
      }
      patchRow(runId, i, { checks, failNotes });
      persistRunCase(runId, i);
    },

    recordRunResult: (runId, i, { result, tester, notes }) => {
      patchRow(runId, i, { result, tester, notes, executed_at: result === 'not_run' ? '' : nowStamp() });
      persistRunCase(runId, i);
    },

    setRunName: (runId, name) => {
      set((s) => ({ runs: s.runs.map((r) => (r.id === runId ? { ...r, name } : r)) }));
      persistRunDetails(runId);
    },

    setRunNotes: (runId, notes) => {
      set((s) => ({ runs: s.runs.map((r) => (r.id === runId ? { ...r, notes } : r)) }));
      persistRunDetails(runId);
    },

    setRunApproval: (runId, who, name) => {
      const approval: Approval | null = name.trim() ? { name: name.trim(), at: nowStamp() } : null;
      const field = who === 'tester' ? 'testerApproval' : 'reviewerApproval';
      const wasClosed = get().runs.find((r) => r.id === runId)?.status === 'closed';
      set((s) => ({
        runs: s.runs.map((r) => {
          if (r.id !== runId) return r;
          const next = { ...r, [field]: approval };
          // A run closes once both tester and reviewer have signed off; clearing either reopens it.
          next.status = next.testerApproval && next.reviewerApproval ? 'closed' : 'open';
          return next;
        }),
      }));
      persistRunDetails(runId);
      if (!wasClosed && get().runs.find((r) => r.id === runId)?.status === 'closed') {
        get().toast('Run closed · tester and reviewer approved');
      }
    },

    reorderRunRows: (runId, from, to) => {
      const run = get().runs.find((r) => r.id === runId);
      if (!run) return;
      const n = run.rows.length;
      if (from === to || from < 0 || to < 0 || from >= n || to >= n) return;
      set((s) => ({
        runs: s.runs.map((r) => {
          if (r.id !== runId) return r;
          const rows = r.rows.slice();
          const [moved] = rows.splice(from, 1);
          rows.splice(to, 0, moved);
          return { ...r, rows };
        }),
      }));
      upsertChange({ kind: 'run', refId: runId, path: run.file, status: 'M', label: run.name });
      schedulePersist(`runorder:${runId}`, () => writeRunOrderNow(runId));
    },

    addRunCases: (runId, caseIds) => {
      const run = get().runs.find((r) => r.id === runId);
      if (!run) return;
      const present = new Set(run.rows.map((r) => r.case_id));
      const toAdd = caseIds.filter((id) => !present.has(id));
      if (toAdd.length === 0) {
        get().toast('Those cases are already in this run');
        return;
      }
      const { cases } = get();
      const startIdx = run.rows.length;
      const newRows: RunRow[] = toAdd.map((id, k) => {
        const c = cases.find((x) => x.id === id);
        const display_id = c?.displayId ?? id;
        const title = c?.title ?? '';
        return {
          case_id: id,
          display_id,
          title,
          result: 'not_run',
          tester: '',
          executed_at: '',
          notes: '',
          checks: {},
          failNotes: {},
          itemText: snapshotItemText(id),
          // Continue the sidecar index sequence so new files sort after the existing rows.
          file: relJoin(run.file, runCaseFileName(startIdx + k, { display_id, title })),
        };
      });
      set((s) => ({ runs: s.runs.map((r) => (r.id === runId ? { ...r, rows: [...r.rows, ...newRows] } : r)) }));
      upsertChange({ kind: 'run', refId: runId, path: run.file, status: 'M', label: run.name });
      const rp = get().repoPath;
      if (rp)
        void Promise.all(
          newRows.map((row) =>
            writeFileAt(rp, row.file, serializeRunCase(buildRunCaseFile(row, get().cases.find((c) => c.id === row.case_id)))),
          ),
        )
          .then(scheduleRefresh)
          .catch(onWriteError);
      // Persist the new row order + regenerated summary alongside the fresh sidecars.
      schedulePersist(`runorder:${runId}`, () => writeRunOrderNow(runId));
      schedulePersist(`rundetails:${runId}`, () => writeRunDetailsNow(runId));
      get().toast(`Added ${newRows.length} ${newRows.length === 1 ? 'case' : 'cases'} to run`);
    },

    removeRunRow: async (runId, i) => {
      const run = get().runs.find((r) => r.id === runId);
      const row = run?.rows[i];
      if (!run || !row) return;
      const hasResult = row.result !== 'not_run' || Object.keys(row.checks).length > 0;
      if (
        hasResult &&
        !(await get().confirm({
          title: `Remove "${row.title || row.display_id}" from this run?`,
          message: 'Its recorded result and checks for this run will be deleted.',
          confirmLabel: 'Remove',
          danger: true,
        }))
      )
        return;
      set((s) => ({
        runs: s.runs.map((r) => (r.id !== runId ? r : { ...r, rows: r.rows.filter((_, j) => j !== i) })),
      }));
      upsertChange({ kind: 'run', refId: runId, path: run.file, status: 'M', label: run.name });
      const rp = get().repoPath;
      if (rp) void deletePath(rp, row.file).then(scheduleRefresh).catch(onWriteError);
      // Rewrite `.order` (the removed stem is gone) and the summary, which dropped this row.
      schedulePersist(`runorder:${runId}`, () => writeRunOrderNow(runId));
      schedulePersist(`rundetails:${runId}`, () => writeRunDetailsNow(runId));
    },

    duplicateRun: (runId) => {
      const src = get().runs.find((r) => r.id === runId);
      if (!src) return;
      const name = `${src.name} (copy)`;
      const date = new Date().toISOString().slice(0, 10);
      const dir = relJoin(RUNS_REL, runFileStem(name, date));
      const rows: RunRow[] = src.rows.map((r, i) => {
        // Re-snapshot from the live case where possible; otherwise carry the source snapshot.
        const snap = snapshotItemText(r.case_id);
        return {
          case_id: r.case_id,
          display_id: r.display_id,
          title: r.title,
          result: 'not_run',
          tester: '',
          executed_at: '',
          notes: '',
          checks: {},
          failNotes: {},
          itemText: Object.keys(snap).length ? snap : { ...(r.itemText ?? {}) },
          file: relJoin(dir, runCaseFileName(i, { display_id: r.display_id, title: r.title })),
        };
      });
      const run: Run = {
        id: dir,
        name,
        file: dir,
        created: date,
        testDate: date,
        status: 'open',
        scope: src.scope,
        rows,
        summary: '',
        notes: '',
        testerApproval: null,
        reviewerApproval: null,
        // The copy inherits the source's frozen definitions: its cases are the same cases, and
        // re-freezing them from today's reference book would silently rewrite history.
        snapshot: src.snapshot,
      };
      set((s) => ({ runs: [run, ...s.runs], sel: { ...s.sel, kind: 'run', runId: run.id, guideIndex: 0 }, view: 'run' }));
      upsertChange({ kind: 'run', refId: run.id, path: run.file, status: 'A', label: run.name });
      writeWholeRun(run);
      get().toast(`Run duplicated · ${rows.length} cases reset`);
    },

    deleteRun: async (runId) => {
      const run = get().runs.find((r) => r.id === runId);
      if (!run) return;
      if (
        !(await get().confirm({
          title: `Delete run "${run.name}"?`,
          message: 'This removes the run and all its recorded results from disk.',
          confirmLabel: 'Delete',
          danger: true,
        }))
      )
        return;
      set((s) => {
        // If the deleted run was open (run view / guide), drop back to the runs list.
        const wasActive = s.sel.runId === runId;
        return {
          runs: s.runs.filter((r) => r.id !== runId),
          sel: wasActive ? { ...s.sel, runId: null, guideIndex: undefined } : s.sel,
          view: wasActive && (s.view === 'run' || s.view === 'guide') ? 'runs' : s.view,
        };
      });
      upsertChange({ kind: 'run', refId: runId, path: run.file, status: 'D', label: run.name });
      const rp = get().repoPath;
      if (rp) void deletePath(rp, run.file).then(scheduleRefresh).catch(onWriteError);
      get().toast(`Deleted run "${run.name}"`);
    },

    exportRunToPdf: async (runId) => {
      const { runs, cases, tree, repoPath } = get();
      const run = runs.find((r) => r.id === runId);
      if (!run) return;
      if (!isNwjs()) {
        get().toast('PDF export needs the desktop app');
        return;
      }
      const automation = await loadRunAutomationExecutions(repoPath, run);
      const model: RunReportModel = {
        runName: run.name,
        status: run.status,
        created: run.created,
        testDate: run.testDate ?? run.created,
        repoName: baseName(repoPath),
        generatedAt: nowStamp(),
        summary: buildRunSummary(run, cases),
        suites: groupRunBySuite(run, cases, tree),
        notes: run.notes,
        testerApproval: run.testerApproval,
        reviewerApproval: run.reviewerApproval,
        ...(automation.executions.length
          ? {
              automation: {
                executions: automation.executions.map((e) => ({
                  executionId: e.executionId,
                  project: e.project,
                  state: e.state,
                  createdAt: e.createdAt,
                  ...(e.error ? { error: e.error } : {}),
                  arguments: e.arguments.map((a) => ({
                    key: a.key,
                    type: a.type,
                    value: a.value,
                    source: a.source,
                    ...(a.reference ? { reference: a.reference } : {}),
                  })),
                  results: e.results.map((r) => ({
                    automationId: r.automationId,
                    status: r.status,
                    flaky: r.flaky,
                    attempts: r.attempts,
                    duration: r.duration,
                  })),
                })),
              },
            }
          : {}),
      };
      try {
        const res = await previewRunReport(model);
        if (res.ok) {
          console.debug('[pdf] exportRunToPdf: preview opened', { runId });
        } else if (res.reason === 'not-nwjs') {
          get().toast('PDF export needs the desktop app');
        } else {
          console.error('[pdf] exportRunToPdf: preview failed', { runId, reason: res.reason, error: res.error });
          get().toast('Could not open report preview');
        }
      } catch (e) {
        console.error('[pdf] exportRunToPdf: unexpected error', { runId, error: e });
        get().toast('Could not open report preview');
      }
    },

    rewriteRunDetails: (runId) => writeRunDetailsNow(runId),

    exportWeeklyReport: async () => {
      const { runs, repoPath } = get();
      if (!isNwjs()) {
        get().toast('PDF export needs the desktop app');
        return;
      }
      const data = buildWeeklyData(runs);
      if (data.runs.length === 0) {
        get().toast('No runs executed this week — nothing to report');
        return;
      }
      const model = { ...data, repoName: baseName(repoPath), generatedAt: nowStamp() };
      try {
        const res = await previewReportHtml(
          buildWeeklyReportHtml(model, { preview: true }),
          `Week of ${weekLabel(data.weekStart, data.weekEnd)} — Report preview`,
        );
        if (res.ok) {
          console.debug('[pdf] exportWeeklyReport: preview opened', { week: data.weekStart });
        } else if (res.reason === 'not-nwjs') {
          get().toast('PDF export needs the desktop app');
        } else {
          console.error('[pdf] exportWeeklyReport: preview failed', { reason: res.reason, error: res.error });
          get().toast('Could not open report preview');
        }
      } catch (e) {
        console.error('[pdf] exportWeeklyReport: unexpected error', { error: e });
        get().toast('Could not open report preview');
      }
    },
  };
}
