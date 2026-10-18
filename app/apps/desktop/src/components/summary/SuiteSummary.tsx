import { useEffect, useState } from 'react';
import { I } from '@/components/icons';
import { Button, Field, Input, StatusPill, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app-store';
import type { Case, Result, Run, Status, SuiteNode, TreeNode, Workspace } from '@/types';
import { EmptyCenter } from '@/components/common/EmptyCenter';

function findSuiteNode(nodes: TreeNode[], id: string): SuiteNode | null {
  for (const n of nodes) {
    if (n.type === 'suite' && n.id === id) return n;
    const r = n.type === 'suite' ? findSuiteNode(n.children, id) : null;
    if (r) return r;
  }
  return null;
}

function collectCaseIds(nodes: TreeNode[], out: string[]) {
  for (const n of nodes) {
    if (n.type === 'case') out.push(n.id);
    else collectCaseIds(n.children, out);
  }
}

const STATUS_DOT: Record<Status, string> = { active: 'bg-pass', draft: 'bg-blocked', deprecated: 'bg-ink-faint' };

function StatCount({ label, n, dot }: { label: string; n: number; dot?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[22px] font-bold leading-none tracking-[-0.01em]">{n}</span>
      <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.05em] text-ink-faint">
        {dot && <span className={cn('size-[7px] rounded-full', dot)} />}
        {label}
      </span>
    </div>
  );
}

/**
 * Editable metadata for a workspace OR a suite, persisted to its (optional, lazy) sibling
 * folder note (`<folder>.md`). Commits on blur. A workspace's Name + prefix are required
 * (revert when blank); a suite's prefix is optional — blank means "inherit from the parent".
 */
function FolderSettings({ node, ws }: { node: SuiteNode; ws: Workspace | null }) {
  const { updateWorkspace, updateSuite, resolveSuitePrefix } = useApp();
  const isWs = !!node.isWorkspace && !!ws;

  const init = isWs && ws
    ? { name: ws.name, description: ws.description, prefix: ws.prefix }
    : { name: node.name, description: node.description ?? '', prefix: node.prefix ?? '' };
  const [name, setName] = useState(init.name);
  const [description, setDescription] = useState(init.description);
  const [prefix, setPrefix] = useState(init.prefix);

  // resync when the selected node / workspace changes underneath us (reload, switching)
  useEffect(() => {
    setName(init.name);
    setDescription(init.description);
    setPrefix(init.prefix);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id, ws?.id, init.name, init.description, init.prefix]);

  const commit = (patch: { name?: string; description?: string; prefix?: string }) =>
    isWs && ws ? updateWorkspace(ws.id, patch) : updateSuite(node.id, patch);
  const commitName = () => (name.trim() ? commit({ name: name.trim() }) : setName(init.name));
  // Workspace prefix is required (revert when blank); a suite's blank prefix clears the
  // override so it inherits from an ancestor.
  const commitPrefix = () =>
    isWs ? (prefix.trim() ? commit({ prefix: prefix.trim() }) : setPrefix(init.prefix)) : commit({ prefix: prefix.trim() });

  const inherited = resolveSuitePrefix(node.id);
  const effectivePrefix = prefix.trim() || (isWs ? 'CW' : inherited);
  const notePath = isWs ? (ws?.path ? `${ws.path}.md` : '.casewright/config.yaml') : `${node.path}.md`;

  return (
    <section className="rounded-lg border border-border bg-panel-2">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">{isWs ? 'Workspace settings' : 'Suite settings'}</span>
        <span className="font-mono text-[11px] text-ink-faint">{notePath}</span>
      </div>
      <div className="flex flex-col gap-3.5 p-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} />
        </Field>
        <Field label="Description">
          <Textarea
            rows={2}
            value={description}
            placeholder={isWs ? 'What this workspace is for…' : 'What this suite covers…'}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => commit({ description })}
          />
        </Field>
        <Field label="Display ID prefix">
          <Input
            mono
            value={prefix}
            placeholder={isWs ? 'PAY' : inherited}
            onChange={(e) => setPrefix(e.target.value)}
            onBlur={commitPrefix}
          />
        </Field>
        <div className="text-[11.5px] text-ink-faint">
          New cases here are numbered <span className="font-mono">{effectivePrefix}-NNNN</span>
          {!isWs && !prefix.trim() && (
            <> (inherited from <span className="font-mono">{inherited}</span>)</>
          )}
          ; runs are stored centrally in <span className="font-mono">.casewright/runs/</span>.
        </div>
      </div>
    </section>
  );
}

function runTally(run: Run, ids: Set<string> | null): { total: number; pass: number; fail: number } {
  const rows = ids ? run.rows.filter((r) => ids.has(r.case_id)) : run.rows;
  const count = (res: Result) => rows.filter((r) => r.result === res).length;
  return { total: rows.length, pass: count('pass'), fail: count('fail') };
}

