import { describe, expect, it } from 'vitest';
import type { Result } from '@/types';
import type { WeeklyData } from '@/utils/run-dashboard';
import { buildWeeklyReportHtml, weekLabel, type WeeklyReportModel } from './weekly-report-html';

const counts = (over: Partial<Record<Result, number>> = {}): Record<Result, number> => ({
  pass: 0,
  fail: 0,
  blocked: 0,
  in_progress: 0,
  skipped: 0,
  not_run: 0,
  ...over,
});

const data: WeeklyData = {
  weekStart: '2026-06-29',
  weekEnd: '2026-07-05',
  runs: [
    {
      runId: 'rA',
      name: 'Smoke Mon',
      date: '2026-06-29',
      status: 'closed',
      total: 2,
      executedInWeek: 2,
      counts: counts({ pass: 1, fail: 1 }),
    },
    {
      runId: 'rB',
      name: 'Smoke Thu',
      date: '2026-07-02',
      status: 'open',
      total: 2,
      executedInWeek: 1,
      counts: counts({ pass: 1, not_run: 1 }),
    },
  ],
  tests: [
    { case_id: 'c1', display_id: 'CW-0001', title: 'Login', results: ['fail', 'pass'], trend: 'improved' },
    { case_id: 'c2', display_id: 'CW-0002', title: 'Reset & <verify>', results: ['pass', null], trend: 'passing' },
    { case_id: 'c3', display_id: 'CW-0003', title: 'Export', results: [null, 'not_run'], trend: null },
  ],
  improved: 1,
  regressed: 0,
};

function buildModel(overrides: Partial<WeeklyReportModel> = {}): WeeklyReportModel {
  return { ...data, repoName: 'casewright', generatedAt: '2026-07-03 09:30', ...overrides };
}

describe('weekLabel', () => {
  it('drops the start year when both ends share it', () => {
    expect(weekLabel('2026-06-29', '2026-07-05')).toBe('Jun 29 – Jul 5, 2026');
  });

  it('keeps both years across a year boundary', () => {
    expect(weekLabel('2026-12-28', '2027-01-03')).toBe('Dec 28, 2026 – Jan 3, 2027');
  });
});

describe('buildWeeklyReportHtml', () => {
  it('emits a self-contained HTML document with no scripts or external assets', () => {
    const html = buildWeeklyReportHtml(buildModel());
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<style>');
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/<link\b/);
  });

  it('renders the week header and metadata in readable form', () => {
    const html = buildWeeklyReportHtml(buildModel());
    expect(html).toContain('Weekly test report');
    expect(html).toContain('Week of Jun 29 – Jul 5, 2026');
    expect(html).toContain('casewright');
    expect(html).not.toContain('2026-06-29'); // raw ISO never shown
  });

  it('lists the runs executed this week with column keys, dates, and status', () => {
    const html = buildWeeklyReportHtml(buildModel());
    expect(html).toContain('Runs executed this week');
    expect(html).toContain('Smoke Mon');
    expect(html).toContain('Smoke Thu');
    expect(html).toContain('Jun 29, 2026');
    expect(html).toContain('>R1<');
    expect(html).toContain('>R2<');
    expect(html).toContain('badge-closed');
    expect(html).toContain('badge-open');
  });

  it('renders each test once with a per-run result cell and a trend', () => {
    const html = buildWeeklyReportHtml(buildModel());
    expect(html).toContain('Test progression');
    expect((html.match(/CW-0001/g) ?? []).length).toBe(1); // listed once
    expect(html).toContain('▲ Improved');
    expect(html).toContain('Passing');
    expect(html).toContain('Not run'); // in-run but unexecuted cell
    expect(html).toContain('mx-none'); // absent-from-run cell placeholder
  });

  it('computes the tiles: pass rate from latest verdicts, improved / regressed counts', () => {
    const html = buildWeeklyReportHtml(buildModel());
    // Latest verdicts: c1 pass, c2 pass, c3 none → 100% of 2.
    expect(html).toContain('>100<small class="tile-pct">%</small>');
    expect(html).toContain('Improved');
    expect(html).toContain('Regressed');
  });

  it('HTML-escapes free text (test titles, run names)', () => {
    const html = buildWeeklyReportHtml(buildModel());
    expect(html).not.toContain('Reset & <verify>');
    expect(html).toContain('Reset &amp; &lt;verify&gt;');
  });

  it('shows an empty-state note when nothing ran this week', () => {
    const html = buildWeeklyReportHtml(buildModel({ runs: [], tests: [], improved: 0, regressed: 0 }));
    expect(html).toContain('No runs were executed this week.');
    expect(html).not.toContain('Test progression');
  });

  it('adds the Save-PDF toolbar and script only in preview mode', () => {
    const plain = buildWeeklyReportHtml(buildModel());
    expect(plain).not.toContain('cw-toolbar');

    const preview = buildWeeklyReportHtml(buildModel(), { preview: true });
    expect(preview).toContain('class="cw-preview"');
    expect(preview).toContain('id="cw-save"');
    expect(preview).toContain('<script');
    expect(preview).toContain('"Weekly report 2026-06-29.pdf"'); // default filename
  });
});
