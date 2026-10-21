import { RES } from '@/components/ui';
import { HoverPopover } from '@/components/ui/hover-popover';
import type { Result } from '@/types';

const STATUSES: Result[] = ['pass', 'fail', 'blocked', 'in_progress', 'skipped', 'not_run'];

export function RunResultBar({ counts, total, selected, onSelect }: {
  counts: Record<Result, number>;
  total: number;
  selected?: Result;
  onSelect: (result: Result) => void;
}) {
  return <div role="group" aria-label="Filter cases by result" className="flex h-[30px] w-[220px] shrink-0 rounded-md border border-border bg-sunken">
    {STATUSES.filter((s) => counts[s] > 0).map((s) => <HoverPopover key={s}
      className="min-w-6 basis-0 first:rounded-l-[5px] last:rounded-r-[5px]" style={{ flexGrow: counts[s] }}
      content={<div><div className="font-semibold">{RES[s].glyph} {RES[s].label}</div>
        <p className="mt-1">{counts[s]} of {total} cases · {Math.round(counts[s] / total * 100)}%</p>
        <p className="mt-1 text-[11px] text-ink-3">Distribution across the entire run.</p>
        <p className="mt-2 text-accent">{selected === s ? 'Click again to remove this status filter.' : `Click to show only ${RES[s].label.toLowerCase()} cases.`}</p>
      </div>}>
      <button type="button" aria-pressed={selected === s} aria-label={`Show ${RES[s].label} cases: ${counts[s]} of ${total}`}
        onClick={() => onSelect(s)} className="flex h-full w-full items-center justify-center rounded-[inherit] text-[11px] font-semibold hover:brightness-110 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        style={{ background: RES[s].color, color: s === 'not_run' ? 'var(--ink-2)' : 'var(--accent-fg)', boxShadow: selected === s ? 'inset 0 0 0 2px var(--ink)' : undefined }}>
        {counts[s]}
      </button>
    </HoverPopover>)}
    {!total && <span className="m-auto text-[11px] text-ink-3">No cases</span>}
  </div>;
}
