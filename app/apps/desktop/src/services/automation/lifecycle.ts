import { node } from '@/lib/node';
import type { ExecutionManifest, ExecutionState, PlaywrightTestResult } from '@/schemas/automation';
import { classifyTerminal } from './execution';
import { readExecutionManifest, reconcileStaleExecutions, stableStringify, writeExecutionManifest, executionRel } from './storage';

// ---------------------------------------------------------------------------
// Process lifecycle across the app (design §Решение 7, spec "Run from a test run and save results"
// + "Cancel and crash are distinct").
//
// A run is tracked from spawn to terminal state so that:
//   · Stop and timeout terminate the process tree on Windows and macOS (runner.killProcessTree);
//   · quitting the app / closing the repository waits for the terminal state to be written;
//   · a crash leaves attempts on disk and the next open turns a stale `running` into `interrupted`
//     (never a phantom spinner), preserving every earlier attempt.
// ---------------------------------------------------------------------------

/** One attempt of a test, as persisted next to the execution. */
export interface AttemptRecord {
  /** 1-based attempt number. */
  attempt: number;
  status: PlaywrightTestResult['status'];
  duration: number;
  /** Error message of the attempt, if any. */
  error?: string;
}

/** Attempts of one test, keyed by the identity tuple. */
export interface ExecutionAttempts {
  executionId: string;
  tests: Record<string, AttemptRecord[]>;
}

const attemptsRel = (executionId: string): string => `${executionRel(executionId)}/attempts.json`;

let attemptsSeq = 0;

/** Persist (or update) the attempts of an execution without touching earlier attempts. */
export async function writeAttempts(repoPath: string, attempts: ExecutionAttempts): Promise<void> {
  const abs = node.path().join(repoPath, attemptsRel(attempts.executionId));
  await node.fsp().mkdir(node.path().dirname(abs), { recursive: true });
  const temp = `${abs}.${process.pid}.${attemptsSeq++}.tmp`;
  await node.fsp().writeFile(temp, stableStringify(attempts));
  await node.fsp().rename(temp, abs);
}

/** Read the attempts of an execution; `null` when none were written. */
export async function readAttempts(repoPath: string, executionId: string): Promise<ExecutionAttempts | null> {
  try {
    const raw = await node.fsp().readFile(node.path().join(repoPath, attemptsRel(executionId)), 'utf8');
    const parsed = JSON.parse(raw) as ExecutionAttempts;
    return parsed && typeof parsed === 'object' && parsed.tests ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Merge this run's attempts into whatever was already recorded: an interrupted execution keeps its
 * earlier attempts, and a rerun adds to them instead of replacing them (spec "Stop or timeout").
 */
export function mergeAttempts(previous: AttemptRecord[] | undefined, next: readonly AttemptRecord[]): AttemptRecord[] {
  const byAttempt = new Map<number, AttemptRecord>();
  for (const a of previous ?? []) byAttempt.set(a.attempt, a);
  for (const a of next) byAttempt.set(a.attempt, a);
  return [...byAttempt.values()].sort((x, y) => x.attempt - y.attempt);
}

/** A running process the app must be able to stop and wait for. */
export interface ActiveRun {
  executionId: string;
  /** Terminates the process tree. */
  stop(): void;
  /** Resolves when the terminal state has been persisted. */
  settled: Promise<void>;
}

/** Tracks every in-flight execution so a quit can stop and await all of them. */
export class ActiveRunRegistry {
  private readonly runs = new Map<string, ActiveRun>();
  private quitting = false;

  register(run: ActiveRun): void {
    this.runs.set(run.executionId, run);
    void run.settled.finally(() => this.runs.delete(run.executionId));
  }

  get size(): number {
    return this.runs.size;
  }

  /** Stop every run and wait for the terminal state to be written (bounded). */
  async stopAll(timeoutMs = 10_000): Promise<void> {
    this.quitting = true;
    const all = [...this.runs.values()];
    for (const r of all) {
      try {
        r.stop();
      } catch {
        /* best effort */
      }
    }
    await Promise.race([
      Promise.allSettled(all.map((r) => r.settled)).then(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  get isQuitting(): boolean {
    return this.quitting;
  }
}

/** App-wide registry (one per renderer). */
export const activeRuns = new ActiveRunRegistry();

/**
 * What to do with an execution the app finds on disk after a restart: a non-terminal state means the
 * app (or the process) died, so it becomes `interrupted` — attempts stay as recorded.
 */
export async function reconcileOnOpen(repoPath: string): Promise<ExecutionManifest[]> {
  return reconcileStaleExecutions(repoPath);
}

/**
 * Finalize an execution from a report that already exists on disk (used after a crash where the
 * report was written but the manifest never got its terminal state).
 */
export async function finalizeFromDisk(repoPath: string, executionId: string): Promise<ExecutionManifest | null> {
  const manifest = await readExecutionManifest(repoPath, executionId);
  if (!manifest) return null;
  if (!['queued', 'starting', 'running', 'finishing'].includes(manifest.state)) return manifest;
  const reportPath = node.path().join(repoPath, executionRel(executionId), 'report.json');
  let raw: string | null = null;
  try {
    raw = await node.fsp().readFile(reportPath, 'utf8');
  } catch {
    raw = null;
  }
  const outcome = classifyTerminal({ exitCode: 0, cancelled: false, interrupted: false, reportRaw: raw });
  const next: ExecutionManifest = {
    ...manifest,
    state: outcome.state as ExecutionState,
    error: outcome.error ?? manifest.error,
  };
  await writeExecutionManifest(repoPath, next);
  return next;
}
