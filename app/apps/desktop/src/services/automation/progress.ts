import { AUTOMATION_LIMITS } from '@/schemas/automation';

// ---------------------------------------------------------------------------
// Display-only progress and the bounded log tail (design §Решение 4, spec "Observable execution
// lifecycle"). Progress is parsed from the official `line` reporter's stdout — it never decides a
// status. The authoritative result always comes from `report.json` (see execution.ts).
// ---------------------------------------------------------------------------

/** A bounded, in-memory tail of a stream. Older bytes are dropped and `truncated` is set. */
export class LogTail {
  private buf = '';
  private dropped = false;

  constructor(private readonly max: number = AUTOMATION_LIMITS.maxLogTailChars) {}

  push(chunk: string): void {
    this.buf += chunk;
    if (this.buf.length > this.max) {
      this.buf = this.buf.slice(this.buf.length - this.max);
      this.dropped = true;
    }
  }

  get text(): string {
    return this.buf;
  }

  get truncated(): boolean {
    return this.dropped;
  }
}

export interface ProgressSnapshot {
  /** Total tests Playwright announced for this invocation, or `null` until it says. */
  total: number | null;
  /** Completed tests counted from `line` output (display only). */
  completed: number;
  passed: number;
  failed: number;
  /** The most recent non-empty output line, trimmed. */
  currentLine: string | null;
  startedAt: number;
  lastOutputAt: number;
  /** True when nothing has been printed for longer than {@link AUTOMATION_LIMITS.stallWarnMs}. */
  stalled: boolean;
}

/** The status markers the `line` reporter uses for a finished test (✓/×/» etc.). */
const DONE_MARKERS = /^\s*[✓✔×✘✗»›∘-]\s+\d+/;
const RUNNING_RE = /Running\s+(\d+)\s+test/i;
const SUMMARY_RE = /(\d+)\s+(passed|failed|flaky|skipped|did not run|interrupted)/i;

/**
 * Accumulates display progress from raw stdout chunks. Output can use `\r` to rewrite a line, so
 * chunks are split on `\n`, `\r\n` and `\r`.
 */
export class ProgressTracker {
  private tail = new LogTail();
  private total: number | null;
  private completed = 0;
  private passed = 0;
  private failed = 0;
  private currentLine: string | null = null;
  private lastOutputAt: number;
  private readonly startedAt: number;

  constructor(
    total: number | null = null,
    private readonly now: () => number = Date.now,
  ) {
    this.total = total;
    this.startedAt = now();
    this.lastOutputAt = this.startedAt;
  }

  /** Feed a stdout/stderr chunk; returns the newly complete lines. */
  push(chunk: string): string[] {
    const at = this.now();
    this.lastOutputAt = at;
    this.tail.push(chunk);
    const lines = chunk.split(/\r\n|\n|\r/).filter((l) => l.trim() !== '');
    for (const line of lines) this.consume(line);
    return lines;
  }

  private consume(line: string): void {
    this.currentLine = line.trim();
    const running = RUNNING_RE.exec(line);
    if (running) {
      this.total = Number(running[1]);
      return;
    }
    if (DONE_MARKERS.test(line)) {
      this.completed += 1;
      if (/[✓✔]/.test(line)) this.passed += 1;
      else if (/[×✘✗]/.test(line)) this.failed += 1;
      return;
    }
    const summary = SUMMARY_RE.exec(line);
    if (summary) {
      const n = Number(summary[1]);
      const kind = summary[2].toLowerCase();
      if (kind === 'passed') this.passed = Math.max(this.passed, n);
      else if (kind === 'failed' || kind === 'interrupted') this.failed = Math.max(this.failed, n);
    }
  }

  get logTail(): LogTail {
    return this.tail;
  }

  snapshot(): ProgressSnapshot {
    const at = this.now();
    return {
      total: this.total,
      completed: this.completed,
      passed: this.passed,
      failed: this.failed,
      currentLine: this.currentLine,
      startedAt: this.startedAt,
      lastOutputAt: this.lastOutputAt,
      stalled: at - this.lastOutputAt > AUTOMATION_LIMITS.stallWarnMs,
    };
  }
}
