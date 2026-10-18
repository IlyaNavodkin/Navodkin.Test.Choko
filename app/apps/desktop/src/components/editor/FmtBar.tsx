import type { RefObject } from 'react';
import { I } from '@/components/icons';
import { MOD_KEY, wrapSelection } from '@/utils/markdown';

export interface FmtBarProps {
  targetRef: RefObject<HTMLTextAreaElement | null>;
  onApply: (value: string) => void;
  hint?: boolean;
}

const fmtBtn =
  'grid h-[26px] w-7 place-items-center rounded-sm border border-transparent bg-transparent text-ink-2 hover:bg-raise hover:text-ink';

/** Inline-formatting toolbar for the Objective editor. */
export function FmtBar({ targetRef, onApply, hint = true }: FmtBarProps) {
  const apply = (before: string, after: string) => {
    const el = targetRef.current;
    if (!el) return;
    const r = wrapSelection(el, before, after);
    onApply(r.value);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.selStart, r.selEnd);
    });
  };
  const prevent = (e: { preventDefault: () => void }) => e.preventDefault();
  return (
    <div className="mb-2 flex items-center gap-0.5">
      <button className={fmtBtn} title={`Bold (${MOD_KEY}+B)`} onMouseDown={prevent} onClick={() => apply('**', '**')}>
        {I.bold({ size: 15 })}
      </button>
      <button className={fmtBtn} title={`Italic (${MOD_KEY}+I)`} onMouseDown={prevent} onClick={() => apply('*', '*')}>
        {I.italic({ size: 15 })}
      </button>
      <button className={fmtBtn} title={`Strikethrough (${MOD_KEY}+Shift+X)`} onMouseDown={prevent} onClick={() => apply('~~', '~~')}>
        {I.strike({ size: 15 })}
      </button>
      <span className="mx-1 h-4 w-px bg-border" />
      <button className={fmtBtn} title={`Inline code (${MOD_KEY}+E)`} onMouseDown={prevent} onClick={() => apply('`', '`')}>
        {I.code({ size: 15 })}
      </button>
      <button className={fmtBtn} title={`Link (${MOD_KEY}+K)`} onMouseDown={prevent} onClick={() => apply('[', '](https://)')}>
        {I.link({ size: 15 })}
      </button>
      {hint && <span className="ml-auto text-[11px] text-ink-faint">markdown — lists, quotes, code blocks &amp; inline formatting</span>}
    </div>
  );
}
