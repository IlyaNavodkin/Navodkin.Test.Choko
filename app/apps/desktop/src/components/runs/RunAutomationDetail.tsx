import { I } from '@/components/icons';
import { Button, Tag } from '@/components/ui';
import type { CatalogEntry, AutomationBinding } from '@/schemas/automation-store';
import type { RunAutomationResult } from '@/services/automation/run-results';
import type { Run, RunAutomationView } from '@/types';
import { useApp } from '@/store/app-store';
import { AutomationStatus } from './automation-status';

export function RunAutomationDetail({ entry, binding, result, run, view }: {
  entry: CatalogEntry;
  binding?: AutomationBinding;
  result?: RunAutomationResult;
  run: Run;
  view?: RunAutomationView;
}) {
  const ctx = useApp();
  const row = run.rows.find((r) => r.case_id === binding?.caseId);
  const referenceIds = [...new Set(Object.values(binding?.arguments ?? {}).flatMap((v) => v.kind === 'reference' ? [v.entryId] : []))];
  const preview = view?.preview?.filter((a) => a.key.startsWith(`${entry.automationId}.`)) ?? [];
  const execution = result ? view?.executions.find((e) => e.executionId === result.executionId) : undefined;
  const running = !!view?.busy && !!binding && !!view.activeBindingIds?.includes(binding.id);

  return <div className="mx-auto max-w-[850px]">
    <div className="flex items-center gap-2">
      <Tag>{entry.project || 'default project'}</Tag>
      <AutomationStatus status={result?.status} running={running} />
    </div>
    <h3 className="mt-3 text-[21px] font-semibold leading-snug">{entry.title}</h3>
    <p className="mt-2 break-all font-mono text-[11px] text-ink-3">{entry.file}{entry.line ? `:${entry.line}` : ''}</p>
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <Button variant="primary" size="sm" disabled={!!view?.busy || !binding}
        onClick={() => binding && void ctx.startRunAutomation(run.id, { onlyBindingIds: [binding.id] })}>
        {I.play({ size: 13 })} Run this test
      </Button>
      {row && <button type="button" className="min-w-0 truncate text-[12px] text-accent" onClick={() => binding && ctx.openCase(binding.caseId)}>
        {row.display_id} · {row.title}
      </button>}
    </div>

    <section className="mt-7 rounded-lg border border-border p-4">
      <h4 className="text-[13px] font-semibold">Latest result</h4>
      {result ? <>
        <div className="mt-3 flex flex-wrap gap-5 text-[12px]">
          <span>{(result.duration / 1000).toFixed(2)} s</span>
          <span>{result.attempts} attempt{result.attempts === 1 ? '' : 's'}</span>
          {result.flaky && <Tag>Flaky</Tag>}
        </div>
        <p className="mt-2 break-all font-mono text-[10px] text-ink-3">{result.executionId}</p>
        {result.error && <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-fail-soft p-3 text-[12px] text-fail">{result.error}</pre>}
        {!!execution?.arguments?.length && <details className="mt-3 rounded border border-border p-3">
          <summary className="cursor-pointer text-[11px] font-medium">Arguments used in this execution · snapshot</summary>
          <dl className="mt-2 divide-y divide-border">
            {execution.arguments.map((arg, i) => <div key={i} className="flex flex-wrap gap-3 py-2 text-[11px]">
              <dt className="font-mono text-ink-3">{arg.key}</dt>
              <dd className="break-all font-mono">{String(arg.value)}</dd>
              {arg.reference && <dd className="text-ink-3">{arg.reference.title} · {arg.reference.revision.slice(0, 8)}</dd>}
            </div>)}
          </dl>
        </details>}
        {execution?.logTail && <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-sunken p-3 font-mono text-[11px]">{execution.logTail}</pre>}
      </> : <p className="mt-2 text-[12px] text-ink-3">This test has not been run here. Run it individually, run all, or import a report from your terminal or VS Code.</p>}
    </section>

    <section className="mt-5 rounded-lg border border-border p-4">
      <h4 className="text-[13px] font-semibold">Arguments for the next launch</h4>
      <p className="mt-1 text-[11px] text-ink-3">Resolved from the current binding; completed executions keep their snapshots in history.</p>
      {referenceIds.length ? <div className="mt-3 flex flex-wrap gap-2">
        {referenceIds.map((id) => <button key={id} type="button" className="rounded-md bg-accent-soft px-2 py-1 text-[12px] text-accent-ink" onClick={() => ctx.openReferenceEntry(id)}>
          {ctx.refs.find((d) => d.id === id)?.entry.title ?? id}
        </button>)}
      </div> : <p className="mt-3 text-[12px] text-ink-3">{Object.keys(binding?.arguments ?? {}).length ? 'Custom bound values.' : entry.arguments.some((a) => a.required && a.default === undefined) ? 'Choose a compatible argument set in the Autotests catalog.' : 'Using test defaults.'}</p>}
      {preview.length > 0 && <dl className="mt-3 divide-y divide-border">
        {preview.map((arg, i) => <div key={i} className="flex flex-wrap gap-3 py-2 font-mono text-[11px]">
          <dt className="text-ink-3">{arg.key.slice(entry.automationId.length + 1)}</dt><dd className="break-all">{String(arg.value)}</dd>
        </div>)}
      </dl>}
    </section>
  </div>;
}
