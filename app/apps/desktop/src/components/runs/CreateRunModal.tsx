import { useMemo, useState, type ReactNode } from 'react';
import { I } from '@/components/icons';
import { Button, Field, Input, Modal, ModalFooter, ModalHeader, Select, StatusPill } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app-store';
import { deriveItems } from '@/utils/run-items';
import { renderInline, renderMarkdown } from '@/utils/markdown';
import type { Case, CreateRunResult, RunSnapshotMiss, TreeNode } from '@/types';

type NodeState = 'on' | 'off' | 'partial';

/** A failed creation, as the modal shows it (the store never creates a run it cannot freeze). */
type CreateFailure = Extract<CreateRunResult, { ok: false }>;

/** Width folder rows give their disclosure chevron (size-5 = 20px) plus its gap-1 (4px). */
const CHEVRON_COL = 24;

/**
 * Why the run was not created. `args` is a hard stop (the chosen set must be fixed or dropped);
 * `snapshot` is the explicit decision point for references that could not be frozen — the user
 * may still create the run, and it records them as unresolved.
 */
function CreateIssuePanel({ failure, onProceed }: { failure: CreateFailure; onProceed: () => void }) {
  if (failure.reason === 'snapshot')
    return (
      <div className="flex flex-col gap-1.5 rounded-md border border-blocked bg-blocked-soft px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
          {I.warn({ size: 14 })}
          {failure.issues.length === 1 ? '1 reference has no record to freeze' : `${failure.issues.length} references have no record to freeze`}
        </div>
        <ul className="flex max-h-[120px] flex-col gap-1 overflow-auto">
          {failure.issues.map((issue: RunSnapshotMiss) => (
            <li key={`${issue.id}-${issue.where}`} className="text-[12px] leading-[1.45] text-ink-2">
              <span className="font-mono text-[11px] text-ink-3">{issue.where}</span> — {issue.reason}
            </li>
          ))}
        </ul>
        <div className="text-[12px] text-ink-3">
          Creating the run anyway freezes the rest and records these references as unresolved — nothing is hidden.
        </div>
        <div>
          <Button variant="ghost" size="sm" onClick={onProceed}>
            {I.plus({ size: 12 })} Create the run without them
          </Button>
        </div>
      </div>
    );
  return (
    <div className="rounded-md border border-fail bg-fail-soft px-3 py-2.5 text-[12.5px] text-ink">
      <div className="flex items-center gap-1.5 font-semibold">{I.warn({ size: 14 })} The run was not created</div>
      <div className="mt-1 text-ink-2">{failure.message}</div>
    </div>
  );
}

/** A tri-state checkbox: checked / indeterminate / empty. */
function TriBox({ state }: { state: NodeState }) {
  if (state === 'on')
    return (
      <span className="grid size-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px] border-accent bg-accent text-white">
        {I.check({ size: 12 })}
      </span>
    );
  if (state === 'partial')
    return (
      <span className="grid size-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px] border-accent bg-accent-soft text-accent">
        <span className="h-[2px] w-2.5 rounded-full bg-accent" />
      </span>
    );
  return <span className="size-[18px] shrink-0 rounded-[5px] border-[1.5px] border-border-2 bg-panel" />;
}