export function SuiteSummary() {
  const { sel, tree, cases, runs, workspaces, openCase, openRun, createCase } = useApp();
  const node = sel.suiteId ? findSuiteNode(tree, sel.suiteId) : null;
  if (!node) return <EmptyCenter />;

  const isWorkspace = !!node.isWorkspace;
  const ws = workspaces.find((w) => node.path === w.path || node.path.startsWith(w.path + '/')) ?? null;

  const ids: string[] = [];
  collectCaseIds(node.children, ids);
  const idSet = new Set(ids);
  const byId = new Map(cases.map((c) => [c.id, c]));
  const myCases = ids.map((id) => byId.get(id)).filter((c): c is Case => !!c);

  const counts: Record<Status, number> = { active: 0, draft: 0, deprecated: 0 };
  myCases.forEach((c) => (counts[c.status] += 1));

  // Runs are repo-level; a run is relevant if any of its rows references a case that
  // lives under this node (workspace or suite) — by case membership, not file path (req 21).
  const relevantRuns = runs.filter((r) => r.rows.some((row) => idSet.has(row.case_id))).slice(0, 6);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel">
      <div className="flex-none border-b border-border px-[26px] py-[18px]">
        <div className="flex items-center gap-3">
          <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', isWorkspace ? 'bg-accent-soft text-accent' : 'bg-sunken text-ink-3')}>
            {isWorkspace ? I.workspace({ size: 20 }) : I.folder({ size: 20 })}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[21px] font-semibold tracking-[-0.01em]">{node.name}</h2>
            <div className="mt-0.5 font-mono text-[12px] text-ink-faint">{node.path}/</div>
          </div>
          <Button variant="primary" onClick={() => createCase(node.id)}>
            {I.plus({ size: 14 })} New case
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-7 gap-y-2">
          <StatCount label="cases" n={myCases.length} />
          <StatCount label="active" n={counts.active} dot={STATUS_DOT.active} />
          <StatCount label="draft" n={counts.draft} dot={STATUS_DOT.draft} />
          <StatCount label="deprecated" n={counts.deprecated} dot={STATUS_DOT.deprecated} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex max-w-[820px] flex-col gap-6 px-[26px] py-[26px]">
          <FolderSettings node={node} ws={ws} />

          <section>
            <div className="mb-2.5 flex items-center gap-2">
              <span className="text-[13px] font-semibold">Test cases</span>
              <span className="font-mono text-[11px] text-ink-faint">{myCases.length}</span>
            </div>
            {myCases.length === 0 ? (
              <div className="rounded-md border border-dashed border-border-2 bg-panel-2 px-3 py-4 text-[12.5px] text-ink-3">
                No cases yet. Use “New case” above, or the + on a folder in the sidebar.
              </div>
            ) : (
              <div className="flex flex-col overflow-hidden rounded-lg border border-border">
                {myCases.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => openCase(c.id)}
                    className="flex items-center gap-3 border-b border-border px-3.5 py-2.5 text-left last:border-b-0 hover:bg-raise"
                  >
                    <span className="grid shrink-0 place-items-center text-ink-3">{I.file({ size: 14 })}</span>
                    <span className="w-[84px] shrink-0 font-mono text-[11.5px] text-ink-faint">{c.displayId}</span>
                    <span className={cn('min-w-0 flex-1 truncate text-[13.5px]', c.status === 'deprecated' && 'text-ink-faint')}>{c.title}</span>
                    {c.modified && <span className="size-1.5 shrink-0 rounded-full bg-blocked" title="Uncommitted" />}
                    <StatusPill status={c.status} />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-2.5 flex items-center gap-2">
              <span className="text-[13px] font-semibold">{isWorkspace ? 'Runs' : 'Recent runs'}</span>
              <span className="font-mono text-[11px] text-ink-faint">{relevantRuns.length}</span>
            </div>
            {relevantRuns.length === 0 ? (
              <div className="rounded-md border border-dashed border-border-2 bg-panel-2 px-3 py-4 text-[12.5px] text-ink-3">
                No runs {isWorkspace ? 'in this workspace' : 'cover these cases'} yet.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {relevantRuns.map((run) => {
                  const t = runTally(run, idSet);
                  const pct = t.total ? Math.round((t.pass / t.total) * 100) : 0;
                  return (
                    <button
                      key={run.id}
                      onClick={() => openRun(run.id)}
                      className="flex items-center gap-3 rounded-lg border border-border bg-panel px-3.5 py-3 text-left transition hover:border-accent-line hover:shadow-[0_2px_8px_var(--shadow)]"
                    >
                      <span className="grid shrink-0 place-items-center text-ink-3">{I.grid({ size: 15 })}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[13.5px] font-semibold">
                          {run.name}
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em]', run.status === 'open' ? 'bg-accent-soft text-accent-ink' : 'bg-sunken text-ink-3')}>
                            {run.status}
                          </span>
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-ink-faint">{run.created}</div>
                      </div>
                      <div className="shrink-0 text-right font-mono text-[11.5px] text-ink-3">
                        {t.total} cases · {t.pass} pass{t.fail ? ` · ${t.fail} fail` : ''}
                      </div>
                      <span className="shrink-0 text-[15px] font-bold tabular-nums" style={{ color: pct >= 80 ? 'var(--pass)' : pct >= 50 ? 'var(--blocked)' : 'var(--fail)' }}>
                        {pct}%
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
