import type { Case, Result, Run, RunRow } from '@/types';
import { yamlScalar } from '@/services/format/yaml-scalar';
import { deriveItems, effectiveTestDate, rowFailures, type Failure } from './run-items';
import { numberSteps } from './steps';
import { resolveVariables } from './variables';

// ---------------------------------------------------------------------------
// Defect snapshots.
//
// A defect report is a self-contained, copy-pasteable Markdown document built from one run
// row. It freezes what was tested (case text + the run's snapshot values) so it stays valid
// after the case is edited or deleted. The file on disk is the snapshot: it is rendered once
// and never rebuilt from live data.
// ---------------------------------------------------------------------------

/** Where the failure was observed. */
export type DefectSource = 'manual' | 'automation' | 'both';

/** One evidence file attached to a defect (path is repo-relative). */
export interface DefectEvidence {
  path: string;
  name: string;
}

/** The automation result a defect was filed from, if any. */
export interface DefectAutomation {
  executionId: string;
  automationId: string;
  project: string;
  status: string;
  attempts: number;
  error?: string;
}

/** The editable model behind a defect snapshot. */
export interface DefectDraft {
  /* identity / metadata */
  caseId: string;
  displayId: string;
  runFile: string;
  runName: string;
  result: Result;
  tester: string;
  testDate: string;
  createdAt: string;
  updatedAt: string;
  source: DefectSource;
  automation?: DefectAutomation | null;
  /* editable report sections */
  summary: string;
  environment: string;
  objective: string;
  preconditions: string;
  steps: string;
  expected: string;
  actual: string;
  testData: string;
  notes: string;
  evidence: DefectEvidence[];
}

export interface BuildDefectOptions {
  /** Environment line(s) to prefill — the caller adds OS/browser/build details. */
  environment?: string;
  /** Fixed clock for tests; defaults to now. */
  now?: Date;
  /** Include every case step rather than only the lead-up to the last failed one. */
  includeAllSteps?: boolean;
  /** Defaults to `manual` for a recorded row, otherwise `automation` when a result is supplied. */
  source?: DefectSource;
  automation?: DefectAutomation | null;
}

export interface DefectWarning {
  code: string;
  message: string;
  tone: 'warn' | 'info';
}

const RESULT_LABEL: Record<Result, string> = {
  pass: 'Pass',
  fail: 'Fail',
  blocked: 'Blocked',
  in_progress: 'In progress',
  skipped: 'Skipped',
  not_run: 'Not run',
};

const norm = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();

const bullet = (lines: string[]): string => lines.filter((l) => l.trim() !== '').join('\n');

/** Format one argument value for the test-data block. */
function argValue(v: string | number | boolean): string {
  return typeof v === 'string' ? v : String(v);
}

/** Resolve the case's setup items into a preconditions block, preferring the run snapshot. */
function preconditionsFor(kase: Case | undefined, row: RunRow, testDate: string): string {
  if (!kase?.setup.length) return '';
  return kase.setup
    .map((s, i) => {
      const name = resolveVariables(row.itemText?.[`setup:${i}`] ?? s.name, testDate).trim();
      const body = resolveVariables(s.body, testDate).trim();
      return body ? `- **${name}**\n${body.replace(/\n/g, '\n  ')}` : `- ${name}`;
    })
    .join('\n');
}

/** Resolve the case's acceptance criteria into an expected-result block, preferring the run snapshot. */
function expectedFor(kase: Case | undefined, row: RunRow, testDate: string): string {
  if (!kase?.expected.length) return '';
  return kase.expected.map((t, i) => `- ${resolveVariables(row.itemText?.[`accept:${i}`] ?? t, testDate)}`).join('\n');
}

/**
 * Build the "steps to reproduce" block from the live case, up to and including the last
 * failed step (or every step when `includeAllSteps` is set / no step failed). Nested steps
 * keep their outline numbers and two-space indentation.
 */
