/**
 * Pure builder for a single test run's PDF report — turns a plain data model into a
 * fully self-contained HTML string (one inline `<style>`, no external assets, no JS).
 *
 * It stays free of React, NW.js, and Node so it can be unit-tested directly and so the
 * hidden print window renders it identically without the app's Vite/Tailwind pipeline.
 * The base stylesheet, result metadata, and preview chrome are shared with the weekly
 * report via `report-shared`.
 */
import type { RunSummary, RunSummaryEntry } from '@/utils/run-items';
import type { Approval, Result } from '@/types';
import {
  PREVIEW_STYLE,
  REPORT_STYLE,
  RESULT_META,
  SEG_ORDER,
  barSegments,
  esc,
  fmtDate,
  fmtStamp,
  pct,
  renderPreviewScript,
  renderToolbar,
  statusBadge,
} from './report-shared';

/** One test case that ran under a suite, for the breakdown roster. */
export interface ReportCaseRow {
  display_id: string;
  title: string;
  result: Result;
}

/** One suite in the test breakdown: its result distribution plus the roster of cases. */
export interface ReportSuiteRow {
  name: string;
  total: number;
  /** Per-result counts, for the suite's distribution bar and tally. */
  counts: Record<Result, number>;
  /** Every case that ran under this suite, in run order. */
  cases: ReportCaseRow[];
}

/** Everything the report renders — assembled by the orchestrator, consumed purely here. */
export interface RunReportModel {
  runName: string;
  status: 'open' | 'closed';
  created: string;
  testDate: string;
  repoName: string;
  /** `YYYY-MM-DD HH:MM` stamp for the footer. */
  generatedAt: string;
  summary: RunSummary;
  suites: ReportSuiteRow[];
  /** Run-level notes prose — only rendered in the preview's optional "Include notes" mode. */
  notes: string;
  testerApproval: Approval | null;
  reviewerApproval: Approval | null;
}

/** A "completed" test reached a pass or fail verdict — blocked / skipped / not-run did not.
 *  Progress and pass rate are measured against this, not against everything-but-not-run. */
const completedCount = (counts: Record<Result, number>): number => counts.pass + counts.fail;

function renderHead(m: RunReportModel): string {
  // No "Workspace" (a run can span workspaces) and no "Scope". The generated stamp lives
  // only in the footer now, not duplicated here.
  const meta: Array<[string, string]> = [
    ['Repository', m.repoName || '—'],
    ['Created', fmtDate(m.created) || '—'],
    ['Test date', fmtDate(m.testDate) || '—'],
  ];
  return `
  <header class="head">
    <div class="eyebrow">Test run report</div>
    <h1>${esc(m.runName) || 'Untitled run'} ${statusBadge(m.status)}</h1>
    <dl class="meta">
      ${meta.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
    </dl>
  </header>`;
}

function renderTiles(m: RunReportModel): string {
  const { counts, total } = m.summary;
  const done = completedCount(counts); // pass + fail — the only "completed" tests
  const tiles: Array<{ label: string; value: number; sub: string; color?: string }> = [
    { label: 'Total cases', value: total, sub: `${m.suites.length} suite${m.suites.length === 1 ? '' : 's'}` },
    { label: 'Completed', value: done, sub: `${pct(done, total)}% of plan` },
    { label: 'Passed', value: counts.pass, sub: `${pct(counts.pass, done)}% pass rate`, color: 'var(--pass)' },
    { label: 'Failed', value: counts.fail, sub: `${pct(counts.fail, done)}% of completed`, color: 'var(--fail)' },
    { label: 'Blocked', value: counts.blocked, sub: counts.blocked ? 'not completed' : 'none', color: 'var(--blocked)' },
    { label: 'Not run', value: counts.not_run, sub: `${pct(counts.not_run, total)}% remaining` },
  ];
  return `
  <section class="tiles">
    ${tiles
      .map(
        (t) => `
      <div class="tile">
        <div class="tile-num" ${t.color ? `style="color:${t.color}"` : ''}>${t.value}</div>
        <div class="tile-label">${esc(t.label)}</div>
        <div class="tile-sub">${esc(t.sub)}</div>
      </div>`,
      )
      .join('')}
  </section>`;
}

function renderBar(m: RunReportModel): string {
  const { counts, total } = m.summary;
  const completion = pct(completedCount(counts), total); // share of the plan run to a verdict
  const legend = SEG_ORDER.filter((r) => counts[r] > 0)
    .map(
      (r) =>
        `<span class="chip"><span class="dot" style="background:${RESULT_META[r].color}"></span><b>${counts[r]}</b> ${esc(
          RESULT_META[r].label,
        )}</span>`,
    )
    .join('');
  return `
  <section class="bar-block">
    <div class="bar-head">
      <h2>Overall progress</h2>
      <span class="bar-pct" style="color:var(--accent)">${completion}% <small>complete</small></span>
    </div>
    <div class="bar">${barSegments(counts, true)}</div>
    <div class="legend">${legend}</div>
  </section>`;
}

