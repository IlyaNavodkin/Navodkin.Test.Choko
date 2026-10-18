import { useRef, useState, type ReactNode } from 'react';
import { I } from '@/components/icons';
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Input,
} from '@/components/ui';
import { renderInline, renderMarkdown } from '@/utils/markdown';
import type { ChecklistItem } from '@/utils/run-items';
import type { CheckState } from '@/types';
import { GuideCheck } from './GuideCheck';

export type { ChecklistItem };

export interface GuideChecklistProps {
  title: string;
  caption: string;
  items: ChecklistItem[];
  myChecks: Record<string, CheckState>;
  failNotes: Record<string, string>;
  cycle: (key: string) => void;
  onFailNote: (key: string, value: string) => void;
  setGroup: (state: CheckState) => void;
  /** Set a single item's check state directly (used by the row context menu). */
  setState: (key: string, state: CheckState) => void;
  /** Copy text to the clipboard (toasts on success/failure). */
  copy: (text: string) => void;
  numbered?: boolean;
}

/**
 * Right-click menu for a checklist row: copy (the live selection if there is one,
 * otherwise the whole item) plus a set-state section (passed / failed / clear).
 */
function CheckRowMenu({
  item,
  onCopy,
  onSet,
  children,
}: {
  item: ChecklistItem;
  onCopy: (text: string) => void;
  onSet: (state: CheckState) => void;
  children: ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [selText, setSelText] = useState('');
  const wholeText = item.body?.trim() ? `${item.text}\n\n${item.body}` : item.text;

  // On open, copy reflects the user's selection only when it actually falls inside this row;
  // a selection in another item (right-click doesn't clear it) should still copy *this* item.
  const onOpenChange = (open: boolean) => {
    if (!open) return;
    const sel = window.getSelection();
    const text = sel?.toString() ?? '';
    const within =
      !!text.trim() &&
      !!sel &&
      sel.rangeCount > 0 &&
      !!rowRef.current?.contains(sel.getRangeAt(0).commonAncestorContainer);
    setSelText(within ? text : '');
  };

  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger asChild>
        <div ref={rowRef}>{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onCopy(selText || wholeText)}>
          <span className="grid shrink-0 place-items-center text-ink-3 group-data-[highlighted]:text-accent-ink">
            {I.copy({ size: 15 })}
          </span>
          <span className="flex-1">{selText ? 'Copy selection' : 'Copy item'}</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onSet('pass')}>
          <span className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-[#3a6fc0] text-white">
            {I.check({ size: 11 })}
          </span>
          <span className="flex-1">Mark checked</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onSet('fail')}>
          <span className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-fail text-white">
            {I.x({ size: 10 })}
          </span>
          <span className="flex-1">Mark failed</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onSet('none')}>
          <span className="size-4 shrink-0 rounded-[4px] border-[1.5px] border-border-2" />
          <span className="flex-1">Clear</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function GuideChecklist({ title, caption, items, myChecks, failNotes, cycle, onFailNote, setGroup, setState, copy, numbered }: GuideChecklistProps) {
  const resolved = items.filter((it) => (myChecks[it.key] ?? 'none') !== 'none').length;
  const allPass = items.length > 0 && items.every((it) => myChecks[it.key] === 'pass');
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-panel">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">{title}</span>
        <span className="flex-1 text-[12px] text-ink-faint">{caption}</span>
        <span className="font-mono text-[11.5px] text-ink-faint">
          {allPass ? <span className="inline-flex items-center gap-1 text-pass">{I.check({ size: 12 })} done</span> : `${resolved}/${items.length}`}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setGroup(allPass ? 'none' : 'pass')}>
          {allPass ? 'Clear' : 'Pass all'}
        </Button>
      </div>
      <div className="flex flex-col p-1.5">
        {items.length === 0 && <div className="px-0.5 py-1.5 text-[13px] text-ink-3">None specified.</div>}
        {items.map((it) => {
          const state = myChecks[it.key] ?? 'none';
          return (
            <div key={it.key}>
              <CheckRowMenu item={it} onCopy={copy} onSet={(s) => setState(it.key, s)}>
                <GuideCheck state={state} onToggle={() => cycle(it.key)} num={numbered ? (it.num ?? '') + '.' : null} depth={it.depth}>
                  {renderInline(it.text, it.key)}
                  {it.body?.trim() && (
                    <div className="mt-1 text-[13px] font-normal text-ink-3">
                      {renderMarkdown(it.body, it.key + '-body')}
                    </div>
                  )}
                </GuideCheck>
              </CheckRowMenu>
              {state === 'fail' && (
                <div className="mb-1 ml-[42px] mr-2" style={it.depth ? { marginLeft: 42 + it.depth * 26 } : undefined}>
                  <Input
                    className="text-[12.5px]"
                    value={failNotes[it.key] ?? ''}
                    placeholder="What failed? (added to the defect report)"
                    onChange={(e) => onFailNote(it.key, e.target.value)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
