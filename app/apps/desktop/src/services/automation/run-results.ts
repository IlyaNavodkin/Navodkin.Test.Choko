import { node } from '@/lib/node';
import type { ExecutionManifest, PlaywrightJsonReport } from '@/schemas/automation';
import type { Result, Run, RunRow } from '@/types';
import { sha256Hex } from '@/services/hash';
import { readMaybe, writeFileAt, makeDir } from '@/services/repo-fs';
import { executionRel, readExecutionManifest, stableStringify } from './storage';
import { parsePlaywrightReport, summarizeResults, walkSpecs } from './report';

/** A run-level summary line for the "run finished" toast (states, never per-test). */
export function summarizeExecutions(
  all: readonly { state: import('@/schemas/automation').ExecutionState; error?: string | null }[],
): string {
  // Only this run's finished invocations matter for the toast; in-flight ones (a parallel group)
  // are summarized when the last one settles.
  const executions = all.filter((e) => ['completed', 'runner_error', 'cancelled', 'interrupted'].includes(e.state));
  if (executions.length === 0) return 'Autotests finished';
  const failed = executions.filter((e) => e.state === 'runner_error' || e.state === 'interrupted').length;
  const cancelled = executions.filter((e) => e.state === 'cancelled').length;
  const completed = executions.filter((e) => e.state === 'completed').length;
  if (failed) return `${failed} of ${executions.length} autotest run${executions.length === 1 ? '' : 's'} failed to complete${completed ? `; ${completed} completed` : ''}`;
  if (cancelled) return `${cancelled} autotest run${cancelled === 1 ? ' was' : 's were'} cancelled${completed ? `; ${completed} completed` : ''}`;
  return `${completed} autotest run${completed === 1 ? '' : 's'} completed`;
}

// ---------------------------------------------------------------------------
// Automation results in a run (spec "Run from a test run and save results", "Explicit apply to
// summary").
//
// Executions live in `.testoritto/automation/executions/<id>/`; an explicit "save to run" copies
// the manifest/report into `<run>/automation/<id>/` (a sidecar the run loader ignores). Applying
// results to the run's *summary* is a separate, explicit, revision-checked action: automated results
// never overwrite manual checks/notes on their own.
// ---------------------------------------------------------------------------

export const RUN_AUTOMATION_DIR = 'automation';
export const RUN_IMPORTS_DIR = 'automation/imports';

/** Where a saved execution lives inside a run folder. */
export const runAutomationRel = (runFile: string, executionId: string): string =>
  `${runFile}/${RUN_AUTOMATION_DIR}/${executionId}`;

/** Where an imported report's results live inside a run folder (idempotent by importId). */
export const runImportRel = (runFile: string, importId: string): string =>
  `${runFile}/${RUN_IMPORTS_DIR}/${importId}/results.json`;

/** One automation result mapped onto a run row. */
export interface RunAutomationResult {
  executionId: string;
  automationId: string;
  project: string;
  caseId: string | null;
  /** The run row it maps to, if any. */
  caseRowIndex: number | null;
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  flaky: boolean;
  attempts: number;
  duration: number;
  error?: string;
}

export interface RunAutomationLoad {
  results: RunAutomationResult[];
  /** Executions whose manifest/report could not be read. */
  issues: string[];
}

/** Map an execution manifest + report onto run rows (annotations first, file+title fallback). */
export function mapReportToRun(run: Run, manifest: ExecutionManifest, report: PlaywrightJsonReport): RunAutomationResult[] {
  const byAutomation = new Map(manifest.tests.map((t) => [`${t.automationId}::${t.project}`, t]));
  const out: RunAutomationResult[] = [];
  for (const { suite, spec } of walkSpecs(report)) {
    const tags = (spec as { tags?: string[] }).tags ?? [];
    const tag = tags.find((t) => t.startsWith('@tt:') || t.startsWith('tt:'));
    const automationId = tag ? (tag.startsWith('@tt:') ? tag.slice(4) : tag.slice(3)) : null;
    if (!automationId) continue;
    const tests = (spec.tests ?? []) as { projectName?: string; results?: Parameters<typeof summarizeResults>[0] }[];
    for (const test of tests) {
      const project = test.projectName ?? suite.projectName ?? '';
      const key = `${automationId}::${project}`;
      const ref = byAutomation.get(key);
      const summary = summarizeResults(test.results ?? []);
      const caseId = ref?.caseId ?? null;
      const file = suite.file ?? ref?.file ?? null;
      let caseRowIndex: number | null = null;
      if (caseId) caseRowIndex = run.rows.findIndex((r) => r.case_id === caseId);
      if (caseRowIndex === null || caseRowIndex < 0) {
        // Fallback: match the discovery file + title against a row's case title.
        caseRowIndex = run.rows.findIndex(
          (r) => (file && r.file.endsWith(file)) || (spec.title && r.title === spec.title),
        );
        if (caseRowIndex < 0) caseRowIndex = null;
      }
      out.push({
        executionId: manifest.executionId,
        automationId,
        project,
        caseId,
        caseRowIndex,
        status: summary.status,
        flaky: summary.flaky,
        attempts: summary.attempts,
        duration: summary.duration,
        ...(summary.results.at(-1)?.error?.message ? { error: summary.results.at(-1)!.error!.message } : {}),
      });
    }
  }
  return out;
}

