/**
 * Pure builder for the weekly test report — the runs executed during one Mon–Sun week,
 * plus a progression matrix listing every test once with its result from each of those
 * runs (so a fix, a regression, or a still-failing test is visible at a glance).
 *
 * Like the run report, it turns a plain data model into a fully self-contained HTML
 * string with no React/NW.js/Node dependencies; base stylesheet, result metadata, and
 * the preview chrome come from `report-shared`.
 */
import type { Result } from '@/types';
import type { WeeklyData, WeeklyRunColumn, WeeklyTestRow, WeeklyTrend } from '@/utils/run-dashboard';
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

/** Everything the weekly report renders — the week's data plus repo/footer context. */
export interface WeeklyReportModel extends WeeklyData {
  repoName: string;
  /** `YYYY-MM-DD HH:MM` stamp for the footer. */
  generatedAt: string;
}

const TREND_META: Record<Exclude<WeeklyTrend, null>, { label: string; arrow: string; color: string }> = {
  improved: { label: 'Improved', arrow: '▲', color: 'var(--pass)' },
  regressed: { label: 'Regressed', arrow: '▼', color: 'var(--fail)' },
  passing: { label: 'Passing', arrow: '', color: 'var(--pass)' },
  failing: { label: 'Failing', arrow: '', color: 'var(--fail)' },
};

/** `Jun 29 – Jul 5, 2026` — the report's human week label. */
export function weekLabel(start: string, end: string): string {
  const s = fmtDate(start);
  const e = fmtDate(end);
  // Drop the start date's year when both ends share it (the common case).
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${sameYear ? s.replace(/, \d{4}$/, '') : s} – ${e}`;
}

/** The last pass/fail/blocked verdict a test reached across the week's runs, or null. */
function finalVerdict(t: WeeklyTestRow): Result | null {
  for (let i = t.results.length - 1; i >= 0; i--) {
    const r = t.results[i];
    if (r === 'pass' || r === 'fail' || r === 'blocked') return r;
  }
  return null;
}

function renderHead(m: WeeklyReportModel): string {
  const meta: Array<[string, string]> = [
    ['Repository', m.repoName || '—'],
    ['Week', weekLabel(m.weekStart, m.weekEnd)],
    ['Runs', String(m.runs.length)],
  ];
  return `
  <header class="head">
    <div class="eyebrow">Weekly test report</div>
    <h1>Week of ${esc(weekLabel(m.weekStart, m.weekEnd))}</h1>
    <dl class="meta">
      ${meta.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
    </dl>
  </header>`;
}

function renderTiles(m: WeeklyReportModel): string {
  const executed = m.runs.reduce((n, r) => n + r.executedInWeek, 0);
  const finals = m.tests.map(finalVerdict).filter((r): r is Result => r !== null);
  const passed = finals.filter((r) => r === 'pass').length;
  const tiles: Array<{ label: string; value: number; sub: string; color?: string; pct?: boolean }> = [
    { label: 'Runs', value: m.runs.length, sub: 'executed this week' },
    { label: 'Tests covered', value: m.tests.length, sub: 'listed once each' },
    { label: 'Executions', value: executed, sub: 'results recorded' },
    { label: 'Pass rate', value: pct(passed, finals.length), sub: 'of latest verdicts', color: 'var(--pass)', pct: true },
    { label: 'Improved', value: m.improved, sub: 'now passing', color: 'var(--pass)' },
    { label: 'Regressed', value: m.regressed, sub: 'were passing', color: 'var(--fail)' },
  ];
  return `
  <section class="tiles">
    ${tiles
      .map(
        (t) => `
      <div class="tile">
        <div class="tile-num" ${t.color ? `style="color:${t.color}"` : ''}>${t.value}${t.pct ? '<small class="tile-pct">%</small>' : ''}</div>
        <div class="tile-label">${esc(t.label)}</div>
        <div class="tile-sub">${esc(t.sub)}</div>
      </div>`,
      )
      .join('')}
  </section>`;
}

function renderRunRow(r: WeeklyRunColumn, i: number): string {
  const tally = SEG_ORDER.filter((res) => r.counts[res] > 0)
    .map((res) => `${r.counts[res]} ${RESULT_META[res].label.toLowerCase()}`)
    .join(' · ');
  return `
    <div class="week-run">
      <span class="week-run-col mono">R${i + 1}</span>
      <div class="week-run-title">
        <span class="week-run-name">${esc(r.name) || 'Untitled run'} ${statusBadge(r.status)}</span>
        <span class="week-run-tally">${esc(fmtDate(r.date))} · ${r.total} case${r.total === 1 ? '' : 's'}${
          tally ? ` · ${esc(tally)}` : ''
        }</span>
      </div>
      <div class="week-run-progress"><div class="bar week-run-bar">${barSegments(r.counts, false)}</div></div>
    </div>`;
}

function renderRuns(m: WeeklyReportModel): string {
  return `
  <section>
    <h2>Runs executed this week</h2>
    ${m.runs.map(renderRunRow).join('')}
  </section>`;
}

function resultCell(r: Result | null): string {
  if (r === null) return `<td class="mx-cell mx-none">—</td>`;
  const meta = RESULT_META[r];
  const label = r === 'not_run' ? 'Not run' : meta.label;
  return `<td class="mx-cell"><span class="dot" style="background:${meta.color}"></span><span style="color:${
    r === 'not_run' || r === 'skipped' ? 'var(--ink-3)' : meta.color
  }">${esc(label)}</span></td>`;
}