function stepsFor(kase: Case | undefined, row: RunRow, testDate: string, includeAllSteps: boolean): string {
  if (!kase) {
    // The case is gone: fall back to the snapshot's item texts, in positional order.
    const keys = Object.keys(row.checks)
      .filter((k) => k.startsWith('step:'))
      .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)));
    if (!keys.length) return '';
    return keys
      .map((k, i) => {
        const text = row.itemText?.[k] ?? k;
        const note = (row.failNotes[k] ?? '').trim();
        return `${i + 1}. ${text}${row.checks[k] === 'fail' ? `  ✗${note ? ` ${note}` : ''}` : ''}`;
      })
      .join('\n');
  }

  const nums = numberSteps(kase.steps);
  const lastFail = kase.steps.reduce((last, _s, i) => (row.checks[`step:${i}`] === 'fail' ? i : last), -1);
  const end = includeAllSteps || lastFail < 0 ? kase.steps.length - 1 : lastFail;
  const lines: string[] = [];
  for (let i = 0; i <= end; i++) {
    const step = kase.steps[i];
    // Prefer the text captured in the run sidecar: it is what was actually executed.
    const text = resolveVariables(row.itemText?.[`step:${i}`] ?? step.text, testDate);
    const note = (row.failNotes[`step:${i}`] ?? '').trim();
    const failed = row.checks[`step:${i}`] === 'fail';
    lines.push(`${'  '.repeat(step.depth)}${nums[i] ?? i + 1}. ${text}${failed ? `  ✗${note ? ` ${note}` : ''}` : ''}`);
  }
  return lines.join('\n');
}

/**
 * Split failed-item notes into the Actual block and the leftover Notes. Notes that merely
 * repeat a failed item's description are dropped (the user asked for that explicitly).
 */
export function splitActualAndNotes(failures: Failure[], notes: string): { actual: string; notes: string } {
  const actualLines = failures.map((f) => `- ${f.text}${f.note ? ` — ${f.note}` : ''}`);
  const actual = bullet(actualLines);
  const n = notes.trim();
  if (!n) return { actual, notes: '' };
  if (!actual) return { actual: n, notes: '' };
  const failureNotes = failures.map((f) => norm(f.note)).filter(Boolean);
  if (failureNotes.includes(norm(n)) || norm(actual).includes(norm(n))) return { actual, notes: '' };
  return { actual, notes: n };
}

/** Build a draft from a run row, prefilled from the case and the run's frozen data. */
export function buildDefectDraft(run: Run, row: RunRow, kase: Case | undefined, opts: BuildDefectOptions = {}): DefectDraft {
  const testDate = effectiveTestDate(run, row);
  const title = resolveVariables(row.title, testDate);
  const defaultSummary = `[${row.display_id}] ${title}`;
  // Failed-item text is case-derived, so resolve {{today}}; the tester's note is not.
  const failures = rowFailures(row, kase).map((f) => ({ text: resolveVariables(f.text, testDate), note: f.note }));
  const { actual, notes } = splitActualAndNotes(failures, row.notes);
  const args = run.snapshot?.arguments;
  const testData = args?.values.length
    ? args.values.map((v) => `- **${v.key}**: ${argValue(v.value)}`).join('\n')
    : '';
  const source: DefectSource =
    opts.source ?? (row.executed_at ? 'manual' : opts.automation ? 'automation' : 'manual');
  const now = (opts.now ?? new Date()).toISOString();

  return {
    caseId: row.case_id,
    displayId: row.display_id,
    runFile: run.file,
    runName: run.name,
    result: row.result,
    tester: row.tester,
    testDate,
    createdAt: now,
    updatedAt: now,
    source,
    automation: opts.automation ?? null,
    summary: defaultSummary,
    environment: opts.environment ?? '',
    objective: kase ? resolveVariables(kase.objective.trim(), testDate) : '',
    preconditions: preconditionsFor(kase, row, testDate),
    steps: stepsFor(kase, row, testDate, opts.includeAllSteps ?? false),
    expected: expectedFor(kase, row, testDate),
    actual,
    testData,
    notes,
    evidence: [],
  };
}

/** The default summary for a row — also used to warn when the tester never rewrote it. */
export function defaultDefectSummary(run: Run, row: RunRow): string {
  return `[${row.display_id}] ${resolveVariables(row.title, effectiveTestDate(run, row))}`;
}

