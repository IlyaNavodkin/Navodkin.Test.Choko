import { Fragment, useRef, useState } from 'react';
import { I } from '@/components/icons';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { SetupItem } from '@/types';
import { editorKeyDown, hasHeadings13, renderInline, renderMarkdown, stripHeadings13 } from '@/utils/markdown';
import { FmtBar } from './FmtBar';

export interface SetupControlProps {
  items: SetupItem[];
  onChange: (items: SetupItem[]) => void;
}

const dropLine =
  "relative mx-0.5 my-px h-0.5 rounded-[2px] bg-accent before:absolute before:-left-0.5 before:top-1/2 before:size-[7px] before:-translate-y-1/2 before:rounded-full before:bg-accent before:shadow-[0_0_0_2px_var(--panel)] before:content-['']";

/** The body of a single setup item — a multi-line markdown editor that disallows h1–h3 headings. */
function SetupBody({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const badHeadings = hasHeadings13(value);
  return (
    <div className="mt-1.5">
      <FmtBar targetRef={ref} onApply={onChange} hint={false} />
      <textarea
        ref={ref}
        className="min-h-[64px] w-full resize-y rounded-md border border-border bg-panel px-3 py-2 font-ui text-[14px] leading-[1.6] text-[oklch(0.30_0.012_60)] focus:border-accent-line focus:shadow-[0_0_0_3px_var(--accent-soft)] focus:outline-none"
        value={value}
        placeholder="Describe this setup step… (markdown — no #, ## or ### headings)"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={editorKeyDown}
      />
      {badHeadings && (
        <div className="mt-2 flex items-center gap-[7px] rounded-md border border-[oklch(0.85_0.06_80)] bg-blocked-soft px-2.5 py-[7px] text-[12px] text-[oklch(0.5_0.12_66)]">
          {I.warn({ size: 14 })}
          <span>Top-level headings (#, ##, ###) aren't allowed in a setup body.</span>
          <Button size="sm" className="ml-auto" onClick={() => onChange(stripHeadings13(value))}>
            Clean up
          </Button>
        </div>
      )}
    </div>
  );
}

/** Setup — a reorderable list of named, multi-line markdown items (`### name` + body). */
export function SetupControl({ items, onChange }: SetupControlProps) {
  const nameRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [drag, setDrag] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);

  const setName = (i: number, v: string) => onChange(items.map((x, j) => (j === i ? { ...x, name: v } : x)));
  const setBody = (i: number, v: string) => onChange(items.map((x, j) => (j === i ? { ...x, body: v } : x)));
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));
  const add = () => {
    onChange([...items, { name: '', body: '' }]);
    requestAnimationFrame(() => nameRefs.current[items.length]?.focus());
  };
  const rowOver = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const before = e.clientY - r.top < r.height / 2;
    setDropIdx(before ? i : i + 1);
  };
  const doDrop = (e?: React.DragEvent) => {
    if (e) e.preventDefault();
    if (drag !== null && dropIdx !== null) {
      let at = dropIdx;
      if (drag < dropIdx) at -= 1;
      const next = items.slice();
      const [x] = next.splice(drag, 1);
      next.splice(at, 0, x);
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
        <span className="text-[13px] font-semibold tracking-[0.01em] text-ink">Setup</span>
        <span className="font-mono text-[11px] text-ink-faint">## Setup</span>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
          {preview ? I.edit({ size: 13 }) : I.eye({ size: 13 })} {preview ? 'Edit' : 'Preview'}
        </Button>
      </div>
      {preview ? (
        <div className="rounded-md border border-dashed border-border px-4 py-[14px] font-ui text-[14.5px] leading-[1.6] text-[oklch(0.30_0.012_60)]">
          {items.length ? (
            <div className="flex flex-col gap-3">
              {items.map((it, i) => (
                <div key={i}>
                  <div className="font-semibold text-ink">
                    {it.name.trim() ? renderInline(it.name, `setn${i}`) : <span className="font-normal text-ink-3">Unnamed step</span>}
                  </div>
                  {it.body.trim() && (
                    <div className="mt-1 text-[13.5px] text-ink-3">{renderMarkdown(it.body, `setb${i}`)}</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <span className="text-ink-3">No setup steps yet.</span>
          )}
        </div>
      ) : (
        <>
      <div className="flex flex-col gap-2" onDragOver={(e) => e.preventDefault()} onDrop={() => doDrop()}>
        {items.map((it, i) => (
          <Fragment key={i}>
            {drag !== null && dropIdx === i && <div className={dropLine} />}
            <div
              className={cn(
                'group rounded-md border border-border bg-panel-2 px-2 py-2',
                drag === i && 'opacity-40',
              )}
              onDragOver={rowOver(i)}
              onDrop={doDrop}
            >
              <div className="flex items-center gap-[7px]">
                <span
                  className="grid shrink-0 cursor-grab place-items-center text-ink-faint opacity-0 group-hover:opacity-100"
                  draggable
                  onDragStart={() => setDrag(i)}
                  onDragEnd={endDrag}
                >
                  {I.drag({ size: 14 })}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-ink-faint">###</span>
                <input
                  ref={(el) => {
                    nameRefs.current[i] = el;
                  }}
                  className="flex-1 rounded-sm border border-transparent bg-transparent px-2 py-[3px] text-[14px] font-semibold hover:bg-panel focus:border-accent focus:bg-panel focus:shadow-[0_0_0_3px_var(--accent-soft)] focus:outline-none"
                  value={it.name}
                  placeholder="Setup step name…"
                  onChange={(e) => setName(i, e.target.value)}
                  onKeyDown={editorKeyDown}
                />
                <Button
                  icon
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-ink-faint opacity-0 hover:text-fail group-hover:opacity-100"
                  title="Remove"
                  onClick={() => remove(i)}
                >
                  {I.trash({ size: 13 })}
                </Button>
              </div>
              <SetupBody value={it.body} onChange={(v) => setBody(i, v)} />
            </div>
          </Fragment>
        ))}
        {drag !== null && dropIdx === items.length && <div className={dropLine} />}
      </div>
      <button
        className="inline-flex items-center gap-1.5 self-start rounded-sm border border-transparent px-2 py-[5px] text-[12.5px] text-ink-3 hover:bg-raise hover:text-ink"
        onClick={add}
      >
        {I.plus({ size: 14 })} Add setup step
      </button>
        </>
      )}
    </div>
  );
}
