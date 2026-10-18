import { useMemo, useState, type ReactNode } from 'react';
import { I } from '@/components/icons';
import { Button, Field, Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui';
import { useApp } from '@/store/app-store';
import type { Case, TreeNode } from '@/types';

type NodeState = 'on' | 'off' | 'partial';

/** Width folder rows give their disclosure chevron (size-5 = 20px) plus its gap-1 (4px). */
const CHEVRON_COL = 24;

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

/**
 * Pick additional cases to append to the currently open run. Cases already in the run are shown
 * disabled (greyed, "in run") so the tree stays oriented; only genuinely new cases are selectable.
 */
export function AddCasesModal() {
  const ctx = useApp();
  const close = () => ctx.setModal(null);
  const run = ctx.runs.find((r) => r.id === ctx.sel.runId);

  const byId = useMemo(() => new Map(ctx.cases.map((c) => [c.id, c] as const)), [ctx.cases]);
  const inRun = useMemo(() => new Set(run?.rows.map((r) => r.case_id) ?? []), [run]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(ctx.tree.map((n) => (n.type === 'suite' ? n.id : ''))));

  // suite id → all descendant case ids (precomputed once, like the create-run picker).
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

  // Only cases not already in the run are addable; toggling a suite acts on its addable cases.
  const addableUnder = (node: TreeNode): string[] =>
    (node.type === 'case' ? [node.id] : (caseIdsBySuite.get(node.id) ?? [])).filter((id) => !inRun.has(id));

  const nodeState = (node: TreeNode): NodeState => {
    if (node.type === 'case') return selected.has(node.id) ? 'on' : 'off';
    const ids = addableUnder(node);
    if (ids.length === 0) return 'off';
    const on = ids.filter((id) => selected.has(id)).length;
    return on === 0 ? 'off' : on === ids.length ? 'on' : 'partial';
  };

  const toggleNode = (node: TreeNode) => {
    const ids = addableUnder(node);
    if (ids.length === 0) return;
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = ids.every((id) => next.has(id));
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

  const newCaseIds = useMemo(() => ctx.cases.filter((c) => !inRun.has(c.id)).map((c) => c.id), [ctx.cases, inRun]);
  const selectAll = () => setSelected(new Set(newCaseIds));
  const clearAll = () => setSelected(new Set());

  const count = selected.size;

  // ---- recursive tree rows ----
  const renderNodes = (nodes: TreeNode[], depth: number): ReactNode[] =>
    nodes.flatMap((node) => {
      const indent = 8 + depth * 18;
      if (node.type === 'case') {
        const c: Case | undefined = byId.get(node.id);
        const already = inRun.has(node.id);
        return (
          <button
            key={node.id}
            disabled={already}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-[5px] text-left enabled:hover:bg-raise disabled:cursor-default disabled:opacity-50"
            style={{ paddingLeft: indent + CHEVRON_COL }}
            onClick={() => toggleNode(node)}
          >
            <TriBox state={nodeState(node)} />
            <span className="font-mono text-[11px] text-ink-3">{c?.displayId ?? '—'}</span>
            <span className="truncate text-[13px] text-ink">{c?.title ?? node.id}</span>
            {already && <span className="ml-auto shrink-0 text-[11px] text-ink-faint">in run</span>}
          </button>
        );
      }
      const open = expanded.has(node.id);
      const addable = addableUnder(node).length;
      const rows: ReactNode[] = [
        <div key={node.id} className="flex items-center gap-1 rounded-md hover:bg-raise" style={{ paddingLeft: indent }}>
          <button className="grid size-5 shrink-0 place-items-center text-ink-faint" onClick={() => toggleExpand(node.id)} title={open ? 'Collapse' : 'Expand'}>
            {I.chevron({ size: 14, style: { transform: open ? 'rotate(90deg)' : 'none' } })}
          </button>
          <button className="flex flex-1 items-center gap-2.5 py-[5px] text-left disabled:cursor-default" disabled={addable === 0} onClick={() => toggleNode(node)}>
            <TriBox state={nodeState(node)} />
            <span className="grid place-items-center text-ink-faint">
              {node.isWorkspace ? I.workspace({ size: 14 }) : I.folder({ size: 14 })}
            </span>
            <span className="text-[13px] font-semibold">{node.name}</span>
            <span className="font-mono text-[11px] text-ink-faint">{addable}</span>
          </button>
        </div>,
      ];
      if (open) rows.push(...renderNodes(node.children, depth + 1));
      return rows;
    });

  return (
    <Modal onClose={close} maxWidth={820}>
      <ModalHeader>
        <span className="grid place-items-center text-accent">{I.plus({ size: 18 })}</span>
        <h3>Add cases to run</h3>
      </ModalHeader>
      <ModalBody style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Cases — check workspaces, suites, or individual cases to add">
          <div className="flex flex-wrap items-center gap-2 pb-2">
            <Button variant="ghost" size="sm" disabled={newCaseIds.length === 0} onClick={selectAll}>
              Select all new
            </Button>
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Clear
            </Button>
          </div>
          <div className="max-h-[460px] min-h-[300px] overflow-auto rounded-md border border-border bg-panel p-1">
            {ctx.tree.length === 0 ? (
              <div className="px-2 py-3 text-[13px] text-ink-3">No cases yet.</div>
            ) : newCaseIds.length === 0 ? (
              <div className="px-2 py-3 text-[13px] text-ink-3">Every case is already in this run.</div>
            ) : (
              renderNodes(ctx.tree, 0)
            )}
          </div>
        </Field>
        <div className="text-[12.5px] text-ink-3">
          {I.layers({ size: 13 })} Adds <b>{count}</b> {count === 1 ? 'case' : 'cases'} as fresh, not-run rows · keyed on stable{' '}
          <span className="font-mono">case_id</span>.
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={count === 0 || !run}
          onClick={() => {
            if (run) ctx.addRunCases(run.id, [...selected]);
            close();
          }}
        >
          {I.plus({ size: 14 })} Add {count > 0 ? count : ''} {count === 1 ? 'case' : 'cases'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
