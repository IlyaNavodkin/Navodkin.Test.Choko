import type { Run, RunRowFilter } from '@/types';
import { activityWeeks, type ActivityWeek } from './run-dashboard';

/** Use the calendar date actually stored in the result, without timezone conversion. */
export function recordedDay(stamp: string | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/u.exec(stamp ?? '');
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3])
    ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/** Original indices are essential: editing a filtered card must update the correct run row. */
export function filterRunRows(run: Run, filter: RunRowFilter = {}) {
  return run.rows.map((row, index) => ({ row, index })).filter(({ row }) =>
    (!filter.result || row.result === filter.result) &&
    (!filter.date || (row.result !== 'not_run' && recordedDay(row.executed_at) === filter.date)));
}

/** Full Jan–Dec grid, Monday first. Padding and future days never contribute to totals/intensity. */
export function calendarYearWeeks(runs: Run[], year: number, now = new Date()): ActivityWeek[] {
  const first = new Date(year, 0, 1);
  first.setDate(first.getDate() - (first.getDay() + 6) % 7);
  const last = new Date(year, 11, 31);
  const count = Math.floor((Date.UTC(year, 11, 31) - Date.UTC(first.getFullYear(), first.getMonth(), first.getDate())) / 604_800_000) + 1;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const weeks = activityWeeks(runs, count, last);
  let max = 0;
  for (const week of weeks) for (const day of week.days) {
    day.future = !day.date.startsWith(`${year}-`) || day.date > today;
    if (day.future) {
      day.total = 0;
      day.status = null;
      day.level = 0;
    } else max = Math.max(max, day.total);
  }
  let previousMonth = '';
  return weeks.map((week) => {
    for (const day of week.days) if (day.total) day.level = Math.max(1, Math.ceil(3 * day.total / max)) as 1 | 2 | 3;
    const firstInYear = week.days.find((d) => d.date.startsWith(`${year}-`));
    const month = firstInYear?.date.slice(5, 7) ?? '';
    const monthLabel = month && month !== previousMonth
      ? new Date(`${firstInYear!.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short' }) : undefined;
    previousMonth = month;
    return { days: week.days, ...(monthLabel ? { monthLabel } : {}) };
  });
}