export function CreateRunModal() {
  const ctx = useApp();
  const close = () => ctx.setModal(null);
  const allTags = useMemo(() => [...new Set(ctx.cases.flatMap((c) => c.tags))].sort(), [ctx.cases]);
  const byId = useMemo(() => new Map(ctx.cases.map((c) => [c.id, c] as const)), [ctx.cases]);

  const [name, setName] = useState('');
  const [tag, setTag] = useState(allTags[0] ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // `arguments` set to freeze into the run ('' = none, the default — a run needs no values).
  const [argsId, setArgsId] = useState('');
  const [failure, setFailure] = useState<CreateFailure | null>(null);
  const [busy, setBusy] = useState(false);
  // Case shown in the right-hand detail pane (clicking a case's name previews it;
  // clicking its checkbox toggles inclusion). Null until the user picks one.
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewCase = previewId ? (byId.get(previewId) ?? null) : null;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(ctx.tree.map((n) => (n.type === 'suite' ? n.id : ''))));

  // Precompute suite id → all descendant case ids once (avoids rebuilding the suite
  // index on every node visit, which was O(N²) across the whole tree render).
  const caseIdsBySuite = useMemo(() => {
    const map = new Map<string, string[]>();
    const collect = (node: TreeNode): string[] => {
      if (node.type === 'case') return [node.id];
      const ids = node.children.flatMap(collect);
      map.set(node.id, ids);
      return ids;
    };
    ctx.tree.forEach(collect);
    return map;
  }, [ctx.tree]);

  // Case ids beneath a suite/workspace node (recurses into sub-suites).
  const caseIdsUnder = (node: TreeNode): string[] =>
    node.type === 'case' ? [node.id] : (caseIdsBySuite.get(node.id) ?? []);

  const nodeState = (node: TreeNode): NodeState => {
    if (node.type === 'case') return selected.has(node.id) ? 'on' : 'off';
    const ids = caseIdsUnder(node);
    if (ids.length === 0) return 'off';
    const on = ids.filter((id) => selected.has(id)).length;
    return on === 0 ? 'off' : on === ids.length ? 'on' : 'partial';
  };

  const toggleNode = (node: TreeNode) => {
    const ids = caseIdsUnder(node);
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = ids.length > 0 && ids.every((id) => next.has(id));
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAll = () => setSelected(new Set(ctx.cases.map((c) => c.id)));
  const clearAll = () => setSelected(new Set());
  const addTag = () => {
    const ids = ctx.cases.filter((c) => c.tags.includes(tag)).map((c) => c.id);
    setSelected((prev) => new Set([...prev, ...ids]));
  };

  const count = selected.size;
  const scopeLabel = count === ctx.cases.length && count > 0 ? 'repo' : `custom (${count} ${count === 1 ? 'case' : 'cases'})`;

  // Only sets the app can read and write: an archived or unreadable record must not be offered.
  const argSets = useMemo(
    () => ctx.refs.filter((d) => d.entry.kind === 'arguments' && !d.entry.archived && !d.readonly),
    [ctx.refs],
  );
  const selectedArgs = argsId ? argSets.find((d) => d.id === argsId) : undefined;

  /**
   * Create the run. The store freezes the reference book first and refuses (with a reason) a run
   * it cannot freeze honestly, so a failure here keeps every choice and shows the problem.
   * `allowIncomplete` is the user's explicit "create it anyway" for unfreezable references.
   */
  const submit = (allowIncomplete: boolean) => {
    setBusy(true);
    void ctx
      .createRun({ name: name.trim(), caseIds: [...selected], scopeLabel, argsEntryId: argsId || null, allowIncomplete })
      .then((res) => {
        setBusy(false);
        if (!res.ok) setFailure(res);
      });
  };

  // ---- recursive tree rows ----
  const renderNodes = (nodes: TreeNode[], depth: number): ReactNode[] =>
    nodes.flatMap((node) => {
      const indent = 8 + depth * 18;
      if (node.type === 'case') {
        const c: Case | undefined = byId.get(node.id);
        const active = previewId === node.id;
        return (
          <div
            key={node.id}
            className={cn('flex w-full items-center gap-2.5 rounded-md px-2 py-[5px] hover:bg-raise', active && 'bg-accent-soft hover:bg-accent-soft')}
            // Folder rows lead with a chevron (CHEVRON_COL wide); cases have none, so they reserve
            // the same width — this keeps a case's checkbox one indent step to the RIGHT of its
            // parent folder's, instead of landing to the left of it.
            style={{ paddingLeft: indent + CHEVRON_COL }}
          >
            {/* Only the checkbox toggles inclusion — clicking the name previews the case instead. */}
            <button className="grid shrink-0 place-items-center" onClick={() => toggleNode(node)} title={nodeState(node) === 'on' ? 'Remove from run' : 'Include in run'}>
              <TriBox state={nodeState(node)} />
            </button>
            <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => setPreviewId(node.id)} title="Show details">
              <span className="font-mono text-[11px] text-ink-3">{c?.displayId ?? '—'}</span>
              <span className="truncate text-[13px] text-ink">{c?.title ?? node.id}</span>
            </button>
          </div>
        );
      }
      const open = expanded.has(node.id);
      const rows: ReactNode[] = [
        <div key={node.id} className="flex items-center gap-1 rounded-md hover:bg-raise" style={{ paddingLeft: indent }}>
          <button className="grid size-5 shrink-0 place-items-center text-ink-faint" onClick={() => toggleExpand(node.id)} title={open ? 'Collapse' : 'Expand'}>
            {I.chevron({ size: 14, style: { transform: open ? 'rotate(90deg)' : 'none' } })}
          </button>
          <button className="flex flex-1 items-center gap-2.5 py-[5px] text-left" onClick={() => toggleNode(node)}>
            <TriBox state={nodeState(node)} />
            <span className="grid place-items-center text-ink-faint">
              {node.isWorkspace ? I.workspace({ size: 14 }) : I.folder({ size: 14 })}
            </span>
            <span className="text-[13px] font-semibold">{node.name}</span>
            <span className="font-mono text-[11px] text-ink-faint">{caseIdsUnder(node).length}</span>
          </button>
        </div>,
      ];
      if (open) rows.push(...renderNodes(node.children, depth + 1));
      return rows;
    });

  return (
    <Modal onClose={close} maxWidth={1600} className="h-[88%]">
      <ModalHeader>
        <span className="grid place-items-center text-accent">{I.grid({ size: 18 })}</span>
        <h3>New test run</h3>
      </ModalHeader>
      <div className="flex min-h-0 flex-1">
        {/* Left — the run form (name + case picker). */}
        <div className="flex min-h-0 w-1/2 flex-col gap-4 overflow-hidden p-[18px]">
          <Field label="Run name">
            <Input value={name} placeholder="e.g. Regression — Sprint 13" onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Arguments set — optional">
            <Select
              aria-label="Run arguments set"
              value={argsId}
              onValueChange={(value) => {
                setArgsId(value);
                setFailure(null);
              }}
              options={[{ value: '', label: 'None' }, ...argSets.map((d) => ({ value: d.id, label: `${d.entry.title || d.id} · ${(d.entry.values ?? []).length} values` }))]}
            />
            <div className="pt-1.5 text-[11.5px] text-ink-faint">
              {argSets.length === 0 ? (
                <>No argument sets yet — add one in the Reference section. A run without a set is fine.</>
              ) : selectedArgs ? (
                <>
                  Values are frozen into the run as <span className="font-mono">arguments.json</span> with revision{' '}
                  <span className="font-mono">{selectedArgs.revision.slice(0, 8)}</span>; editing the set later never changes this run.
                </>
              ) : (
                <>Optional: freeze a set of values (e.g. <span className="font-mono">dev</span>) with this run for automation and reports.</>
              )}
            </div>
          </Field>
          <Field className="min-h-0 flex-1" label="Cases — check workspaces, suites, or individual cases">
            <div className="flex flex-wrap items-center gap-2 pb-2">
              <Button variant="ghost" size="sm" onClick={selectAll}>
                Select all (repo)
              </Button>
              <Button variant="ghost" size="sm" onClick={clearAll}>
                Clear
              </Button>
              {allTags.length > 0 && (
                <span className="ml-auto flex items-center gap-1.5">
                  {I.tag({ size: 13 })}
                  <Select aria-label="Case tag" size="sm" className="w-auto" value={tag} onValueChange={setTag} options={allTags.map((t) => ({ value: t, label: t }))} />
                  <Button variant="ghost" size="sm" onClick={addTag}>
                    {I.plus({ size: 12 })} Add tag
                  </Button>
                </span>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-panel p-1">
              {ctx.tree.length === 0 ? (
                <div className="px-2 py-3 text-[13px] text-ink-3">No cases yet.</div>
              ) : (
                renderNodes(ctx.tree, 0)
              )}
            </div>
          </Field>
          <div className="flex-none text-[12.5px] text-ink-3">
            {I.layers({ size: 13 })} Seeds <b>{count}</b> {count === 1 ? 'case' : 'cases'} · keyed on stable{' '}
            <span className="font-mono">case_id</span> · written as a folder under <span className="font-mono">.ch/runs/</span>.
          </div>
        </div>
        {/* Right — details of the case whose name was clicked. */}
        <div className="flex min-h-0 w-1/2 flex-col border-l border-border bg-panel-2">
          <CasePreview kase={previewCase} />
        </div>
      </div>
      {failure && (
        <div className="flex-none border-t border-border px-[18px] py-3">
          <CreateIssuePanel failure={failure} onProceed={() => submit(true)} />
        </div>
      )}
      <ModalFooter>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!name.trim() || count === 0 || busy}
          onClick={() => submit(false)}
        >
          {I.plus({ size: 14 })} Create run
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/** A labeled block in the detail pane. */
function PreviewSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">{title}</div>
      {children}
    </section>
  );
}

/** Read-only detail of the case the user clicked — header (id / status / tags) + scrollable body. */
function CasePreview({ kase }: { kase: Case | null }) {
  if (!kase)
    return (
      <div className="grid flex-1 place-items-center px-8 text-center">
        <div className="flex flex-col items-center gap-3 text-ink-faint">
          <span className="grid size-12 place-items-center rounded-full bg-sunken">{I.grid({ size: 22 })}</span>
          <div className="text-[13px]">Click a case&rsquo;s name on the left to preview its full details here.</div>
        </div>
      </div>
    );

  const { setup, steps, accept } = deriveItems(kase);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-none border-b border-border px-5 py-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="font-mono text-[12px] font-semibold text-accent-ink">{kase.displayId}</span>
          <StatusPill status={kase.status} />
        </div>
        <h4 className="m-0 text-[17px] font-semibold leading-[1.3] tracking-[-0.01em] [text-wrap:pretty]">{kase.title}</h4>
        {kase.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {kase.tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full border border-border bg-panel px-2 py-0.5 text-[11px] text-ink-2">
                {I.tag({ size: 10 })} {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        <div className="flex flex-col gap-5">
          {kase.objective.trim() && (
            <PreviewSection title="Objective">
              <div className="font-read text-[14px] leading-[1.6] text-ink-2">{renderMarkdown(kase.objective, 'p-obj')}</div>
            </PreviewSection>
          )}
          {kase.systems.length > 0 && (
            <PreviewSection title="Systems in scope">
              <div className="flex flex-wrap gap-1.5">
                {kase.systems.map((s, i) => (
                  <span key={i} className="rounded-full border border-border bg-panel px-[10px] py-[3px] text-[12px] text-ink-2">
                    {renderInline(s, `p-sys${i}`)}
                  </span>
                ))}
              </div>
            </PreviewSection>
          )}
          {setup.length > 0 && (
            <PreviewSection title="Setup">
              <ul className="flex flex-col gap-2">
                {setup.map((it) => (
                  <li key={it.key} className="text-[13px] leading-[1.5]">
                    <div className="font-semibold text-ink">{renderInline(it.text, it.key)}</div>
                    {it.body && <div className="mt-0.5 text-ink-3">{renderMarkdown(it.body, it.key + 'b')}</div>}
                  </li>
                ))}
              </ul>
            </PreviewSection>
          )}
          {steps.length > 0 && (
            <PreviewSection title="Steps">
              <ol className="flex flex-col gap-1.5">
                {steps.map((it) => (
                  <li key={it.key} className="flex gap-2 text-[13px] leading-[1.5] text-ink-2" style={{ paddingLeft: (it.depth ?? 0) * 16 }}>
                    <span className="min-w-[1.6em] shrink-0 font-mono text-[12px] text-ink-faint">{it.num}</span>
                    <span>{renderInline(it.text, it.key)}</span>
                  </li>
                ))}
              </ol>
            </PreviewSection>
          )}
          {accept.length > 0 && (
            <PreviewSection title="Acceptance criteria">
              <ul className="flex flex-col gap-1.5">
                {accept.map((it) => (
                  <li key={it.key} className="flex gap-2 text-[13px] leading-[1.5] text-ink-2">
                    <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" />
                    <span>{renderInline(it.text, it.key)}</span>
                  </li>
                ))}
              </ul>
            </PreviewSection>
          )}
        </div>
      </div>
    </div>
  );
}
