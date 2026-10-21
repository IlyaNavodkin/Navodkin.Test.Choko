import { useState } from 'react';
import { I } from '@/components/icons';
import { Button, Input, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useApp, useAppStore } from '@/store/app-store';
import { automationEntryKey, runAutomationEntries } from '@/utils/automation-workflow';
import { AutomationTree } from '@/components/automation/AutomationTree';
import { AutomationStatus, automationResultLookup } from './automation-status';
import { RunAutomationActivity } from './RunAutomationActivity';
import { RunAutomationDetail } from './RunAutomationDetail';

type ResultFilter = 'all' | 'passed' | 'failed' | 'not_run';

export function RunAutomationPage() {
  const ctx = useApp();
  const run = ctx.runs.find((r) => r.id === ctx.sel.runId);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ResultFilter>('all');
  const selectedKey = ctx.sel.automationKey ?? null;
  if (!run) return <div className="p-8 text-ink-3">Run not found.</div>;

  const view = ctx.runAutomation[run.id];
  const busy = !!view?.busy;
  const entries = runAutomationEntries(ctx.automationCatalog, ctx.automationBindings, run.rows.map((r) => r.case_id));
  const statusOf = automationResultLookup(entries, view?.results ?? []);
  const counts = {
    all: entries.length,
    passed: entries.filter((e) => statusOf(e)?.status === 'passed').length,
    failed: entries.filter((e) => ['failed', 'timedOut'].includes(statusOf(e)?.status ?? '')).length,
    not_run: entries.filter((e) => !statusOf(e)).length,
  };
  const shown = entries.filter((e) => {
    const status = statusOf(e)?.status;
    const matches = filter === 'all' || (filter === 'failed'
      ? status === 'failed' || status === 'timedOut'
      : filter === 'not_run' ? !status : status === filter);
    return matches && `${e.title} ${e.file} ${e.project} ${e.automationId}`.toLowerCase().includes(query.toLowerCase());
  });
  const selected = shown.find((e) => automationEntryKey(e) === selectedKey) ?? shown[0] ?? null;
  const binding = selected ? ctx.automationBindings.find((b) =>
    automationEntryKey(b) === automationEntryKey(selected) && b.enabled && !b.archived &&
    run.rows.some((r) => r.case_id === b.caseId)) : undefined;
  const activeKeys = new Set(ctx.automationBindings.filter((b) => view?.activeBindingIds?.includes(b.id)).map(automationEntryKey));

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-panel">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0 flex-1">
          <button type="button" className="mb-1 flex items-center gap-1 text-[11px] text-ink-3 hover:text-accent" onClick={() => ctx.openRun(run.id)}>
            {I.chevron({ size: 11, style: { transform: 'rotate(180deg)' } })}{run.name}
          </button>
          <h2 className="text-[24px] font-extrabold">Autotests <span className="ml-2 font-ui text-[13px] font-normal text-ink-3">{entries.length} tests in this run</span></h2>
        </div>
        <Button size="sm" disabled={busy} onClick={() => void ctx.importAutomationReport(run.id)}>Import report</Button>
        {import.meta.env.MODE === 'mockup' && <Tag>Demo · simulated launches</Tag>}
        <Button size="sm" disabled={busy || counts.failed === 0} onClick={() => void ctx.rerunFailedAutomation(run.id)}>
          Run failed ({counts.failed})
        </Button>
        {busy ? (
          <Button size="sm" onClick={() => ctx.stopRunAutomation(run.id)}>{I.x({ size: 12 })} Stop</Button>
        ) : (
          <Button size="sm" variant="primary" disabled={!entries.length} onClick={() => void ctx.startRunAutomation(run.id)}>
            {I.play({ size: 12 })} Run all ({entries.length})
          </Button>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[410px] max-w-[48%] shrink-0 flex-col border-r border-border bg-panel-2">
          <div className="flex flex-col gap-3 border-b border-border p-3">
            <Input aria-label="Search run autotests" placeholder="Search tests, files or folders…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="flex flex-wrap gap-1.5">
              {(['all', 'passed', 'failed', 'not_run'] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)}
                  className={cn('rounded-full border border-border bg-panel px-2 py-1 text-[11px] text-ink-3', filter === f && 'border-accent-line bg-accent-soft text-accent-ink')}>
                  {f === 'not_run' ? 'Not run' : f[0].toUpperCase() + f.slice(1)} {counts[f]}
                </button>
              ))}
            </div>
          </div>
          <AutomationTree key={`${filter}:${query}`} entries={shown} selectedKey={selected ? automationEntryKey(selected) : null}
            onSelect={(e) => useAppStore.setState((s) => ({ sel: { ...s.sel, automationKey: automationEntryKey(e) } }))}
            renderMeta={(e) => <AutomationStatus status={statusOf(e)?.status} running={busy && activeKeys.has(automationEntryKey(e))} />} />
          <p className="border-t border-border px-4 py-3 text-[11px] leading-relaxed text-ink-3">
            Only autotests linked to this run’s Cases. Run all ignores the search and status filters.
          </p>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto px-7 py-6">
          {selected ? (
            <RunAutomationDetail entry={selected} binding={binding} result={statusOf(selected)} run={run} view={view} />
          ) : (
            <div className="py-8 text-[13px] text-ink-3">
              {entries.length ? 'No tests match these filters.' : 'No linked autotests. Select a Case for tests in the Autotests catalog.'}
              <Button variant="ghost" onClick={ctx.openAutomationSection}>Open catalog</Button>
            </div>
          )}
          <details open={!!view?.importPreview || !!view?.issues.length || !!view?.previewProblems?.length}
            className="mx-auto mt-6 max-w-[850px] rounded-lg border border-border">
            <summary className="cursor-pointer px-4 py-3 text-[12px] font-medium">Execution history, logs & report import</summary>
            <div className="border-t border-border p-3"><RunAutomationActivity run={run} /></div>
          </details>
        </main>
      </div>
    </div>
  );
}
