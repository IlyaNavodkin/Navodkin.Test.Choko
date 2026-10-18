import { useState, type ReactNode } from 'react';
import { I } from '@/components/icons';
import { Button, Field, Modal, ModalBody, ModalFooter, ModalHeader, Tag, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app-store';
import { parsePatch, type FilePatch, type PatchLine } from '@/utils/patch';
import type { Change } from '@/types';

const keyOf = (c: Change) => c.kind + ':' + c.refId;

const STAT_COLOR: Record<string, string> = { M: 'text-blocked', A: 'text-pass', D: 'text-fail' };
const STAT_LABEL: Record<string, string> = { A: 'Added', M: 'Modified', D: 'Deleted' };

/** Changes are shown grouped by what they are, not as raw files — a run is one row for its
 *  whole folder, a case is one row by title. */
const GROUPS = [
  { kind: 'case' as const, title: 'Test cases', icon: I.file },
  { kind: 'run' as const, title: 'Test runs', icon: I.grid },
];

const VERB: Record<string, string> = { A: 'Add', M: 'Update', D: 'Remove' };
const NOUN: Record<'case' | 'run', [string, string]> = {
  case: ['test case', 'test cases'],
  run: ['test run', 'test runs'],
};

/** A sensible default commit message derived from the selected entities (the user can override it). */
function suggestMessage(sel: Change[]): string {
  if (sel.length === 0) return '';
  if (sel.length === 1) {
    const c = sel[0];
    return `${VERB[c.status] ?? 'Update'} ${NOUN[c.kind][0]} "${c.label}"`;
  }
  const parts = (['case', 'run'] as const)
    .map((kind) => ({ kind, n: sel.filter((c) => c.kind === kind).length }))
    .filter((p) => p.n > 0)
    .map((p) => `${p.n} ${NOUN[p.kind][p.n === 1 ? 0 : 1]}`);
  const statuses = new Set(sel.map((c) => c.status));
  const verb = statuses.size === 1 ? (VERB[[...statuses][0]] ?? 'Update') : 'Update';
  return `${verb} ${parts.join(' and ')}`;
}

type DiffState = FilePatch[] | 'loading' | 'error';

const LINE_CLASS: Record<PatchLine['t'], string> = {
  add: 'bg-add-bg text-[color:var(--add)]',
  del: 'bg-del-bg text-[color:var(--del)]',
  hunk: 'bg-sunken text-ink-faint',
  ctx: 'text-ink-2',
};

/** The expandable diff panel under a change row — colored unified-diff lines per file. */
function DiffView({ diff }: { diff: DiffState | undefined }) {
  if (!diff || diff === 'loading')
    return <div className="px-3 py-2 text-[11.5px] text-ink-faint">Loading diff…</div>;
  if (diff === 'error')
    return <div className="px-3 py-2 text-[11.5px] text-fail">Could not read the diff for this change.</div>;
  if (diff.length === 0)
    return <div className="px-3 py-2 text-[11.5px] text-ink-faint">No differences against the last commit.</div>;
  return (
    <div className="max-h-[260px] overflow-auto font-mono text-[11px] leading-[1.55]">
      {diff.map((f) => (
        <div key={f.path}>
          <div className="sticky top-0 flex items-center gap-1.5 border-y border-border bg-sunken px-2.5 py-1 text-[10.5px] text-ink-3 first:border-t-0">
            <span className="truncate">{f.path}</span>
            {f.created && <span className="font-bold text-pass">new</span>}
            {f.deleted && <span className="font-bold text-fail">deleted</span>}
          </div>
          {f.lines.map((l, i) => (
            <div key={i} className={cn('whitespace-pre-wrap break-words px-2.5', LINE_CLASS[l.t])}>
              {l.text || ' '}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** A small per-row icon action (diff / stage / revert), quiet until hovered. */
function RowAction({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-md text-ink-3 opacity-0 transition hover:bg-sunken hover:text-ink focus-visible:opacity-100 group-hover/row:opacity-100',
        active && 'bg-sunken text-accent opacity-100',
      )}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

export function CommitModal() {
  const ctx = useApp();
  const { changes, branch, doCommit, setModal, gitBusy } = ctx;
  const close = () => setModal(null);
  const [sel, setSel] = useState<Record<string, boolean>>(() =>
    changes.reduce<Record<string, boolean>>((a, c) => ((a[keyOf(c)] = true), a), {}),
  );
  // null → show the auto-suggested message (and keep it in sync with the selection); once the user
  // types, `msg` holds their text and the suggestion no longer overrides it.
  const [msg, setMsg] = useState<string | null>(null);
  const [openDiff, setOpenDiff] = useState<Record<string, boolean>>({});
  const [diffs, setDiffs] = useState<Record<string, DiffState>>({});

  const toggle = (k: string) => setSel((s) => ({ ...s, [k]: !s[k] }));
  const toggleDiff = (c: Change) => {
    const k = keyOf(c);
    setOpenDiff((s) => ({ ...s, [k]: !s[k] }));
    if (!diffs[k]) {
      setDiffs((s) => ({ ...s, [k]: 'loading' }));
      ctx
        .changeDiff(c)
        .then((text) => setDiffs((s) => ({ ...s, [k]: parsePatch(text) })))
        .catch(() => setDiffs((s) => ({ ...s, [k]: 'error' })));
    }
  };

  const selectedChanges = changes.filter((c) => sel[keyOf(c)]);
  const selectedKeys = selectedChanges.map(keyOf);
  const n = selectedKeys.length;
  const message = msg ?? suggestMessage(selectedChanges);

  return (
    <Modal onClose={close} maxWidth={720}>
      <ModalHeader>
        <span className="grid place-items-center text-accent">{I.commit({ size: 18 })}</span>
        <h3>Commit changes</h3>
        <Tag className="ml-auto">
          {n} of {changes.length} staged
        </Tag>
      </ModalHeader>
      <ModalBody style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {changes.length === 0 ? (
          <div className="flex items-center gap-[7px] rounded-md border border-dashed border-border-2 bg-panel-2 px-3 py-[9px] text-[12px] text-ink-3">
            {I.check({ size: 14 })} Working tree clean — nothing to commit.
          </div>
        ) : (
          <>
            <div className="flex flex-col overflow-hidden rounded-md border border-border">
              {GROUPS.map((g) => {
                const items = changes.filter((c) => c.kind === g.kind);
                if (!items.length) return null;
                return (
                  <div key={g.kind} className="flex flex-col">
                    <div className="flex items-center gap-1.5 border-b border-border bg-panel-2 px-[11px] py-1.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-ink-faint">
                      {g.icon({ size: 12 })}
                      {g.title}
                      <span className="text-ink-3">({items.length})</span>
                    </div>
                    {items.map((c) => {
                      const k = keyOf(c);
                      const staged = !!sel[k];
                      return (
                        <div key={k} className="border-b border-border last:border-b-0">
                          <div
                            className="group/row flex cursor-pointer items-center gap-2.5 px-[11px] py-2 hover:bg-panel-2"
                            onClick={() => toggle(k)}
                          >
                            <span
                              className={cn(
                                'grid size-4 shrink-0 place-items-center rounded-sm border-[1.5px] border-border-2 text-transparent',
                                staged && 'border-accent bg-accent text-white',
                              )}
                            >
                              {I.check({ size: 12 })}
                            </span>
                            <span
                              title={STAT_LABEL[c.status] ?? c.status}
                              className={cn('w-[14px] shrink-0 cursor-help text-center font-mono text-[11px] font-bold', STAT_COLOR[c.status])}
                            >
                              {c.status}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">{c.label}</span>
                            <RowAction title={openDiff[k] ? 'Hide diff' : 'View diff'} active={openDiff[k]} onClick={() => toggleDiff(c)}>
                              {I.eye({ size: 14 })}
                            </RowAction>
                            <RowAction title={staged ? 'Unstage — leave out of this commit' : 'Stage — include in this commit'} onClick={() => toggle(k)}>
                              {staged ? I.minus({ size: 14 }) : I.plus({ size: 14 })}
                            </RowAction>
                            <RowAction title="Discard changes… (restore the last committed version)" onClick={() => void ctx.revertChange(c)}>
                              {I.undo({ size: 14 })}
                            </RowAction>
                          </div>
                          {openDiff[k] && (
                            <div className="border-t border-border bg-panel-2">
                              <DiffView diff={diffs[k]} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <Field label="Message">
              <Textarea
                rows={3}
                placeholder="Describe what changed…"
                value={message}
                onChange={(ev) => setMsg(ev.target.value)}
                className="font-mono text-[12.5px]"
              />
            </Field>
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <span className="mr-auto flex items-center gap-1.5 text-[12px] text-ink-3">{I.branch({ size: 13 })} {branch}</span>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button variant="primary" disabled={n === 0 || !message.trim() || gitBusy} onClick={() => doCommit(selectedKeys, message)}>
          {I.commit({ size: 14 })} Commit {n} change{n === 1 ? '' : 's'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
