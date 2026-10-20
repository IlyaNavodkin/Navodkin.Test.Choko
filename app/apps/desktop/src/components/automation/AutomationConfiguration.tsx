import { I } from '@/components/icons';
import { Button, Select, Tag } from '@/components/ui';
import type { AutomationBinding, CatalogEntry } from '@/schemas/automation-store';
import type { ReferenceDoc } from '@/services/reference-book';
import type { Case } from '@/types';
import { planReferenceArguments } from '@/utils/automation-workflow';

export function AutomationConfiguration({ entry, bindings, cases, docs, onCase, onArgumentSet, onOpenReference, busy = false }: {
  entry: CatalogEntry;
  bindings: AutomationBinding[];
  cases: Case[];
  docs: ReferenceDoc[];
  onCase: (id: string | null) => void;
  onArgumentSet: (id: string | null) => void;
  onOpenReference: (id?: string) => void;
  busy?: boolean;
}) {
  const selectedCaseIds = [...new Set(bindings.filter((b) => !b.archived).map((b) => b.caseId))];
  const legacy = selectedCaseIds.length > 1;
  const selectedCaseId = legacy ? '__legacy__' : selectedCaseIds[0] ?? '';
  const argumentsByKey = bindings[0]?.arguments ?? {};
  const referencedSets = [...new Set(Object.values(argumentsByKey).flatMap((v) => v.kind === 'reference' ? [v.entryId] : []))];
  const selectedSetId = referencedSets.length === 1 ? referencedSets[0] : '';
  const selectedDoc = docs.find((d) => d.id === selectedSetId);
  const sets = docs.filter((d) => d.entry.kind === 'arguments' && !d.entry.archived && !d.readonly);
  const unavailableCase = selectedCaseId && selectedCaseId !== '__legacy__' && !cases.some((c) => c.id === selectedCaseId);
  const unavailableSet = selectedSetId && !sets.some((d) => d.id === selectedSetId);
  const values = selectedDoc?.entry.values?.filter((v) => argumentsByKey[v.key]?.kind === 'reference') ?? [];
  const stale = selectedDoc && Object.values(argumentsByKey).some((v) => v.kind === 'reference' && v.entryId === selectedDoc.id && v.revision && v.revision !== selectedDoc.revision);

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col gap-2">
        <label className="text-[13px] font-semibold" htmlFor={`case-${entry.automationId}`}>Test case</label>
        <p className="text-[12px] text-ink-3">One autotest covers one Case. Several autotests can cover the same Case.</p>
        <Select id={`case-${entry.automationId}`} aria-label="Test case" className="w-full" value={selectedCaseId} disabled={busy} onChange={(e) => onCase(e.target.value || null)}>
          <option value="">Not linked to a case</option>
          {legacy && <option value="__legacy__" disabled>Multiple legacy links — choose one Case</option>}
          {unavailableCase && <option value={selectedCaseId} disabled>Missing Case · {selectedCaseId}</option>}
          {cases.map((c) => <option key={c.id} value={c.id}>{c.displayId} — {c.title}</option>)}
        </Select>
        {legacy && <p className="text-[12px] text-blocked">Existing links are kept until you select a replacement.</p>}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[13px] font-semibold" htmlFor={`arguments-${entry.automationId}`}>Arguments</label>
          <Button size="sm" variant="ghost" onClick={() => onOpenReference(selectedSetId || undefined)}>{I.link({ size: 12 })} Reference book</Button>
        </div>
        <p className="text-[12px] text-ink-3">Choose an environment set from the Reference book. Values stay linked to their source.</p>
        <Select id={`arguments-${entry.automationId}`} aria-label="Argument set" className="w-full" value={selectedSetId} disabled={busy || !selectedCaseIds.length || legacy} onChange={(e) => onArgumentSet(e.target.value || null)}>
          <option value="">No reference set</option>
          {unavailableSet && <option value={selectedSetId} disabled>Unavailable set · {selectedDoc?.entry.title ?? selectedSetId}</option>}
          {sets.map((doc) => {
            const problems = planReferenceArguments(entry, doc).problems;
            return <option key={doc.id} value={doc.id} disabled={!!problems.length}>{doc.entry.title}{problems.length ? ' · incompatible inputs' : ''}</option>;
          })}
        </Select>
        {!selectedCaseIds.length && <p className="text-[11px] text-ink-3">Choose a Case to configure its launch arguments.</p>}
        {stale && <div className="rounded-md bg-blocked-soft p-3 text-[12px] text-blocked"><p>This set has changed since it was linked. Review the current values, then refresh the link before running.</p><Button size="sm" className="mt-2" disabled={busy} onClick={() => onArgumentSet(selectedDoc.id)}>Refresh linked values</Button></div>}
        {!sets.length && <p className="text-[12px] text-ink-3">Create an arguments set in the Reference book, then select it here.</p>}
        {referencedSets.length > 1 && <p className="text-[12px] text-blocked">Values currently reference multiple sets. Selecting one replaces this configuration.</p>}
        {values.length > 0 && (
          <div className="mt-1 overflow-hidden rounded-lg border border-border">
            <div className="flex items-center justify-between border-b border-border bg-panel-2 px-3 py-2 text-[11px] text-ink-3"><span>Linked values</span><Tag>{selectedDoc?.entry.title}</Tag></div>
            <dl className="divide-y divide-border">
              {values.map((v) => <div key={v.key} className="grid grid-cols-[minmax(100px,1fr)_2fr] gap-3 px-3 py-2 text-[12px]"><dt className="font-mono text-ink-3">{v.key}</dt><dd className="min-w-0 break-all font-mono">{String(v.value)}</dd></div>)}
            </dl>
          </div>
        )}
        {selectedSetId && <p className="text-[11px] text-ink-3">Applied to the next launch. Previous executions keep their own argument snapshots.</p>}
      </section>
    </div>
  );
}