function trendCell(t: WeeklyTrend): string {
  if (!t) return `<td class="mx-trend mx-none">—</td>`;
  const meta = TREND_META[t];
  return `<td class="mx-trend" style="color:${meta.color}">${meta.arrow ? `${meta.arrow} ` : ''}${esc(meta.label)}</td>`;
}

function renderMatrix(m: WeeklyReportModel): string {
  const head = `
      <tr>
        <th class="mx-id">ID</th>
        <th class="mx-title">Test</th>
        ${m.runs.map((_, i) => `<th class="mx-run mono">R${i + 1}</th>`).join('')}
        <th class="mx-trend-h">Trend</th>
      </tr>`;
  const rows = m.tests
    .map(
      (t) => `
      <tr class="mx-row">
        <td class="mx-id mono">${esc(t.display_id)}</td>
        <td class="mx-title">${esc(t.title)}</td>
        ${t.results.map(resultCell).join('')}
        ${trendCell(t.trend)}
      </tr>`,
    )
    .join('');
  return `
  <section>
    <h2>Test progression</h2>
    <p class="mx-note">Each test appears once; the R columns are the week's runs in order, so reading a row
    left to right shows how that test progressed, recovered, or regressed across the week.</p>
    <table class="mx"><thead>${head}</thead><tbody>${rows}</tbody></table>
  </section>`;
}

/** Weekly-report-specific rules, appended after the shared base stylesheet. */
const WEEKLY_STYLE = `
.tile-pct{font-size:13px;font-weight:700;margin-left:1px;}

/* runs executed this week */
.week-run{display:flex;align-items:center;gap:12px;padding:7px 0;border-bottom:1px solid var(--border);break-inside:avoid;}
.week-run:last-child{border-bottom:0;}
.week-run-col{flex:0 0 auto;width:26px;font-size:11px;font-weight:700;color:var(--ink-3);}
.week-run-title{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1;}
.week-run-name{font-size:13.5px;font-weight:600;}
.week-run-tally{font-family:var(--font-mono);font-size:10.5px;color:var(--ink-faint);}
.week-run-progress{width:170px;flex:0 0 auto;}
.week-run-bar{height:9px;border-radius:5px;}
.week-run-bar .seg{min-width:0;}

/* progression matrix */
.mx-note{margin:0 0 10px;font-size:11.5px;color:var(--ink-3);}
.mx{width:100%;border-collapse:collapse;font-size:12px;}
.mx th{text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;
  color:var(--ink-faint);padding:0 8px 6px 0;border-bottom:1.5px solid var(--border-2);}
.mx-row{break-inside:avoid;}
.mx-row td{padding:6px 8px 6px 0;border-bottom:1px solid var(--border);vertical-align:top;}
.mx-row:last-child td{border-bottom:0;}
.mx-id{width:76px;white-space:nowrap;color:var(--ink-3);font-size:11px;}
.mx-title{font-weight:500;padding-right:12px;}
.mx-cell,.mx-run{white-space:nowrap;font-family:var(--font-mono);font-size:10.5px;font-weight:700;width:74px;}
.mx-cell .dot{width:8px;height:8px;margin-right:4px;vertical-align:middle;}
.mx-trend,.mx-trend-h{white-space:nowrap;text-align:right;font-size:11px;font-weight:700;width:86px;}
.mx-none{color:var(--ink-faint);font-weight:400;}
`;

/** Options for {@link buildWeeklyReportHtml}. */
export interface BuildWeeklyReportOptions {
  /** Wrap the report in the shared Save-PDF preview chrome (see run report). */
  preview?: boolean;
}

/** Build the complete, self-contained weekly report HTML document. */
export function buildWeeklyReportHtml(model: WeeklyReportModel, opts: BuildWeeklyReportOptions = {}): string {
  const preview = opts.preview ?? false;
  const style = REPORT_STYLE + WEEKLY_STYLE;
  const title = `Weekly test report — ${weekLabel(model.weekStart, model.weekEnd)}`;
  const empty = model.runs.length === 0;
  const body = empty
    ? `<div class="empty">No runs were executed this week.</div>`
    : [renderTiles(model), renderRuns(model), renderMatrix(model)].join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>${preview ? style + PREVIEW_STYLE : style}</style>
</head>
<body${preview ? ' class="cw-preview"' : ''}>
${preview ? renderToolbar() : ''}
<div class="report">
${renderHead(model)}
${body}
<div class="footer">Generated by Casewright · ${esc(fmtStamp(model.generatedAt))}</div>
</div>
${preview ? renderPreviewScript(`Weekly report ${model.weekStart}`) : ''}
</body>
</html>`;
}
