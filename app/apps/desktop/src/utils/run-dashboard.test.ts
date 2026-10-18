import { describe, expect, it } from 'vitest';
import type { Result, Run, RunRow } from '@/types';
import { activityWeeks, buildWeeklyData, dashboardStats, executionsByDay, weekRange } from './run-dashboard';

// Friday July 3, 2026 — its Mon–Sun week is Jun 29 → Jul 5.
const NOW = new Date(2026, 6, 3);

const row = (result: Result, executed_at: string, case_id = 'c1', display_id = 'CW-0001', title = ''): RunRow => ({
  case_id,
  display_id,
  title,
  result,
  tester: '',
  executed_at,
  notes: '',
  checks: {},
  failNotes: {},
  itemText: {},
  file: '',
});

const mkRun = (over: Partial<Run>): Run => ({
  id: 'r1',
  name: 'Run',
  file: '.casewright/runs/r1',
  created: '2026-07-01',
  testDate: '2026-07-01',
  status: 'open',
  scope: '',
  rows: [],
  summary: '',
  notes: '',
  testerApproval: null,
  reviewerApproval: null,
  ...over,
});

describe('weekRange', () => {
  it('spans Monday to Sunday of the week containing now', () => {
    expect(weekRange(NOW)).toEqual({ start: '2026-06-29', end: '2026-07-05' });
  });

  it('treats Sunday as the end of the previous Monday-start week', () => {
    expect(weekRange(new Date(2026, 6, 5))).toEqual({ start: '2026-06-29', end: '2026-07-05' });
    expect(weekRange(new Date(2026, 6, 6))).toEqual({ start: '2026-07-06', end: '2026-07-12' });
  });
});

describe('executionsByDay', () => {
  it('tallies rows by their executed_at day, skipping unstamped and not-run rows', () => {
    const runs = [
      mkRun({
        rows: [
          row('pass', '2026-07-01 09:00'),
          row('fail', '2026-07-01 10:30', 'c2'),
          row('pass', '2026-07-02 11:00', 'c3'),
          row('not_run', '', 'c4'),
          row('pass', '', 'c5'), // verdict but no stamp — nothing to place on a day
        ],
      }),
    ];
    const days = executionsByDay(runs);
    expect(days.get('2026-07-01')).toMatchObject({ pass: 1, fail: 1 });
    expect(days.get('2026-07-02')).toMatchObject({ pass: 1 });
    expect(days.size).toBe(2);
  });
});

describe('activityWeeks', () => {
  it('returns the requested number of Monday-first weeks ending in the current week', () => {
    const weeks = activityWeeks([], 4, NOW);
    expect(weeks).toHaveLength(4);
    expect(weeks[0].days[0].date).toBe('2026-06-08');
    expect(weeks[3].days[0].date).toBe('2026-06-29');
    expect(weeks[3].days[6].date).toBe('2026-07-05');
  });

  it('marks days after now as future', () => {
    const days = activityWeeks([], 1, NOW)[0].days;
    expect(days.map((d) => d.future)).toEqual([false, false, false, false, false, true, true]);
  });

  it('colors a day by its worst result and scales level to the busiest day', () => {
    const runs = [
      mkRun({
        rows: [
          row('pass', '2026-07-01 09:00'),
          row('pass', '2026-07-01 09:10', 'c2'),
          row('pass', '2026-07-01 09:20', 'c3'),
          row('pass', '2026-07-02 09:00', 'c4'),
          row('fail', '2026-07-02 09:10', 'c5'),
          row('blocked', '2026-06-30 09:00', 'c6'),
        ],
      }),
    ];
    const days = activityWeeks(runs, 1, NOW)[0].days;
    const byDate = new Map(days.map((d) => [d.date, d]));
    expect(byDate.get('2026-07-01')).toMatchObject({ status: 'pass', total: 3, level: 3 });
    expect(byDate.get('2026-07-02')).toMatchObject({ status: 'fail', total: 2, level: 2 });
    expect(byDate.get('2026-06-30')).toMatchObject({ status: 'blocked', total: 1, level: 1 });
    expect(byDate.get('2026-06-29')).toMatchObject({ status: null, total: 0, level: 0 });
  });

  it('counts in_progress toward a day’s activity total and colors the day', () => {
    const days = activityWeeks([mkRun({ rows: [row('in_progress', '2026-07-01 09:00')] })], 1, NOW)[0].days;
    expect(days.find((d) => d.date === '2026-07-01')).toMatchObject({ status: 'in_progress', total: 1, level: 3 });
  });

  it('labels the first week and each week that starts a new month', () => {
    const weeks = activityWeeks([], 4, NOW);
    // Mondays: Jun 8, Jun 15, Jun 22, Jun 29 — only the first carries a label.
    expect(weeks.map((w) => w.monthLabel)).toEqual(['Jun', undefined, undefined, undefined]);
    const withJuly = activityWeeks([], 4, new Date(2026, 6, 10)); // Mondays Jun 15 … Jul 6
    expect(withJuly.map((w) => w.monthLabel)).toEqual(['Jun', undefined, undefined, 'Jul']);
  });
});

