import {
  AUTOMATION_TAG_PREFIX,
  AUTOMATION_LIMITS,
  AutomationAnnotation,
  DEFAULT_VARIANT,
  type DiscoveredTest,
  type PlaywrightAnnotation,
  type PlaywrightJsonReport,
  type PlaywrightSpec,
  type PlaywrightSuite,
  type PlaywrightTestResult,
  type PlaywrightTestStatus,
} from '@/schemas/automation';

// ---------------------------------------------------------------------------
// Tolerant Playwright JSON reader (design §Решение 2, §Решение 3).
//
// The official report is the single source of truth for status, attempts and attachments. We read
// it defensively: unknown fields are ignored, a missing field degrades to a diagnostic, and a
// structurally broken report is reported as such — never thrown. The parser also derives the
// catalog (one entry per spec × project) and the diagnostics discovery needs.
// ---------------------------------------------------------------------------

export type ReportParse =
  | { ok: true; report: PlaywrightJsonReport }
  | { ok: false; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');
const asNumber = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

const STATUSES = new Set<PlaywrightTestStatus>(['passed', 'failed', 'timedOut', 'skipped', 'interrupted']);
const asStatus = (v: unknown): PlaywrightTestStatus | null => (STATUSES.has(v as PlaywrightTestStatus) ? (v as PlaywrightTestStatus) : null);

/** Parse raw JSON report text into our tolerant shape. Never throws. */
export function parsePlaywrightReport(raw: string): ReportParse {
  if (raw.length > AUTOMATION_LIMITS.maxReportBytes) {
    return { ok: false, error: `The Playwright report is larger than ${Math.round(AUTOMATION_LIMITS.maxReportBytes / 1024 / 1024)} MB and was not read.` };
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `The Playwright report is not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!isRecord(data)) return { ok: false, error: 'The Playwright report is not a JSON object.' };
  const suites = asArray(data.suites);
  if (!Array.isArray(data.suites)) {
    return { ok: false, error: 'The Playwright report has no "suites" array.' };
  }
  const report = data as unknown as PlaywrightJsonReport;
  report.suites = suites as PlaywrightSuite[];
  if (countSpecs(report) > AUTOMATION_LIMITS.maxTests) {
    return { ok: false, error: `The Playwright report contains more than ${AUTOMATION_LIMITS.maxTests} tests and was not read.` };
  }
  return { ok: true, report };
}

/** Total specs (leaf tests) in a report. */
export function countSpecs(report: PlaywrightJsonReport): number {
  let n = 0;
  for (const _ of walkSpecs(report)) n++;
  return n;
}

/** Depth-first traversal of every spec, paired with the suite chain and the root file. */
export function* walkSpecs(
  report: PlaywrightJsonReport,
): Generator<{ suite: PlaywrightSuite; spec: PlaywrightSpec; titlePath: string[]; file: string | null }> {
  const visit = function* (
    suite: PlaywrightSuite,
    parents: string[],
    parentFile: string | null,
  ): Generator<{ suite: PlaywrightSuite; spec: PlaywrightSpec; titlePath: string[]; file: string | null }> {
    const titlePath = suite.title ? [...parents, suite.title] : parents;
    const file = suite.file ?? parentFile;
    for (const spec of asArray((suite ?? {}).specs)) yield { suite, spec: spec as PlaywrightSpec, titlePath, file };
    for (const child of asArray((suite ?? {}).suites)) yield* visit(child as PlaywrightSuite, titlePath, file);
  };
  for (const suite of asArray(report.suites)) yield* visit(suite as PlaywrightSuite, [], (suite as PlaywrightSuite).file ?? null);
}

/* ---- annotations / tags / identity ---- */

function readAnnotations(...sources: unknown[]): PlaywrightAnnotation[] {
  const out: PlaywrightAnnotation[] = [];
  for (const src of sources) {
    for (const a of asArray((src as { annotations?: unknown })?.annotations)) {
      if (isRecord(a) && typeof a.type === 'string') out.push({ type: a.type, description: asString(a.description) });
    }
  }
  return out;
}

function readTags(...sources: unknown[]): string[] {
  const out = new Set<string>();
  for (const src of sources) {
    for (const t of asArray((src as { tags?: unknown })?.tags)) if (typeof t === 'string') out.add(t);
  }
  return [...out];
}

const annotationValue = (anns: PlaywrightAnnotation[], type: string): string | null => {
  const found = anns.find((a) => a.type === type);
  return found && found.description ? found.description : null;
};

/** The `@tt:<automationId>` tag, if present. */
export const automationTag = (automationId: string): string => `${AUTOMATION_TAG_PREFIX}${automationId}`;
export const automationIdFromTags = (tags: readonly string[]): string | null => {
  // Playwright's JSON report stores tags without the leading `@` (`tt:login`), while the CLI and
  // the test title use `@tt:login`. Accept both.
  const tag = tags.find((t) => t === AUTOMATION_TAG_PREFIX.slice(1) || t.startsWith(AUTOMATION_TAG_PREFIX) || t.startsWith(AUTOMATION_TAG_PREFIX.slice(1)));
  if (!tag) return null;
  return tag.startsWith(AUTOMATION_TAG_PREFIX) ? tag.slice(AUTOMATION_TAG_PREFIX.length) : tag.slice(AUTOMATION_TAG_PREFIX.length - 1);
};

/**
 * The catalog: one {@link DiscoveredTest} per (spec × project). Identity is read from the
 * `testoritto.*` annotations (per test first, then the spec), with the `@tt:` tag as a fallback for
 * `automationId`; a test with neither is catalogued but not runnable-by-key.
 */
export function discoveredTests(report: PlaywrightJsonReport): DiscoveredTest[] {
  const out: DiscoveredTest[] = [];
  for (const { suite, spec, titlePath, file: rootFile } of walkSpecs(report)) {
    const specTags = readTags(spec);
    const specAnns = readAnnotations(spec);
    for (const test of asArray(spec.tests)) {
      const t = isRecord(test) ? test : {};
      const anns = [...specAnns, ...readAnnotations(t)];
      const tags = [...new Set([...specTags, ...readTags(t)])];
      const project = asString(t.projectName) || asString(suite.projectName);
      const automationId = annotationValue(anns, AutomationAnnotation.automationId) ?? automationIdFromTags(tags);
      const location = isRecord(spec) && isRecord((spec as unknown as { location?: unknown }).location)
        ? (spec as unknown as { location: Record<string, unknown> }).location
        : null;
      const file = rootFile || asString(location?.file) || null;
      // The root suite is titled with the file name; it is the location, not a describe block, so
      // the test-list path (and the catalog display) starts at the first real describe.
      const path = [...titlePath, asString(spec.title)];
      if (path.length > 1 && file) {
        const base = (p: string): string => p.split(/[\\/]/).pop() ?? p;
        if (path[0] === file || base(path[0]) === base(file)) path.shift();
      }
      out.push({
        automationId,
        caseId: annotationValue(anns, AutomationAnnotation.caseId),
        variantId: annotationValue(anns, AutomationAnnotation.variantId),
        title: asString(spec.title),
        titlePath: path,
        project,
        file,
        line: typeof location?.line === 'number' ? location.line : null,
        expectedStatus: asStatus((t as { expectedStatus?: unknown }).expectedStatus),
        tags,
      });
    }
  }
  return out;
}

/** The identity tuple a run pins a test by (design §Остальные решения 1). */
export const testKey = (t: Pick<DiscoveredTest, 'caseId' | 'automationId' | 'project' | 'variantId'>): string =>
  [t.caseId ?? '', t.automationId ?? '', t.project, t.variantId || DEFAULT_VARIANT].join('::');

export interface DiscoveryIssues {
  /** Tests that cannot be started by key (missing annotation and tag) — run is blocked. */
  unkeyed: DiscoveredTest[];
  /** The same key found more than once — run is blocked. */
  duplicates: { key: string; tests: DiscoveredTest[] }[];
  /** Nothing found at all. */
  empty: boolean;
}

/** Validation the run must pass before starting (spec "Duplicate or missing identity"). */
export function discoveryIssues(tests: readonly DiscoveredTest[]): DiscoveryIssues {
  const byKey = new Map<string, DiscoveredTest[]>();
  const unkeyed: DiscoveredTest[] = [];
  for (const t of tests) {
    if (!t.automationId) {
      unkeyed.push(t);
      continue;
    }
    const k = testKey(t);
    const list = byKey.get(k) ?? [];
    list.push(t);
    byKey.set(k, list);
  }
  const duplicates = [...byKey.entries()].filter(([, list]) => list.length > 1).map(([key, tests]) => ({ key, tests }));
  return { unkeyed, duplicates, empty: tests.length === 0 };
}

/* ---- results (pass/fail/flaky/attempts) ---- */

export interface SpecResultSummary {
  /** The final attempt's status (`passed` for a flaky test that passed on retry). */
  status: PlaywrightTestStatus;
  /** True when a retry passed: at least one failed attempt then a passing final one. */
  flaky: boolean;
  attempts: number;
  duration: number;
  results: PlaywrightTestResult[];
}

/** Summarize the attempts of one (spec × project) from the report. */
export function summarizeResults(results: readonly PlaywrightTestResult[]): SpecResultSummary {
  const attempts = results.length;
  const final = results[attempts - 1];
  const status = final?.status ?? 'interrupted';
  const failedEarlier = results.slice(0, -1).some((r) => r.status === 'failed' || r.status === 'timedOut');
  return {
    status,
    flaky: status === 'passed' && failedEarlier,
    attempts,
    duration: results.reduce((sum, r) => sum + asNumber(r.duration), 0),
    results: [...results],
  };
}

/** Count specs by final status (used for the run summary and report section). */
export function summarizeReport(report: PlaywrightJsonReport): Record<PlaywrightTestStatus, number> {
  const counts: Record<PlaywrightTestStatus, number> = { passed: 0, failed: 0, timedOut: 0, skipped: 0, interrupted: 0 };
  for (const { spec, suite } of walkSpecs(report)) {
    const tests = asArray(spec.tests);
    if (tests.length === 0) continue;
    // Aggregate every project's attempts for this spec under its final status.
    for (const test of tests) {
      const t = isRecord(test) ? test : {};
      const summary = summarizeResults(asArray(t.results) as PlaywrightTestResult[]);
      void suite;
      counts[summary.status] += 1;
    }
  }
  return counts;
}
