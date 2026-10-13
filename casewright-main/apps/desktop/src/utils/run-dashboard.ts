import type { Result, Run } from '@/types';
import { effectiveTestDate } from '@/utils/run-items';
import { resolveVariables } from '@/utils/variables';

// ---------------------------------------------------------------------------
// Pure data behind the Runs dashboard: per-day execution tallies (the activity
// graph), this-week stat tiles, and the weekly-report matrix (each test listed
// once, with its result from every run executed this week). An "execution" is
// a run row with a recorded verdict — `executed_at` is stamped when a result is
// recorded and cleared when it's reset to not-run. `now` is injectable so all
// of this is deterministic in tests.
// ---------------------------------------------------------------------------

/** Local `YYYY-MM-DD` for a Date. */
function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The leading `YYYY-MM-DD` of an `executed_at` stamp (or any ISO-ish string), or null. */
function dayOf(stamp: string | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(stamp ?? '');
  return m ? m[1] : null;
}

/** Local midnight of the Monday starting the week that contains `d`. */
function mondayOf(d: Date): Date {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7)); // Sun=0 → back 6, Mon=1 → back 0
  return day;
}

/** Monday-to-Sunday bounds (inclusive, ISO days) of the week containing `now`. */
export function weekRange(now: Date = new Date()): { start: string; end: string } {
  const start = mondayOf(now);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { start: isoDay(start), end: isoDay(end) };
}

export type DayCounts = Record<Result, number>;
const zeroCounts = (): DayCounts => ({ pass: 0, fail: 0, blocked: 0, in_progress: 0, skipped: 0, not_run: 0 });

/** Tally every recorded execution by its local `executed_at` day. */
export function executionsByDay(runs: Run[]): Map<string, DayCounts> {
  const days = new Map<string, DayCounts>();
  for (const run of runs) {
    for (const row of run.rows) {
      if (row.result === 'not_run') continue;
      const day = dayOf(row.executed_at);
      if (!day) continue;
      let t = days.get(day);
      if (!t) {
        t = zeroCounts();
        days.set(day, t);
      }
      t[row.result] += 1;
    }
  }
  return days;
}

/** The color a day's cell takes: the most attention-worthy result recorded that day. */
export type DayStatus = 'fail' | 'blocked' | 'pass' | 'in_progress' | 'skipped';

export interface ActivityDay {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  /** Executions recorded on this day. */
  total: number;
  counts: DayCounts;
  /** Dominant status for the cell color (fail > blocked > pass > in_progress > skipped); null = no activity. */
  status: DayStatus | null;
  /** Intensity 0–3 relative to the busiest day in the window (0 = no activity). */
  level: 0 | 1 | 2 | 3;
  /** After `now` — rendered as a blank placeholder, not an empty day. */
  future: boolean;
}

export interface ActivityWeek {
  /** Short month label ("Jul") when this week starts a new month; the first week is always labeled. */
  monthLabel?: string;
  /** Monday-first, always 7 days. */
  days: ActivityDay[];
}

function dayStatus(t: DayCounts): DayStatus | null {
  if (t.fail > 0) return 'fail';
  if (t.blocked > 0) return 'blocked';
  if (t.pass > 0) return 'pass';
  if (t.in_progress > 0) return 'in_progress';
  if (t.skipped > 0) return 'skipped';
  return null;
}

/**
 * The activity-graph grid: the last `weeks` calendar weeks (Monday-first, current week last),
 * each day carrying its execution tally, a status color bucket, and an intensity level scaled
 * to the busiest day in the window.
 */
export function activityWeeks(runs: Run[], weeks: number, now: Date = new Date()): ActivityWeek[] {
  const byDay = executionsByDay(runs);
  const today = isoDay(now);
  const firstMonday = mondayOf(now);
  firstMonday.setDate(firstMonday.getDate() - 7 * (weeks - 1));

  let max = 0;
  const grid: ActivityDay[][] = [];
  for (let w = 0; w < weeks; w++) {
    const week: ActivityDay[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(firstMonday.getTime());
      date.setDate(date.getDate() + w * 7 + d);
      const key = isoDay(date);
      const counts = byDay.get(key) ?? zeroCounts();
      const total = counts.pass + counts.fail + counts.blocked + counts.in_progress + counts.skipped;
      max = Math.max(max, total);
      week.push({ date: key, total, counts, status: dayStatus(counts), level: 0, future: key > today });
    }
    grid.push(week);
  }
  for (const week of grid)
    for (const day of week)
      if (day.total > 0) day.level = Math.max(1, Math.ceil((3 * day.total) / max)) as 1 | 2 | 3;

  let prevMonth = -1;
  return grid.map((days, i) => {
    const monday = new Date(firstMonday.getFullYear(), firstMonday.getMonth(), firstMonday.getDate() + i * 7);
    const month = monday.getMonth();
    const monthLabel =
      month !== prevMonth ? monday.toLocaleDateString('en-US', { month: 'short' }) : undefined;
    prevMonth = month;
    return monthLabel ? { monthLabel, days } : { days };
  });
}

export interface DashboardStats {
  /** Runs currently open (any age). */
  openRuns: number;
  /** Runs with at least one execution recorded this week. */
  runsThisWeek: number;
  /** Executions recorded this week (rows with a verdict, stamped Mon–Sun of the current week). */
  executedThisWeek: number;
  /** This week's executions by result. */
  counts: DayCounts;
  /** pass / executed this week (0 when nothing ran). */
  passRate: number;
  /** fail + blocked this week. */
  attention: number;
}

/** True when `day` (ISO) falls inside the inclusive `start`–`end` ISO-day range. */
const inRange = (day: string | null, start: string, end: string): boolean =>
  day !== null && day >= start && day <= end;

