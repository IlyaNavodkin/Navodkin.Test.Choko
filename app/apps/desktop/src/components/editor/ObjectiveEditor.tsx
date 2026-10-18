import { useRef, useState } from 'react';
import { I } from '@/components/icons';
import { Button } from '@/components/ui';
import { editorKeyDown, hasHeadings13, renderMarkdown, stripHeadings13 } from '@/utils/markdown';
import { FmtBar } from './FmtBar';

export interface ObjectiveEditorProps {
  value: string;
  onChange: (value: string) => void;
}

/** Objective — the editorial reading surface (sans-serif editor + inline preview). */
export function ObjectiveEditor({ value, onChange }: ObjectiveEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const badHeadings = hasHeadings13(value);
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-[9px]">
        <span className="grid place-items-center text-ink-3">{I.edit({ size: 15 })}</span>
        <span className="text-[13px] font-semibold tracking-[0.01em] text-ink">Objective</span>
        <span className="font-mono text-[11px] text-ink-faint">## Objective</span>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
          {preview ? I.edit({ size: 13 }) : I.eye({ size: 13 })} {preview ? 'Edit' : 'Preview'}
        </Button>
      </div>
      <div className="relative">
        {!preview && <FmtBar targetRef={ref} onApply={onChange} />}
        {preview ? (
          <div className="rounded-md border border-dashed border-border px-4 py-[14px] font-ui text-[15px] leading-[1.6] text-[oklch(0.30_0.012_60)]">
            {value.trim() ? renderMarkdown(value, 'obj') : <span className="text-ink-3">No objective yet.</span>}
          </div>
        ) : (
          <textarea
            ref={ref}
            className="min-h-[90px] w-full resize-y rounded-md border border-border bg-panel px-4 py-[14px] font-ui text-[15px] leading-[1.6] text-[oklch(0.30_0.012_60)] focus:border-accent-line focus:shadow-[0_0_0_3px_var(--accent-soft)] focus:outline-none"
            value={value}
            placeholder="Describe what this case verifies, and why it matters…"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={editorKeyDown}
          />
        )}
        {badHeadings && (
          <div className="mt-2 flex items-center gap-[7px] rounded-md border border-[oklch(0.85_0.06_80)] bg-blocked-soft px-2.5 py-[7px] text-[12px] text-[oklch(0.5_0.12_66)]">
            {I.warn({ size: 14 })}
            <span>Top-level headings (#, ##, ###) aren't allowed here — they'd split the file's sections. Lists, quotes and code blocks are fine.</span>
            <Button size="sm" className="ml-auto" onClick={() => onChange(stripHeadings13(value))}>
              Clean up
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