/** A source label for the report metadata. */
export function sourceLabel(draft: DefectDraft): string {
  if (draft.source === 'both') return 'Manual + autotest';
  if (draft.source === 'automation') {
    const a = draft.automation;
    return a ? `Autotest — ${a.automationId} (${a.project})` : 'Autotest';
  }
  return 'Manual';
}

/** Render the ready-to-paste Markdown body (no front matter). */
export function renderDefectMarkdown(draft: DefectDraft): string {
  const meta = [
    `**Case:** ${draft.displayId} · **Run:** ${draft.runName} · **Test date:** ${draft.testDate}`,
    `**Tester:** ${draft.tester || '—'} · **Result:** ${RESULT_LABEL[draft.result]} · **Source:** ${sourceLabel(draft)}`,
  ];
  if (draft.environment.trim()) {
    meta.push(`**Environment:** ${draft.environment.trim().replace(/\s*\n+\s*/g, ' · ')}`);
  }

  const parts: string[] = [`# ${draft.summary.trim() || `${draft.displayId} — defect`}`, meta.join('\n')];
  const section = (heading: string, body: string) => {
    if (body.trim()) parts.push(`## ${heading}\n\n${body.trim()}`);
  };
  section('Objective', draft.objective);
  section('Preconditions', draft.preconditions);
  section('Steps to reproduce', draft.steps);
  section('Expected result', draft.expected);
  section('Actual result', draft.actual);
  section('Test data', draft.testData);
  section('Evidence', draft.evidence.map((e) => `- ${e.name} (${e.path})`).join('\n'));
  if (draft.automation?.error && draft.source !== 'manual') {
    parts.push(`## Autotest failure\n\n\`\`\`\n${draft.automation.error.trim()}\n\`\`\``);
  }
  section('Notes', draft.notes);
  return parts.join('\n\n') + '\n';
}

/** The full on-disk file: front matter + the rendered body. */
export function serializeDefectFile(draft: DefectDraft): string {
  const front = [
    '---',
    'schema_version: 1',
    `case: ${yamlScalar(draft.displayId)}`,
    `case_id: ${yamlScalar(draft.caseId)}`,
    `run: ${yamlScalar(draft.runFile)}`,
    `run_name: ${yamlScalar(draft.runName)}`,
    `result: ${draft.result}`,
    `tester: ${yamlScalar(draft.tester)}`,
    `test_date: ${yamlScalar(draft.testDate)}`,
    `created_at: ${yamlScalar(draft.createdAt)}`,
    `updated_at: ${yamlScalar(draft.updatedAt)}`,
    `source: ${draft.source}`,
    ...(draft.automation
      ? [
          `automation_execution: ${yamlScalar(draft.automation.executionId)}`,
          `automation_id: ${yamlScalar(draft.automation.automationId)}`,
          `automation_project: ${yamlScalar(draft.automation.project)}`,
          `automation_status: ${yamlScalar(draft.automation.status)}`,
          `automation_attempts: ${draft.automation.attempts}`,
          ...(draft.automation.error ? [`automation_error: ${yamlScalar(draft.automation.error)}`] : []),
        ]
      : []),
    ...(draft.evidence.length ? ['evidence:', ...draft.evidence.map((e) => `  - ${yamlScalar(e.path)}`)] : ['evidence: []']),
    '---',
  ].join('\n');
  return `${front}\n\n${renderDefectMarkdown(draft)}`;
}

const unquote = (raw: string): string => {
  const s = raw.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    try {
      return JSON.parse(s) as string;
    } catch {
      return s.slice(1, -1);
    }
  }
  return s;
};

const SECTION_NAMES = [
  'Objective',
  'Preconditions',
  'Steps to reproduce',
  'Expected result',
  'Actual result',
  'Test data',
  'Evidence',
  'Autotest failure',
  'Notes',
] as const;

/** Split the body into its reserved sections (everything before the first heading is dropped). */
function bodySections(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  let current: string | null = null;
  const acc: Record<string, string[]> = {};
  for (const line of body.split('\n')) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      const name = m[1].trim();
      current = (SECTION_NAMES as readonly string[]).includes(name) ? name : null;
      if (current) acc[current] ??= [];
      continue;
    }
    if (current) acc[current].push(line);
  }
  for (const [k, lines] of Object.entries(acc)) {
    out[k] = lines.join('\n').trim();
  }
  return out;
}

