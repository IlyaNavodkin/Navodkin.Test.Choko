import { useEffect } from 'react';
import { I } from '@/components/icons';
import { Button, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app-store';
import type { Run } from '@/types';
import { latestAutomationResults } from '@/utils/automation-workflow';

const STATE_LABEL: Record<string, string> = {
  queued: 'Queued',
  starting: 'Starting…',
  running: 'Running',
  finishing: 'Finishing…',
  completed: 'Completed',
  runner_error: 'Runner error',
  cancelled: 'Cancelled',
  interrupted: 'Interrupted',
};

const STATE_TONE: Record<string, string> = {
  completed: 'text-pass',
  runner_error: 'text-fail',
  cancelled: 'text-ink-3',
  interrupted: 'text-blocked',
};

/** Automation panel in a run: enabled bindings, start/stop, live state, results and apply. */
export function RunAutomationActivity({ run }: { run: Run }) {
  const ctx = useApp();
  const view = ctx.runAutomation[run.id];
  const runCaseIds = new Set(run.rows.map((r) => r.case_id));
  const enabled = ctx.automationBindings.filter((b) => b.enabled && !b.archived && runCaseIds.has(b.caseId));

  useEffect(() => {
    void ctx.loadRunAutomation(run.id);
    void ctx.previewRunAutomation(run.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.id]);

  const busy = !!view?.busy;
  const executions = view?.executions ?? [];
  const results = latestAutomationResults(view?.results ?? []);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-panel px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="grid place-items-center text-accent">{I.play({ size: 14 })}</span>
        <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">Autotests</div>
        <Tag>{enabled.length} linked</Tag>
        <span className="flex-1" />
        {busy ? (
          <Button size="sm" onClick={() => ctx.stopRunAutomation(run.id)}>
            {I.x({ size: 12 })} Stop
          </Button>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={() => void ctx.importAutomationReport(run.id)}>
              Import report
            </Button>
            {results.some((r) => r.status === 'failed' || r.status === 'timedOut') && (
              <Button size="sm" variant="ghost" onClick={() => void ctx.rerunFailedAutomation(run.id)}>
                {I.play({ size: 12 })} Rerun failed
              </Button>
            )}
            <Button size="sm" disabled={enabled.length === 0} onClick={() => void ctx.startRunAutomation(run.id)}>
              {I.play({ size: 12 })} Run linked
            </Button>
          </>
        )}
      </div>

      {enabled.length === 0 && (
        <div className="text-[12px] text-ink-3">
          No enabled autotests are bound to this run’s cases. Bind tests in the Autotests section.
        </div>
      )}

      {(view?.preview?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">Resolved arguments</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11.5px]">
            {view!.preview!.map((a, i) => (
              <div key={`${a.key}-${i}`} className="flex items-center gap-1.5">
                <span className="font-mono text-ink-3">{a.key}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-ink">{String(a.value)}</span>
                <span className="text-[10px] text-ink-faint">{a.source}</span>
                {a.reference && <span className="text-[10px] text-ink-faint">· {a.reference.title}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {(view?.previewProblems?.length ?? 0) > 0 && (
        <div className="rounded border border-[oklch(0.85_0.06_80)] bg-blocked-soft px-2 py-1.5 text-[11.5px] text-[oklch(0.5_0.12_66)]">
          {view!.previewProblems!.map((p, i) => (
            <div key={i}>{p}</div>
          ))}
        </div>
      )}

      {view?.importPreview && (
        <div className="flex flex-col gap-1 rounded border border-border bg-panel-2 px-2 py-1.5 text-[12px]">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Import preview</span>
            <Tag>{view.importPreview.format}</Tag>
            <span className="flex-1" />
            <Button size="sm" variant="ghost" disabled={!view.importPreview.ok} onClick={() => void ctx.applyAutomationImport(run.id)}>
              Apply import
            </Button>
          </div>
          <div className="text-ink-3">
            {view.importPreview.matched.length} matched · {view.importPreview.unmatched.length} unmatched ·{' '}
            {view.importPreview.duplicates.length} duplicate{view.importPreview.duplicates.length === 1 ? '' : 's'}
          </div>
          {view.importPreview.problems.map((p, i) => (
            <div key={i} className="text-[oklch(0.5_0.12_66)]">{p}</div>
          ))}
        </div>
      )}

      {executions.map((e) => (
        <div key={e.executionId} className="flex flex-col gap-1 rounded border border-border bg-panel-2 px-2 py-1.5 text-[12px]">
          <div className="flex items-center gap-2">
            <span className={cn('font-semibold', STATE_TONE[e.state])}>{STATE_LABEL[e.state] ?? e.state}</span>
            <span className="font-mono text-[11px] text-ink-3">{e.project}</span>
            <span className="text-ink-3">
              {e.state === 'completed' && e.total !== null ? e.total : e.completed}
              {e.total !== null ? `/${e.total}` : ''} done
            </span>
            <span className="flex-1" />
            <span className="font-mono text-[10.5px] text-ink-faint">{e.executionId.slice(0, 8)}</span>
          </div>
          {e.currentLine && <div className="truncate font-mono text-[11px] text-ink-3">{e.currentLine}</div>}
          {e.error && <div className="text-fail">{e.error}</div>}
          {e.logTail && (
            <pre className="max-h-[90px] overflow-auto whitespace-pre-wrap rounded bg-sunken px-1.5 py-1 font-mono text-[10.5px] text-ink-3">
              {e.logTail}
            </pre>
          )}
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" disabled={e.state === 'running' || e.state === 'starting'} onClick={() => void ctx.saveAutomationExecution(run.id, e.executionId)}>
              Save to run
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={e.state !== 'completed'}
              title="Apply the automated status only to rows without a manual result"
              onClick={() => void ctx.applyAutomationExecution(run.id, e.executionId)}
            >
              Apply to unrecorded
            </Button>
          </div>
        </div>
      ))}

      {results.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">Saved results</div>
          {results.map((r, i) => (
            <div key={`${r.executionId}-${r.automationId}-${i}`} className="flex items-center gap-2 text-[12px]">
              <span className={cn('font-mono text-[10.5px]', r.status === 'passed' ? 'text-pass' : r.status === 'failed' || r.status === 'timedOut' ? 'text-fail' : 'text-ink-3')}>
                {r.status}
              </span>
              <span className="min-w-0 flex-1 truncate">{r.automationId}</span>
              <span className="font-mono text-[10.5px] text-ink-faint">{r.project}</span>
              {r.flaky && <Tag>flaky</Tag>}
              <span className="text-ink-faint">{r.attempts} attempt{r.attempts === 1 ? '' : 's'}</span>
            </div>
          ))}
        </div>
      )}

      {(view?.issues.length ?? 0) > 0 && (
        <div className="flex flex-col gap-0.5 rounded border border-[oklch(0.85_0.06_80)] bg-blocked-soft px-2 py-1.5 text-[11.5px] text-[oklch(0.5_0.12_66)]">
          {view!.issues.map((issue, i) => (
            <span key={i}>{issue}</span>
          ))}
        </div>
      )}
    </div>
  );
}
