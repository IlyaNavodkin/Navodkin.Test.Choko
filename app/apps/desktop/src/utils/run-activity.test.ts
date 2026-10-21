import { describe, expect, it } from 'vitest';
import { calendarYearWeeks, filterRunRows, recordedDay } from './run-activity';
import type { Run, RunRow } from '@/types';

const row = (result: RunRow['result'], executed_at: string): RunRow => ({
  case_id: 'case', display_id: 'CASE-1', title: 'Case', result, executed_at, tester: '',
  notes: '', checks: {}, failNotes: {}, file: '',
});
const run = (rows: RunRow[]): Run => ({ id: 'run', name: 'Run', file: '', created: '2025-01-01',
  status: 'open', scope: '', rows, summary: '', notes: '', testerApproval: null, reviewerApproval: null });

describe('annual activity', () => {
  it('shows all 366 days of a past leap year, and excludes neighbouring years', () => {
    const weeks = calendarYearWeeks([run([
      row('fail', '2023-12-31 10:00'), row('pass', '2024-02-29 10:00'), row('blocked', '2025-01-01 10:00'),
    ])], 2024, new Date(2026, 9, 21));
    const visible = weeks.flatMap((w) => w.days).filter((d) => !d.future);
    expect(visible).toHaveLength(366);
    expect(visible[0].date).toBe('2024-01-01');
    expect(visible.at(-1)?.date).toBe('2024-12-31');
    expect(visible.reduce((n, d) => n + d.total, 0)).toBe(1);
    expect(visible.find((d) => d.date === '2024-02-29')).toMatchObject({ status: 'pass', level: 3 });
  });
  it('starts with January even when the first Monday belongs to December, and hides future days', () => {
    const weeks = calendarYearWeeks([], 2026, new Date(2026, 0, 3));
    expect(weeks[0].monthLabel).toBe('Jan');
    expect(weeks.flatMap((w) => w.days).filter((d) => !d.future).map((d) => d.date)).toEqual([
      '2026-01-01', '2026-01-02', '2026-01-03',
    ]);
  });
  it('scales intensity only against visible results in the selected year', () => {
    const weeks = calendarYearWeeks([run([
      ...Array.from({ length: 20 }, () => row('fail', '2025-12-29 10:00')),
      row('pass', '2026-01-01 10:00'),
    ])], 2026, new Date(2026, 0, 3));
    expect(weeks.flatMap((w) => w.days).find((d) => d.date === '2026-01-01')?.level).toBe(3);
  });
});

describe('day and result filtering', () => {
  const source = run([row('pass', '2025-10-20 09:00'), row('fail', '2026-06-10 10:00'),
    row('fail', '2026-06-11 10:00'), row('not_run', '2026-06-10 12:00')]);
  it('filters by result and date together while retaining original row indices', () => {
    expect(filterRunRows(source, { result: 'fail', date: '2026-06-10' }).map((r) => r.index)).toEqual([1]);
    expect(filterRunRows(source, { result: 'fail' }).map((r) => r.index)).toEqual([1, 2]);
  });
  it('links a day to execution dates rather than run creation or test dates, excluding unrun rows', () => {
    expect(filterRunRows(source, { date: '2025-01-01' })).toEqual([]);
    expect(filterRunRows(source, { date: '2026-06-10' }).map((r) => r.index)).toEqual([1]);
    expect(filterRunRows(source, { result: 'not_run' }).map((r) => r.index)).toEqual([3]);
    expect(filterRunRows(source)).toHaveLength(4);
  });
  it('validates dates and preserves the stored calendar day without UTC shifts', () => {
    expect(recordedDay('2024-02-29T23:30:00-03:00')).toBe('2024-02-29');
    expect(recordedDay('2025-02-29 12:00')).toBeNull();
    expect(recordedDay('2026-99-01')).toBeNull();
    expect(recordedDay('')).toBeNull();
  });
});
