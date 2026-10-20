import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExecutionManifest } from '@/schemas/automation';
import {
  ActiveRunRegistry,
  finalizeFromDisk,
  mergeAttempts,
  readAttempts,
  reconcileOnOpen,
  writeAttempts,
} from './lifecycle';
import { executionRel, writeExecutionManifest } from './storage';

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});

async function mkRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'testoritto-lifecycle-'));
  cleanup.push(dir);
  return dir;
}

const manifest = (over: Partial<ExecutionManifest> = {}): ExecutionManifest => ({
  schemaVersion: 1,
  executionId: 'exec-1',
  runId: 'run-1',
  createdAt: '2026-10-19T10:00:00.000Z',
  state: 'running',
  node: { command: 'node', version: 'v22.23.1' },
  playwright: { version: '1.60.0', cliPath: 'cli.js' },
  project: 'chromium',
  args: [],
  arguments: [],
  tests: [],
  ...over,
});

describe('ActiveRunRegistry', () => {
  it('stops every run and waits for each to settle', async () => {
    const reg = new ActiveRunRegistry();
    const stopped: string[] = [];
    let settleA: () => void = () => {};
    let settleB: () => void = () => {};
    reg.register({ executionId: 'a', stop: () => stopped.push('a'), settled: new Promise<void>((r) => (settleA = r)) });
    reg.register({ executionId: 'b', stop: () => stopped.push('b'), settled: new Promise<void>((r) => (settleB = r)) });
    expect(reg.size).toBe(2);

    const stopping = reg.stopAll(1000);
    expect(stopped.sort()).toEqual(['a', 'b']);
    expect(reg.isQuitting).toBe(true);
    settleA();
    settleB();
    await stopping;
    await new Promise((r) => setTimeout(r, 0));
    expect(reg.size).toBe(0);
  });

  it('does not hang a quit when a run ignores the stop (bounded wait)', async () => {
    const reg = new ActiveRunRegistry();
    reg.register({ executionId: 'stuck', stop: () => {}, settled: new Promise<void>(() => {}) });
    const started = Date.now();
    await reg.stopAll(50);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('attempts persistence', () => {
  it('writes and reads attempts without losing earlier ones', async () => {
    const repo = await mkRepo();
    await writeAttempts(repo, { executionId: 'exec-1', tests: { 'RND-1::login::p::default': [{ attempt: 1, status: 'failed', duration: 5 }] } });
    const read = await readAttempts(repo, 'exec-1');
    expect(read?.tests['RND-1::login::p::default']).toHaveLength(1);
    expect(await readAttempts(repo, 'missing')).toBeNull();
  });

  it('merges a rerun into the earlier attempts instead of replacing them', () => {
    const merged = mergeAttempts(
      [{ attempt: 1, status: 'failed', duration: 5 }],
      [
        { attempt: 1, status: 'failed', duration: 6 },
        { attempt: 2, status: 'passed', duration: 7 },
      ],
    );
    expect(merged.map((a) => [a.attempt, a.status, a.duration])).toEqual([
      [1, 'failed', 6],
      [2, 'passed', 7],
    ]);
  });
});

describe('reconcileOnOpen / finalizeFromDisk', () => {
  it('turns a stale running execution into interrupted on open', async () => {
    const repo = await mkRepo();
    await writeExecutionManifest(repo, manifest());
    const fixed = await reconcileOnOpen(repo);
    expect(fixed.map((m) => m.state)).toEqual(['interrupted']);
  });

  it('finalizes an interrupted-looking execution from a report that was written before the crash', async () => {
    const repo = await mkRepo();
    await writeExecutionManifest(repo, manifest({ state: 'running' }));
    const dir = join(repo, executionRel('exec-1'));
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'report.json'),
      JSON.stringify({ suites: [{ title: 'f', specs: [{ title: 'x', tags: ['@tt:x'], tests: [{ projectName: 'p', results: [{ status: 'passed', duration: 1 }] }] }] }] }),
    );
    const done = await finalizeFromDisk(repo, 'exec-1');
    expect(done?.state).toBe('completed');
  });

  it('marks an execution without a report as runner_error when finalizing', async () => {
    const repo = await mkRepo();
    await writeExecutionManifest(repo, manifest({ state: 'running' }));
    const done = await finalizeFromDisk(repo, 'exec-1');
    expect(done?.state).toBe('runner_error');
  });

  it('leaves a terminal execution alone', async () => {
    const repo = await mkRepo();
    await writeExecutionManifest(repo, manifest({ state: 'cancelled' }));
    expect((await finalizeFromDisk(repo, 'exec-1'))?.state).toBe('cancelled');
  });
});
