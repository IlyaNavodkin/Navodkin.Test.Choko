import type { SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { controlBase } from './input';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/**
 * Native `<select>` styled to match the brand controls. Kept native (rather than
 * Radix Select) so the existing status/scope pickers preserve their exact
 * keyboard and markup behavior.
 */
export function Select({ className, children, ...rest }: SelectProps) {
  return (
    <select className={cn(controlBase, className)} {...rest}>
      {children}
    </select>
  );
}
