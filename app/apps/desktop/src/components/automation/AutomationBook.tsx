import { useState } from 'react';
import { I } from '@/components/icons';
import { Button, Field, Input, Select, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { AutomationArgDefinition } from '@/schemas/automation';
import type { CatalogEntry } from '@/schemas/automation-store';
import { useApp } from '@/store/app-store';
import type { AutomationFilter } from '@/types';
import {
  blankArgDefinition,
  catalogProjects,
  matchesCatalogEntry,
  patchArgDefinition,
  removeArgDefinition,
  definitionIssues,
} from '@/utils/automation-catalog';

const FILTERS: { id: AutomationFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'runnable', label: 'Runnable' },
  { id: 'archived', label: 'Archive' },
];

/** One editable argument-definition row. */
function ArgRow({
  def,
  disabled,
  onChange,
  onRemove,
}: {
  def: AutomationArgDefinition;
  disabled: boolean;
  onChange: (patch: Partial<AutomationArgDefinition>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <Input
        className="h-8 w-[150px] font-mono text-[12px]"
        placeholder="key"
        value={def.key}
        disabled={disabled}
        onChange={(e) => onChange({ key: e.target.value })}
      />
      <Select
        className="h-8 w-[110px]"
        value={def.type}
        disabled={disabled}
        onChange={(e) => onChange({ type: e.target.value as AutomationArgDefinition['type'] })}
      >
        {(['string', 'number', 'boolean', 'url', 'enum'] as const).map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </Select>
      {def.type === 'enum' && (
        <Input
          className="h-8 min-w-0 flex-1 text-[12px]"
          placeholder="options, comma-separated"
          value={(def.options ?? []).join(', ')}
          disabled={disabled}
          onChange={(e) => onChange({ options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
        />
      )}
      {def.type === 'number' && (
        <span className="flex items-center gap-1">
          <Input
            className="h-8 w-[74px] text-[12px]"
            placeholder="min"
            value={def.min ?? ''}
            disabled={disabled}
            onChange={(e) => onChange({ min: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
          <Input
            className="h-8 w-[74px] text-[12px]"
            placeholder="max"
            value={def.max ?? ''}
            disabled={disabled}
            onChange={(e) => onChange({ max: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
        </span>
      )}
      <Input
        className="h-8 w-[130px] text-[12px]"
        placeholder="default"
        value={def.default === undefined ? '' : String(def.default)}
        disabled={disabled}
        onChange={(e) => onChange({ default: e.target.value === '' ? undefined : e.target.value })}
      />
      <label className="flex h-8 shrink-0 items-center gap-1 text-[11.5px] text-ink-2">
        <input type="checkbox" checked={!!def.required} disabled={disabled} onChange={(e) => onChange({ required: e.target.checked })} />
        required
      </label>
      <Button size="sm" variant="ghost" disabled={disabled} title="Remove argument" onClick={onRemove}>
        {I.trash({ size: 13 })}
      </Button>
    </div>
  );
}

export function AutomationListView({
  entries,
  selectedId,
  query,
  filter,
  project,
  onSelect,
  onQuery,
  onFilter,
  onProject,
}: {
  entries: CatalogEntry[];
  selectedId: string | null;
  query: string;
  filter: AutomationFilter;
  project: string;
  onSelect: (id: string) => void;
  onQuery: (q: string) => void;
  onFilter: (f: AutomationFilter) => void;
  onProject: (p: string) => void;
}) {
  const projects = catalogProjects(entries);
  const shown = entries.filter((e) => matchesCatalogEntry(e, { query, filter, project }));
  const archived = entries.filter((e) => e.archived).length;

  return (
    <div className="flex min-h-0 w-[330px] shrink-0 flex-col border-r border-border bg-panel-2">
      <div className="flex flex-col gap-2 border-b border-border p-2.5">
        <div className="relative flex items-center">
          <span className="pointer-events-none absolute left-2 text-ink-faint">{I.search({ size: 14 })}</span>
          <Input className="h-[30px] pl-7" placeholder="Search autotests…" value={query} onChange={(e) => onQuery(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border border-border bg-panel px-2 py-0.5 text-[11.5px] text-ink-2 hover:bg-raise',
                filter === f.id && 'border-accent-line bg-accent-soft font-semibold text-accent-ink',
              )}
              onClick={() => onFilter(f.id)}
            >
              {f.label}
              {f.id === 'archived' && archived > 0 ? ` (${archived})` : ''}
            </button>
          ))}
          {projects.length > 1 && (
            <Select className="ml-auto h-6 w-auto text-[11.5px]" value={project} onChange={(e) => onProject(e.target.value)}>
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {shown.map((e) => (
          <button
            key={e.automationId}
            className={cn(
              'mb-1 flex w-full flex-col gap-1 rounded-md border border-transparent px-2.5 py-2 text-left transition hover:bg-raise',
              selectedId === e.automationId && 'border-border bg-panel shadow-[0_1px_2px_var(--shadow)]',
            )}
            onClick={() => onSelect(e.automationId)}
          >
            <span className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{e.title || e.automationId}</span>
              {e.archived && <Tag>archived</Tag>}
            </span>
            <span className="flex items-center gap-1.5 text-[11.5px] text-ink-faint">
              <span className="font-mono">{e.automationId}</span>
              {e.project && <span>· {e.project}</span>}
              {e.caseId && <span>· {e.caseId}</span>}
            </span>
          </button>
        ))}
        {shown.length === 0 && <div className="px-2 py-3 text-[12.5px] text-ink-3">Nothing matches.</div>}
      </div>
    </div>
  );
}

export function AutomationCard({
  entry,
  bindings,
  onArchive,
  onAddBinding,
  onRemoveBinding,
  onToggleBinding,
  onArgs,
  currentCaseId,
}: {
  entry: CatalogEntry | null;
  bindings: { id: string; caseId: string; enabled: boolean }[];
  onArchive: (archived: boolean) => void;
  onAddBinding: () => void;
  onRemoveBinding: (id: string) => void;
  onToggleBinding: (id: string, enabled: boolean) => void;
  onArgs: (args: AutomationArgDefinition[]) => void;
  currentCaseId: string | null;
}) {
  const [localArgs, setLocalArgs] = useState<AutomationArgDefinition[] | null>(null);
  if (!entry) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center px-8 text-center">
        <div className="flex max-w-[420px] flex-col items-center gap-2 text-ink-faint">
          {I.play({ size: 26 })}
          <div className="text-[13px]">Select an autotest to see its identity, arguments and case bindings.</div>
        </div>
      </div>
    );
  }
  const args = localArgs ?? entry.arguments;
  const problems = definitionIssues(args);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto px-[26px] pb-6 pt-4">
      <div className="flex items-center gap-2.5">
        <h3 className="m-0 min-w-0 flex-1 truncate text-[17px] font-semibold">{entry.title || entry.automationId}</h3>
        {entry.archived && <Tag>archived</Tag>}
        <Button size="sm" onClick={() => onArchive(!entry.archived)}>
          {entry.archived ? 'Restore' : 'Archive'}
        </Button>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
        <span className="rounded border border-border bg-panel px-1.5 font-mono text-[11.5px]">{entry.automationId}</span>
        {entry.project && <Tag>{entry.project}</Tag>}
        {entry.caseId && <span>case {entry.caseId}</span>}
        {entry.file && <span className="font-mono">{entry.line ? `${entry.file}:${entry.line}` : entry.file}</span>}
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">Arguments</div>
          <span className="flex-1" />
          <Button size="sm" onClick={() => setLocalArgs([...args, blankArgDefinition()])}>
            {I.plus({ size: 12 })} Add
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {args.map((d, i) => (
            <ArgRow
              key={i}
              def={d}
              disabled={false}
              onChange={(patch) => setLocalArgs(patchArgDefinition(args, i, patch))}
              onRemove={() => setLocalArgs(removeArgDefinition(args, i))}
            />
          ))}
          {args.length === 0 && <div className="text-[12.5px] text-ink-3">This test declares no arguments.</div>}
        </div>
        {problems.length > 0 && (
          <div className="rounded-md border border-fail bg-fail-soft px-3 py-2 text-[12px] text-ink">
            {problems.map((p, i) => (
              <div key={i}>{p.message}</div>
            ))}
          </div>
        )}
        <div>
          <Button
            size="sm"
            variant="primary"
            disabled={problems.length > 0}
            onClick={() => {
              onArgs(args);
              setLocalArgs(null);
            }}
          >
            Save arguments
          </Button>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">Case bindings</div>
          <span className="flex-1" />
          <Button size="sm" disabled={!currentCaseId} title={currentCaseId ? 'Bind to the open case' : 'Open a case first'} onClick={onAddBinding}>
            {I.plus({ size: 12 })} Bind to open case
          </Button>
        </div>
        {bindings.length === 0 ? (
          <div className="text-[12.5px] text-ink-3">Not linked to any case yet.</div>
        ) : (
          <div className="flex flex-col gap-1">
            {bindings.map((b) => (
              <div key={b.id} className="flex items-center gap-2 rounded-md border border-border bg-panel px-2.5 py-1.5 text-[12.5px]">
                <span className="font-mono text-[11.5px] text-ink-3">{b.caseId}</span>
                <span className="flex-1" />
                <label className="flex items-center gap-1 text-[11.5px] text-ink-2">
                  <input type="checkbox" checked={b.enabled} onChange={(e) => onToggleBinding(b.id, e.target.checked)} />
                  enabled
                </label>
                <Button size="sm" variant="ghost" onClick={() => onRemoveBinding(b.id)} title="Remove binding">
                  {I.trash({ size: 13 })}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** The Automation section: discovered autotests, their arguments and case bindings. */
export function AutomationBook() {
  const ctx = useApp();
  const currentCaseId = ctx.sel.id ?? null;
  const selected = ctx.automationCatalog.find((e) => e.automationId === ctx.automationSelId) ?? null;
  const bindings = selected ? ctx.automationBindings.filter((b) => b.automationId === selected.automationId) : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel">
      <div className="flex items-center gap-3 px-[22px] py-[14px]">
        <h2 className="m-0 text-[18px] font-semibold">Autotests</h2>
        <Tag>.casewright/autotests/</Tag>
        <span className="flex-1" />
        <label className="flex items-center gap-1.5 text-[12px] text-ink-2">
          <input type="checkbox" checked={ctx.automationTrusted} onChange={(e) => ctx.setAutomationTrusted(e.target.checked)} />
          Trust this project
        </label>
        <Button disabled={ctx.automationBusy || !ctx.automationTrusted} onClick={() => void ctx.discoverAutomation()}>
          {I.sync({ size: 14 })} {ctx.automationBusy ? 'Discovering…' : 'Discover tests'}
        </Button>
      </div>

      {ctx.automationDiscoverError && (
        <div className="flex flex-col gap-1 border-b border-[oklch(0.85_0.07_80)] bg-blocked-soft px-4 py-2 text-[12px] text-[oklch(0.5_0.12_66)] whitespace-pre-wrap">
          {ctx.automationDiscoverError}
        </div>
      )}
      {ctx.automationIssues.length > 0 && (
        <div className="flex flex-col gap-0.5 border-b border-[oklch(0.85_0.06_80)] bg-blocked-soft px-4 py-2 text-[12px] text-[oklch(0.5_0.12_66)]">
          {ctx.automationIssues.map((i, n) => (
            <span key={n}>{i.message}</span>
          ))}
        </div>
      )}

      {ctx.automationCatalog.length === 0 ? (
        <div className="grid min-h-0 flex-1 place-items-center">
          <div className="flex max-w-[480px] flex-col items-center gap-3 text-center">
            {I.play({ size: 30, style: { color: 'var(--ink-faint)' } })}
            <div className="text-[14px] font-medium">No autotests discovered yet</div>
            <div className="text-[13px] text-ink-3">
              Put a Playwright project in <span className="font-mono">.casewright/autotests/</span> (package.json,
              playwright.config.ts, tests and node_modules). Confirm that you trust this project, then run discovery — it
              executes the project’s Playwright config and lists the tests it finds. Nothing runs on open.
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <AutomationListView
            entries={ctx.automationCatalog}
            selectedId={ctx.automationSelId}
            query={ctx.automationQuery}
            filter={ctx.automationFilter}
            project={ctx.automationProjectFilter}
            onSelect={ctx.selectAutomationEntry}
            onQuery={ctx.setAutomationQuery}
            onFilter={ctx.setAutomationFilter}
            onProject={ctx.setAutomationProjectFilter}
          />
          <AutomationCard
            entry={selected}
            bindings={bindings}
            currentCaseId={currentCaseId}
            onArchive={(archived) => selected && void ctx.setAutomationArchived(selected.automationId, archived)}
            onAddBinding={() => selected && currentCaseId && void ctx.addAutomationBinding(selected, currentCaseId)}
            onRemoveBinding={(id) => void ctx.removeAutomationBinding(id)}
            onToggleBinding={(id, enabled) => void ctx.setAutomationBindingEnabled(id, enabled)}
            onArgs={(args) => selected && void ctx.setAutomationArgs(selected.automationId, args)}
          />
        </div>
      )}
    </div>
  );
}
