import type { Run } from '@/types';
import { sha256Hex } from '@/services/hash';
import { parsePlaywrightReport, walkSpecs } from './report';
import type { RunAutomationResult } from './run-results';

// ---------------------------------------------------------------------------
// Importing a completed Playwright report from CI or a manual run (design §Решение 8).
//
// Import is a *separate* path from running: it never executes config/test code. Both readers are
// fail-closed — a corrupt payload, a DTD/external entity, or a report that does not correspond to
// this run is diagnosed and applies nothing. Applying is idempotent: the import id is derived from
// the payload, so re-importing the same report cannot duplicate results.
// ---------------------------------------------------------------------------

export type ImportFormat = 'playwright-json' | 'junit';

export interface ImportTest {
  /** Stable identity when the payload provides one (automationId from annotations). */
  automationId: string | null;
  caseId: string | null;
  title: string;
  file: string | null;
  status: RunAutomationResult['status'];
  duration: number;
  flaky: boolean;
  attempts: number;
}

export interface ImportPreview {
  ok: boolean;
  format: ImportFormat;
  importId: string;
  tests: ImportTest[];
  /** Tests mapped to a run row. */
  matched: { test: ImportTest; rowIndex: number }[];
  /** Tests with no matching row — shown, never applied. */
  unmatched: ImportTest[];
  /** The same identity appeared more than once in the payload. */
  duplicates: ImportTest[];
  problems: string[];
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/* ---------------------------------------------------------------------------
 * JUnit (XML) — a deliberately small, non-validating reader.
 * ------------------------------------------------------------------------- */

const decodeXml = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** Parse JUnit `<testcase>` elements. No DTD, no external entities — reject them outright. */
export function parseJUnit(xml: string): { ok: true; tests: ImportTest[] } | { ok: false; error: string } {
  if (/<!DOCTYPE/i.test(xml) || /<!ENTITY/i.test(xml)) {
    return { ok: false, error: 'JUnit reports with a DTD or entity declarations are not read.' };
  }
  if (!/<testsuites[\s>]|<testsuite[\s>]/i.test(xml)) {
    return { ok: false, error: 'This does not look like a JUnit XML report (no <testsuite>).' };
  }
  const tests: ImportTest[] = [];
  const rx = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(xml)) !== null) {
    const attrs = m[1] ?? '';
    const body = m[2] ?? '';
    const attr = (name: string): string | null => {
      const a = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(attrs) ?? new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, 'i').exec(attrs);
      return a ? decodeXml(a[1]) : null;
    };
    const name = attr('name') ?? '';
    const className = attr('classname') ?? '';
    const file = attr('file');
    const time = Number(attr('time') ?? '0') * 1000;
    const failed = /<failure\b/i.test(body);
    const errored = /<error\b/i.test(body);
    const skipped = /<skipped\b/i.test(body);
    const status: RunAutomationResult['status'] = errored ? 'interrupted' : failed ? 'failed' : skipped ? 'skipped' : 'passed';
    tests.push({
      automationId: /@tt:([A-Za-z0-9._-]+)/.exec(name)?.[1] ?? null,
      caseId: null,
      title: [className, name].filter(Boolean).join(' › '),
      file,
      status,
      duration: Number.isFinite(time) ? time : 0,
      flaky: false,
      attempts: 1,
    });
  }
  if (tests.length === 0) return { ok: false, error: 'The JUnit report contains no <testcase> elements.' };
  return { ok: true, tests };
}

/* ---------------------------------------------------------------------------
 * Playwright JSON — reuse the tolerant report reader.
 * ------------------------------------------------------------------------- */

export function parsePlaywrightImport(json: string): { ok: true; tests: ImportTest[] } | { ok: false; error: string } {
  const parsed = parsePlaywrightReport(json);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const tests: ImportTest[] = [];
  for (const { spec, suite } of walkSpecs(parsed.report)) {
    const tags = spec.tags ?? [];
    const automationId = /@tt:([A-Za-z0-9._-]+)/.exec(tags.join(' '))?.[1] ?? null;
    const results = (spec.tests ?? []).flatMap((t) => t.results ?? []);
    const final = results.at(-1);
    const status: RunAutomationResult['status'] = final?.status ?? 'interrupted';
    tests.push({
      automationId,
      caseId: null,
      title: spec.title,
      file: suite.file ?? spec.file ?? null,
      status,
      duration: results.reduce((n, r) => n + (r.duration ?? 0), 0),
      flaky: status === 'passed' && results.slice(0, -1).some((r) => r.status === 'failed' || r.status === 'timedOut'),
      attempts: results.length,
    });
  }
  if (tests.length === 0) return { ok: false, error: 'The Playwright report contains no tests.' };
  return { ok: true, tests };
}

