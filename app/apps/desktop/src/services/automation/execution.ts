import {
  AutomationAnnotation,
  isTerminalExecutionState,
  type ExecutionState,
  type PlaywrightAnnotation,
  type PlaywrightJsonReport,
} from '@/schemas/automation';
import { countSpecs, parsePlaywrightReport, testKey, walkSpecs } from './report';

// ---------------------------------------------------------------------------
// Execution lifecycle (spec "Observable execution lifecycle", design "Наблюдаемость исполнения").
//
// Two pure pieces live here so both the runner and the UI share one truth:
//   · the transition table (which state may follow which), and
//   · `classifyTerminal` — the fail-closed decision of what the end of a process *means*, derived
//     from exit code + report validity + correlation with the selection. A clean exit with no
//     valid report is `runner_error`, never a success (design §Решение 2).
// ---------------------------------------------------------------------------

const TRANSITIONS: Record<ExecutionState, readonly ExecutionState[]> = {
  queued: ['starting', 'cancelled', 'interrupted'],
  starting: ['running', 'finishing', 'runner_error', 'cancelled', 'interrupted'],
  running: ['finishing', 'runner_error', 'cancelled', 'interrupted'],
  finishing: ['completed', 'runner_error', 'interrupted'],
  completed: [],
  runner_error: [],
  cancelled: [],
  interrupted: [],
};

/** Whether `to` may follow `from` in the lifecycle. */
export const canTransition = (from: ExecutionState, to: ExecutionState): boolean => TRANSITIONS[from].includes(to);

/**
 * A small guarded cursor over a lifecycle: it refuses an illegal transition so a late signal can
 * not resurrect a finished execution.
 */
export class ExecutionCursor {
  private state: ExecutionState;

  constructor(initial: ExecutionState = 'queued') {
    this.state = initial;
  }

  get current(): ExecutionState {
    return this.state;
  }

  get terminal(): boolean {
    return isTerminalExecutionState(this.state);
  }

  /** Move to `to`; throws when the transition is illegal (a programming error, surfaced loudly). */
  move(to: ExecutionState): ExecutionState {
    if (to === this.state) return this.state;
    if (!canTransition(this.state, to)) {
      throw new Error(`Illegal execution transition ${this.state} -> ${to}`);
    }
    this.state = to;
    return this.state;
  }
}

/** What the end of a Playwright process means (design §Решение 2). */
export interface TerminalInput {
  exitCode: number | null;
  /** The user pressed Stop. */
  cancelled: boolean;
  /** The app/process was torn down (crash, quit) rather than the run finishing. */
  interrupted: boolean;
  /** Raw `report.json` content, or `null` when the file is absent. */
  reportRaw: string | null;
  /** Identity keys the run selected; a report that does not contain them is not ours. */
  selectionKeys?: readonly string[];
}

export interface TerminalOutcome {
  state: ExecutionState;
  report: PlaywrightJsonReport | null;
  error: string | null;
}

/** Identity keys present in a parsed report (same tuple discovery uses). */
export function reportKeys(report: PlaywrightJsonReport): Set<string> {
  const keys = new Set<string>();
  for (const { suite, spec } of walkSpecs(report)) {
    const anns: PlaywrightAnnotation[] = [
      ...readAnnotationList(spec),
      ...asArrayOfTests(spec).flatMap((t) => readAnnotationList(t)),
    ];
    const tags = [
      ...asStringArray((spec as { tags?: unknown }).tags),
      ...asArrayOfTests(spec).flatMap((t) => asStringArray((t as { tags?: unknown }).tags)),
    ];
    for (const test of asArrayOfTests(spec)) {
      const t = test as { projectName?: unknown };
      const project = typeof t.projectName === 'string' ? t.projectName : (suite.projectName ?? '');
      keys.add(
        testKey({
          caseId: annotationValue(anns, AutomationAnnotation.caseId),
          automationId: annotationValue(anns, AutomationAnnotation.automationId) ?? automationIdFromTags(tags),
          project,
          variantId: annotationValue(anns, AutomationAnnotation.variantId),
        }),
      );
    }
  }
  return keys;
}

/**
 * Decide the terminal state. `interrupted` and `cancelled` are explicit and win; otherwise the
 * report must exist, parse, contain the selection and be non-empty — anything else is
 * `runner_error` with a diagnostic. Statuses themselves are read from the report elsewhere.
 */
export function classifyTerminal(input: TerminalInput): TerminalOutcome {
  if (input.interrupted) return { state: 'interrupted', report: null, error: null };
  if (input.cancelled) return { state: 'cancelled', report: null, error: null };

  const raw = input.reportRaw;
  if (raw === null || raw.trim() === '') {
    const why =
      input.exitCode === 0
        ? 'Playwright exited successfully but wrote no JSON report.'
        : `Playwright stopped before writing a report (exit code ${input.exitCode ?? 'unknown'}). The test config may have failed to load.`;
    return { state: 'runner_error', report: null, error: why };
  }

  const parsed = parsePlaywrightReport(raw);
  if (!parsed.ok) return { state: 'runner_error', report: null, error: parsed.error };
  const report = parsed.report;

  if (countSpecs(report) === 0) {
    let detail = '';
    const firstError = report.errors?.find((e) => e?.message);
    if (firstError) detail = ` ${firstError.message}`;
    return { state: 'runner_error', report, error: `The Playwright report contains no tests.${detail}` };
  }

  const selection = input.selectionKeys ?? [];
  if (selection.length) {
    const present = reportKeys(report);
    const missing = selection.filter((k) => !present.has(k));
    if (missing.length) {
      return {
        state: 'runner_error',
        report,
        error: `The Playwright report does not contain ${missing.length} of the selected test${missing.length === 1 ? '' : 's'}; the run did not match the selection.`,
      };
    }
  }

  return { state: 'completed', report, error: null };
}

/* ---- tiny tolerant readers (kept local to avoid a report.ts <-> execution.ts cycle) ---- */

const automationIdFromTags = (tags: readonly string[]): string | null => {
  const tag = tags.find((t) => t.startsWith('@tt:') || t.startsWith('tt:'));
  if (!tag) return null;
  return tag.startsWith('@tt:') ? tag.slice(4) : tag.slice(3);
};

const annotationValue = (anns: readonly PlaywrightAnnotation[], type: string): string | null => {
  const found = anns.find((a) => a.type === type);
  return found && found.description ? found.description : null;
};

const asArrayOfTests = (spec: unknown): unknown[] => {
  const tests = (spec as { tests?: unknown })?.tests;
  return Array.isArray(tests) ? tests : [];
};

function readAnnotationList(src: unknown): PlaywrightAnnotation[] {
  const out: PlaywrightAnnotation[] = [];
  const raw = (src as { annotations?: unknown })?.annotations;
  for (const a of Array.isArray(raw) ? raw : []) {
    if (a && typeof a === 'object' && typeof (a as { type?: unknown }).type === 'string') {
      out.push({ type: (a as { type: string }).type, description: String((a as { description?: unknown }).description ?? '') });
    }
  }
  return out;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
