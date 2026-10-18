import { rt } from './referenceMessages';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Button } from '@codaa/ui';
import { markdownReference, ReferencePicker, type ReferenceOption } from './ReferencePicker';
export function SourceReferenceButton({ target, options, disabled, onChange, value }: { target: RefObject<HTMLTextAreaElement | null>; options: ReferenceOption[]; disabled: boolean; onChange: (value: string) => void; value: string }) {
  const [open, setOpen] = useState(false);
  const bookmark = useRef({ start: 0, end: 0 });
  const history = useRef<{ before: string; after: string; start: number; end: number; undone: boolean } | null>(null);
  function focus(start = bookmark.current.start, end = bookmark.current.end) { requestAnimationFrame(() => { target.current?.focus(); target.current?.setSelectionRange(start, end); }); }
  useEffect(() => {
    const item = history.current;
    if (item && value !== (item.undone ? item.before : item.after)) history.current = null;
    const element = target.current;
    function undo(event: KeyboardEvent) {
      const item = history.current;
      if (disabled || !item || !(event.ctrlKey || event.metaKey) || !['z', 'y'].includes(event.key.toLowerCase())) return;
      const redo = event.shiftKey || event.key.toLowerCase() === 'y';
      if ((!redo && !item.undone && element?.value === item.after.replace(/\r\n/g, '\n')) || (redo && item.undone && element?.value === item.before.replace(/\r\n/g, '\n'))) {
        event.preventDefault(); event.stopPropagation(); item.undone = !redo;
        const caret = item.end + item.after.replace(/\r\n/g, '\n').length - item.before.replace(/\r\n/g, '\n').length;
        onChange(redo ? item.after : item.before); focus(redo ? caret : item.start, redo ? caret : item.end);
      }
    }
    element?.addEventListener('keydown', undo);
    return () => element?.removeEventListener('keydown', undo);
  });
  return <><Button size="sm" variant="ghost" disabled={disabled} onClick={() => {
    const element = target.current; if (!element) return;
    bookmark.current = { start: element.selectionStart, end: element.selectionEnd }; setOpen(true);
  }}>{rt('insert')}</Button>{open && <ReferencePicker options={options} onClose={() => { setOpen(false); focus(); }} onPick={(option) => {
    const element = target.current; if (!element || disabled) return;
    const { start: domStart, end: domEnd } = bookmark.current; const before = value;
    // DOM textarea offsets use LF even when the source owns exact CRLF bytes.
    function sourceOffset(offset: number) { let dom = 0; let index = 0; while (dom < offset && index < before.length) { if (before[index] === '\r' && before[index + 1] === '\n') index++; index++; dom++; } return index; }
    const start = sourceOffset(domStart); const end = sourceOffset(domEnd);
    const insertion = markdownReference(before.slice(start, end) || option.title, option.href);
    const after = before.slice(0, start) + insertion + before.slice(end);
    const caret = domStart + insertion.replace(/\r\n/g, '\n').length;
    history.current = { before, after, start: domStart, end: domEnd, undone: false }; onChange(after); setOpen(false); focus(caret, caret);
  }} />}</>;
}