/* ---------------------------------------------------------------------------
 * Preview + apply
 * ------------------------------------------------------------------------- */

const identityOf = (t: ImportTest): string => `${t.automationId ?? ''}|${t.file ?? ''}|${t.title}`;

/**
 * Read a payload and match it against a run. Foreign reports (no test maps to any row) are
 * diagnosed and never applied. Nothing here writes or executes.
 */
export function previewImport(
  payload: string,
  format: ImportFormat,
  run: Run,
): ImportPreview {
  const parsed = format === 'junit' ? parseJUnit(payload) : parsePlaywrightImport(payload);
  if (!parsed.ok) {
    return { ok: false, format, importId: sha256Hex(payload), tests: [], matched: [], unmatched: [], duplicates: [], problems: [parsed.error] };
  }
  return matchImport(parsed.tests, format, payload, run);
}

/** Pure matching step (exported for tests and for an execution manifest import). */
export function matchImport(tests: readonly ImportTest[], format: ImportFormat, payload: string, run: Run): ImportPreview {
  const seen = new Map<string, ImportTest>();
  const duplicates: ImportTest[] = [];
  for (const t of tests) {
    const key = identityOf(t);
    if (seen.has(key)) duplicates.push(t);
    else seen.set(key, t);
  }

  const rowFor = (t: ImportTest): number | null => {
    const byCase = t.caseId ? run.rows.findIndex((r) => r.case_id === t.caseId) : -1;
    if (byCase >= 0) return byCase;
    const base = (p: string): string => p.split(/[\\/]/).pop() ?? p;
    const byFile = t.file ? run.rows.findIndex((r) => base(r.file) === base(t.file as string)) : -1;
    if (byFile >= 0) return byFile;
    // JUnit names are `classname › name`; compare both the full title and the leaf.
    const leaf = t.title.split('›').pop()?.trim() ?? t.title;
    const byTitle = run.rows.findIndex((r) => r.title === t.title || r.title === leaf);
    return byTitle >= 0 ? byTitle : null;
  };

  const matched: ImportPreview['matched'] = [];
  const unmatched: ImportTest[] = [];
  for (const t of tests) {
    const rowIndex = rowFor(t);
    if (rowIndex === null) unmatched.push(t);
    else matched.push({ test: t, rowIndex });
  }

  const problems: string[] = [];
  if (matched.length === 0) problems.push('No test in this report matches a case in the run; nothing was imported.');
  if (duplicates.length) problems.push(`${duplicates.length} test${duplicates.length === 1 ? ' appears' : 's appear'} more than once in the report.`);

  return {
    ok: problems.length === 0,
    format,
    importId: sha256Hex(payload),
    tests: [...tests],
    matched,
    unmatched,
    duplicates,
    problems,
  };
}

/** One mapped result per matched test, ready for `applyImport`. */
export function importedResults(preview: ImportPreview, run: Run, executionId: string): RunAutomationResult[] {
  if (!preview.ok) return [];
  return preview.matched.map(({ test, rowIndex }) => ({
    executionId,
    automationId: test.automationId ?? test.title,
    project: '',
    caseId: run.rows[rowIndex]?.case_id ?? null,
    caseRowIndex: rowIndex,
    status: test.status,
    flaky: test.flaky,
    attempts: test.attempts,
    duration: test.duration,
  }));
}

/**
 * Sidecar payload for a saved import. The import id is the payload hash, and the store replaces the
 * file for that id — re-importing the same report is idempotent by construction.
 */
export const importSidecar = (preview: ImportPreview, executionId: string): string =>
  JSON.stringify({ schemaVersion: 1, importId: preview.importId, executionId, format: preview.format, results: preview.matched.map(({ test }) => test) }, null, 2) + '\n';

/** True when this exact payload was already imported into the run. */
export async function isAlreadyImported(
  readFile: (rel: string) => Promise<string | null>,
  rel: string,
  preview: ImportPreview,
): Promise<boolean> {
  const existing = await readFile(rel);
  if (!existing) return false;
  try {
    return (JSON.parse(existing) as { importId?: string }).importId === preview.importId;
  } catch {
    return false;
  }
}