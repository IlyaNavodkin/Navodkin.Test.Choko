import { node } from '@/lib/node';
import type {
  ExecutionManifest,
  ExecutionState,
  PlaywrightJsonReport,
  ResolvedAutomationArg,
} from '@/schemas/automation';
import { randomUuid } from '@/utils/ids';
import { readExecutionManifest, writeExecutionManifest, executionRel, stableStringify } from './storage';
import { mergeAttempts, writeAttempts, type AttemptRecord } from './lifecycle';
import { buildInvocation, startRunner, type RunnerEvent, type RunnerHandle, type SpawnFn } from './runner';
import { summarizeResults, walkSpecs } from './report';
import type { ExecutionTestRef } from '@/schemas/automation';

// ---------------------------------------------------------------------------
// Execution orchestration: one invocation from manifest → spawn → terminal state.
//
// The manifest is written *before* the process starts (so a crash leaves a record), the attempts
// are written when the run ends, and the terminal state is persisted even if the app is closing.
// The report stays on disk beside the manifest; results are never copied into the run implicitly.
// ---------------------------------------------------------------------------

export interface ExecutionInput {
  repoPath: string;
  runId: string;
  project: string;
  /** Playwright selection args (see selection.ts), without the CLI path. */
  args: readonly string[];
  env: Record<string, string>;
  selectionKeys: readonly string[];
  tests: ExecutionTestRef[];
  argsSnapshot: readonly ResolvedAutomationArg[];
  node: { command: string; version: string };
  playwright: { version: string; cliPath: string };
  parentExecutionId?: string;
  timeoutMs?: number;
  executionId?: string;
  createdAt?: string;
}

export interface ExecutionDeps {
  spawn?: SpawnFn;
  now?: () => number;
  onEvent?: (e: RunnerEvent) => void;
  /** Resolves when the app is quitting (used to persist the terminal state). */
  isQuitting?: () => boolean;
}

export interface ExecutionHandle {
  manifest: ExecutionManifest;
  stop(): void;
  /** Resolves with the final manifest after the terminal state has been persisted. */
  done: Promise<ExecutionManifest>;
}

/** A fresh, sortable execution id (`<timestamp>-<short uuid>`), safe as a path segment. */
export function newExecutionId(at: Date = new Date()): string {
  const stamp = at.toISOString().replace(/[:.]/g, '-').replace('Z', '');
  return `${stamp}-${randomUuid().slice(0, 8)}`;
}

/** Turn the parsed report into attempts for the selected tests. */
export function attemptsFromReport(report: PlaywrightJsonReport): Record<string, AttemptRecord[]> {
  const out: Record<string, AttemptRecord[]> = {};
  for (const { spec, suite } of walkSpecs(report)) {
    const tags = (spec as { tags?: string[] }).tags ?? [];
    const tag = tags.find((t) => t.startsWith('@tt:') || t.startsWith('tt:'));
    const automationId = tag ? (tag.startsWith('@tt:') ? tag.slice(4) : tag.slice(3)) : null;
    if (!automationId) continue;
    for (const test of (spec.tests ?? []) as { projectName?: string; results?: { status: string; duration?: number; error?: { message?: string } }[] }[]) {
      const project = test.projectName ?? suite.projectName ?? '';
      const key = `${automationId}::${project}`;
      const results = (test.results ?? []).map((r, i) => ({
        attempt: i + 1,
        status: (r.status as AttemptRecord['status']) ?? 'interrupted',
        duration: typeof r.duration === 'number' ? r.duration : 0,
        ...(r.error?.message ? { error: r.error.message } : {}),
      }));
      out[key] = mergeAttempts(out[key], results);
    }
  }
  return out;
}

