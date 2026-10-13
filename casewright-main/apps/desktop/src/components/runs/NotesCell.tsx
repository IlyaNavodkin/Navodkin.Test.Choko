import { useEffect, useRef, useState } from 'react';
import { editorKeyDown, renderMarkdown } from '@/utils/markdown';

export interface NotesCellProps {
  value: string;
  onChange: (value: string) => void;
}

/** Multi-line markdown notes cell — rendered when idle, textarea when editing. */
export function NotesCell({ value, onChange }: NotesCellProps) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const grow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };
  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      grow(ref.current);
      ref.current.setSelectionRange(value.length, value.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (editing) {
    return (
      <textarea
        ref={ref}
        className="w-full resize-none overflow-hidden rounded-sm border border-accent bg-panel px-1.5 py-1 font-ui text-[12.5px] leading-[1.4] shadow-[0_0_0_2px_var(--accent-soft)] focus:outline-none"
        value={value}
        rows={1}
        placeholder="Notes — markdown, multi-line"
        onChange={(e) => {
          onChange(e.target.value);
          grow(e.target);
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (editorKeyDown(e)) return;
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }
  return (
    <div
      className="min-h-[26px] cursor-text whitespace-normal rounded-sm border border-transparent px-1.5 py-1 text-[12.5px] leading-[1.4] text-ink hover:border-border hover:bg-panel"
      onClick={() => setEditing(true)}
      title="Click to edit — markdown supported"
    >
      {value.trim() ? renderMarkdown(value, 'n') : <span className="text-ink-3">—</span>}
    </div>
  );
}
