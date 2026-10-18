import type { Result } from '@/types';
import { cn } from '@/lib/utils';

export interface ResultMeta {
  key: Result;
  label: string;
  glyph: string;
  color: string;
  /**
   * Whether a tester can pick this result for a case. Non-selectable results (`skipped`,
   * `not_run`) still render everywhere via {@link RES} so existing runs display them — they're
   * just not offered as choices when recording a new result. `skipped` is retired this way:
   * unlisted, but never dropped.
   */
  selectable: boolean;
}

/** Result metadata — colors pair with glyphs for colorblind-safe signaling. */
export const RESULTS: ResultMeta[] = [
  { key: 'pass', label: 'Pass', glyph: '✓', color: 'var(--pass)', selectable: true },
  { key: 'fail', label: 'Fail', glyph: '✕', color: 'var(--fail)', selectable: true },
  { key: 'blocked', label: 'Blocked', glyph: '▢', color: 'var(--blocked)', selectable: true },
  { key: 'in_progress', label: 'In progress', glyph: '◐', color: 'var(--inprogress)', selectable: true },
  { key: 'skipped', label: 'Skipped', glyph: '⤼', color: 'var(--skipped)', selectable: false },
  { key: 'not_run', label: 'Not run', glyph: '·', color: 'var(--notrun)', selectable: false },
];

/** Results a tester can choose when recording — excludes retired/implicit states (`skipped`, `not_run`). */
export const SELECTABLE_RESULTS: ResultMeta[] = RESULTS.filter((r) => r.selectable);

export const RES: Record<Result, ResultMeta> = Object.fromEntries(
  RESULTS.map((r) => [r.key, r]),
) as Record<Result, ResultMeta>;

const RESULT_CLASS: Record<Result, string> = {
  pass: 'text-pass bg-pass-soft border-[oklch(0.85_0.06_152)]',
  fail: 'text-fail bg-fail-soft border-[oklch(0.85_0.07_27)]',
  blocked: 'text-blocked bg-blocked-soft border-[oklch(0.85_0.1_58)]',
  in_progress: 'text-inprogress bg-inprogress-soft border-[oklch(0.85_0.08_250)]',
  skipped: 'text-skipped bg-skipped-soft border-[oklch(0.87_0.006_75)]',
  not_run: 'text-ink-3 bg-notrun-soft border-border',
};

/** A single result swatch — color dot + label. */
export function ResultSwatch({ value }: { value: Result }) {
  const r = RES[value] ?? RES.not_run;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[5px] whitespace-nowrap rounded-[5px] border px-2 py-0.5 font-mono text-[11px] font-semibold',
        RESULT_CLASS[value] ?? RESULT_CLASS.not_run,
      )}
    >
      <span className="size-2 shrink-0 rounded-[2px]" style={{ background: r.color }} />
      {r.label}
    </span>
  );
}
