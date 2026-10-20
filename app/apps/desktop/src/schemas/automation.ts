import { z } from 'zod';

/**
 * Autotest model (`openspec/changes/add-playwright-automation`): the JSON shapes we read from the
 * official Playwright reporters, the execution lifecycle, and the size/selection guards.
 *
 * The type model lives here; an execution's on-disk manifest and the tolerant report parser are in
 * `services/automation/*`. Everything about a report is read **tolerantly** — an unknown extra
 * field never fails a run, and a missing one degrades to a diagnostic instead of a thrown error.
 */

/**
 * The observable execution lifecycle (spec "Observable execution lifecycle"). Every transition is
 * driven by a signal, never a guess — see `services/automation/execution.ts`.
 */
export type ExecutionState =
  | 'queued'
  | 'starting'
  | 'running'
  | 'finishing'
  | 'completed'
  | 'runner_error'
  | 'cancelled'
  | 'interrupted';

/** States that mean the execution is over and will not change on its own. */
export const TERMINAL_EXECUTION_STATES: readonly ExecutionState[] = [
  'completed',
  'runner_error',
  'cancelled',
  'interrupted',
];

export const isTerminalExecutionState = (s: ExecutionState): boolean => TERMINAL_EXECUTION_STATES.includes(s);

/**
 * Size/time guards (spec "Bounded results and artifacts"). A breach is a diagnostic, never a
 * silent truncation that would misrepresent a result.
 */
export const AUTOMATION_LIMITS = {
  /** Characters of the bounded stdout/stderr tail kept per execution and shown in the UI. */
  maxLogTailChars: 40_000,
  /** JSON report size we are willing to read back. */
  maxReportBytes: 32 * 1024 * 1024,
  /** Tests in one report; beyond this the report is treated as not ours. */
  maxTests: 10_000,
  /** Bytes of one attachment we keep as a sidecar; larger ones are recorded but not copied. */
  maxAttachmentBytes: 5 * 1024 * 1024,
  /** Wait for the first line of output before warning "config may be stuck". */
  startTimeoutMs: 30_000,
  /** No output for this long → "possibly hung" (a warning; the process is not killed). */
  stallWarnMs: 120_000,
  /** Hard default timeout for one invocation. */
  defaultTimeoutMs: 15 * 60_000,
} as const;

/**
 * Playwright report format versions we understand. We read the version the installed CLI reports and
 * refuse (with a clear message) rather than silently mis-parsing an unknown format.
 */
export const PLAYWRIGHT_SUPPORTED = {
  /** Oldest `@playwright/test` we accept (its JSON reporter shape). */
  minMajor: 1,
  minMinor: 30,
} as const;