function renderCaseRow(c: ReportCaseRow): string {
  const meta = RESULT_META[c.result];
  return `
        <tr class="case-row">
          <td class="case-id mono">${esc(c.display_id)}</td>
          <td class="case-title">${esc(c.title)}</td>
          <td class="case-result"><span class="dot" style="background:${meta.color}"></span><span style="color:${
            meta.color
          }">${esc(meta.label)}</span></td>
        </tr>`;
}

function renderSuiteGroup(s: ReportSuiteRow): string {
  const tally = SEG_ORDER.filter((r) => s.counts[r] > 0)
    .map((r) => `${s.counts[r]} ${RESULT_META[r].label.toLowerCase()}`)
    .join(' · ');
  return `
    <div class="suite-group">
      <div class="suite-group-head">
        <div class="suite-group-title">
          <span class="suite-group-name">${esc(s.name)}</span>
          <span class="suite-group-tally">${s.total} case${s.total === 1 ? '' : 's'}${
            tally ? ` · ${esc(tally)}` : ''
          }</span>
        </div>
        <div class="suite-group-progress"><div class="bar suite-bar">${barSegments(s.counts, false)}</div></div>
      </div>
      <table class="case-table"><tbody>${s.cases.map(renderCaseRow).join('')}</tbody></table>
    </div>`;
}

function renderSuiteBreakdown(suites: ReportSuiteRow[]): string {
  if (!suites.length) return '';
  return `
  <section>
    <h2>Test breakdown</h2>
    ${suites.map(renderSuiteGroup).join('')}
  </section>`;
}

function renderPassed(entries: RunSummaryEntry[]): string {
  if (!entries.length) return '';
  const items = entries
    .map(
      (e) =>
        `<li><span class="mono passed-id">${esc(e.display_id)}</span><span class="passed-title">${esc(e.title)}</span></li>`,
    )
    .join('');
  return `<section><h2>Passed (${entries.length})</h2><ul class="passed">${items}</ul></section>`;
}

/** Every case with something worth telling the dev team: failed items and/or recorded notes. */
function notesEntries(m: RunReportModel): RunSummaryEntry[] {
  return [...m.summary.attention, ...m.summary.passed, ...m.summary.remaining].filter(
    (e) => e.notes || e.failures.length > 0,
  );
}

/** True when the report has any notes content the preview's "Include notes" toggle could add. */
export function hasNotesContent(m: RunReportModel): boolean {
  return !!m.notes.trim() || notesEntries(m).length > 0;
}

/**
 * The comprehensive-notes sections (run notes + per-case notes and failure detail, for
 * sharing with dev teams). Emitted only into the preview document, hidden until the
 * toolbar's "Include notes" checkbox adds `cw-with-notes` to the body — so the default
 * report (and the default-saved PDF) stays the concise version.
 */
function renderNotesSections(m: RunReportModel): string {
  const runNotes = m.notes.trim();
  const entries = notesEntries(m);
  if (!runNotes && !entries.length) return '';
  const cases = entries
    .map(
      (e) => `
      <div class="note-case">
        <div class="note-case-head">
          <span class="dot" style="background:${RESULT_META[e.result].color}"></span>
          <span class="mono note-case-id">${esc(e.display_id)}</span>
          <span class="note-case-title">${esc(e.title)}</span>
          <span class="note-case-result" style="color:${RESULT_META[e.result].color}">${esc(RESULT_META[e.result].label)}</span>
        </div>
        ${
          e.failures.length
            ? `<ul class="note-fails">${e.failures
                .map((f) => `<li>${esc(f.text)}${f.note ? `<span class="note-fail-note"> — ${esc(f.note)}</span>` : ''}</li>`)
                .join('')}</ul>`
            : ''
        }
        ${e.notes ? `<div class="note-prose">${esc(e.notes)}</div>` : ''}
      </div>`,
    )
    .join('');
  return `
  <section class="notes-block">
    <h2>Test run notes</h2>
    ${runNotes ? `<div class="note-prose note-run">${esc(runNotes)}</div>` : ''}
    ${entries.length ? `<div class="notes-sub">Case notes &amp; failures (${entries.length})</div>${cases}` : ''}
  </section>`;
}

function renderApprovalCard(label: string, a: Approval | null): string {
  const body = a
    ? `<div class="approved"><span class="approver">${esc(a.name)}</span><span class="mono approved-at">${esc(
        fmtStamp(a.at),
      )}</span></div>`
    : `<div class="awaiting">Awaiting sign-off</div>`;
  return `
    <div class="signoff-card">
      <div class="signoff-label">${esc(label)}</div>
      ${body}
    </div>`;
}

function renderSignoff(m: RunReportModel): string {
  return `
  <section>
    <h2>Sign-off</h2>
    <div class="signoff">
      ${renderApprovalCard('Tester', m.testerApproval)}
      ${renderApprovalCard('Reviewer', m.reviewerApproval)}
    </div>
  </section>`;
}

