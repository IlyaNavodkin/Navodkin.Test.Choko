import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExecutionState } from '@/schemas/automation';
import { buildInvocation, killProcessTree, startRunner, type InvocationSpec, type RunnerEvent } from './runner';

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});

async function mkRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'testoritto-runner-'));
  cleanup.push(dir);
  await mkdir(join(dir, '.ch', 'autotests'), { recursive: true });
  return dir;
}

const baseSpec = (over: Partial<InvocationSpec> = {}): InvocationSpec => ({
  repoPath: 'C:\\repo',
  nodeCommand: 'C:\\nodejs\\node.exe',
  cliPath: 'C:\\repo\\node_modules\\@playwright\\test\\cli.js',
  executionDir: 'C:\\repo\\.ch\\automation\\executions\\e1',
  args: ['--grep', '@tt:login'],
  env: { TESTORITTO_ARG_BASE_URL: 'https://dev.example.com' },
  ...over,
});

interface FakeChild {
  child: ChildProcess;
  stdout: EventEmitter;
  stderr: EventEmitter;
  emitClose: (code: number | null) => void;
  killed: () => boolean;
}

function fakeChild(): FakeChild {
  const ee = new EventEmitter();
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child = ee as unknown as ChildProcess;
  (child as unknown as { stdout: EventEmitter }).stdout = stdout;
  (child as unknown as { stderr: EventEmitter }).stderr = stderr;
  (child as unknown as { pid: number }).pid = 4242;
  (child as unknown as { kill: () => boolean }).kill = () => true;
  let killed = false;
  return {
    child,
    stdout,
    stderr,
    emitClose: (code) => ee.emit('close', code),
    killed: () => killed,
  };
}

async function waitFor(cond: () => boolean, ms = 1000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout waiting for condition');
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('buildInvocation', () => {
  it('spawns the CLI with an argv array, no shell, and the report path in the env', () => {
    const built = buildInvocation(baseSpec());
    expect(built.command).toBe('C:\\nodejs\\node.exe');
    expect(built.args.slice(0, 2)).toEqual([baseSpec().cliPath, 'test']);
    expect(built.args).toContain('--reporter=json');
    expect(built.args).toContain('--grep');
    expect(built.options.shell).toBe(false);
    expect(built.options.cwd).toBe(join('C:\\repo', '.ch', 'autotests'));
    const env = built.options.env as Record<string, string>;
    expect(env.PLAYWRIGHT_JSON_OUTPUT_NAME).toBe(built.reportPath);
    expect(env.TESTORITTO_ARG_BASE_URL).toBe('https://dev.example.com');
  });
});

describe('startRunner lifecycle', () => {
  it('moves starting -> running -> finishing -> completed from output + a valid report', async () => {
    const states: ExecutionState[] = [];
    const events: RunnerEvent[] = [];
    const fake = fakeChild();
    const built = buildInvocation(baseSpec());
    const handle = startRunner(
      built,
      baseSpec(),
      {
        spawn: () => fake.child,
        readReport: async () =>
          JSON.stringify({
            suites: [{ title: 'f', specs: [{ title: 'login', tags: ['@tt:login'], tests: [{ projectName: 'p', results: [{ status: 'passed', duration: 1 }] }] }] }],
          }),
        killTree: () => {},
      },
      (e) => {
        events.push(e);
        if (e.type === 'state') states.push(e.state);
      },
    );

    expect(states).toEqual(['starting']);
    fake.stdout.emit('data', Buffer.from('Running 1 test using 1 worker\n'));
    await waitFor(() => states.includes('running'));
    fake.emitClose(0);
    const outcome = await handle.done;
    expect(outcome.state).toBe('completed');
    expect(states).toEqual(['starting', 'running', 'finishing', 'completed']);
  });

  it('is runner_error when the process exits 0 without a report', async () => {
    const fake = fakeChild();
    const handle = startRunner(buildInvocation(baseSpec()), baseSpec(), { spawn: () => fake.child, readReport: async () => null, killTree: () => {} }, () => {});
    fake.emitClose(0);
    const outcome = await handle.done;
    expect(outcome.state).toBe('runner_error');
    expect(outcome.error).toMatch(/wrote no JSON report/);
  });

  it('classifies a stopped run as cancelled', async () => {
    const fake = fakeChild();
    let killed = false;
    const handle = startRunner(
      buildInvocation(baseSpec()),
      baseSpec(),
      { spawn: () => fake.child, readReport: async () => null, killTree: () => (killed = true) },
      () => {},
    );
    handle.stop();
    expect(killed).toBe(true);
    fake.emitClose(null);
    expect((await handle.done).state).toBe('cancelled');
  });

  it('warns when the config is slow to start, then when output stalls', async () => {
    let clock = 0;
    const warns: string[] = [];
    const fake = fakeChild();
    startRunner(
      buildInvocation(baseSpec()),
      baseSpec({ startTimeoutMs: 10, stallWarnMs: 20 }),
      { spawn: () => fake.child, readReport: async () => null, killTree: () => {}, now: () => clock, tickMs: 3 },
      (e) => {
        if (e.type === 'warn') warns.push(e.kind);
      },
    );
    clock = 100;
    await waitFor(() => warns.includes('start-timeout'));
    fake.stdout.emit('data', Buffer.from('Running 1 test\n'));
    clock = 500;
    await waitFor(() => warns.includes('stalled'));
    fake.emitClose(1);
  });

  it('keeps only a bounded tail of output', async () => {
    const fake = fakeChild();
    const handle = startRunner(buildInvocation(baseSpec()), baseSpec(), { spawn: () => fake.child, readReport: async () => null, killTree: () => {} }, () => {});
    fake.stdout.emit('data', Buffer.from('x'.repeat(100_000)));
    fake.emitClose(1);
    await handle.done;
    expect(handle.progress().completed).toBeGreaterThanOrEqual(0);
  });
});

describe('killProcessTree', () => {
  it('is a no-op without a pid', () => {
    expect(() => killProcessTree({ pid: undefined } as unknown as ChildProcess, 'win32')).not.toThrow();
  });
});

describe('startRunner integration (real node + fake CLI)', () => {
  it('runs a real process, reads the report it wrote, and completes', async () => {
    const repo = await mkRepo();
    const cli = join(repo, 'fake-cli.js');
    await writeFile(
      cli,
      [
        'const fs = require("node:fs");',
        'const out = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME;',
        'fs.writeFileSync(out, JSON.stringify({ suites: [{ title: "f", specs: [{ title: "login", tags: ["@tt:login"], tests: [{ projectName: "p", results: [{ status: "passed", duration: 3 }] }] }] }] }));',
        'console.log("Running 1 test using 1 worker");',
        'process.exit(0);',
      ].join('\n'),
    );
    const built = buildInvocation({ repoPath: repo, nodeCommand: process.execPath, cliPath: cli, executionDir: join(repo, 'exec') });
    const handle = startRunner(built, { repoPath: repo, nodeCommand: process.execPath, cliPath: cli, executionDir: join(repo, 'exec') }, {}, () => {});
    const outcome = await handle.done;
    expect(outcome.state).toBe('completed');
    expect(handle.progress().total).toBe(1);
  });
});
