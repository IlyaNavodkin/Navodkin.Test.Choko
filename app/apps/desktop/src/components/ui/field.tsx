import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface FieldProps {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** Labeled form field (uppercase label above its control). */
export function Field({ label, children, className, style }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-[5px]', className)} style={style}>
      {label != null && (
        <label className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">{label}</label>
      )}
      {children}
    </div>
  );
}
