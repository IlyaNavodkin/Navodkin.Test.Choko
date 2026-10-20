import { mkdtemp, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExecutionManifest, PlaywrightJsonReport } from '@/schemas/automation';
import type { Run, RunRow } from '@/types';
import { loadRunAutomation, mapReportToRun, planApplyToSummary, saveExecutionToRun, saveImportToRun, summarizeExecutions, loadImportedResults } from './run-results';
import { writeExecutionManifest } from './storage';
import { executionRel } from './storage';

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});

async function mkRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'testoritto-run-results-'));
  cleanup.push(dir);
  return dir;
}

const row = (over: Partial<RunRow> = {}): RunRow => ({
  case_id: 'RND-0001',
  display_id: 'RND-0001',
  title: 'login works',
  result: 'not_run',
  tester: '',
  executed_at: '',
  notes: '',
  checks: {},
  failNotes: {},
  file: '.casewright/runs/r/001-RND-0001.md',
  ...over,
});

const run = (over: Partial<Run> = {}): Run => ({
  id: 'r',
  name: 'Run',
  file: '.casewright/runs/r',
  created: '2026-10-19',
  status: 'open',
  scope: 'custom',
  rows: [row(), row({ case_id: 'RND-0002', display_id: 'RND-0002', title: 'logout works' })],
  summary: '',
  notes: '',
  testerApproval: null,
  reviewerApproval: null,
  ...over,
});

const manifest = (over: Partial<ExecutionManifest> = {}): ExecutionManifest => ({
  schemaVersion: 1,
  executionId: 'e1',
  runId: 'r',
  createdAt: '2026-10-19T10:00:00.000Z',
  state: 'completed',
  node: { command: 'node', version: 'v22' },
  playwright: { version: '1.60.0', cliPath: 'cli.js' },
  project: 'chromium',
  args: [],
  arguments: [],
  tests: [{ caseId: 'RND-0001', automationId: 'login', project: 'chromium', variantId: 'default', title: 'login works', file: 'tests/login.spec.ts', line: 3 }],
  ...over,
});

const report = (results: { status: string; duration?: number }[], project = 'chromium'): PlaywrightJsonReport =>
  ({
    suites: [
      {
        title: 'login.spec.ts',
        file: 'tests/login.spec.ts',
        specs: [{ title: 'login works', ok: true, tags: ['@tt:login'], tests: [{ projectName: project, results }] }],
      },
    ],
  }) as unknown as PlaywrightJsonReport;

describe('mapReportToRun', () => {
  it('maps by caseId to the run row', () => {
    const mapped = mapReportToRun(run(), manifest(), report([{ status: 'passed', duration: 4 }]));
    expect(mapped).toHaveLength(1);
    expect(mapped[0]).toMatchObject({ automationId: 'login', caseRowIndex: 0, status: 'passed', attempts: 1, duration: 4 });
  });

  it('marks a retry-then-pass as flaky with both attempts', () => {
    const mapped = mapReportToRun(run(), manifest(), report([{ status: 'failed' }, { status: 'passed' }]));
    expect(mapped[0]).toMatchObject({ flaky: true, attempts: 2, status: 'passed' });
  });

  it('falls back to file/title when the annotation caseId has no row', () => {
    const mapped = mapReportToRun(run(), manifest({ tests: [] }), report([{ status: 'failed' }]));
    expect(mapped[0].caseRowIndex).toBe(0);
    expect(mapped[0].caseId).toBeNull();
  });
});

