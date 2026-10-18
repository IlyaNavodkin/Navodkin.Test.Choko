import type { Case, Result, Run, RunRow } from '@/types';
import { numberSteps } from '@/utils/steps';
import { resolveVariables } from '@/utils/variables';

/** One checklist row in the run guide — positional `key`, display `text`, optional number/indent. */
export interface ChecklistItem {
  key: string;
  text: string;
  num?: string;
  depth?: number;
  /** Optional secondary detail shown under the row (e.g. a setup item's markdown body). */
  body?: string;
}

export interface DerivedItems {
  setup: ChecklistItem[];
  steps: ChecklistItem[];
  accept: ChecklistItem[];
}

/**
 * Derive the run checklist from a live case — the single source of truth for item
 * keys/text shared by the guide UI and the per-case sidecar writer. Keys are
 * positional (`setup:i` / `step:i` / `accept:i`), matching the sidecar encoding.
 */
export function deriveItems(kase: Case | undefined): DerivedItems {
  if (!kase) return { setup: [], steps: [], accept: [] };
  const stepNums = numberSteps(kase.steps);
  return {
    setup: kase.setup.map((s, i) => ({ key: `setup:${i}`, text: s.name, body: s.body })),
    steps: kase.steps.map((s, i) => ({ key: `step:${i}`, text: s.text, num: stepNums[i], depth: s.depth })),
    accept: kase.expected.map((t, i) => ({ key: `accept:${i}`, text: t })),
  };
}

/** The test date a run row resolves `{{today}}` against: its own override, else the run's. */
export function effectiveTestDate(run: Run, row: RunRow): string {
  return row.testDate || run.testDate || run.created;
}

const RESULT_LABEL: Record<Result, string> = {
  pass: 'Pass',
  fail: 'Fail',
  blocked: 'Blocked',
  in_progress: 'In progress',
  skipped: 'Skipped',
  not_run: 'Not run',
};

/** A failed checklist item, resolved to its display text and (optional) failure note. */
export interface Failure {
  text: string;
  note: string;
}

/** Canonical checklist key order for a row (setup→steps→accept, then any orphan keys) + labels. */
function rowItemOrder(row: RunRow, kase: Case | undefined): { order: string[]; label: Record<string, string> } {
  const label: Record<string, string> = {};
  const order: string[] = [];
  const { setup, steps, accept } = deriveItems(kase);
  [...setup, ...steps, ...accept].forEach((it) => {
    label[it.key] = (it.num ? `${it.num}. ` : '') + it.text;
    order.push(it.key);
  });
  for (const k of Object.keys(row.checks)) if (!order.includes(k)) order.push(k);
  return { order, label };
}

/**
 * The checklist items a row marked `fail`, in canonical order, with each item's display
 * text resolved from the live case (falling back to the snapshot `itemText` when it's gone).
 */
export function rowFailures(row: RunRow, kase: Case | undefined): Failure[] {
  const { order, label } = rowItemOrder(row, kase);
  return order
    .filter((k) => row.checks[k] === 'fail')
    .map((k) => ({ text: label[k] ?? row.itemText?.[k] ?? k, note: (row.failNotes[k] ?? '').trim() }));
}

/**
 * Build a copy-pasteable defect report for a non-passing case: title, objective,
 * a reference back to the run, and every checklist item marked `fail` with its
 * failure description. Falls back to the snapshot `itemText` when the live case is gone.
 */
export function buildDefectText(run: Run, row: RunRow, kase: Case | undefined): string {
  const td = effectiveTestDate(run, row);
  const lines: string[] = [`# ${row.display_id} — ${resolveVariables(row.title, td)}`];
  if (kase?.objective.trim()) lines.push('', `**Objective:** ${resolveVariables(kase.objective.trim(), td)}`);
  lines.push('', `**Run:** ${run.name}`);
  lines.push(`**Result:** ${RESULT_LABEL[row.result]} · Tester: ${row.tester || '—'} · ${row.executed_at || '—'}`);

  const { setup, steps, accept } = deriveItems(kase);

  if (steps.length) {
    // Steps to reproduce: the case's steps at their real indentation (2 spaces per depth level), up
    // to and including the last one that failed — the lead-up — with each failure flagged inline.
    const lastFail = steps.reduce((last, it, i) => (row.checks[it.key] === 'fail' ? i : last), -1);
    if (lastFail >= 0) {
      lines.push('', '## Steps to reproduce');
      for (let i = 0; i <= lastFail; i++) {
        const it = steps[i];
        const note = row.checks[it.key] === 'fail' ? (row.failNotes[it.key] ?? '').trim() : null;
        const mark = note === null ? '' : `  ✗${note ? ` ${note}` : ''}`;
        lines.push(`${'  '.repeat(it.depth ?? 0)}${it.num ?? '-'}. ${resolveVariables(it.text, td)}${mark}`);
      }
    }
    // Failed preconditions / acceptance criteria live outside the ordered step sequence.
    for (const [label, group] of [
      ['Failed setup', setup],
      ['Failed acceptance criteria', accept],
    ] as const) {
      const failed = group.filter((it) => row.checks[it.key] === 'fail');
      if (!failed.length) continue;
      lines.push('', `## ${label}`);
      for (const it of failed) {
        const note = (row.failNotes[it.key] ?? '').trim();
        lines.push(`- ${resolveVariables(it.text, td)}${note ? ` — ${note}` : ''}`);
      }
    }
  } else {
    // Live case is gone — no step order/indentation to recover, so fall back to a flat list of the
    // failed items using the text snapshotted at record time.
    const failed = rowFailures(row, kase);
    if (failed.length) {
      lines.push('', '## Failed items');
      for (const f of failed) lines.push(`- ${resolveVariables(f.text, td)}${f.note ? ` — ${f.note}` : ''}`);
    }
  }

  if (row.notes.trim()) lines.push('', '## Notes', row.notes.trim());
  return lines.join('\n');
}