/** Keys the execution selected, as stored in the manifest (testKey tuples). */
export const manifestKeys = (report: PlaywrightJsonReport): string[] => {
  const keys: string[] = [];
  for (const { spec, suite } of walkSpecs(report)) {
    const tags = (spec as { tags?: string[] }).tags ?? [];
    const tag = tags.find((t) => t.startsWith('@tt:') || t.startsWith('tt:'));
    if (!tag) continue;
    const automationId = tag.startsWith('@tt:') ? tag.slice(4) : tag.slice(3);
    for (const test of (spec.tests ?? []) as { projectName?: string }[]) {
      keys.push(`${automationId}::${test.projectName ?? suite.projectName ?? ''}`);
    }
  }
  return keys;
};
/**
 * Start one invocation. Writes the manifest first, then spawns; the returned `done` resolves only
 * after the terminal state (and attempts) are on disk.
 */
export function startExecution(input: ExecutionInput, deps: ExecutionDeps = {}): ExecutionHandle {
  const executionId = input.executionId ?? newExecutionId();
  const createdAt = input.createdAt ?? new Date().toISOString();
  const executionDir = node.path().join(input.repoPath, executionRel(executionId));

  const manifest: ExecutionManifest = {
    schemaVersion: 1,
    executionId,
    runId: input.runId,
    createdAt,
    state: 'queued',
    node: input.node,
    playwright: input.playwright,
    project: input.project,
    args: [...input.args],
    arguments: [...input.argsSnapshot],
    tests: [...input.tests],
    ...(input.parentExecutionId ? { parentExecutionId: input.parentExecutionId } : {}),
  };

  // Every manifest write goes through one queue: state events fire while the run is in flight, and
  // two concurrent temp-file renames would race on Windows.
  let writeChain: Promise<void> = Promise.resolve();
  const writeManifest = (state: ExecutionState, error?: string | null): Promise<void> => {
    manifest.state = state;
    if (error !== undefined) {
      if (error) manifest.error = error;
      else delete manifest.error;
    }
    writeChain = writeChain
      .catch(() => {})
      .then(() => writeExecutionManifest(input.repoPath, manifest));
    return writeChain;
  };

  const built = buildInvocation({
    repoPath: input.repoPath,
    nodeCommand: input.node.command,
    cliPath: input.playwright.cliPath,
    executionDir,
    args: input.args,
    env: input.env,
    selectionKeys: input.selectionKeys,
    timeoutMs: input.timeoutMs,
  });

  const started = (async () => {
    await writeManifest('starting');
  })();

  let runner: RunnerHandle | null = null;
  let stopRequested = false;

  const done = (async (): Promise<ExecutionManifest> => {
    await started;
    runner = startRunner(built, {
      repoPath: input.repoPath,
      nodeCommand: input.node.command,
      cliPath: input.playwright.cliPath,
      executionDir,
      args: input.args,
      env: input.env,
      selectionKeys: input.selectionKeys,
      timeoutMs: input.timeoutMs,
    }, { spawn: deps.spawn, now: deps.now }, (e) => {
      deps.onEvent?.(e);
      // Intermediate state writes go through the same queue (never a direct rename race).
      if (e.type === 'state' && !['queued', 'starting'].includes(e.state)) {
        void writeManifest(e.state);
      }
    });

    const outcome = await runner.done;
    await writeManifest(outcome.state, outcome.error);
    if (outcome.report) {
      const attempts = attemptsFromReport(outcome.report);
      await writeAttempts(input.repoPath, { executionId, tests: attempts }).catch(() => {});
    }
    return manifest;
  })();

  return {
    manifest,
    stop: () => {
      stopRequested = true;
      runner?.stop();
    },
    done,
  };
}

/** Re-read a persisted execution manifest (used by the run panel after a reload). */
export const readExecution = (repoPath: string, executionId: string): Promise<ExecutionManifest | null> =>
  readExecutionManifest(repoPath, executionId);

/** Persist the arguments snapshot next to the execution for the report section. */
export async function writeArgumentsSnapshot(repoPath: string, executionId: string, args: readonly ResolvedAutomationArg[]): Promise<void> {
  const abs = node.path().join(repoPath, executionRel(executionId), 'arguments.json');
  await node.fsp().mkdir(node.path().dirname(abs), { recursive: true });
  await node.fsp().writeFile(abs, stableStringify({ schemaVersion: 1, arguments: [...args] }));
}

export { summarizeResults };
