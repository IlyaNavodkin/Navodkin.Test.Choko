import { Fragment, useRef, useState } from 'react';
import { I } from '@/components/icons';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { editorKeyDown, renderInline } from '@/utils/markdown';
import { numberSteps } from '@/utils/steps';
import type { Step } from '@/types';

export interface StepsControlProps {
  steps: Step[];
  onChange: (steps: Step[]) => void;
}

const dropLine =
  "relative mx-0.5 my-px h-0.5 rounded-[2px] bg-accent before:absolute before:-left-0.5 before:top-1/2 before:size-[7px] before:-translate-y-1/2 before:rounded-full before:bg-accent before:shadow-[0_0_0_2px_var(--panel)] before:content-['']";

/** Steps — ordered, nestable list (Tab to nest, drag ↔ to re-parent). */
export function StepsControl({ steps, onChange }: StepsControlProps) {
  const refs = useRef<Record<number, HTMLInputElement | null>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [dropDepth, setDropDepth] = useState(0);
  const [preview, setPreview] = useState(false);
  const nums = numberSteps(steps);

  const setText = (i: number, v: string) => onChange(steps.map((s, j) => (j === i ? { ...s, text: v } : s)));
  const setDepth = (i: number, d: number) =>
    onChange(steps.map((s, j) => (j === i ? { ...s, depth: Math.max(0, Math.min(3, d)) } : s)));
  const remove = (i: number) => onChange(steps.filter((_, j) => j !== i));
  const addAfter = (i: number) => {
    const d = i >= 0 ? steps[i].depth : 0;
    const next = steps.slice();
    next.splice(i + 1, 0, { text: '', depth: d });
    onChange(next);
    requestAnimationFrame(() => refs.current[i + 1]?.focus());
  };

  // deepest nesting allowed at a gap = (depth of the item just above it) + 1
  const maxDepthAt = (gap: number) => {
    const arr = drag !== null ? steps.filter((_, j) => j !== drag) : steps;
    const gapND = drag !== null && drag < gap ? gap - 1 : gap;
    const prev = arr[gapND - 1];
    return Math.min(3, prev ? prev.depth + 1 : 0);
  };
  const rowOver = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const before = e.clientY - r.top < r.height / 2;
    const gap = before ? i : i + 1;
    const maxD = maxDepthAt(gap);
    const baseLeft = listRef.current ? listRef.current.getBoundingClientRect().left : r.left;
    let depth = Math.round((e.clientX - baseLeft - 44) / 22);
    depth = Math.max(0, Math.min(maxD, depth));
    setDropIdx(gap);
    setDropDepth(depth);
  };
  const doDrop = (e?: React.DragEvent) => {
    if (e) e.preventDefault();
    if (drag !== null && dropIdx !== null) {
      let at = dropIdx;
      if (drag < dropIdx) at -= 1;
      const next = steps.slice();
      const [x] = next.splice(drag, 1);
      next.splice(at, 0, { ...x, depth: dropDepth });
      onChange(next);
    }
    setDrag(null);
    setDropIdx(null);
  };
  const endDrag = () => {
    setDrag(null);
    setDropIdx(null);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-[9px]">
        <span className="grid place-items-center text-ink-3">{I.list({ size: 15 })}</span>
        <span className="text-[13px] font-semibold tracking-[0.01em] text-ink">Steps</span>
        <span className="font-mono text-[11px] text-ink-faint">## Steps</span>
        <span className="flex-1" />
        {!preview && <span className="text-[11px] text-ink-3">Tab to nest · drag ↔ to re-parent</span>}
        <Button variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
          {preview ? I.edit({ size: 13 }) : I.eye({ size: 13 })} {preview ? 'Edit' : 'Preview'}
        </Button>
      </div>
      {preview ? (
        <div className="rounded-md border border-dashed border-border px-4 py-[14px] font-ui text-[14.5px] leading-[1.6] text-[oklch(0.30_0.012_60)]">
          {steps.length ? (
            <ol className="flex flex-col gap-1.5">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-2" style={{ marginLeft: s.depth * 22 }}>
                  <span className="shrink-0 select-none font-mono text-ink-faint">{nums[i]}.</span>
                  <span>{s.text.trim() ? renderInline(s.text, `sp${i}`) : <span className="text-ink-3">Empty</span>}</span>
                </li>
              ))}
            </ol>
          ) : (
            <span className="text-ink-3">No steps yet.</span>
          )}
        </div>
      ) : (
        <>
      <div className="flex flex-col" ref={listRef} onDragOver={(e) => e.preventDefault()} onDrop={() => doDrop()}>
        {steps.map((s, i) => (
          <Fragment key={i}>
            {drag !== null && dropIdx === i && <div className={dropLine} style={{ marginLeft: dropDepth * 22 }} />}
            <div
              className={cn(
                'group flex items-center gap-[7px] rounded-sm border border-transparent px-0.5 hover:bg-[oklch(0.975_0.004_80)]',
                drag === i && 'opacity-40',
              )}
              style={{ marginLeft: s.depth * 22 }}
              onDragOver={rowOver(i)}
              onDrop={doDrop}
            >
              <span
                className="grid shrink-0 cursor-grab place-items-center text-ink-faint opacity-0 group-hover:opacity-100"
                draggable
                onDragStart={() => setDrag(i)}
                onDragEnd={endDrag}
              >
                {I.drag({ size: 14 })}
              </span>
              <span
                className={cn(
                  'min-w-[30px] shrink-0 text-right font-mono text-[12px]',
                  s.depth > 0 ? 'font-medium text-ink-faint' : 'font-semibold text-accent-ink',
                )}
              >
                {nums[i]}.
              </span>
              <input
                ref={(el) => {
                  refs.current[i] = el;
                }}
                className="flex-1 rounded-sm border border-transparent bg-transparent px-2 py-[3px] text-[14px] hover:bg-panel focus:border-accent focus:bg-panel focus:shadow-[0_0_0_3px_var(--accent-soft)] focus:outline-none"
                value={s.text}
                placeholder="Describe the action…"
                onChange={(e) => setText(i, e.target.value)}
                onKeyDown={(e) => {
                  if (editorKeyDown(e)) return;
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addAfter(i);
                  } else if (e.key === 'Tab') {
                    e.preventDefault();
                    setDepth(i, s.depth + (e.shiftKey ? -1 : 1));
                  } else if (e.key === 'Backspace' && s.text === '' && steps.length > 1) {
                    e.preventDefault();
                    remove(i);
                    requestAnimationFrame(() => refs.current[Math.max(0, i - 1)]?.focus());
                  }
                }}
              />
              <div className="flex shrink-0 gap-px opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <Button icon size="sm" variant="ghost" className="text-ink-faint hover:text-ink" title="Outdent" disabled={s.depth === 0} onClick={() => setDepth(i, s.depth - 1)}>
                  {I.outdent({ size: 14 })}
                </Button>
                <Button icon size="sm" variant="ghost" className="text-ink-faint hover:text-ink" title="Indent" disabled={s.depth >= 3} onClick={() => setDepth(i, s.depth + 1)}>
                  {I.indent({ size: 14 })}
                </Button>
                <Button icon size="sm" variant="ghost" className="text-ink-faint hover:bg-fail-soft hover:text-fail" title="Remove" onClick={() => remove(i)}>
                  {I.trash({ size: 13 })}
                </Button>
              </div>
            </div>
          </Fragment>
        ))}
        {drag !== null && dropIdx === steps.length && <div className={dropLine} style={{ marginLeft: dropDepth * 22 }} />}
      </div>
      <button
        className="inline-flex items-center gap-1.5 self-start rounded-sm border border-transparent px-2 py-[5px] text-[12.5px] text-ink-3 hover:bg-raise hover:text-ink"
        onClick={() => addAfter(steps.length - 1)}
      >
        {I.plus({ size: 14 })} Add step
      </button>
        </>
      )}
    </div>
  );
}
