import { useState } from 'react';
import { I } from '@/components/icons';
import { Button, Modal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app-store';
import type { Resolution, Resolutions } from '@/types';
import { FileDetail } from './FileDetail';

/**
 * Root structured 3-way merge resolver (the showpiece). Reads the conflict from the
 * store; the structured 3-way merge engine that populates it is a deferred follow-up,
 * so this is null (and the modal is not shown) until then.
 */
export function MergeResolver() {
  const { completeMerge, setModal, conflict } = useApp();
  const cancel = () => setModal(null);
  const [active, setActive] = useState(0);
  const [resolutions, setResolutions] = useState<Resolutions>({});
  const setRes = (k: string, v: Resolution) => setResolutions((s) => ({ ...s, [k]: v }));

  if (!conflict) return null;

  // count conflicts per file + how many are resolved
  const fileStats = conflict.files.map((f) => {
    const keys =
      f.kind === 'run'
        ? f.rows.filter((r) => r.conflict).map((r) => f.path + '::' + r.case_id)
        : f.elements.filter((e) => e.conflict).map((e) => f.path + '::' + e.key);
    const resolved = keys.filter((k) => resolutions[k]).length;
    return { total: keys.length, resolved };
  });
  const totalConflicts = fileStats.reduce((a, s) => a + s.total, 0);
  const totalResolved = fileStats.reduce((a, s) => a + s.resolved, 0);
  const done = totalResolved === totalConflicts;

  return (
    <Modal onClose={cancel} dismissable={false} className="h-[90%] max-h-[920px] w-[96%] max-w-[1080px]">
      <div className="flex items-center gap-[13px] border-b border-border px-5 py-4">
        <div className="grid size-[34px] shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">{I.merge({ size: 20 })}</div>
        <div>
          <h3 className="m-0 text-[15.5px] font-semibold">
            Resolve merge — pull from <span className="font-mono">origin/{conflict.branch}</span>
          </h3>
          <div className="mt-px text-[12px] text-ink-3">Structured 3-way merge · non-conflicting changes already merged automatically</div>
        </div>
        <div className="ml-auto flex items-center gap-2.5 text-[12px] text-ink-3">
          <span>
            {totalResolved} / {totalConflicts} conflicts
          </span>
          <div className="h-1.5 w-[130px] overflow-hidden rounded-full bg-sunken">
            <i
              className="block h-full bg-accent transition-[width] duration-[250ms]"
              style={{ width: (totalConflicts ? (totalResolved / totalConflicts) * 100 : 100) + '%' }}
            />
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-64 flex-none overflow-auto border-r border-border bg-panel-2 p-2.5">
          <div className="px-1.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-faint">
            Conflicted files · {conflict.files.length}
          </div>
          {conflict.files.map((f, i) => {
            const st = fileStats[i];
            const resolved = st.resolved === st.total;
            return (
              <div
                key={i}
                className={cn(
                  'mb-1 cursor-pointer rounded-md border border-transparent px-2.5 py-[9px] hover:bg-raise',
                  active === i && 'border-border bg-panel shadow-[0_1px_2px_var(--shadow)]',
                )}
                onClick={() => setActive(i)}
              >
                <div className="flex items-center gap-[7px] font-mono text-[12px]">
                  <span className={cn('size-2 shrink-0 rounded-full', resolved ? 'bg-pass' : 'bg-blocked')} />
                  <span className="grid place-items-center text-ink-faint">
                    {f.kind === 'run' ? I.grid({ size: 13 }) : I.file({ size: 13 })}
                  </span>
                  <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{f.path.split('/').pop()}</span>
                  <span
                    className={cn(
                      'rounded-full px-[5px] font-mono text-[10px]',
                      resolved ? 'bg-pass-soft text-pass' : 'bg-blocked-soft text-[oklch(0.5_0.12_66)]',
                    )}
                  >
                    {resolved ? 'done' : st.resolved + '/' + st.total}
                  </span>
                </div>
                <div className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10.5px] text-ink-faint">
                  {f.path.replace(/\/[^/]+$/, '')}
                </div>
              </div>
            );
          })}
        </div>
        <FileDetail file={conflict.files[active]} resolutions={resolutions} setRes={setRes} />
      </div>

      <div className="flex items-center gap-3 border-t border-border bg-panel-2 px-5 py-[13px]">
        <span className="flex items-center gap-2 text-[12.5px] text-ink-3">
          {done ? (
            <span className="inline-flex items-center gap-1.5 text-pass">{I.check({ size: 14 })} All conflicts resolved</span>
          ) : (
            <>
              {I.warn({ size: 14 })} {totalConflicts - totalResolved} conflict(s) remaining
            </>
          )}
        </span>
        <span className="flex-1" />
        <Button variant="ghost" onClick={cancel}>
          Abort merge
        </Button>
        <Button onClick={cancel} title="Hand-edit raw markdown / CSV">
          {I.code({ size: 14 })} Raw view
        </Button>
        <Button variant="primary" disabled={!done} onClick={() => completeMerge(resolutions)}>
          {I.merge({ size: 14 })} Complete merge
        </Button>
      </div>
    </Modal>
  );
}