/** The stat-tile numbers for the dashboard header, scoped to the current Mon–Sun week. */
export function dashboardStats(runs: Run[], now: Date = new Date()): DashboardStats {
  const { start, end } = weekRange(now);
  const counts = zeroCounts();
  let runsThisWeek = 0;
  for (const run of runs) {
    let touched = false;
    for (const row of run.rows) {
      if (row.result === 'not_run' || !inRange(dayOf(row.executed_at), start, end)) continue;
      counts[row.result] += 1;
      touched = true;
    }
    if (touched) runsThisWeek += 1;
  }
  const executedThisWeek = counts.pass + counts.fail + counts.blocked + counts.in_progress + counts.skipped;
  return {
    openRuns: runs.filter((r) => r.status === 'open').length,
    runsThisWeek,
    executedThisWeek,
    counts,
    passRate: executedThisWeek ? Math.round((counts.pass / executedThisWeek) * 100) : 0,
    attention: counts.fail + counts.blocked,
  };
}

/* ---- weekly report data ---- */

/** One run column in the weekly matrix, in chronological order. */
export interface WeeklyRunColumn {
  runId: string;
  name: string;
  /** The run's test date (falling back to its created date) — the column's date label. */
  date: string;
  status: 'open' | 'closed';
  /** Cases in the run. */
  total: number;
  /** How many of its executions were recorded inside this report's week. */
  executedInWeek: number;
  /** Current result distribution across all its rows. */
  counts: DayCounts;
}

/**
 * How a test moved across the week's runs, judged on its pass/fail/blocked verdicts in run
 * order (skipped and not-run are ignored): did the latest verdict recover from an earlier
 * bad one, regress from an earlier pass, or hold steady? Null = no verdicts at all.
 */
export type WeeklyTrend = 'improved' | 'regressed' | 'passing' | 'failing' | null;

/** One test's row in the weekly matrix — listed once, with its result from every run. */
export interface WeeklyTestRow {
  case_id: string;
  display_id: string;
  title: string;
  /** Aligned with the report's run columns; null = the test wasn't part of that run. */
  results: (Result | null)[];
  trend: WeeklyTrend;
}

export interface WeeklyData {
  /** Inclusive Mon–Sun ISO bounds of the reported week. */
  weekStart: string;
  weekEnd: string;
  /** Runs with at least one execution recorded inside the week, oldest first. */
  runs: WeeklyRunColumn[];
  /** Every test that appears in those runs, once, sorted by display id. */
  tests: WeeklyTestRow[];
  /** Trend tallies across `tests`, for the report's stat tiles. */
  improved: number;
  regressed: number;
}

const isVerdict = (r: Result | null): r is 'pass' | 'fail' | 'blocked' =>
  r === 'pass' || r === 'fail' || r === 'blocked';

function trendOf(results: (Result | null)[]): WeeklyTrend {
  const verdicts = results.filter(isVerdict);
  if (verdicts.length === 0) return null;
  const last = verdicts[verdicts.length - 1];
  const earlier = verdicts.slice(0, -1);
  if (last === 'pass') return earlier.some((v) => v !== 'pass') ? 'improved' : 'passing';
  return earlier.some((v) => v === 'pass') ? 'regressed' : 'failing';
}

/**
 * Assemble the weekly-report data for the week containing `now`: the runs executed that week
 * (columns, chronological) and every test that ran in them (rows, listed once) with its result
 * from each run — the raw material for the progression/resolution/degradation matrix.
 */
export function buildWeeklyData(runs: Run[], now: Date = new Date()): WeeklyData {
  const { start, end } = weekRange(now);

  const weekRuns = runs
    .filter((r) => r.rows.some((row) => row.result !== 'not_run' && inRange(dayOf(row.executed_at), start, end)))
    .sort(
      (a, b) =>
        (a.testDate || a.created || '').localeCompare(b.testDate || b.created || '') ||
        (a.created || '').localeCompare(b.created || '') ||
        a.id.localeCompare(b.id),
    );

  const columns: WeeklyRunColumn[] = weekRuns.map((run) => {
    const counts = zeroCounts();
    let executedInWeek = 0;
    for (const row of run.rows) {
      counts[row.result] += 1;
      if (row.result !== 'not_run' && inRange(dayOf(row.executed_at), start, end)) executedInWeek += 1;
    }
    return {
      runId: run.id,
      name: run.name,
      date: run.testDate || run.created,
      status: run.status,
      total: run.rows.length,
      executedInWeek,
      counts,
    };
  });

  // One row per case across all the week's runs; the newest run wins the id/title labels.
  const tests = new Map<string, WeeklyTestRow>();
  weekRuns.forEach((run, i) => {
    for (const row of run.rows) {
      let t = tests.get(row.case_id);
      if (!t) {
        t = {
          case_id: row.case_id,
          display_id: row.display_id,
          title: row.title,
          results: weekRuns.map(() => null),
          trend: null,
        };
        tests.set(row.case_id, t);
      }
      t.results[i] = row.result;
      t.display_id = row.display_id;
      t.title = resolveVariables(row.title, effectiveTestDate(run, row));
    }
  });

  const rows = [...tests.values()]
    .map((t) => ({ ...t, trend: trendOf(t.results) }))
    .sort((a, b) => a.display_id.localeCompare(b.display_id) || a.case_id.localeCompare(b.case_id));

  return {
    weekStart: start,
    weekEnd: end,
    runs: columns,
    tests: rows,
    improved: rows.filter((t) => t.trend === 'improved').length,
    regressed: rows.filter((t) => t.trend === 'regressed').length,
  };
}
