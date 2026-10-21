import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { node } from '@/lib/node';
import { AUTOMATION_LIMITS, type ExecutionState } from '@/schemas/automation';
import { classifyTerminal, type TerminalOutcome } from './execution';
import { automationProjectPath } from './project';
import { ProgressTracker, type ProgressSnapshot } from './progress';

// ---------------------------------------------------------------------------
// The Playwright runner (design §Решение по запуску, §Наблюдаемость исполнения).
//
// We spawn the *autotest project's* Playwright CLI with the *external* Node — an argv array with
// `shell: false`, cwd at `.ch/autotests/`, and a prepared environment. The JSON report is
// the sole source of truth for status; stdout (`line` reporter) only feeds display progress. A clean
// exit with no report is `runner_error`, never a success.
// ---------------------------------------------------------------------------

export interface InvocationSpec {
  repoPath: string;
  nodeCommand: string;
  cliPath: string;
  /** Unique per-execution directory; the report and artifacts live here. */
  executionDir: string;
  /** Extra Playwright args (selection, projects, …). */
  args?: readonly string[];
  /** Extra environment (e.g. `TESTORITTO_ARG_*`), merged over `process.env`. */
  env?: Record<string, string>;
  /** Hard timeout for the whole invocation. */
  timeoutMs?: number;
  /** Identity keys the run selected; used to correlate the report. */
  selectionKeys?: readonly string[];
  /** Start/ stall thresholds (overridable in tests). */
  startTimeoutMs?: number;
  stallWarnMs?: number;
}

export interface BuiltInvocation {
  command: string;
  args: string[];
  options: SpawnOptions;
  reportPath: string;
  outputDir: string;
}

/** Build the exact spawn call for an invocation (pure — asserted directly in tests). */
export function buildInvocation(spec: InvocationSpec): BuiltInvocation {
  const path = node.path();
  const reportPath = path.join(spec.executionDir, 'report.json');
  const outputDir = path.join(spec.executionDir, 'artifacts');
  const args = [
    spec.cliPath,
    'test',
    `--output=${outputDir}`,
    '--reporter=line',
    '--reporter=json',
    ...(spec.args ?? []),
  ];
  const options: SpawnOptions = {
    cwd: automationProjectPath(spec.repoPath),
    shell: false,
    windowsHide: true,
    // A process group on POSIX lets us signal the whole tree; on Windows we use taskkill /T.
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      ...spec.env,
      PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  };
  return { command: spec.nodeCommand, args, options, reportPath, outputDir };
}

export type SpawnFn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

export type RunnerEvent =
  | { type: 'state'; state: ExecutionState; detail?: string }
  | { type: 'output'; stream: 'stdout' | 'stderr'; chunk: string }
  | { type: 'warn'; kind: 'start-timeout' | 'stalled'; message: string }
  | { type: 'done'; outcome: TerminalOutcome; progress: ProgressSnapshot };

export interface RunnerDeps {
  spawn?: SpawnFn;
  now?: () => number;
  readReport?: (path: string) => Promise<string | null>;
  killTree?: (child: ChildProcess) => void;
  /** Poll interval for the start/stall/timeout watches. */
  tickMs?: number;
}

export interface RunnerHandle {
  /** Ask Playwright to stop; the process tree is terminated. */
  stop(): void;
  /** Resolves with the terminal outcome once the process has closed and the report was read. */
  done: Promise<TerminalOutcome>;
  progress(): ProgressSnapshot;
}

