import { I } from '@/components/icons';
import { cn } from '@/lib/utils';
import { wordDiff } from '@/utils/diff';
import { renderInline } from '@/utils/markdown';
import { listText, numberSteps, stepText } from '@/utils/steps';
import type { MergeElement, Step } from '@/types';

type Side = 'ours' | 'theirs';

/** Serialize one side of a conflicting element to editable text. */
export function serialize(el: MergeElement, which: Side): string {
  if (el.kind === 'steps') return stepText(el[which]);
  if (el.kind === 'list' || el.kind === 'tags') return listText(el[which]);
  return el[which]; // field | prose
}

/** Word-level prose diff: render one side with its add/del highlights. */
export function ProseDiff({
  ours,
  theirs,
  side,
  prose,
}: {
  ours: string;
  theirs: string;
  side: Side;
  prose?: boolean;
}) {
  const { del, add } = wordDiff(ours, theirs);
  const toks = side === 'ours' ? del : add;
  const cls =
    side === 'ours'
      ? 'rounded-[3px] bg-del-bg px-px text-del line-through'
      : 'rounded-[3px] bg-add-bg px-px text-add';
  return (
    <div className={cn('text-[13.5px] leading-[1.55]', prose && 'font-read text-[15px]')}>
      {toks.map((t, i) =>
        t.t === 'same' ? (
          <span key={i}>{t.v}</span>
        ) : (
          <span key={i} className={cls}>
            {t.v}
          </span>
        ),
      )}
    </div>
  );
}

/** List diff: mark items unique to this side. */
export function ListDiff({ ours, theirs, side }: { ours: string[]; theirs: string[]; side: Side }) {
  const mine = side === 'ours' ? ours : theirs;
  const other = side === 'ours' ? theirs : ours;
  const oset = new Set(other);
  return (
    <ul className="m-0 flex list-none flex-col gap-[3px] p-0 text-[13px]">
      {mine.map((it, i) => {
        const changed = !oset.has(it);
        return (
          <li
            key={i}
            className={cn('flex gap-[7px] py-0.5', changed && (side === 'ours' ? 'text-del line-through' : 'text-add'))}
          >
            <span className={cn('shrink-0 font-mono', changed ? (side === 'ours' ? 'text-del' : 'text-add') : 'text-ink-faint')}>
              –
            </span>
            <span>{renderInline(it, 'ld' + side + i)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function StepsDiff({ ours, theirs, side }: { ours: Step[]; theirs: Step[]; side: Side }) {
  const mine = side === 'ours' ? ours : theirs;
  const other = side === 'ours' ? theirs : ours;
  const oset = new Set(other.map((s) => s.text));
  const nums = numberSteps(mine);
  return (
    <div className="font-mono text-[12.5px]">
      {mine.map((s, i) => {
        const changed = !oset.has(s.text);
        return (
          <div
            key={i}
            className="flex gap-2 py-0.5"
            style={{
              paddingLeft: s.depth * 18,
              color: changed ? (side === 'ours' ? 'var(--del)' : 'var(--add)') : undefined,
              textDecoration: changed && side === 'ours' ? 'line-through' : undefined,
            }}
          >
            <span className="min-w-[26px] shrink-0 text-right text-ink-faint">{nums[i]}.</span>
            <span>{s.text}</span>
          </div>
        );
      })}
    </div>
  );
}

export function MergedPreview({ el, text }: { el: MergeElement; text: string }) {
  const prose = el.kind === 'prose' || el.kind === 'field';
  let body;
  if (el.kind === 'steps') {
    const lines = text.split('\n');
    body = (
      <div className="font-mono text-[12.5px]">
        {lines.map((ln, i) => {
          const depth = (ln.match(/^ */)?.[0].length ?? 0) / 2;
          return (
            <div key={i} className="flex gap-2 py-0.5" style={{ paddingLeft: depth * 18 }}>
              <span className="min-w-[26px] shrink-0 text-right text-ink-faint">{i + 1}.</span>
              <span>{ln.trim()}</span>
            </div>
          );
        })}
      </div>
    );
  } else if (el.kind === 'list' || el.kind === 'tags') {
    body = (
      <ul className="m-0 flex list-none flex-col gap-[3px] p-0 text-[13px]">
        {text.split('\n').map((ln, i) => (
          <li key={i} className="flex gap-[7px] py-0.5">
            <span className="shrink-0 font-mono text-ink-faint">–</span>
            <span>{renderInline(ln, 'mp' + i)}</span>
          </li>
        ))}
      </ul>
    );
  } else {
    body = <span>{renderInline(text, 'mp')}</span>;
  }
  return (
    <div className="border-t border-border bg-panel-2 px-[14px] py-[11px]">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-faint">
        {I.check({ size: 12 })} Merged result
      </div>
      <div className={cn('text-[13.5px]', prose && 'font-read text-[15px] leading-[1.55]')}>{body}</div>
    </div>
  );
}
