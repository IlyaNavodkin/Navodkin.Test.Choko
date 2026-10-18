import type { ReactNode } from 'react';
import { I } from '@/components/icons';
import { Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { MergeElement } from '@/types';
import { chipAuto, ehMark, ehName, ehStatus, elemAuto, elemBase, elemHead } from './styles';

/** An auto-merged element — collapsed and reassuring. */
export function AutoElement({ el }: { el: MergeElement }) {
  let summary: ReactNode;
  if (el.kind === 'tags') {
    summary = (
      <span>
        {(el.merged || el.theirs).map((t) => (
          <Tag key={t} className="mr-[5px]">
            #{t}
          </Tag>
        ))}
      </span>
    );
  } else if (el.auto === 'same') {
    summary = <span className="text-ink-3">unchanged on both sides</span>;
  } else if (el.kind === 'list') {
    const v = el.auto === 'ours' ? el.ours : el.theirs;
    summary = <span>{v.join(' · ')}</span>;
  } else if (el.kind === 'steps') {
    const v = el.auto === 'ours' ? el.ours : el.theirs;
    summary = <span className="font-mono">{v.map((s) => s.text).join(' → ')}</span>;
  } else {
    const v = el.auto === 'ours' ? el.ours : el.theirs;
    summary = <span>{v}</span>;
  }
  return (
    <div className={cn(elemBase, elemAuto)}>
      <div className={cn(elemHead, 'border-b-0')}>
        <span className={ehName}>{el.label}</span>
        <span className={ehMark}>{el.kind === 'field' ? 'front-matter' : '## ' + el.label}</span>
        <span className={ehStatus}>
          <span className={chipAuto}>{I.check({ size: 12 })} auto-merged</span>
        </span>
      </div>
      <div className="px-[14px] pb-3 pt-1.5 text-[13px] text-ink-2">
        {summary}
        {el.reason && <div className="mt-1 text-[12px] text-ink-faint">{el.reason}</div>}
      </div>
    </div>
  );
}