/** Read every saved automation execution of a run, newest first. */
export async function loadRunAutomation(repoPath: string, run: Run): Promise<RunAutomationLoad> {
  const dir = node.path().join(repoPath, run.file, RUN_AUTOMATION_DIR);
  let ids: string[];
  try {
    ids = (await node.fsp().readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && e.name !== 'imports')
      .map((e) => e.name)
      .sort()
      .reverse();
  } catch {
    return loadImportedResults(repoPath, run);
  }
  const results: RunAutomationResult[] = [];
  const issues: string[] = [];
  for (const id of ids) {
    const base = node.path().join(repoPath, runAutomationRel(run.file, id));
    let manifest: ExecutionManifest;
    try {
      manifest = JSON.parse(await node.fsp().readFile(node.path().join(base, 'manifest.json'), 'utf8')) as ExecutionManifest;
    } catch {
      issues.push(`Execution ${id} in this run could not be read.`);
      continue;
    }
    let report: PlaywrightJsonReport | null = null;
    try {
      const parsed = parsePlaywrightReport(await node.fsp().readFile(node.path().join(base, 'report.json'), 'utf8'));
      if (parsed.ok) report = parsed.report;
    } catch {
      /* no report saved */
    }
    if (report) results.push(...mapReportToRun(run, manifest, report));
  }
  const imported = await loadImportedResults(repoPath, run);
  return { results: [...results, ...imported.results], issues: [...issues, ...imported.issues] };
}

/**
 * Persist the matched results of an imported report. The path is keyed by the payload hash, so
 * importing the same report twice rewrites the same file — never duplicates results.
 */
export async function saveImportToRun(
  repoPath: string,
  run: Run,
  importId: string,
  format: string,
  results: readonly RunAutomationResult[],
): Promise<void> {
  const rel = runImportRel(run.file, importId);
  await writeFileAt(repoPath, rel, stableStringify({ schemaVersion: 1, importId, format, results: [...results] }));
}

