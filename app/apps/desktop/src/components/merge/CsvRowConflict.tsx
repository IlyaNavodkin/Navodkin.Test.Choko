import { I } from '@/components/icons';
import { Button, ResultSwatch } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { CsvMergeRow, Resolution, RunRowValue } from '@/types';
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

export interface CsvRowConflictProps {
  row: CsvMergeRow;
  resKey: string;
  res?: Resolution;
  setRes: (key: string, value: Resolution) => void;
}

/** A diverging CSV result row — pick which tester's recording wins. */
export function CsvRowConflict({ row, resKey, res, setRes }: CsvRowConflictProps) {
  const choice = res?.choice;

  const renderSide = (side: 'ours' | 'theirs', data: RunRowValue, label: string, who: string) => (
    <div className={cn('px-[14px] py-3', side === 'ours' && 'border-r border-border', choice === side && 'bg-accent-soft')}>
      <div className={sideHead}>
        <span className={cn('text-[11px] font-bold uppercase tracking-[0.05em]', side === 'ours' ? 'text-accent-ink' : 'text-[oklch(0.5_0.13_300)]')}>
          {label}
        </span>
        <span className={sideWho}>{who}</span>
        <span className="ml-auto">
          <Button size="sm" className="h-[23px] text-[11px]" onClick={() => setRes(resKey, { choice: side })}>
            {choice === side ? I.check({ size: 12 }) : null} Take {side === 'ours' ? 'yours' : 'theirs'}
          </Button>
        </span>
      </div>
      <div className="grid grid-cols-[90px_1fr] items-baseline gap-x-3 gap-y-1 text-[12.5px]">
        <span className="font-mono text-[11px] uppercase text-ink-faint">result</span>
        <ResultSwatch value={data.result} />
        <span className="font-mono text-[11px] uppercase text-ink-faint">tester</span>
        <span className="font-mono">{data.tester || '—'}</span>
        <span className="font-mono text-[11px] uppercase text-ink-faint">notes</span>
        <span>{data.notes || <span className="text-ink-3">—</span>}</span>
      </div>
    </div>
  );

  return (
    <div className={cn(elemBase, elemConflict)}>
      <div className={elemHead}>
        <span className={ehName}>
          <span className="font-mono">{row.display_id}</span> — result row
        </span>
        <span className={ehMark}>case_id {row.case_id}</span>
        <span className={ehStatus}>
          {choice ? (
            <span className={chipResolved}>
              {I.check({ size: 12 })} {choice === 'ours' ? 'kept yours' : 'kept theirs'}
            </span>
          ) : (
            <span className={chipConflict}>{I.warn({ size: 12 })} conflict</span>
          )}
        </span>
      </div>
      <div className="grid grid-cols-2">
        {renderSide('ours', row.ours!, 'Yours', 'stage :2 · local')}
        {renderSide('theirs', row.theirs!, 'Theirs', 'stage :3 · incoming')}
      </div>
      <div className={baseRef}>
        <div className={baseRefH}>{I.clock({ size: 12 })} Base</div>
        <ResultSwatch value={row.base!.result} />
      </div>
    </div>
  );
}
