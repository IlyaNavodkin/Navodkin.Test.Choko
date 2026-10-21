import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Button, RES, Select } from '@/components/ui';
import { HoverPopover } from '@/components/ui/hover-popover';
import { I } from '@/components/icons';
import { cn } from '@/lib/utils';
import { calendarYearWeeks, filterRunRows, recordedDay } from '@/utils/run-activity';
import type { ActivityDay, DayStatus } from '@/utils/run-dashboard';
import type { Result, Run } from '@/types';

const LEVEL_MIX = ['0%', '45%', '70%', '100%'];
const GLYPHED: DayStatus[] = ['fail', 'blocked'];
const LEGEND: Result[] = ['pass', 'fail', 'blocked', 'in_progress', 'skipped'];
const formatDay = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });

function DayInfo({ day, runs }: { day: ActivityDay; runs: Run[] }) {
  const activeRuns = runs.filter((run) => filterRunRows(run, { date: day.date }).length);
  return <div className="max-w-[280px]">
    <div className="font-semibold">{formatDay(day.date)}</div>
    <p className="mt-1 text-ink-3">{day.total} recorded result{day.total === 1 ? '' : 's'} · {activeRuns.length} run{activeRuns.length === 1 ? '' : 's'}</p>
    {day.total ? <>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">{LEGEND.filter((s) => day.counts[s]).map((s) =>
        <span key={s}><span style={{ color: RES[s].color }}>{RES[s].glyph}</span> {day.counts[s]} {RES[s].label}</span>)}</div>
      <ul className="mt-2 border-t border-border pt-2 text-ink-2">{activeRuns.slice(0, 3).map((run) =>
        <li key={run.id} className="truncate">{run.name}</li>)}</ul>
      {activeRuns.length > 3 && <p className="text-ink-3">+{activeRuns.length - 3} more runs</p>}
      <p className="mt-2 text-[11px] text-accent">Click to show this day’s runs and cases.</p>
    </> : <p className="mt-2 text-ink-3">No case results were recorded on this day.</p>}
  </div>;
}