/**
 * Parse a saved defect file back into a draft. Tolerant: an older/simpler file still opens,
 * and a missing H1/front matter means "not a defect snapshot".
 */
export function parseDefectFile(raw: string): DefectDraft | null {
  const text = raw.replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) return null;
  const front = text.slice(4, end);
  const body = text.slice(end + 5).trim();
  const data: Record<string, string> = {};
  const evidence: DefectEvidence[] = [];
  let inEvidence = false;
  for (const line of front.split('\n')) {
    if (/^evidence:\s*$/.test(line)) {
      inEvidence = true;
      continue;
    }
    if (inEvidence) {
      const m = /^\s*-\s+(.+)$/.exec(line);
      if (m) {
        const p = unquote(m[1]);
        if (p) evidence.push({ path: p, name: p.split(/[/\\]/).pop() || p });
        continue;
      }
      if (line.trim() !== '') inEvidence = false;
    }
    const m = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (m) data[m[1]] = unquote(m[2]);
  }

  const summaryLine = body.split('\n').find((l) => l.startsWith('# '));
  if (!summaryLine) return null;
  const sections = bodySections(body);
  const automation =
    data.automation_execution || data.automation_id
      ? {
          executionId: data.automation_execution ?? '',
          automationId: data.automation_id ?? '',
          project: data.automation_project ?? '',
          status: data.automation_status ?? '',
          attempts: Number(data.automation_attempts || 0),
          ...(data.automation_error ? { error: data.automation_error } : {}),
        }
      : null;

  return {
    caseId: data.case_id ?? '',
    displayId: data.case ?? '',
    runFile: data.run ?? '',
    runName: data.run_name ?? '',
    result: (data.result as Result) ?? 'fail',
    tester: data.tester ?? '',
    testDate: data.test_date ?? '',
    createdAt: data.created_at ?? '',
    updatedAt: data.updated_at ?? '',
    source: (data.source as DefectSource) ?? 'manual',
    automation,
    summary: summaryLine.slice(2).trim(),
    environment: extractMeta(body, 'Environment') ?? '',
    objective: sections.Objective ?? '',
    preconditions: sections.Preconditions ?? '',
    steps: sections['Steps to reproduce'] ?? '',
    expected: sections['Expected result'] ?? '',
    actual: sections['Actual result'] ?? '',
    testData: sections['Test data'] ?? '',
    notes: sections.Notes ?? '',
    evidence,
  };
}

/** Pull a `**Label:** value` line out of the report header. */
function extractMeta(body: string, label: string): string | null {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)$`, 'm');
  return re.exec(body)?.[1]?.trim() ?? null;
}

/** Soft checks shown above Copy — never block the copy. */
export function defectWarnings(draft: DefectDraft, defaultSummary?: string): DefectWarning[] {
  const out: DefectWarning[] = [];
  if (!draft.summary.trim()) out.push({ code: 'summary-empty', message: 'Summary is empty.', tone: 'warn' });
  else if (defaultSummary && norm(draft.summary) === norm(defaultSummary))
    out.push({
      code: 'summary-default',
      message: 'Summary still repeats the test case title — describe the defect instead.',
      tone: 'warn',
    });
  if (!draft.actual.trim())
    out.push({ code: 'actual-empty', message: 'Actual result is empty — what happened?', tone: 'warn' });
  if (!draft.evidence.length)
    out.push({ code: 'evidence-empty', message: 'No evidence attached (screenshot, log, trace).', tone: 'warn' });
  if (!draft.expected.trim())
    out.push({ code: 'expected-empty', message: 'Expected result is empty.', tone: 'warn' });
  if (!draft.steps.trim())
    out.push({ code: 'steps-empty', message: 'No steps to reproduce.', tone: 'warn' });
  if (!draft.environment.trim())
    out.push({ code: 'environment-empty', message: 'Environment is empty.', tone: 'warn' });
  return out;
}