describe('planApplyToSummary', () => {
  it('proposes the combined result per row without touching manual notes', () => {
    const results = mapReportToRun(run(), manifest(), report([{ status: 'passed' }]));
    const plan = planApplyToSummary(run(), results);
    expect(plan.ok).toBe(true);
    expect(plan.changes).toEqual([{ rowIndex: 0, title: 'login works', from: 'not_run', to: 'pass', tests: results }]);
    expect(plan.changes[0].tests[0].status).toBe('passed');
  });

  it('is a no-op when the row already has the result', () => {
    const results = mapReportToRun(run(), manifest(), report([{ status: 'passed' }]));
    const plan = planApplyToSummary(run({ rows: [row({ result: 'pass' })] }), results);
    expect(plan.changes).toEqual([]);
  });

  it('takes the worst status across several tests on one row', () => {
    const passed = mapReportToRun(run(), manifest(), report([{ status: 'passed' }]))[0];
    const failed = mapReportToRun(run(), manifest(), report([{ status: 'failed' }]))[0];
    const plan = planApplyToSummary(run(), [passed, failed]);
    expect(plan.changes[0].to).toBe('fail');
  });

  it('reports an execution with no results', () => {
    const plan = planApplyToSummary(run(), []);
    expect(plan.ok).toBe(false);
    expect(plan.problems[0]).toMatch(/no test results/);
  });
});

describe('saveExecutionToRun / loadRunAutomation', () => {
  it('copies an execution into the run and reads it back', async () => {
    const repo = await mkRepo();
    const r = run();
    const execDir = join(repo, executionRel('e1'));
    await mkdir(execDir, { recursive: true });
    await writeExecutionManifest(repo, manifest());
    await writeFile(join(execDir, 'report.json'), JSON.stringify(report([{ status: 'passed' }])));

    await saveExecutionToRun(repo, r.file, 'e1');
    const saved = await readdir(join(repo, r.file, 'automation', 'e1'));
    expect(saved.sort()).toEqual(['manifest.json', 'report.json']);

    const loaded = await loadRunAutomation(repo, r);
    expect(loaded.issues).toEqual([]);
    expect(loaded.results).toHaveLength(1);
    expect(loaded.results[0].status).toBe('passed');
  });

  it('returns empty for a run without automation results', async () => {
    const repo = await mkRepo();
    expect(await loadRunAutomation(repo, run())).toEqual({ results: [], issues: [] });
  });
});

describe('summarizeExecutions', () => {
  it('counts only terminal invocations and names failures/cancellations', () => {
    expect(summarizeExecutions([{ state: 'running' }])).toBe('Autotests finished');
    expect(summarizeExecutions([{ state: 'completed' }, { state: 'completed' }])).toBe('2 autotest runs completed');
    expect(summarizeExecutions([{ state: 'completed' }, { state: 'runner_error' }])).toBe('1 of 2 autotest runs failed to complete; 1 completed');
    expect(summarizeExecutions([{ state: 'cancelled' }])).toBe('1 autotest run was cancelled');
  });
});

describe('imported results in a run', () => {
  const imported: Parameters<typeof saveImportToRun>[4] = [
    {
      executionId: 'import:abc',
      automationId: 'login',
      project: '',
      caseId: 'RND-0001',
      caseRowIndex: 0,
      status: 'passed',
      flaky: false,
      attempts: 1,
      duration: 1500,
    },
  ];

  it('saves an import keyed by payload id and reads it back', async () => {
    const repo = await mkRepo();
    await saveImportToRun(repo, run(), 'abc', 'junit', imported);
    expect(await loadImportedResults(repo, run())).toMatchObject({ results: [{ automationId: 'login', status: 'passed' }], issues: [] });
    expect((await loadRunAutomation(repo, run())).results).toHaveLength(1);
  });

  it('is idempotent: importing the same payload twice does not duplicate results', async () => {
    const repo = await mkRepo();
    await saveImportToRun(repo, run(), 'abc', 'junit', imported);
    await saveImportToRun(repo, run(), 'abc', 'junit', imported);
    expect((await loadRunAutomation(repo, run())).results).toHaveLength(1);
  });

  it('reports a broken import sidecar without failing the run', async () => {
    const repo = await mkRepo();
    const { mkdir, writeFile } = await import('node:fs/promises');
    const dir = join(repo, run().file, 'automation', 'imports', 'broken');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'results.json'), '{ nope');
    const load = await loadImportedResults(repo, run());
    expect(load.results).toEqual([]);
    expect(load.issues[0]).toMatch(/could not be read/);
  });
});