/** A year of current recorded verdicts, with day drill-down; not an execution audit log. */
export function ActivityGraph({ runs, year, selectedDate, onYearChange, onSelectDate }: {
  runs: Run[];
  year: number;
  selectedDate: string | null;
  onYearChange: (year: number) => void;
  onSelectDate: (date: string | null) => void;
}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const weeks = useMemo(() => calendarYearWeeks(runs, year), [runs, year]);
  const grid = useRef<HTMLDivElement>(null);
  const [focusedDate, setFocusedDate] = useState<string | null>(null);
  const total = weeks.reduce((n, w) => n + w.days.reduce((m, d) => m + d.total, 0), 0);
  const availableDays = weeks.flatMap((w) => w.days).filter((d) => !d.future);
  const focusDate = [focusedDate, selectedDate].find((date) => date?.startsWith(`${year}-`)) ?? availableDays.at(-1)?.date;
  const earliestYear = Math.min(currentYear - 9, year, ...runs.flatMap((r) => r.rows.flatMap((row) => {
    const day = recordedDay(row.executed_at);
    return day ? [Number(day.slice(0, 4))] : [];
  })));
  const years = Array.from({ length: currentYear - earliestYear + 1 }, (_, i) => currentYear - i);
  const changeYear = (next: number) => { onYearChange(next); onSelectDate(null); };
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const offset = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    const index = availableDays.findIndex((d) => d.date === date);
    const target = availableDays[index + offset];
    if (target) grid.current?.querySelector<HTMLButtonElement>(`[data-activity-date="${target.date}"]`)?.focus();
  };

  return <section className="min-w-0 rounded-lg border border-border bg-panel p-4" aria-label="Test activity calendar">
    <div className="flex flex-wrap items-center gap-3">
      <h3 className="text-[14px] font-bold">Test activity</h3>
      <span className="text-[12px] text-ink-3">{total} result{total === 1 ? '' : 's'} recorded in {year}</span>
      <div className="ml-auto flex items-center gap-1">
        <Button icon size="sm" variant="ghost" aria-label="Previous activity year" title="Previous year" disabled={year <= 1900} onClick={() => changeYear(year - 1)}>{I.back({ size: 14 })}</Button>
        <Select size="sm" aria-label="Activity year" value={String(year)} onValueChange={(value) => changeYear(Number(value))}
          options={years.map((y) => ({ value: String(y), label: String(y) }))} />
        <Button icon size="sm" variant="ghost" aria-label="Next activity year" title="Next year" disabled={year >= currentYear} onClick={() => changeYear(year + 1)}>{I.chevron({ size: 14 })}</Button>
        {year !== currentYear && <Button size="sm" variant="ghost" onClick={() => changeYear(currentYear)}>Current year</Button>}
      </div>
    </div>
    <p className="mb-3 mt-1 text-[11px] text-ink-3">By result recording date across all runs. Hover for details; click a day to filter runs.</p>
    <div className="overflow-x-auto pb-1" ref={grid}>
      <div className="w-max">
        <div className="ml-[33px] flex h-4 gap-[3px] text-[10px] text-ink-3">{weeks.map((w, i) =>
          <span key={i} className="w-4 shrink-0 whitespace-nowrap">{w.monthLabel ?? ''}</span>)}</div>
        <div className="flex gap-[3px]">
          <div className="flex w-[30px] shrink-0 flex-col gap-[3px] text-[10px] text-ink-3">{['Mon', '', 'Wed', '', 'Fri', '', ''].map((d, i) =>
            <span key={i} className="h-4 leading-4">{d}</span>)}</div>
          {weeks.map((week, wi) => <div key={wi} className="flex flex-col gap-[3px]">{week.days.map((day) => day.future
            ? <span key={day.date} className="size-4" aria-hidden="true" />
            : <HoverPopover key={day.date} content={<DayInfo day={day} runs={runs} />}>
              <button type="button" data-activity-date={day.date} aria-label={`Activity on ${day.date}: ${day.total} recorded result${day.total === 1 ? '' : 's'}`}
                aria-pressed={day.date === selectedDate} tabIndex={day.date === focusDate ? 0 : -1}
                onFocus={() => setFocusedDate(day.date)} onKeyDown={(e) => moveFocus(e, day.date)} onClick={() => onSelectDate(day.date === selectedDate ? null : day.date)}
                className={cn('grid size-4 place-items-center rounded-[3px] text-[9px] font-bold leading-none hover:ring-1 hover:ring-border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent', selectedDate === day.date && 'ring-2 ring-accent ring-offset-2 ring-offset-panel')}
                style={{ background: !day.status ? 'var(--sunken)' : day.level === 3 ? RES[day.status].color : `color-mix(in oklab, ${RES[day.status].color} ${LEVEL_MIX[day.level]}, var(--panel))`, color: day.level === 3 ? 'var(--accent-fg)' : day.status ? RES[day.status].color : undefined }}>
                {day.status && GLYPHED.includes(day.status) ? RES[day.status].glyph : ''}
              </button>
            </HoverPopover>)}</div>)}
        </div>
      </div>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-ink-3">
      {LEGEND.map((s) => <span key={s} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: RES[s].color }} />{RES[s].label}</span>)}
      <span className="ml-auto inline-flex items-center gap-1">Less {LEVEL_MIX.slice(1).map((mix) => <span key={mix} className="size-2.5 rounded-[3px]" style={{ background: `color-mix(in oklab, var(--pass) ${mix}, var(--panel))` }} />)} More</span>
    </div>
    <p className="mt-2 text-[10px] text-ink-faint">Color shows the highest-priority result; intensity shows volume. Updating a verdict moves its activity date; earlier attempts are not retained here.</p>
  </section>;
}
