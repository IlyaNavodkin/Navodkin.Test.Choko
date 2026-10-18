import type { CSSProperties, ReactNode } from 'react';
import { I } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { CheckState } from '@/types';

export interface GuideCheckProps {
  state: CheckState;
  /** Cycle the state: none → pass → fail → none. */
  onToggle: () => void;
  children: ReactNode;
  num?: string | null;
  depth?: number;
}

export function GuideCheck({ state, onToggle, children, num, depth }: GuideCheckProps) {
  const style: CSSProperties | undefined = depth ? { marginLeft: depth * 26 } : undefined;
  const done = state !== 'none';
  const stateLabel = state === 'pass' ? 'passed' : state === 'fail' ? 'failed' : 'not checked';
  // Only the checkbox toggles — the row is a plain div so the user can select/copy text and
  // click links inside it without flipping the check state.
  return (
    <div className="flex w-full items-start gap-[11px] rounded-md px-[11px] py-[9px] text-left" style={style}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Check status: ${stateLabel}. Click to cycle: empty → passed → failed.`}
        title="Click to cycle: empty → passed → failed"
        className={cn(
          'mt-px grid size-5 shrink-0 cursor-pointer place-items-center rounded-[5px] border-[1.5px] text-white transition',
          state === 'pass'
            ? 'border-[#3a6fc0] bg-[#3a6fc0]'
            : state === 'fail'
              ? 'border-fail bg-fail'
              : 'border-border-2 bg-panel hover:border-[#3a6fc0]',
        )}
      >
        {state === 'pass' ? I.check({ size: 13 }) : state === 'fail' ? I.x({ size: 12 }) : null}
      </button>
      {num != null && (
        <span className={cn('mt-px min-w-[26px] shrink-0 font-mono text-[13px] font-semibold', done ? 'text-ink-faint' : 'text-accent-ink')}>{num}</span>
      )}
      <div className={cn('min-w-0 flex-1 pt-px text-[14.5px] leading-[1.5]', state === 'fail' ? 'text-fail' : done ? 'text-ink-3' : 'text-ink')}>{children}</div>
    </div>
  );
}
