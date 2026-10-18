import { useState } from 'react';
import { I } from '@/components/icons';
import { Input, RES, RESULTS } from '@/components/ui';
import { renderInline } from '@/utils/markdown';
import { rowFailures } from '@/utils/run-items';
import type { Case, Result, RunRow } from '@/types';
import { NotesField } from './NotesField';

/** A compact result chip + dropdown picker (self-contained open state). */
function ResultPicker({ value, onChange }: { value: Result; onChange: (r: Result) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        className="inline-flex items-center gap-[5px] rounded-[5px] border border-border bg-panel px-[9px] py-[3px] font-mono text-[12px] font-semibold hover:bg-raise"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="size-[9px] rounded-[3px]" style={{ background: RES[value].color }} />
        {RES[value].label}
        {I.chevronDown({ size: 12 })}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 flex min-w-[130px] flex-col gap-0.5 rounded-md border border-border-2 bg-panel p-[5px] shadow-[0_12px_30px_var(--shadow)]">
            {/* Selectable results, plus `not_run` so a row can be reset. Retired states (skipped)
                stay out of the picker but still render via the chip above for existing rows. */}
            {RESULTS.filter((r) => r.selectable || r.key === 'not_run').map((r) => (
              <button
                key={r.key}
                className="flex items-center gap-2 rounded-sm border-0 bg-transparent px-[9px] py-1.5 text-left text-[12.5px] hover:bg-raise"
                onClick={() => {
                  onChange(r.key);
                  setOpen(false);
                }}
              >
                <span className="size-[9px] shrink-0 rounded-[3px]" style={{ background: r.color }} />
                {r.label}
                {value === r.key && <span className="ml-auto text-accent">{I.check({ size: 13 })}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export interface RunCaseCardProps {
  row: RunRow;
  /** The live case behind this row (for failure text); `undefined` when it was deleted. */
  kase: Case | undefined;
  gone: boolean;
  lastTester: string;
  onResult: (result: Result) => void;
  onNotes: (value: string) => void;
  onTester: (value: string) => void;
  onGuide: () => void;
  /** Remove this case from the run. */
  onRemove: () => void;
  /** Native drag handlers for the in-card reorder handle. */
  onDragStart: () => void;
  onDragEnd: () => void;
}

/**
 * One test case in a run, as a self-contained card (grid cell): id + title on top, then the result
 * picker + tester, then the failed checklist items and this case's notes. Built to stack vertically
 * and fill its grid cell (`h-full`) so cards reflow into as many columns as the area allows. The
 * drag handle + remove control live in the header and reveal on hover (`group/card` on the cell).
 */
export function RunCaseCard({
  row,
  kase,
  gone,
  lastTester,
  onResult,
  onNotes,
  onTester,
  onGuide,
  onRemove,
  onDragStart,
  onDragEnd,
}: RunCaseCardProps) {
  const failures = rowFailures(row, kase);

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-panel">
      <div className="flex flex-col gap-2 border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="shrink-0 font-mono text-[11.5px] text-ink-3">{row.display_id}</span>
          {row.executed_at && <span className="truncate font-mono text-[10.5px] text-ink-faint">{row.executed_at}</span>}
          <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/card:opacity-100">
            <span className="cursor-grab text-ink-faint" title="Drag to reorder" draggable onDragStart={onDragStart} onDragEnd={onDragEnd}>
              {I.drag({ size: 14 })}
            </span>
            <button
              className="text-ink-faint transition-colors hover:text-fail"
              title="Remove from run"
              aria-label="Remove from run"
              onClick={onRemove}
            >
              {I.x({ size: 13 })}
            </button>
          </span>
        </div>

        {/* Flex row so the title (a flex child with min-w-0) can shrink and truncate — a plain
            inline-block button sizes to its full text and would impose that as a hard min width. */}
        <div className="flex min-w-0 items-baseline gap-1.5">
          {gone ? (
            <span className="min-w-0 truncate text-[13.5px] text-ink-faint">{row.title}</span>
          ) : (
            <button
              className="min-w-0 truncate rounded-[3px] border-0 bg-transparent p-0 text-left text-[13.5px] font-medium text-ink hover:text-accent-ink hover:underline hover:underline-offset-2"
              title={row.title}
              onClick={onGuide}
            >
              {row.title}
            </button>
          )}
          {gone && (
            <span className="shrink-0 text-[10px] text-fail" title="Case no longer resolves to a live file">
              ⚠ deleted
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <ResultPicker value={row.result} onChange={onResult} />
          <Input
            className="min-w-0 flex-1 font-mono text-[12.5px]"
            value={row.tester}
            placeholder={lastTester || 'Tester'}
            onChange={(e) => onTester(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 px-3 py-2.5">
        {failures.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.05em] text-ink-faint">Failed checks</div>
            <ul className="flex flex-col gap-1 pl-0.5">
              {failures.map((f, k) => (
                <li key={k} className="flex gap-1.5 text-[12.5px] leading-[1.45] text-ink-2">
                  <span className="mt-[5px] size-[6px] shrink-0 rounded-full bg-fail" />
                  <span>
                    {renderInline(f.text, `f${k}`)}
                    {f.note && <span className="text-ink-3"> — {renderInline(f.note, `fn${k}`)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <NotesField value={row.notes} onChange={onNotes} idPrefix={`rn-${row.case_id}`} />
      </div>
    </div>
  );
}