/** Run-report-specific rules, appended after the shared base stylesheet. */
const RUN_STYLE = `
/* test breakdown — one group per suite, then every case that ran under it */
.suite-group{margin-bottom:18px;break-inside:avoid;}
.suite-group-head{display:flex;align-items:center;gap:14px;padding:6px 0 8px;border-bottom:1.5px solid var(--border-2);}
.suite-group-title{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1;}
.suite-group-name{font-size:14.5px;font-weight:600;}
.suite-group-tally{font-family:var(--font-mono);font-size:10.5px;color:var(--ink-faint);}
.suite-group-progress{width:170px;flex:0 0 auto;}
/* Same segmented color coding as the overall bar, just smaller and without numbers. */
.suite-bar{height:9px;border-radius:5px;}
.suite-bar .seg{min-width:0;}
.case-table{width:100%;border-collapse:collapse;font-size:12.5px;}
.case-row{break-inside:avoid;}
.case-row td{padding:6px 0;border-bottom:1px solid var(--border);vertical-align:top;}
.case-row:last-child td{border-bottom:0;}
.case-id{width:88px;white-space:nowrap;color:var(--ink-3);font-size:11px;}
.case-title{font-weight:500;padding-right:12px;}
.case-result{width:92px;white-space:nowrap;text-align:right;font-family:var(--font-mono);font-size:11px;font-weight:700;}
.case-result .dot{margin-right:4px;vertical-align:middle;}

/* passed list */
.passed{list-style:none;margin:0;padding:0;columns:2;column-gap:24px;}
.passed li{display:flex;align-items:baseline;gap:8px;font-size:12px;color:var(--ink-2);margin-bottom:3px;break-inside:avoid;}
.passed-id{font-size:10.5px;color:var(--ink-faint);flex:0 0 auto;}
.passed-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

/* comprehensive notes — present only in the preview document, shown only when the
   toolbar's "Include notes" checkbox sets cw-with-notes on the body */
.notes-block{display:none;}
body.cw-with-notes .notes-block{display:block;}
.note-prose{white-space:pre-wrap;font-size:12.5px;color:var(--ink-2);}
.note-run{margin-bottom:4px;}
.notes-sub{margin:14px 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--ink-2);}
.note-case{border:1px solid var(--border);border-radius:9px;padding:10px 12px;margin-bottom:8px;break-inside:avoid;}
.note-case-head{display:flex;align-items:center;gap:8px;}
.note-case-id{font-size:10.5px;color:var(--ink-3);flex:0 0 auto;}
.note-case-title{font-size:13px;font-weight:600;min-width:0;flex:1;}
.note-case-result{font-family:var(--font-mono);font-size:11px;font-weight:700;flex:0 0 auto;}
.note-fails{margin:8px 0 0;padding-left:18px;font-size:12px;color:var(--ink-2);}
.note-fails li{margin-bottom:3px;}
.note-fail-note{color:var(--ink-3);}
.note-case .note-prose{margin-top:8px;}

/* sign-off */
.signoff{display:flex;gap:14px;flex-wrap:wrap;}
.signoff-card{flex:1;min-width:200px;border:1px solid var(--border);border-radius:9px;padding:14px;break-inside:avoid;}
.signoff-label{font-size:10.5px;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-faint);}
.approved{margin-top:10px;display:flex;align-items:baseline;gap:10px;}
.approver{font-size:15px;font-weight:700;}
.approved-at{font-size:11.5px;color:var(--ink-faint);}
.awaiting{margin-top:10px;font-size:13px;font-style:italic;color:var(--ink-3);}
`;

/** Options for {@link buildRunReportHtml}. */
export interface BuildReportOptions {
  /**
   * Wrap the report in preview chrome: a sticky toolbar whose "Save PDF" button prints the
   * window to a user-picked PDF (the toolbar hides itself when printing). Adds an inline
   * script — only emitted in this mode, so the plain report stays script-free.
   */
  preview?: boolean;
}

/** Build the complete, self-contained report HTML document for one run. */
export function buildRunReportHtml(model: RunReportModel, opts: BuildReportOptions = {}): string {
  const preview = opts.preview ?? false;
  const empty = model.summary.total === 0;
  const style = REPORT_STYLE + RUN_STYLE;
  // Notes ride along only in the preview document (hidden until toggled on), so the plain
  // report — and any PDF saved with the box unchecked — stays the concise version.
  const withNotes = preview && hasNotesContent(model);
  const body = empty
    ? `<div class="empty">No cases in this run.</div>`
    : [
        renderTiles(model),
        renderBar(model),
        renderSuiteBreakdown(model.suites),
        renderPassed(model.summary.passed),
        withNotes ? renderNotesSections(model) : '',
      ].join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(model.runName)} — Test run report</title>
<style>${preview ? style + PREVIEW_STYLE : style}</style>
</head>
<body${preview ? ' class="cw-preview"' : ''}>
${preview ? renderToolbar({ notesToggle: withNotes }) : ''}
<div class="report">
${renderHead(model)}
${body}
${renderSignoff(model)}
<div class="footer">Generated by Casewright · ${esc(fmtStamp(model.generatedAt))}</div>
</div>
${preview ? renderPreviewScript(model.runName) : ''}
</body>
</html>`;
}