/** Terminate a process tree the right way on each platform (design §Решение 7). */
export function killProcessTree(child: ChildProcess, platform: NodeJS.Platform = process.platform): void {
  const pid = child.pid;
  if (pid == null) return;
  if (platform === 'win32') {
    try {
      node
        .childProcess()
        .spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { shell: false, windowsHide: true });
    } catch {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
}

const defaultReadReport = async (p: string): Promise<string | null> => {
  try {
    return await node.fsp().readFile(p, 'utf8');
  } catch {
    return null;
  }
};

let runnerSeq = 0;

/**
 * Start one Playwright invocation and drive its lifecycle. Progress is display-only; the terminal
 * outcome is classified from exit code + report (see {@link classifyTerminal}).
 */
export function startRunner(built: BuiltInvocation, spec: InvocationSpec, deps: RunnerDeps, onEvent: (e: RunnerEvent) => void): RunnerHandle {
  void runnerSeq++;
  const now = deps.now ?? Date.now;
  const spawn = deps.spawn ?? ((c, a, o) => node.childProcess().spawn(c, a, o));
  const readReport = deps.readReport ?? defaultReadReport;
  const killTree = deps.killTree ?? ((c) => killProcessTree(c));
  const tickMs = deps.tickMs ?? 250;
  const startTimeoutMs = spec.startTimeoutMs ?? AUTOMATION_LIMITS.startTimeoutMs;
  const stallWarnMs = spec.stallWarnMs ?? AUTOMATION_LIMITS.stallWarnMs;
  const timeoutMs = spec.timeoutMs ?? AUTOMATION_LIMITS.defaultTimeoutMs;

  const tracker = new ProgressTracker(null, now);
  const startedAt = now();
  let lastOutputAt = startedAt;
  let state: ExecutionState = 'starting';
  let cancelled = false;
  let interrupted = false;
  let sawOutput = false;
  let warnedStart = false;
  let warnedStall = false;
  let child: ChildProcess;

  let resolveDone: (o: TerminalOutcome) => void = () => {};
  const done = new Promise<TerminalOutcome>((res) => (resolveDone = res));

  const emit = (e: RunnerEvent): void => onEvent(e);
  const setState = (next: ExecutionState, detail?: string): void => {
    if (next === state) return;
    state = next;
    emit({ type: 'state', state: next, detail });
  };

  // The report and artifacts are written by Playwright during the run, so the execution directory
  // must exist before it starts (Playwright does not create the JSON output directory itself).
  try {
    node.fs().mkdirSync(built.outputDir, { recursive: true });
  } catch {
    /* a spawn/permission error below is the better diagnostic */
  }

  emit({ type: 'state', state: 'starting' });

  try {
    child = spawn(built.command, built.args, built.options);
  } catch (e) {
    // Spawn itself failed synchronously — no process, explicit runner_error.
    setState('starting');
    const outcome: TerminalOutcome = { state: 'runner_error', report: null, error: `Could not start Playwright: ${e instanceof Error ? e.message : String(e)}` };
    setState('finishing');
    setState('runner_error', outcome.error ?? undefined);
    resolveDone(outcome);
    emit({ type: 'done', outcome, progress: tracker.snapshot() });
    return { stop: () => {}, done, progress: () => tracker.snapshot() };
  }

  child.stdout?.on('data', (d: Buffer) => {
    const chunk = d.toString();
    if (!sawOutput) {
      sawOutput = true;
      setState('running');
    }
    lastOutputAt = now();
    tracker.push(chunk);
    emit({ type: 'output', stream: 'stdout', chunk });
  });
  child.stderr?.on('data', (d: Buffer) => {
    const chunk = d.toString();
    lastOutputAt = now();
    tracker.push(chunk);
    emit({ type: 'output', stream: 'stderr', chunk });
  });

  const tick = setInterval(() => {
    const at = now();
    if (!sawOutput && !warnedStart && at - startedAt > startTimeoutMs) {
      warnedStart = true;
      emit({ type: 'warn', kind: 'start-timeout', message: 'Playwright has not started running tests yet — the config may be stuck loading.' });
    }
    if (sawOutput && !warnedStall && at - lastOutputAt > stallWarnMs) {
      warnedStall = true;
      emit({ type: 'warn', kind: 'stalled', message: 'No output for a while — the run may be hung.' });
    }
    if (at - startedAt > timeoutMs && !child.killed) {
      cancelled = true;
      emit({ type: 'warn', kind: 'stalled', message: 'The run timed out and was stopped.' });
      killTree(child);
    }
  }, tickMs);

  child.on('error', () => {
    interrupted = true;
  });

  child.on('close', (code) => {
    clearInterval(tick);
    setState('finishing');
    void (async () => {
      const reportRaw = await readReport(built.reportPath);
      const outcome = classifyTerminal({ exitCode: code, cancelled, interrupted, reportRaw, selectionKeys: spec.selectionKeys });
      setState(outcome.state, outcome.error ?? undefined);
      resolveDone(outcome);
      emit({ type: 'done', outcome, progress: tracker.snapshot() });
    })();
  });

  return {
    stop: () => {
      cancelled = true;
      killTree(child);
    },
    done,
    progress: () => tracker.snapshot(),
  };
}
