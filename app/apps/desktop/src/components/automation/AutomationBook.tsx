import { useState } from 'react';
import { I } from '@/components/icons';
import { Button, Input, Select, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { AutomationBinding, CatalogEntry } from '@/schemas/automation-store';
import type { ReferenceDoc } from '@/services/reference-book';
import { useApp } from '@/store/app-store';
import type { AutomationFilter, Case } from '@/types';
import { catalogProjects, matchesCatalogEntry } from '@/utils/automation-catalog';
import { automationEntryKey } from '@/utils/automation-workflow';
import { AutomationTree } from './AutomationTree';
import { AutomationConfiguration } from './AutomationConfiguration';

const FILTERS: { id: AutomationFilter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'runnable', label: 'Runnable' }, { id: 'archived', label: 'Archive' },
];

export function AutomationListView({ entries, selectedId, query, filter, project, onSelect, onQuery, onFilter, onProject }: {
  entries: CatalogEntry[]; selectedId: string | null; query: string; filter: AutomationFilter; project: string;
  onSelect: (id: string) => void; onQuery: (q: string) => void; onFilter: (f: AutomationFilter) => void; onProject: (p: string) => void;
}) {
  const projects = catalogProjects(entries);
  const shown = entries.filter((e) => matchesCatalogEntry(e, { query, filter, project }));
  const archived = entries.filter((e) => e.archived).length;
  return (
    <div className="flex min-h-0 w-[360px] max-w-[45%] shrink-0 flex-col border-r border-border bg-panel-2">
      <div className="flex flex-col gap-3 border-b border-border p-3">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-ink-3"><span>Project files</span><span>{shown.length} tests</span></div>
        <Input aria-label="Search autotests" className="h-8" placeholder="Search tests, files or folders…" value={query} onChange={(e) => onQuery(e.target.value)} />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => <button key={f.id} type="button" className={cn('rounded-full border border-border bg-panel px-2 py-1 text-[11px] text-ink-3 hover:bg-raise', filter === f.id && 'border-accent-line bg-accent-soft text-accent-ink')} onClick={() => onFilter(f.id)}>{f.label}{f.id === 'archived' && archived ? ` (${archived})` : ''}</button>)}
        </div>
        {projects.length > 1 && <Select aria-label="Playwright project" value={project} onChange={(e) => onProject(e.target.value)}><option value="">All projects</option>{projects.map((p) => <option key={p} value={p}>{p}</option>)}</Select>}
      </div>
      <AutomationTree key={`${query}:${filter}:${project}`} entries={shown} selectedKey={selectedId} onSelect={(entry) => onSelect(automationEntryKey(entry))} />
    </div>
  );
}

export function AutomationCard({ entry, bindings, cases, docs, onArchive, onCase, onArgumentSet, onOpenReference, busy = false }: {
  entry: CatalogEntry | null; bindings: AutomationBinding[]; cases: Case[]; docs: ReferenceDoc[];
  onArchive: (archived: boolean) => void; onCase: (id: string | null) => void;
  onArgumentSet: (id: string | null) => void; onOpenReference: (id?: string) => void; busy?: boolean;
}) {
  if (!entry) return <div className="grid min-h-0 flex-1 place-items-center p-8 text-center text-ink-3"><div className="flex max-w-sm flex-col items-center gap-3">{I.play({ size: 28 })}<p>Select an autotest to choose its Case and argument set.</p></div></div>;
  return (
    <article className="min-h-0 min-w-0 flex-1 overflow-auto px-8 py-6">
      <div className="mx-auto flex max-w-[820px] flex-col">
        <div className="mb-2 flex items-center gap-2 text-[11px] text-ink-3"><Tag>{entry.project || 'default project'}</Tag><span className="font-mono">{entry.automationId}</span>{entry.archived && <Tag>archived</Tag>}</div>
        <div className="flex items-start gap-3"><h3 className="min-w-0 flex-1 text-[21px] font-semibold leading-snug">{entry.title || entry.automationId}</h3><Button size="sm" variant="ghost" disabled={busy} onClick={() => onArchive(!entry.archived)}>{entry.archived ? 'Restore' : 'Archive'}</Button></div>
        <div className="mt-2 flex items-center gap-1.5 break-all font-mono text-[11px] text-ink-3">{I.file({ size: 13 })}{entry.file ?? 'No source file'}{entry.line ? `:${entry.line}` : ''}</div>
        <div className="my-6 border-t border-border" />
        <AutomationConfiguration entry={entry} bindings={bindings} cases={cases} docs={docs} onCase={onCase} onArgumentSet={onArgumentSet} onOpenReference={onOpenReference} busy={busy} />
        <div className="mt-8 rounded-lg bg-panel-2 p-4 text-[12px] leading-relaxed text-ink-3"><span className="font-medium text-ink-2">Code lives in your project.</span> Write and run tests in your editor or terminal. Refresh project to update this catalog; import an external report inside a run. Launch tests from Runs → Autotests to keep their results with that run.</div>
      </div>
    </article>
  );
}

