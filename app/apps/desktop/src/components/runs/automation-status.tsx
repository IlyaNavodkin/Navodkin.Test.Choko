import { cn } from '@/lib/utils';
import type { CatalogEntry } from '@/schemas/automation-store';
import type { RunAutomationResult } from '@/services/automation/run-results';
import { latestAutomationResults } from '@/utils/automation-workflow';

export function automationResultLookup(catalog: readonly CatalogEntry[], results: readonly RunAutomationResult[]) {
  const index = new Map(latestAutomationResults(results).map((r) => [JSON.stringify([r.automationId, r.project]), r]));
  const counts = new Map<string, number>();
  for (const e of catalog) counts.set(e.automationId, (counts.get(e.automationId) ?? 0) + 1);
  return (entry: CatalogEntry): RunAutomationResult | undefined => {
    const exact = index.get(JSON.stringify([entry.automationId, entry.project]));
    const imported = counts.get(entry.automationId) === 1 ? index.get(JSON.stringify([entry.automationId, ''])) : undefined;
    if (!exact) return imported;
    return imported && (imported.recordedAt ?? imported.executionId) > (exact.recordedAt ?? exact.executionId) ? imported : exact;
  };
}

export function AutomationStatus({ status, running = false }: { status?: RunAutomationResult['status']; running?: boolean }) {
  const fail = status === 'failed' || status === 'timedOut';
  const label = running ? 'Running' : status === 'passed' ? 'Passed' : fail ? 'Failed' : status === 'skipped' ? 'Skipped' : status === 'interrupted' ? 'Interrupted' : 'Not run';
  return <span className={cn('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium', running ? 'bg-inprogress-soft text-inprogress' : fail ? 'bg-fail-soft text-fail' : status === 'passed' ? 'bg-pass-soft text-pass' : 'bg-sunken text-ink-3')}><span aria-hidden="true">{running ? '◐' : fail ? '✕' : status === 'passed' ? '✓' : '–'}</span>{label}</span>;
}
