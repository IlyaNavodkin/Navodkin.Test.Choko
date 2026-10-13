import { Fragment, useRef, useState, type ReactNode } from 'react';
import { I } from '@/components/icons';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { editorKeyDown, renderInline } from '@/utils/markdown';

export interface ListControlProps {
  icon: ReactNode;
  title: string;
  mark: string;
  marker: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}

const dropLine =
  "relative mx-0.5 my-px h-0.5 rounded-[2px] bg-accent before:absolute before:-left-0.5 before:top-1/2 before:size-[7px] before:-translate-y-1/2 before:rounded-full before:bg-accent before:shadow-[0_0_0_2px_var(--panel)] before:content-['']";

/** Generic single-line list control (Systems / Expected) with drag-reorder. */
export function ListControl({ icon, title, mark, marker, items, onChange, placeholder }: ListControlProps) {
  const refs = useRef<Record<number, HTMLInputElement | null>>({});
  const [drag, setDrag] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);

  const setItem = (i: number, v: string) => onChange(items.map((x, j) => (j === i ? v : x)));
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));
  const add = () => {
    onChange([...items, '']);
    requestAnimationFrame(() => refs.current[items.length]?.focus());
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
        <span className="grid place-items-center text-ink-3">{icon}</span>
        <span className="text-[13px] font-semibold tracking-[0.01em] text-ink">{title}</span>
        <span className="font-mono text-[11px] text-ink-faint">{mark}</span>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
          {preview ? I.edit({ size: 13 }) : I.eye({ size: 13 })} {preview ? 'Edit' : 'Preview'}
        </Button>
      </div>
      {preview ? (
        <div className="rounded-md border border-dashed border-border px-4 py-[14px] font-ui text-[14.5px] leading-[1.6] text-[oklch(0.30_0.012_60)]">
          {items.length ? (
            <ul className="flex flex-col gap-1.5">
              {items.map((it, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 select-none font-mono text-ink-faint">{marker}</span>
                  <span>{it.trim() ? renderInline(it, `lp${i}`) : <span className="text-ink-3">Empty</span>}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-ink-3">Nothing yet.</span>
          )}
        </div>
      ) : (
        <>
      <div className="flex flex-col" onDragOver={(e) => e.preventDefault()} onDrop={() => doDrop()}>
        {items.map((it, i) => (
          <Fragment key={i}>
            {drag !== null && dropIdx === i && <div className={dropLine} />}
            <div
              className={cn(
                'group flex items-center gap-[7px] rounded-sm border border-transparent px-0.5 hover:bg-[oklch(0.975_0.004_80)]',
                drag === i && 'opacity-40',
              )}
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
              <span className="w-3.5 shrink-0 text-center font-mono text-ink-faint">{marker}</span>
              <input
                ref={(el) => {
                  refs.current[i] = el;
                }}
                className="flex-1 rounded-sm border border-transparent bg-transparent px-2 py-[3px] text-[14px] hover:bg-panel focus:border-accent focus:bg-panel focus:shadow-[0_0_0_3px_var(--accent-soft)] focus:outline-none"
                value={it}
                placeholder={placeholder}
                onChange={(e) => setItem(i, e.target.value)}
                onKeyDown={(e) => {
                  if (editorKeyDown(e)) return;
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onChange([...items.slice(0, i + 1), '', ...items.slice(i + 1)]);
                    requestAnimationFrame(() => refs.current[i + 1]?.focus());
                  }
                  if (e.key === 'Backspace' && it === '' && items.length > 1) {
                    e.preventDefault();
                    remove(i);
                    requestAnimationFrame(() => refs.current[Math.max(0, i - 1)]?.focus());
                  }
                }}
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
          </Fragment>
        ))}
        {drag !== null && dropIdx === items.length && <div className={dropLine} />}
      </div>
      <button
        className="inline-flex items-center gap-1.5 self-start rounded-sm border border-transparent px-2 py-[5px] text-[12.5px] text-ink-3 hover:bg-raise hover:text-ink"
        onClick={add}
      >
        {I.plus({ size: 14 })} Add item
      </button>
        </>
      )}
    </div>
  );
}
