import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { attemptsFromReport, newExecutionId, startExecution, type ExecutionInput } from './execute';
import { readExecutionManifest } from './storage';
import { readAttempts } from './lifecycle';
import type { PlaywrightJsonReport } from '@/schemas/automation';

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});

async function mkRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'testoritto-execute-'));
  cleanup.push(dir);
  await mkdir(join(dir, '.ch', 'autotests'), { recursive: true });
  return dir;
}

/** A real child process that writes the given report and exits. */
async function fakeCli(repo: string, report: unknown, exitCode = 0): Promise<string> {
  const cli = join(repo, 'cli.js');
  await writeFile(
    cli,
    [
      'const fs = require("node:fs");',
      `fs.writeFileSync(process.env.PLAYWRIGHT_JSON_OUTPUT_NAME, ${JSON.stringify(JSON.stringify(report))});`,
      `console.log("Running 1 test using 1 worker");`,
      `process.exit(${exitCode});`,
    ].join('\n'),
  );
  return cli;
}

const report = (): PlaywrightJsonReport =>
  ({
    suites: [
      {
        title: 'login.spec.ts',
        file: 'tests/login.spec.ts',
        specs: [
          {
            title: 'login works',
            ok: true,
            tags: ['@tt:login'],
            tests: [{ projectName: 'chromium', results: [{ status: 'failed', duration: 3 }, { status: 'passed', duration: 4 }] }],
          },
        ],
      },
    ],
  }) as unknown as PlaywrightJsonReport;

const input = (repo: string, cli: string, over: Partial<ExecutionInput> = {}): ExecutionInput => ({
  repoPath: repo,
  runId: 'run-1',
  project: 'chromium',
  args: [],
  env: {},
  selectionKeys: [],
  tests: [{ caseId: 'RND-0001', automationId: 'login', project: 'chromium', variantId: 'default', title: 'login works', file: 'tests/login.spec.ts', line: 3 }],
  argsSnapshot: [],
  node: { command: process.execPath, version: 'v22.23.1' },
  playwright: { version: '1.60.0', cliPath: cli },
  ...over,
});

describe('newExecutionId', () => {
  it('is sortable and safe as a path segment', () => {
    const id = newExecutionId(new Date('2026-10-19T10:00:00.000Z'));
    expect(id).toMatch(/^2026-10-19T10-00-00-000-[0-9a-f-]{8}$/);
    expect(id).not.toMatch(/[\\/:]/);
  });
});

describe('attemptsFromReport', () => {
  it('records every attempt per automationId + project', () => {
    const attempts = attemptsFromReport(report());
    expect(attempts['login::chromium']).toEqual([
      { attempt: 1, status: 'failed', duration: 3 },
      { attempt: 2, status: 'passed', duration: 4 },
    ]);
  });
});

describe('startExecution', () => {
  it('writes the manifest before starting and finishes completed with attempts', async () => {
    const repo = await mkRepo();
    const cli = await fakeCli(repo, report());
    const seen: string[] = [];
    const handle = startExecution(input(repo, cli), { onEvent: (e) => e.type === 'state' && seen.push(e.state) });
    const done = await handle.done;
    expect(done.state).toBe('completed');
    const persisted = await readExecutionManifest(repo, handle.manifest.executionId);
    expect(persisted?.state).toBe('completed');
    expect(persisted?.tests[0].automationId).toBe('login');
    expect((await readAttempts(repo, handle.manifest.executionId))?.tests['login::chromium']).toHaveLength(2);
    expect(seen).toContain('running');
  });

  it('records a runner_error when no report is written', async () => {
    const repo = await mkRepo();
    const cli = join(repo, 'cli.js');
    await writeFile(cli, 'process.exit(0);');
    const done = await startExecution(input(repo, cli)).done;
    expect(done.state).toBe('runner_error');
    expect((await readExecutionManifest(repo, done.executionId))?.error).toMatch(/no JSON report/);
  });

  it('records a stopped run as cancelled', async () => {
    const repo = await mkRepo();
    const cli = join(repo, 'cli.js');
    await writeFile(cli, 'setTimeout(() => process.exit(0), 30000);');
    const handle = startExecution(input(repo, cli));
    await new Promise((r) => setTimeout(r, 400));
    handle.stop();
    const done = await handle.done;
    expect(done.state).toBe('cancelled');
  });

  it('keeps the parent execution id for a rerun', async () => {
    const repo = await mkRepo();
    const cli = await fakeCli(repo, report());
    const done = await startExecution(input(repo, cli, { parentExecutionId: 'prev' })).done;
    expect(done.parentExecutionId).toBe('prev');
  });

  it('writes a deterministic manifest', async () => {
    const repo = await mkRepo();
    const cli = await fakeCli(repo, report());
    const handle = startExecution(input(repo, cli, { executionId: 'fixed-id' }));
    await handle.done;
    const raw = await readFile(join(repo, '.ch', 'automation', 'executions', 'fixed-id', 'manifest.json'), 'utf8');
    expect(raw.startsWith('{\n  "args"')).toBe(true);
  });
});
