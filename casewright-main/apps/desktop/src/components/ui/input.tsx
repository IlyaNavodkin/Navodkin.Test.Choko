import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { editorKeyDown } from '@/utils/markdown';

/** Shared control surface for Input / Textarea / Select — reproduces the `.input` look. */
export const controlBase =
  'w-full bg-panel border border-border-2 rounded-md px-[9px] py-1.5 text-[13px] text-ink transition duration-[120ms] outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)] placeholder:text-ink-faint';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
}

export function Input({ mono, className, onKeyDown, ...rest }: InputProps) {
  return (
    <input
      className={cn(controlBase, mono && 'font-mono', className)}
      onKeyDown={(e) => {
        if (!editorKeyDown(e)) onKeyDown?.(e);
      }}
      {...rest}
    />
  );
}
