import { useMemo } from 'react';
import { RES } from '@/components/ui';
import { activityWeeks, type ActivityDay, type DayStatus } from '@/utils/run-dashboard';
import type { Result, Run } from '@/types';

/** How many trailing calendar weeks the graph shows (~6 months). */
const WEEKS = 26;

/** Cell fill strength per intensity level (mixed into the panel color; level 3 = full). */
const LEVEL_MIX = ['0%', '45%', '70%', '100%'];

/** Statuses that carry their glyph inside the cell so a red/green-blind reader still sees them. */
const GLYPHED: DayStatus[] = ['fail', 'blocked'];

const LEGEND: Result[] = ['pass', 'fail', 'blocked', 'in_progress', 'skipped'];

function cellFill(day: ActivityDay): string {
  if (!day.status) return 'var(--sunken)';
  const color = RES[day.status].color;
  return day.level === 3 ? color : `color-mix(in oklab, ${color} ${LEVEL_MIX[day.level]}, var(--panel))`;
}

function dayTitle(day: ActivityDay): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.date);
  const label = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : day.date;
  if (day.total === 0) return `${label} — no tests recorded`;
  const parts = LEGEND.filter((r) => day.counts[r] > 0).map((r) => `${day.counts[r]} ${RES[r].label.toLowerCase()}`);
  return `${label} — ${day.total} recorded: ${parts.join(' · ')}`;
}

/**
 * A GitHub-style calendar of recorded test results: one cell per day for the last
 * ~6 months, colored by the day's most attention-worthy result (fail > blocked >
 * pass > skipped) with intensity scaled to the busiest day. Fail/blocked cells also
 * carry their result glyph so the signal never rides on color alone.
 */
export function ActivityGraph({ runs }: { runs: Run[] }) {
  const weeks = useMemo(() => activityWeeks(runs, WEEKS), [runs]);
  const total = weeks.reduce((n, w) => n + w.days.reduce((m, d) => m + d.total, 0), 0);

  return (
    <div className="flex flex-col gap-2 overflow-x-auto rounded-lg border border-border bg-panel p-[16px]">
      <div className="flex items-baseline gap-2.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">Test activity</span>
        <span className="font-mono text-[10.5px] text-ink-faint">
          {total} result{total === 1 ? '' : 's'} recorded in the last {WEEKS} weeks
        </span>
      </div>

      <div className="flex w-max flex-col gap-[3px]">
        {/* month labels, one slot per week column */}
        <div className="ml-[33px] flex h-[13px] gap-[3px] text-[9.5px] leading-[13px] text-ink-faint">
          {weeks.map((w, i) => (
            <span key={i} className="w-[13px] shrink-0 overflow-visible whitespace-nowrap">
              {w.monthLabel ?? ''}
            </span>
          ))}
        </div>
        <div className="flex gap-[3px]">
          {/* weekday gutter — every other row labeled */}
          <div className="flex w-[30px] shrink-0 flex-col gap-[3px] text-[9.5px] text-ink-faint">
            {['Mon', '', 'Wed', '', 'Fri', '', ''].map((d, i) => (
              <span key={i} className="h-[13px] leading-[13px]">
                {d}
              </span>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.days.map((day) => (
                <span
                  key={day.date}
                  title={day.future ? undefined : dayTitle(day)}
                  className="grid size-[13px] shrink-0 place-items-center rounded-[3px] text-[8px] font-bold leading-none"
                  style={
                    day.future
                      ? { visibility: 'hidden' }
                      : {
                          background: cellFill(day),
                          // On a light (level 1–2) fill the glyph wears the full status color;
                          // on the saturated level-3 fill it flips to white for contrast.
                          color: day.level === 3 ? 'oklch(1 0 0 / 0.92)' : day.status ? RES[day.status].color : undefined,
                        }
                  }
                >
                  {day.status && GLYPHED.includes(day.status) ? RES[day.status].glyph : ''}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-1 flex items-center gap-3 text-[10.5px] text-ink-faint">
        {LEGEND.map((r) => (
          <span key={r} className="inline-flex items-center gap-1.5">
            <span className="size-[10px] rounded-[3px]" style={{ background: RES[r].color }} />
            {RES[r].label}
          </span>
        ))}
        <span className="ml-auto inline-flex items-center gap-1">
          Less
          {LEVEL_MIX.slice(1).map((mix) => (
            <span
              key={mix}
              className="size-[10px] rounded-[3px]"
              style={{ background: `color-mix(in oklab, var(--pass) ${mix}, var(--panel))` }}
            />
          ))}
          More
        </span>
      </div>
    </div>
  );
}