describe('dashboardStats', () => {
  it('scopes counts, pass rate, and run count to the current week', () => {
    const runs = [
      mkRun({
        id: 'r1',
        rows: [
          row('pass', '2026-06-29 09:00'),
          row('fail', '2026-07-01 09:00', 'c2'),
          row('blocked', '2026-07-02 09:00', 'c3'),
          row('pass', '2026-06-20 09:00', 'c4'), // previous week — excluded
        ],
      }),
      mkRun({ id: 'r2', status: 'closed', rows: [row('pass', '2026-07-03 09:00')] }),
      mkRun({ id: 'r3', rows: [row('not_run', '')] }), // open, but nothing executed this week
    ];
    const s = dashboardStats(runs, NOW);
    expect(s.runsThisWeek).toBe(2);
    expect(s.openRuns).toBe(2);
    expect(s.executedThisWeek).toBe(4);
    expect(s.counts).toMatchObject({ pass: 2, fail: 1, blocked: 1 });
    expect(s.passRate).toBe(50);
    expect(s.attention).toBe(2);
  });

  it('counts in_progress executions in the weekly total and pass-rate denominator', () => {
    const s = dashboardStats(
      [mkRun({ rows: [row('pass', '2026-07-01 09:00'), row('in_progress', '2026-07-02 09:00', 'c2')] })],
      NOW,
    );
    expect(s.counts.in_progress).toBe(1);
    expect(s.executedThisWeek).toBe(2); // in_progress counts as executed
    expect(s.passRate).toBe(50); // 1 pass / 2 executed — denominator must include in_progress
  });

  it('reports zeros for an idle week', () => {
    const s = dashboardStats([mkRun({ rows: [row('pass', '2026-06-01 09:00')] })], NOW);
    expect(s).toMatchObject({ runsThisWeek: 0, executedThisWeek: 0, passRate: 0, attention: 0 });
  });
});

describe('buildWeeklyData', () => {
  const monday = mkRun({
    id: 'rA',
    name: 'Smoke Mon',
    created: '2026-06-29',
    testDate: '2026-06-29',
    rows: [
      row('fail', '2026-06-29 09:00', 'c1', 'CW-0001', 'Login'),
      row('pass', '2026-06-29 09:10', 'c2', 'CW-0002', 'Reset'),
      row('pass', '2026-06-29 09:20', 'c3', 'CW-0003', 'Refund'),
    ],
  });
  const thursday = mkRun({
    id: 'rB',
    name: 'Smoke Thu',
    created: '2026-07-02',
    testDate: '2026-07-02',
    rows: [
      row('pass', '2026-07-02 14:00', 'c1', 'CW-0001', 'Login'), // fail → pass: improved
      row('fail', '2026-07-02 14:10', 'c2', 'CW-0002', 'Reset'), // pass → fail: regressed
      row('not_run', '', 'c4', 'CW-0004', 'Export'),
    ],
  });
  const stale = mkRun({ id: 'rC', name: 'Old', created: '2026-06-10', rows: [row('pass', '2026-06-10 09:00')] });

  it('includes only runs executed this week, oldest first', () => {
    const data = buildWeeklyData([thursday, stale, monday], NOW);
    expect(data.weekStart).toBe('2026-06-29');
    expect(data.weekEnd).toBe('2026-07-05');
    expect(data.runs.map((r) => r.runId)).toEqual(['rA', 'rB']);
    expect(data.runs[1]).toMatchObject({ total: 3, executedInWeek: 2 });
  });

  it('lists each test once with its per-run results and trend', () => {
    const data = buildWeeklyData([thursday, monday], NOW);
    expect(data.tests.map((t) => t.display_id)).toEqual(['CW-0001', 'CW-0002', 'CW-0003', 'CW-0004']);
    const byId = new Map(data.tests.map((t) => [t.display_id, t]));
    expect(byId.get('CW-0001')).toMatchObject({ results: ['fail', 'pass'], trend: 'improved' });
    expect(byId.get('CW-0002')).toMatchObject({ results: ['pass', 'fail'], trend: 'regressed' });
    expect(byId.get('CW-0003')).toMatchObject({ results: ['pass', null], trend: 'passing' });
    expect(byId.get('CW-0004')).toMatchObject({ results: [null, 'not_run'], trend: null });
    expect(data.improved).toBe(1);
    expect(data.regressed).toBe(1);
  });

  it('returns an empty shell when nothing ran this week', () => {
    const data = buildWeeklyData([stale], NOW);
    expect(data.runs).toEqual([]);
    expect(data.tests).toEqual([]);
  });
});