/** Parse a `1.44.1` / `v1.44.1` / `1.44.0-beta.1` version into its numeric parts (`null` if unusable). */
export function parseSemver(version: string): { major: number; minor: number; patch: number } | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec((version ?? '').trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** Whether the installed Playwright report format is within our supported range. */
export function isSupportedPlaywrightVersion(version: string): boolean {
  const v = parseSemver(version);
  if (!v) return false;
  if (v.major !== PLAYWRIGHT_SUPPORTED.minMajor) return false;
  return v.minor >= PLAYWRIGHT_SUPPORTED.minMinor;
}

/* ---------------------------------------------------------------------------
 * Playwright JSON report (the authoritative status source, design §Решение по запуску).
 * The shapes below mirror `playwright test --reporter=json` loosely: every field we touch is
 * optional, and the parser tolerates unknown extras.
 * ------------------------------------------------------------------------- */

export type PlaywrightTestStatus = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';

export interface PlaywrightTestError {
  message: string;
  stack?: string;
  location?: { file: string; line: number; column: number };
}

export interface PlaywrightAttachment {
  name: string;
  contentType: string;
  path?: string;
  body?: string;
}

export interface PlaywrightTestStep {
  title: string;
  duration?: number;
  error?: PlaywrightTestError;
}

export interface PlaywrightTestResult {
  status: PlaywrightTestStatus;
  duration: number;
  /** 0-based retry index; > 0 means a prior attempt failed. */
  retry?: number;
  startTime?: string;
  error?: PlaywrightTestError;
  errors?: PlaywrightTestError[];
  attachments?: PlaywrightAttachment[];
  steps?: PlaywrightTestStep[];
}

export interface PlaywrightAnnotation {
  type: string;
  description?: string;
}

/** A leaf test ("spec" in Playwright terms) as it appears in a report. */
export interface PlaywrightSpec {
  title: string;
  ok: boolean;
  tags?: string[];
  annotations?: PlaywrightAnnotation[];
  tests: { projectName?: string; results: PlaywrightTestResult[] }[];
  file?: string;
  line?: number;
}

/** A suite node; leaves hang off `specs`, folders off `suites`. */
export interface PlaywrightSuite {
  title: string;
  file?: string;
  projectName?: string;
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

export interface PlaywrightJsonReport {
  config?: {
    rootDir?: string;
    projects?: { name: string; retries?: number; workers?: number }[];
  };
  suites: PlaywrightSuite[];
  stats?: {
    startTime?: string;
    duration?: number;
    expected?: number;
    unexpected?: number;
    flaky?: number;
    skipped?: number;
  };
  errors?: PlaywrightTestError[];
}

/**
 * One test as discovery reports it (`--list --reporter=json`): the identity tuple plus the expected
 * status and its locating facts. `automationId`/`caseId`/`variantId` come from `testoritto.*`
 * annotations; a missing `automationId` marks the test as not runnable-by-key.
 */
export interface DiscoveredTest {
  automationId: string | null;
  caseId: string | null;
  variantId: string | null;
  title: string;
  /** Suite titles leading to the test, then the test title (the `--test-list` path, minus file). */
  titlePath: string[];
  project: string;
  file: string | null;
  line: number | null;
  /** Playwright's expected status for the test (from config/annotations), e.g. `passed`/`skipped`. */
  expectedStatus: PlaywrightTestStatus | null;
  tags: string[];
}

/* ---------------------------------------------------------------------------
 * Typed automation arguments (design §Остальные решения 4, spec "Typed arguments with
 * reference-book values").
 *
 * A test declares its arguments; a value may be a literal or a pointer into a reference-book
 * `arguments` record (`entryId` + `key`). Precedence, lowest to highest:
 *   schema default → autotest → binding → run override.
 * Resolved values are passed as `TESTORITTO_ARG_<KEY>` env vars, so the test also runs unchanged
 * from VS Code with its own defaults.
 * ------------------------------------------------------------------------- */

export type AutomationArgType = 'string' | 'number' | 'boolean' | 'url' | 'enum';

export interface AutomationArgDefinition {
  key: string;
  type: AutomationArgType;
  /** A missing value is an error when required (and there is no default). */
  required?: boolean;
  /** The lowest-precedence value, declared by the test itself. */
  default?: string | number | boolean;
  /** `enum` only. */
  options?: string[];
  /** `number` only. */
  min?: number;
  max?: number;
}

/** A literal value, or a key of a reference-book `arguments` record. */
export type AutomationArgValue =
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'reference'; entryId: string; key: string; revision?: string };

/** Values supplied at one precedence level, keyed by argument name. */
export type AutomationArgLayer = Record<string, AutomationArgValue>;

/** Where a resolved value came from (shown in the preview and saved in the execution manifest). */
export type AutomationArgSource = 'schema-default' | 'autotest' | 'binding' | 'run-override';

export interface ResolvedAutomationArg {
  key: string;
  type: AutomationArgType;
  value: string | number | boolean;
  source: AutomationArgSource;
  /** Set when the value came from the reference book. */
  reference?: {
    entryId: string;
    key: string;
    /** sha256 of the record file at resolution time — pins what automation ran with. */
    revision: string;
    title: string;
  };
}

/** A preview/execution snapshot of the resolved argument set. */
export interface ResolvedArgumentSet {
  ok: boolean;
  values: ResolvedAutomationArg[];
  problems: string[];
  /** Environment to hand the test (`TESTORITTO_ARG_<KEY>` → value). */
  env: Record<string, string>;
}

/**
 * `--test-list` exists since Playwright 1.60 (release notes); older versions use `--project` +
 * an exact `--grep` on the unique `@tt:` tag.
 */
export const TEST_LIST_MIN_MINOR = 60;

/** Whether this Playwright version supports `--test-list`. */
export function supportsTestList(version: string): boolean {
  const v = parseSemver(version);
  if (!v) return false;
  return v.major > 1 || (v.major === 1 && v.minor >= TEST_LIST_MIN_MINOR);
}


/** Why discovery found nothing usable (surfaced verbatim to the user). */
export interface DiscoveryProblem {
  code: 'unsupported-version' | 'no-cli' | 'no-node' | 'runner-error' | 'bad-report' | 'no-tests';
  message: string;
}

export const AutomationAnnotation = {
  caseId: 'testoritto.caseId',
  automationId: 'testoritto.automationId',
  project: 'testoritto.project',
  variantId: 'testoritto.variantId',
} as const;

/** The filterable marker every runnable test must carry (design §Решение 5). */
export const AUTOMATION_TAG_PREFIX = '@tt:';

/** The default variant when a test declares no `testoritto.variantId`. */
export const DEFAULT_VARIANT = 'default';

export const AUTOMATION_SCHEMA_VERSION = 1;

/** One test the execution selected, as recorded in the manifest. */
export interface ExecutionTestRef {
  caseId: string | null;
  automationId: string;
  project: string;
  variantId: string;
  title: string;
  file: string | null;
  line: number | null;
}

/** What the app ran with — written before the process starts, so a crash still leaves a record. */
export interface ExecutionManifest {
  schemaVersion: number;
  executionId: string;
  runId: string;
  createdAt: string;
  /** `completed` once the terminal state is written; `queued`/`running` while in flight. */
  state: ExecutionState;
  node: { command: string; version: string };
  playwright: { version: string; cliPath: string };
  project: string;
  /** The exact argv (minus the CLI path) so a failure is reproducible. */
  args: string[];
  /** Resolved values, their precedence source and the pinned reference revision. */
  arguments: ResolvedAutomationArg[];
  tests: ExecutionTestRef[];
  /** Set when a rerun was started from a previous execution. */
  parentExecutionId?: string;
  /** The terminal diagnostic, when the execution did not complete. */
  error?: string;
}

/** Zod schema for a report file location (correlation happens in the parser, not here). */
export const PlaywrightReportLocationSchema = z.object({
  file: z.string(),
  line: z.number().int().nonnegative(),
  column: z.number().int().nonnegative().default(0),
});