/** One row's place in the generated run summary. */
export interface RunSummaryEntry {
  case_id: string;
  display_id: string;
  title: string;
  result: Result;
  /** Failed checklist items with their notes — populated for non-passing rows. */
  failures: Failure[];
  /** The free-text note recorded against the row, if any. */
  notes: string;
}

/** A run's results, bucketed for display. `executed` excludes only `not_run` (matches the header pass-rate). */
export interface RunSummary {
  total: number;
  executed: number;
  passRate: number;
  counts: Record<Result, number>;
  /** result === 'pass'. */
  passed: RunSummaryEntry[];
  /** fail | blocked — shown with extra detail. */
  attention: RunSummaryEntry[];
  /** in_progress | skipped | not_run. */
  remaining: RunSummaryEntry[];
}

/**
 * Generate a run's summary from its recorded results — the derived source of truth for the
 * run-details view and the `_run.md` `## Summary` section (never hand-edited). Failed/blocked
 * cases carry their failed steps + notes so the summary is actionable on its own.
 */
export function buildRunSummary(run: Run, cases: Case[]): RunSummary {
  const byId = new Map(cases.map((c) => [c.id, c] as const));
  const counts: Record<Result, number> = { pass: 0, fail: 0, blocked: 0, in_progress: 0, skipped: 0, not_run: 0 };
  const passed: RunSummaryEntry[] = [];
  const attention: RunSummaryEntry[] = [];
  const remaining: RunSummaryEntry[] = [];

  for (const row of run.rows) {
    counts[row.result] += 1;
    const td = effectiveTestDate(run, row);
    const entry: RunSummaryEntry = {
      case_id: row.case_id,
      display_id: row.display_id,
      title: resolveVariables(row.title, td),
      result: row.result,
      failures:
        row.result === 'pass'
          ? []
          : rowFailures(row, byId.get(row.case_id)).map((f) => ({ text: resolveVariables(f.text, td), note: f.note })),
      notes: row.notes.trim(),
    };
    if (row.result === 'pass') passed.push(entry);
    else if (row.result === 'fail' || row.result === 'blocked') attention.push(entry);
    else remaining.push(entry);
  }

  const total = run.rows.length;
  const executed = total - counts.not_run;
  const passRate = executed ? Math.round((counts.pass / executed) * 100) : 0;
  return { total, executed, passRate, counts, passed, attention, remaining };
}

const SUMMARY_ORDER: Result[] = ['pass', 'fail', 'blocked', 'in_progress', 'skipped', 'not_run'];

/** Render a generated run summary as markdown for the `_run.md` `## Summary` section. */
export function serializeRunSummary(s: RunSummary): string {
  if (s.total === 0) return '';
  const tally = SUMMARY_ORDER.filter((r) => s.counts[r] > 0)
    .map((r) => `${s.counts[r]} ${RESULT_LABEL[r].toLowerCase()}`)
    .join(' · ');
  const lines = [
    `**${s.passRate}% pass rate** — ${s.counts.pass}/${s.executed} executed ${s.executed === 1 ? 'case' : 'cases'} passed.`,
    '',
    tally,
  ];
  if (s.attention.length) {
    lines.push('', '### Needs attention');
    for (const e of s.attention) {
      lines.push('', `**${e.display_id} — ${e.title}** · ${RESULT_LABEL[e.result]}`);
      for (const f of e.failures) lines.push(`- ${f.text}${f.note ? ` — ${f.note}` : ''}`);
      if (e.notes) lines.push(`Notes: ${e.notes}`);
    }
  }
  return lines.join('\n');
}
