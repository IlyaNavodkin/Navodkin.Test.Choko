import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExecutionManifest } from '@/schemas/automation';
import {
  executionRel,
  listExecutionIds,
  listExecutions,
  readExecutionManifest,
  reconcileStaleExecutions,
  stableStringify,
  writeExecutionManifest,
} from './storage';

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});

async function mkRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'testoritto-exec-'));
  cleanup.push(dir);
  return dir;
}

const manifest = (over: Partial<ExecutionManifest> = {}): ExecutionManifest => ({
  schemaVersion: 1,
  executionId: '2026-10-19T10-00-00-abc',
  runId: '2026-10-19-smoke',
  createdAt: '2026-10-19T10:00:00.000Z',
  state: 'running',
  node: { command: 'node', version: 'v22.23.1' },
  playwright: { version: '1.60.0', cliPath: 'cli.js' },
  project: 'chromium',
  args: ['--project', 'chromium', '--test-list', 'list.txt'],
  arguments: [],
  tests: [],
  ...over,
});

describe('stableStringify', () => {
  it('sorts keys deterministically and drops undefined', () => {
    expect(stableStringify({ b: 1, a: undefined, c: { z: 1, y: 2 } })).toBe('{\n  "b": 1,\n  "c": {\n    "y": 2,\n    "z": 1\n  }\n}\n');
  });
});

describe('execution storage', () => {
  it('writes a manifest before a run and reads it back', async () => {
    const repo = await mkRepo();
    await writeExecutionManifest(repo, manifest());
    const read = await readExecutionManifest(repo, manifest().executionId);
    expect(read).toMatchObject({ executionId: manifest().executionId, state: 'running', project: 'chromium' });
    const raw = await readFile(join(repo, executionRel(manifest().executionId), 'manifest.json'), 'utf8');
    expect(raw.startsWith('{\n  "args"')).toBe(true); // deterministic key order
  });

  it('refuses an id that could escape the executions folder', async () => {
    const repo = await mkRepo();
    await expect(writeExecutionManifest(repo, manifest({ executionId: '../evil' }))).rejects.toThrow(/usable execution id/);
  });

  it('tolerates a missing or broken manifest', async () => {
    const repo = await mkRepo();
    expect(await readExecutionManifest(repo, 'nope')).toBeNull();
    await mkdir(join(repo, executionRel('broken')), { recursive: true });
    await writeFile(join(repo, executionRel('broken'), 'manifest.json'), '{ not json');
    expect(await readExecutionManifest(repo, 'broken')).toBeNull();
    expect(await listExecutions(repo)).toEqual([]);
  });

  it('lists executions newest first', async () => {
    const repo = await mkRepo();
    await writeExecutionManifest(repo, manifest({ executionId: '2026-10-18-old' }));
    await writeExecutionManifest(repo, manifest({ executionId: '2026-10-19-new' }));
    expect(await listExecutionIds(repo)).toEqual(['2026-10-19-new', '2026-10-18-old']);
    expect((await listExecutions(repo)).map((m) => m.executionId)).toEqual(['2026-10-19-new', '2026-10-18-old']);
  });

  it('marks executions left running by a crash as interrupted', async () => {
    const repo = await mkRepo();
    await writeExecutionManifest(repo, manifest({ executionId: 'a-crashed', state: 'running' }));
    await writeExecutionManifest(repo, manifest({ executionId: 'b-done', state: 'completed' }));
    const fixed = await reconcileStaleExecutions(repo);
    expect(fixed.map((m) => m.executionId)).toEqual(['a-crashed']);
    expect((await readExecutionManifest(repo, 'a-crashed'))?.state).toBe('interrupted');
    expect((await readExecutionManifest(repo, 'b-done'))?.state).toBe('completed');
  });
});
