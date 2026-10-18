import type { Status } from '@/types';
import { cn } from '@/lib/utils';

const STATUS_CLASS: Record<Status, string> = {
  active: 'text-pass bg-pass-soft',
  draft: 'text-blocked bg-blocked-soft',
  deprecated: 'text-ink-3 bg-notrun-soft line-through',
};

/** Capitalized status pill (Active / Draft / Deprecated). */
export function StatusPill({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-[7px] py-px text-[11px] font-semibold capitalize tracking-[0.02em]',
        STATUS_CLASS[status],
        className,
      )}
    >
      {status}
    </span>
  );
}
