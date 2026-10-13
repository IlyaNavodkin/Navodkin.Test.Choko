import type { ReactNode } from 'react';
import { I } from '@/components/icons';
import { Button, RES, RowContextMenu, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app-store';
import { formatRunDate, runDateGroups } from '@/utils/dates';
import { dashboardStats } from '@/utils/run-dashboard';
import type { Result, Run } from '@/types';
import { ActivityGraph } from './ActivityGraph';

type Tally = Record<Result, number>;
const emptyTally = (): Tally => ({ pass: 0, fail: 0, blocked: 0, in_progress: 0, skipped: 0, not_run: 0 });
const SEGS: Result[] = ['pass', 'fail', 'blocked', 'in_progress', 'skipped', 'not_run'];

const RUN_STATUS: Record<string, string> = {
  open: 'text-accent-ink bg-accent-soft',
  closed: 'text-ink-3 bg-sunken',
};

/** One dashboard stat tile — headline number, label, and a small qualifier underneath. */
function StatTile({ value, label, sub, color }: { value: ReactNode; label: string; sub: string; color?: string }) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-panel px-[14px] py-[12px]">
      <div className="text-[24px] font-bold leading-none tracking-[-0.02em]" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="mt-2 text-[11.5px] font-semibold text-ink-2">{label}</div>
      <div className="mt-0.5 text-[10.5px] text-ink-faint">{sub}</div>
    </div>
  );
}

/** One run's card in the recent-runs list (name + status, date, result distribution). */
function RunCard({ run }: { run: Run }) {
  const ctx = useApp();
  const t = emptyTally();
  run.rows.forEach((r) => (t[r.result] += 1));
  const total = run.rows.length;
  return (
    <RowContextMenu
      items={[
        { label: 'Duplicate', icon: I.copy, on: () => ctx.duplicateRun(run.id) },
        { label: 'Export PDF…', icon: I.download, on: () => ctx.exportRunToPdf(run.id) },
        { sep: true },
        { label: 'Delete', icon: I.trash, danger: true, on: () => ctx.deleteRun(run.id) },
      ]}
    >
      <button
        className="flex w-full items-center gap-4 rounded-lg border border-border bg-panel px-[18px] py-[15px] text-left transition hover:border-accent-line hover:shadow-[0_2px_8px_var(--shadow)]"
        onClick={() => ctx.openRun(run.id)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-[9px] text-[14.5px] font-semibold">
            {run.name}
            <span className={cn('rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.05em]', RUN_STATUS[run.status])}>
              {run.status}
            </span>
          </div>
          <div className="mt-[3px] font-mono text-[11.5px] text-ink-faint">
            {formatRunDate(run.created)} · {run.file}
          </div>
        </div>
        <div className="w-[260px] shrink-0 text-right">
          <div className="flex h-[7px] w-full overflow-hidden rounded-full bg-sunken">
            {SEGS.map((s) =>
              t[s] ? <i key={s} className="block h-full" style={{ width: (t[s] / total) * 100 + '%', background: RES[s].color }} /> : null,
            )}
          </div>
          <div className="mt-1.5 whitespace-nowrap font-mono text-[11.5px] text-ink-3">
            {total} cases · {t.pass} pass · {t.fail} fail{t.blocked ? ' · ' + t.blocked + ' blocked' : ''}
          </div>
        </div>
        <span className="grid place-items-center text-ink-faint">{I.chevron({ size: 16 })}</span>
      </button>
    </RowContextMenu>
  );
}

export function RunsList() {
  const ctx = useApp();
  const { runs } = ctx;
  const stats = dashboardStats(runs);
  const rateColor =
    stats.executedThisWeek === 0
      ? 'var(--ink-faint)'
      : stats.passRate >= 80
        ? 'var(--pass)'
        : stats.passRate >= 50
          ? 'var(--blocked)'
          : 'var(--fail)';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-auto px-[30px] py-[26px]">
        <div className="mb-[18px] flex items-center gap-3">
          <h2 className="m-0 text-[18px] font-semibold">Test runs</h2>
          <Tag>.casewright/runs/</Tag>
          <Button
            variant="ghost"
            className="ml-auto"
            onClick={() => void ctx.exportWeeklyReport()}
            title="Download a PDF report of this week's runs, with each test's result from every run"
          >
            {I.download({ size: 14 })} Weekly report
          </Button>
          <Button variant="primary" onClick={ctx.openCreateRun}>
            {I.plus({ size: 15 })} New run
          </Button>
        </div>

        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatTile value={stats.runsThisWeek} label="Runs this week" sub={`${stats.openRuns} open in total`} />
            <StatTile value={stats.executedThisWeek} label="Tests executed" sub="results recorded this week" />
            <StatTile
              value={
                <>
                  {stats.passRate}
                  <span className="text-[13px] font-bold">%</span>
                </>
              }
              label="Pass rate"
              sub={
                stats.executedThisWeek === 0 ? 'nothing executed this week' : `${stats.counts.pass} of ${stats.executedThisWeek} executed`
              }
              color={rateColor}
            />
            <StatTile
              value={stats.attention}
              label="Needs attention"
              sub={
                stats.attention === 0
                  ? 'no failed or blocked tests this week'
                  : `${stats.counts.fail} fail · ${stats.counts.blocked} blocked this week`
              }
              color={stats.attention > 0 ? 'var(--fail)' : 'var(--pass)'}
            />
          </div>

          <ActivityGraph runs={runs} />

          <section className="flex flex-col gap-3">
            <div className="flex items-baseline gap-2.5 px-0.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">Recent runs</span>
              <span className="font-mono text-[10.5px] text-ink-faint">{runs.length}</span>
            </div>
            {runs.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-2 px-4 py-10 text-center">
                <div className="text-[13px] text-ink-3">No test runs yet — seed one from your cases to start recording results.</div>
                <Button variant="primary" onClick={ctx.openCreateRun}>
                  {I.plus({ size: 15 })} New run
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {runDateGroups(runs).map((group) => (
                  <section key={group.label} className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-2 px-0.5 text-[11px] font-bold uppercase tracking-[0.05em] text-ink-faint">
                      {group.label}
                      <span className="font-mono text-[10.5px]">{group.runs.length}</span>
                    </div>
                    {group.runs.map((run) => (
                      <RunCard key={run.id} run={run} />
                    ))}
                  </section>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
