import { node } from '@/lib/node';
import { RunCaseFrontSchema, RunDetailsFrontSchema, type LintWarning } from '@/schemas';
import type { Approval, CheckState, Result } from '@/types';

// ---------------------------------------------------------------------------
// Shared helpers (mirror src/services/format/case.ts)
// ---------------------------------------------------------------------------

/** True when a YAML scalar can't be emitted plain (must be double-quoted). */
function needsQuote(s: string): boolean {
  if (s === '' || s !== s.trim()) return true;
  if (/:( |$)/.test(s) || /\s#/.test(s) || /^#/.test(s)) return true;
  if (/^[!&*?{}[\]|>@`"'%,\-]/.test(s)) return true;
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(s)) return true;
  if (/^[\d.+-]+$/.test(s)) return true; // numeric-looking
  return false;
}
const yamlScalar = (s: string): string => (needsQuote(s) ? JSON.stringify(s) : s);

function trimBlank(lines: string[]): string[] {
  let s = 0;
  let e = lines.length;
  while (s < e && lines[s].trim() === '') s++;
  while (e > s && lines[e - 1].trim() === '') e--;
  return lines.slice(s, e);
}

const sectionBlock = (heading: string, content: string): string => (content ? `${heading}\n\n${content}` : heading);

/** Split a markdown body into its reserved `##` sections; capture the rest as `extra`. */
function splitSections(
  content: string,
  reserved: readonly string[],
  warnings: LintWarning[],
): { sections: Record<string, string>; extra: string } {
  const lines = content.split('\n');
  const acc: Record<string, string[]> = {};
  const extra: string[] = [];
  let current: string | null = null;
  let sawUnknown = false;

  for (const line of lines) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      const name = h[1].trim();
      if (reserved.includes(name)) {
        current = name;
        acc[name] ??= [];
        continue;
      }
      current = null;
      sawUnknown = true;
      extra.push(line);
      continue;
    }
    if (current) acc[current].push(line);
    else if (sawUnknown || line.trim() !== '') extra.push(line);
  }

  const trimmedExtra = trimBlank(extra).join('\n');
  if (trimmedExtra) {
    warnings.push({ code: 'extra-content', message: 'Out-of-schema content was preserved verbatim.' });
  }
  const sections: Record<string, string> = {};
  for (const k of Object.keys(acc)) sections[k] = trimBlank(acc[k]).join('\n');
  return { sections, extra: trimmedExtra };
}

// ---------------------------------------------------------------------------
// Tri-state checklist items
// ---------------------------------------------------------------------------

export interface RunCaseItem {
  /** Stable positional key, e.g. `setup:0` / `step:1` / `accept:2`. */
  key: string;
  text: string;
  state: CheckState;
  /** Failure description — only meaningful when `state === 'fail'`. */
  failNote: string;
}

const GLYPH: Record<CheckState, string> = { none: ' ', pass: 'x', fail: '-' };
// Separates a failed item's text from its note. A rare `!!` sentinel (not prose punctuation like an
// em-dash) plus splitting on the LAST occurrence means dashes/em-dashes in the item text survive,
// and the space padding keeps a trailing `!`/`!!` in the text from being mistaken for the sentinel.
const FAIL_SEP = ' !! ';

/** Serialize one checklist section's items to `- [ |x|-] text[ — failNote]` lines. */
function serializeItems(items: RunCaseItem[]): string {
  return items
    .map((it) => {
      let line = `- [${GLYPH[it.state]}] ${it.text}`.trimEnd();
      if (it.state === 'fail' && it.failNote.trim()) line += `${FAIL_SEP}${it.failNote.trim()}`;
      return line;
    })
    .join('\n');
}

/** Parse a checklist section back into tri-state items, keyed `<prefix>:<ordinal>`. */
function parseItems(text: string, prefix: string, warnings: LintWarning[]): RunCaseItem[] {
  const out: RunCaseItem[] = [];
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    // Tolerate a leading bullet and/or ordinal in either order: `- [x] 1. foo`, `1. [x] foo`.
    const m = /^\s*(?:[-*+]\s+)?(?:\d+\.\s+)?\[([ xX-])\]\s?(.*)$/.exec(raw);
    const key = `${prefix}:${out.length}`;
    if (!m) {
      // A bullet that isn't a recognised checkbox — keep the text, default to `none`.
      const loose = /^\s*(?:[-*+]\s+)?(?:\[.?\]\s?)?(.*)$/.exec(raw);
      warnings.push({ code: 'checkbox', message: `Unrecognised checklist mark; defaulted to empty: "${raw.trim()}".` });
      out.push({ key, text: (loose?.[1] ?? raw).trim(), state: 'none', failNote: '' });
      continue;
    }
    const glyph = m[1];
    const state: CheckState = glyph === 'x' || glyph === 'X' ? 'pass' : glyph === '-' ? 'fail' : 'none';
    let body = m[2].replace(/^\d+\.\s+/, '').trim(); // strip an ordinal that followed the checkbox
    let failNote = '';
    if (state === 'fail') {
      const i = body.lastIndexOf(FAIL_SEP);
      if (i !== -1) {
        failNote = body.slice(i + FAIL_SEP.length).trim();
        body = body.slice(0, i).trim();
      }
    }
    out.push({ key, text: body, state, failNote });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-case sidecar (`<run>/NNN-<id>.md`)
// ---------------------------------------------------------------------------

const CASE_RESERVED = ['Setup', 'Steps', 'Acceptance Criteria', 'Notes'] as const;

export interface RunCaseFile {
  caseId: string;
  displayId: string;
  title: string;
  result: Result;
  tester: string;
  executedAt: string;
  /** Per-case test-date override (ISO); absent/null = inherit the run's. */
  testDate?: string | null;
  notes: string;
  setup: RunCaseItem[];
  steps: RunCaseItem[];
  accept: RunCaseItem[];
}

/** Serialize a per-case run sidecar to canonical markdown (frontmatter + checklist). */
export function serializeRunCase(rc: RunCaseFile, extra = ''): string {
  const front = [
    '---',
    `case_id: ${yamlScalar(rc.caseId)}`,
    `display_id: ${yamlScalar(rc.displayId)}`,
    `title: ${yamlScalar(rc.title)}`,
    `result: ${rc.result}`,
    `tester: ${yamlScalar(rc.tester)}`,
    `executed_at: ${yamlScalar(rc.executedAt)}`,
    // Only emit a per-case override when set — an inherited date keeps the diff minimal.
    ...(rc.testDate ? [`test_date: ${yamlScalar(rc.testDate)}`] : []),
    '---',
  ].join('\n');

  const blocks = [
    sectionBlock('## Setup', serializeItems(rc.setup)),
    sectionBlock('## Steps', serializeItems(rc.steps)),
    sectionBlock('## Acceptance Criteria', serializeItems(rc.accept)),
    sectionBlock('## Notes', rc.notes.trim()),
  ];

  let body = blocks.join('\n\n');
  const tail = extra.trim();
  if (tail) body += `\n\n${tail}`;
  return `${front}\n\n${body}\n`;
}

export interface ParseRunCaseResult {
  runCase: RunCaseFile;
  extra: string;
  warnings: LintWarning[];
}

/** Parse a per-case run sidecar → domain shape + captured extra + lint warnings. */
export function parseRunCase(input: string): ParseRunCaseResult {
  const warnings: LintWarning[] = [];
  const text = input.replace(/\r\n/g, '\n');
  const parsed = node.matter()(text);
  const data = (parsed.data ?? {}) as Record<string, unknown>;
  const content = (parsed.content ?? '') as string;

  const fm = RunCaseFrontSchema.safeParse(data);
  const front = fm.success ? fm.data : RunCaseFrontSchema.parse({});
  if (!fm.success) warnings.push({ code: 'run-case', message: 'Run-case front matter was invalid; coerced to defaults.' });

  const { sections, extra } = splitSections(content, CASE_RESERVED, warnings);

  return {
    runCase: {
      caseId: front.case_id,
      displayId: front.display_id,
      title: front.title,
      result: front.result,
      tester: front.tester,
      executedAt: front.executed_at,
      testDate: front.test_date || undefined,
      notes: (sections['Notes'] ?? '').trim(),
      setup: parseItems(sections['Setup'] ?? '', 'setup', warnings),
      steps: parseItems(sections['Steps'] ?? '', 'step', warnings),
      accept: parseItems(sections['Acceptance Criteria'] ?? '', 'accept', warnings),
    },
    extra,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Run-details sidecar (`<run>/_run.md`)
// ---------------------------------------------------------------------------

const DETAILS_RESERVED = ['Summary', 'Notes'] as const;

export interface RunDetails {
  name: string;
  status: 'open' | 'closed';
  created: string;
  /** The run's default test date (ISO) for `{{today}}` resolution. */
  testDate?: string;
  scope: string;
  testerApproval: Approval | null;
  reviewerApproval: Approval | null;
  summary: string;
  notes: string;
}

function approvalLines(key: string, a: Approval | null): string[] {
  if (!a || !a.name.trim()) return [];
  return [`${key}:`, `  name: ${yamlScalar(a.name)}`, `  at: ${JSON.stringify(a.at)}`];
}

/** Serialize the run-details sidecar to canonical markdown (frontmatter + Summary + Notes). */
export function serializeRunDetails(d: RunDetails, extra = ''): string {
  const front = [
    '---',
    `name: ${yamlScalar(d.name)}`,
    `status: ${d.status}`,
    `created: ${JSON.stringify(d.created)}`,
    `test_date: ${yamlScalar(d.testDate ?? '')}`,
    `scope: ${yamlScalar(d.scope)}`,
    ...approvalLines('tester_approval', d.testerApproval),
    ...approvalLines('reviewer_approval', d.reviewerApproval),
    '---',
  ].join('\n');

  // The generated Summary (pass rate, needs-attention, etc.) is only materialized once a run is
  // closed; while it's open the section is omitted entirely so `_run.md` carries just the notes.
  const blocks = [
    ...(d.summary.trim() ? [sectionBlock('## Summary', d.summary.trim())] : []),
    sectionBlock('## Notes', d.notes.trim()),
  ];

  let body = blocks.join('\n\n');
  const tail = extra.trim();
  if (tail) body += `\n\n${tail}`;
  return `${front}\n\n${body}\n`;
}

export interface ParseRunDetailsResult {
  details: RunDetails;
  extra: string;
  warnings: LintWarning[];
}

/** Parse the run-details sidecar → domain shape + captured extra + lint warnings. */
export function parseRunDetails(input: string): ParseRunDetailsResult {
  const warnings: LintWarning[] = [];
  const text = input.replace(/\r\n/g, '\n');
  const parsed = node.matter()(text);
  const data = (parsed.data ?? {}) as Record<string, unknown>;
  const content = (parsed.content ?? '') as string;

  const fm = RunDetailsFrontSchema.safeParse(data);
  const front = fm.success ? fm.data : RunDetailsFrontSchema.parse({});
  if (!fm.success) warnings.push({ code: 'run-details', message: 'Run-details front matter was invalid; coerced to defaults.' });

  const { sections, extra } = splitSections(content, DETAILS_RESERVED, warnings);
  const toApproval = (a: { name: string; at: string } | null): Approval | null => (a && a.name.trim() ? a : null);

  return {
    details: {
      name: front.name ?? '',
      status: front.status,
      created: front.created,
      testDate: front.test_date ?? '',
      scope: front.scope,
      testerApproval: toApproval(front.tester_approval),
      reviewerApproval: toApproval(front.reviewer_approval),
      summary: (sections['Summary'] ?? '').trim(),
      notes: (sections['Notes'] ?? '').trim(),
    },
    extra,
    warnings,
  };
}