export function AutomationBook() {
  const ctx = useApp();
  const [saving, setSaving] = useState(false);
  const selected = ctx.automationCatalog.find((e) => automationEntryKey(e) === ctx.automationSelId || e.automationId === ctx.automationSelId) ?? null;
  const bindings = selected ? ctx.automationBindings.filter((b) => automationEntryKey(b) === automationEntryKey(selected) && !b.archived) : [];
  const save = async (action: () => Promise<void>) => { setSaving(true); try { await action(); } finally { setSaving(false); } };
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-panel">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-4">
        <div><h2 className="text-[19px] font-semibold">Autotests</h2><p className="mt-0.5 text-[12px] text-ink-3">Project structure, Case coverage and shared environments</p></div>
        <span className="flex-1" />
        {import.meta.env.MODE === 'mockup' && <Tag>Demo project</Tag>}
        <label className="flex items-center gap-1.5 text-[12px] text-ink-3"><input type="checkbox" checked={ctx.automationTrusted} onChange={(e) => ctx.setAutomationTrusted(e.target.checked)} />Trust this project</label>
        <Button disabled={ctx.automationBusy || !ctx.automationTrusted || saving} onClick={() => void ctx.discoverAutomation()}>{I.sync({ size: 14 })}{ctx.automationBusy ? 'Refreshing…' : 'Refresh project'}</Button>
      </header>
      {ctx.automationDiscoverError && <div role="alert" className="border-b border-border bg-blocked-soft px-6 py-3 text-[12px] text-blocked">{ctx.automationDiscoverError}</div>}
      {!!ctx.automationIssues.length && <div role="alert" className="border-b border-border bg-blocked-soft px-6 py-3 text-[12px] text-blocked">{ctx.automationIssues.map((i, n) => <p key={n}>{i.message}</p>)}</div>}
      {ctx.automationCatalog.length ? <div className="flex min-h-0 flex-1">
        <AutomationListView entries={ctx.automationCatalog} selectedId={selected ? automationEntryKey(selected) : null} query={ctx.automationQuery} filter={ctx.automationFilter} project={ctx.automationProjectFilter} onSelect={ctx.selectAutomationEntry} onQuery={ctx.setAutomationQuery} onFilter={ctx.setAutomationFilter} onProject={ctx.setAutomationProjectFilter} />
        <AutomationCard key={selected ? automationEntryKey(selected) : 'empty'} entry={selected} bindings={bindings} cases={ctx.cases} docs={ctx.refs} busy={saving}
          onArchive={(archived) => selected && void save(() => ctx.setAutomationArchived(selected.automationId, archived))}
          onCase={(caseId) => selected && void save(() => ctx.assignAutomationCase(selected, caseId))}
          onArgumentSet={(id) => selected && void save(() => ctx.setAutomationArgumentSet(selected, id))}
          onOpenReference={(id) => id ? ctx.openReferenceEntry(id) : ctx.openReferenceBook()} />
      </div> : <div className="grid flex-1 place-items-center p-8"><div className="max-w-md text-center"><div className="mb-3 text-ink-faint">{I.folder({ size: 32 })}</div><h3 className="font-semibold">Connect your test project</h3><p className="mt-2 text-[13px] text-ink-3">Keep your Playwright project in .casewright/autotests/. Trust the project, then refresh to browse its folders and tests. Author tests in VS Code or your terminal.</p></div></div>}
    </div>
  );
}