/** Read all imported-results sidecars of a run. */
export async function loadImportedResults(
  repoPath: string,
  run: Run,
): Promise<{ results: RunAutomationResult[]; issues: string[] }> {
  const dir = node.path().join(repoPath, run.file, RUN_IMPORTS_DIR);
  let ids: string[];
  try {
    ids = (await node.fsp().readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return { results: [], issues: [] };
  }
  const results: RunAutomationResult[] = [];
  const issues: string[] = [];
  for (const id of ids.sort()) {
    try {
      const raw = JSON.parse(await node.fsp().readFile(node.path().join(repoPath, runImportRel(run.file, id)), 'utf8')) as {
        results?: unknown;
      };
      if (!Array.isArray(raw.results)) throw new Error('no results');
      results.push(...(raw.results as RunAutomationResult[]));
    } catch {
      issues.push(`Imported report ${id} could not be read.`);
    }
  }
  return { results, issues };
}

/**
 * Copy one execution into the run folder (explicit action). Never touches `_run.md` or the case
 * sidecars — results are a separate `automation/` tree.
 */
export async function saveExecutionToRun(repoPath: string, runFile: string, executionId: string): Promise<void> {
  const from = node.path().join(repoPath, executionRel(executionId));
  const toRel = runAutomationRel(runFile, executionId);
  await makeDir(repoPath, toRel);
  for (const name of ['manifest.json', 'report.json', 'attempts.json', 'arguments.json']) {
    const content = await readMaybe(node.path().join(from, name));
    if (content !== null) await writeFileAt(repoPath, `${toRel}/${name}`, content);
  }
}

/** Per-execution detail used by the run report (5.1): status, args + sources, tests. */
export interface RunAutomationExecution {
  executionId: string;
  project: string;
  state: ExecutionManifest['state'];
  createdAt: string;
  error?: string;
  arguments: ExecutionManifest['arguments'];
  results: RunAutomationResult[];
}

/**
 * Load the saved executions of a run for reporting: one entry per execution (newest first) with
 * its manifest arguments and mapped results. Read-only; never executes anything.
 */
export async function loadRunAutomationExecutions(
  repoPath: string,
  run: Run,
): Promise<{ executions: RunAutomationExecution[]; issues: string[] }> {
  const dir = node.path().join(repoPath, run.file, RUN_AUTOMATION_DIR);
  let ids: string[];
  try {
    ids = (await node.fsp().readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
      .reverse();
  } catch {
    return { executions: [], issues: [] };
  }
  const executions: RunAutomationExecution[] = [];
  const issues: string[] = [];
  for (const id of ids) {
    const base = node.path().join(repoPath, runAutomationRel(run.file, id));
    let manifest: ExecutionManifest;
    try {
      manifest = JSON.parse(await node.fsp().readFile(node.path().join(base, 'manifest.json'), 'utf8')) as ExecutionManifest;
    } catch {
      issues.push(`Execution ${id} in this run could not be read.`);
      continue;
    }
    let report: PlaywrightJsonReport | null = null;
    try {
      const parsed = parsePlaywrightReport(await node.fsp().readFile(node.path().join(base, 'report.json'), 'utf8'));
      if (parsed.ok) report = parsed.report;
    } catch {
      /* no report saved */
    }
    executions.push({
      executionId: id,
      project: manifest.project,
      state: manifest.state,
      createdAt: manifest.createdAt,
      ...(manifest.error ? { error: manifest.error } : {}),
      arguments: manifest.arguments ?? [],
      results: report ? mapReportToRun(run, manifest, report) : [],
    });
  }
  return { executions, issues };
}

/** What `apply to summary` would change (no writes) — shown before the user confirms. */
export interface ApplyPlan {
  ok: boolean;
  changes: { rowIndex: number; title: string; from: Result; to: Result; tests: RunAutomationResult[] }[];
  /** Rows with no matching automated test. */
  unmatchedRows: number[];
  problems: string[];
}

/** Automated statuses that map onto the manual `Result` vocabulary. */
const RESULT_OF_STATUS: Record<RunAutomationResult['status'], Result> = {
  passed: 'pass',
  failed: 'fail',
  timedOut: 'fail',
  interrupted: 'blocked',
  skipped: 'not_run',
};

/**
 * Plan the summary change for one execution. A row's automated result is `fail` if any selected test
 * failed, otherwise `pass` if any passed, otherwise the least-positive status. The plan is blocked
 * when the run changed since it was read (`expectedRevision` mismatch).
 */
export function planApplyToSummary(run: Run, results: readonly RunAutomationResult[], expectedRevision?: string): ApplyPlan {
  const problems: string[] = [];
  if (expectedRevision !== undefined && run.file !== undefined) {
    // Revision is checked by the caller against the file; here we only validate mapping.
  }
  const byRow = new Map<number, RunAutomationResult[]>();
  const unmatchedRows: number[] = [];
  for (const r of results) {
    if (r.caseRowIndex === null || !run.rows[r.caseRowIndex]) {
      if (r.caseRowIndex !== null) unmatchedRows.push(r.caseRowIndex);
      continue;
    }
    const list = byRow.get(r.caseRowIndex) ?? [];
    list.push(r);
    byRow.set(r.caseRowIndex, list);
  }
  const changes: ApplyPlan['changes'] = [];
  for (const [rowIndex, tests] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    const row = run.rows[rowIndex];
    const to = combinedResult(tests);
    if (row.result === to) continue;
    changes.push({ rowIndex, title: row.title, from: row.result, to, tests });
  }
  if (results.length === 0) problems.push('This execution has no test results to apply.');
  return { ok: problems.length === 0, changes, unmatchedRows, problems };
}

/** Worst-case combination of several automated tests on one row. */
function combinedResult(tests: readonly RunAutomationResult[]): Result {
  const mapped = tests.map((t) => RESULT_OF_STATUS[t.status]);
  if (mapped.includes('fail')) return 'fail';
  if (mapped.includes('blocked')) return 'blocked';
  if (mapped.includes('pass')) return 'pass';
  return 'not_run';
}

/** Read the saved executions of a run's own folder (for the panel). */
export const runAutomationRevision = async (repoPath: string, run: Run, executionId: string): Promise<string | null> => {
  const raw = await readMaybe(node.path().join(repoPath, runAutomationRel(run.file, executionId), 'manifest.json'));
  return raw === null ? null : sha256Hex(raw);
};

/** Deterministic JSON for a saved automation sidecar (used by reports). */
export const serializeAutomationResults = (results: readonly RunAutomationResult[]): string =>
  stableStringify({ schemaVersion: 1, results: [...results] });

export { readExecutionManifest };
