import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { editorKeyDown, renderMarkdown } from '@/utils/markdown';

const DEFAULT_LABEL_CLASS = 'text-[11px] font-bold uppercase tracking-[0.05em] text-ink-faint';

export interface NotesFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  emptyText?: string;
  /** React key prefix for the rendered markdown nodes. */
  idPrefix?: string;
  /** Label classes, so the heading can match the surrounding section. */
  labelClassName?: string;
  /** Max auto-grow height of the raw editor, in px. */
  maxHeight?: number;
}

/**
 * A notes field that defaults to **rendered markdown** (so the formatted text stays selectable /
 * copyable) with a dim "Edit" link beside the heading that toggles a raw-markdown editor. Entering
 * edit focuses without scrolling the view (`preventScroll`), so toggling never jumps the page.
 */
export function NotesField({
  value,
  onChange,
  label = 'Notes',
  placeholder = 'Notes — markdown, multi-line',
  emptyText = 'No notes.',
  idPrefix = 'notes',
  labelClassName = DEFAULT_LABEL_CLASS,
  maxHeight = 400,
}: NotesFieldProps) {
  const [editing, setEditing] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const grow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
  };

  useEffect(() => {
    if (editing && taRef.current) {
      const el = taRef.current;
      el.focus({ preventScroll: true });
      grow(el);
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing]);

  return (
    <div>
      <div className="group mb-1 flex items-center gap-2">
        <span className={labelClassName}>{label}</span>
        <button
          className={cn(
            'text-[11px] font-semibold text-accent-ink transition-opacity hover:underline',
            editing ? 'opacity-100' : 'opacity-40 group-hover:opacity-100',
          )}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>
      {editing ? (
        <textarea
          ref={taRef}
          className="w-full resize-none overflow-y-auto rounded-sm border border-accent bg-panel px-1.5 py-1 font-ui text-[13px] leading-[1.5] shadow-[0_0_0_2px_var(--accent-soft)] focus:outline-none"
          value={value}
          rows={2}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            grow(e.target);
          }}
          onKeyDown={(e) => {
            if (editorKeyDown(e)) return;
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : value.trim() ? (
        <div className="text-[13px] leading-[1.5] text-ink">{renderMarkdown(value, idPrefix)}</div>
      ) : (
        <span className="text-[12.5px] text-ink-3">{emptyText}</span>
      )}
    </div>
  );
}
