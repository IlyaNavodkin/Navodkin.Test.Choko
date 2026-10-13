import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  accent?: boolean;
}

export function Tag({ accent, className, children, ...rest }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 py-px font-mono text-[11px]',
        accent
          ? 'border-accent-line bg-accent-soft text-accent-ink'
          : 'border-border bg-sunken text-ink-2',
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
