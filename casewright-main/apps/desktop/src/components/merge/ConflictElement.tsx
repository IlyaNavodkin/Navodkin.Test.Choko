import { I } from '@/components/icons';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { MergeElement, Resolution, ResolutionChoice } from '@/types';
import { ListDiff, MergedPreview, ProseDiff, serialize, StepsDiff } from './diffs';
import {
  baseRef,
  baseRefH,
  chipConflict,
  chipResolved,
  ehMark,
  ehName,
  ehStatus,
  elemBase,
  elemConflict,
  elemHead,
  sideHead,
  sideWho,
} from './styles';

export interface ConflictElementProps {
  el: MergeElement;
  resKey: string;
  res?: Resolution;
  setRes: (key: string, value: Resolution) => void;
}

/** One conflicting element — side-by-side ours/theirs with take/edit + merged preview. */
export function ConflictElement({ el, resKey, res, setRes }: ConflictElementProps) {
  const choice = res?.choice;
  const prose = el.kind === 'prose' || el.kind === 'field';
  const editing = choice === 'edit';
  const text = res?.text ?? '';

  const pick = (which: ResolutionChoice) =>
    setRes(resKey, { choice: which, text: serialize(el, which === 'edit' ? 'ours' : which) });

  const renderSide = (side: 'ours' | 'theirs') => {
    if (el.kind === 'list' || el.kind === 'tags') return <ListDiff ours={el.ours} theirs={el.theirs} side={side} />;
    if (el.kind === 'steps') return <StepsDiff ours={el.ours} theirs={el.theirs} side={side} />;
    return <ProseDiff ours={el.ours} theirs={el.theirs} side={side} prose={prose} />;
  };

  return (
    <div className={cn(elemBase, elemConflict)}>
      <div className={elemHead}>
        <span className={ehName}>{el.label}</span>
        <span className={ehMark}>{el.kind === 'field' ? 'front-matter' : '## ' + el.label}</span>
        <span className={ehStatus}>
          {choice ? (
            <span className={chipResolved}>
              {I.check({ size: 12 })} {choice === 'ours' ? 'kept yours' : choice === 'theirs' ? 'kept theirs' : 'edited'}
            </span>
          ) : (
            <span className={chipConflict}>{I.warn({ size: 12 })} conflict</span>
          )}
        </span>
      </div>
      <div className="grid grid-cols-2">
        <div className={cn('border-r border-border px-[14px] py-3', choice === 'ours' && 'bg-accent-soft')}>
          <div className={sideHead}>
            <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-accent-ink">Yours</span>
            <span className={sideWho}>stage :2 · local</span>
            <span className="ml-auto">
              <Button size="sm" className="h-[23px] text-[11px]" onClick={() => pick('ours')}>
                {choice === 'ours' ? I.check({ size: 12 }) : null} Take yours
              </Button>
            </span>
          </div>
          {renderSide('ours')}
        </div>
        <div className={cn('px-[14px] py-3', choice === 'theirs' && 'bg-accent-soft')}>
          <div className={sideHead}>
            <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[oklch(0.5_0.13_300)]">Theirs</span>
            <span className={sideWho}>stage :3 · incoming</span>
            <span className="ml-auto">
              <Button size="sm" className="h-[23px] text-[11px]" onClick={() => pick('theirs')}>
                {choice === 'theirs' ? I.check({ size: 12 }) : null} Take theirs
              </Button>
            </span>
          </div>
          {renderSide('theirs')}
        </div>
      </div>
      <div className={baseRef}>
        <div className={baseRefH}>{I.clock({ size: 12 })} Base · merge-base (stage :1)</div>
        {el.kind === 'steps' ? (
          <div className="font-mono text-[12.5px]">
            {el.base.map((s, i) => (
              <div key={i} className="flex gap-2 py-0.5" style={{ paddingLeft: s.depth * 18 }}>
                <span className="min-w-[26px] shrink-0 text-right text-ink-faint">{i + 1}.</span>
                <span>{s.text}</span>
              </div>
            ))}
          </div>
        ) : el.kind === 'list' || el.kind === 'tags' ? (
          <span>{el.base.join(' · ')}</span>
        ) : (
          <span>{el.base}</span>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-border px-[14px] py-2.5">
        <Button size="sm" variant={editing ? 'primary' : 'default'} onClick={() => pick('edit')}>
          {I.edit({ size: 13 })} Edit merged
        </Button>
        {choice && !editing && (
          <span className="text-[12px] text-ink-3">
            Resolution applies to the whole {el.kind === 'field' ? 'field' : 'section'}.
          </span>
        )}
      </div>
      {editing && (
        <div className="px-[14px] pb-3">
          <textarea
            className="min-h-20 w-full rounded-md border border-accent-line bg-panel px-[11px] py-[9px] font-mono text-[12.5px] focus:shadow-[0_0_0_3px_var(--accent-soft)] focus:outline-none"
            value={text}
            onChange={(e) => setRes(resKey, { choice: 'edit', text: e.target.value })}
          />
        </div>
      )}
      {choice && <MergedPreview el={el} text={text} />}
    </div>
  );
}
