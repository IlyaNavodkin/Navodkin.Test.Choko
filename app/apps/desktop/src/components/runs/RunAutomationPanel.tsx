import { useEffect } from 'react';
import { I } from '@/components/icons';
import { Button } from '@/components/ui';
import { useApp } from '@/store/app-store';
import type { Run } from '@/types';
import { runAutomationEntries } from '@/utils/automation-workflow';
import { AutomationStatus, automationResultLookup } from './automation-status';

/** Compact doorway into the run's dedicated automation workspace. */
export function RunAutomationPanel({ run }: { run: Run }) {
  const ctx = useApp();
  const entries = runAutomationEntries(ctx.automationCatalog, ctx.automationBindings, run.rows.map((r) => r.case_id));
  const results = ctx.runAutomation[run.id]?.results ?? [];
  const resultForEntry = automationResultLookup(entries, results);
  const passed = entries.filter((e) => resultForEntry(e)?.status === 'passed').length;
  const failed = entries.filter((e) => ['failed', 'timedOut'].includes(resultForEntry(e)?.status ?? '')).length;
  const unrun = entries.filter((e) => !resultForEntry(e)).length;
  useEffect(() => { void ctx.loadRunAutomation(run.id); }, [run.id, ctx.loadRunAutomation]);
  return <section className="rounded-lg border border-border bg-panel">
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-3">
      <span className="text-pass">{I.play({ size: 15 })}</span><h3 className="text-[13px] font-semibold">Autotests</h3><span className="text-[11px] text-ink-3">{entries.length} linked</span><span className="flex-1" />
      <Button size="sm" onClick={() => ctx.openRunAutomation(run.id)}>Open autotests {I.chevron({ size: 12 })}</Button>
    </div>
    <div className="flex flex-wrap gap-3 px-3 py-2 text-[11px]"><span className="text-pass">{passed} passed</span><span className="text-fail">{failed} failed</span><span className="text-ink-3">{unrun} not run</span>{ctx.runAutomation[run.id]?.busy && <span className="text-inprogress">Running…</span>}</div>
    <div className="flex flex-col gap-2 px-3 pb-3">
      {entries.slice(0, 3).map((e) => <button type="button" key={`${e.automationId}:${e.project}`} className="flex items-center gap-2 rounded-md py-1 text-left hover:bg-raise" onClick={() => ctx.openRunAutomation(run.id)}><span className="min-w-0 flex-1"><span className="block truncate text-[12px]">{e.title}</span><span className="block truncate font-mono text-[10px] text-ink-3">{e.file}</span></span><AutomationStatus status={resultForEntry(e)?.status} /></button>)}
      {!entries.length && <p className="text-[12px] text-ink-3">Link autotests to this run’s Cases in the Autotests catalog, or import an external report.</p>}
      {entries.length > 3 && <p className="text-[11px] text-ink-3">+{entries.length - 3} more in the automation workspace</p>}
    </div>
  </section>;
}
