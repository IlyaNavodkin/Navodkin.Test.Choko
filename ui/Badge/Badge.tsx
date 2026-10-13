import type { HTMLAttributes, ReactNode } from 'react';
import { clsx as cn } from 'clsx';
import styles from './Badge.module.css';

export type BadgeVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  variant?: BadgeVariant;
};

/** Compact semantic status label. */
export function Badge({ children, className, variant = 'neutral', ...props }: BadgeProps) {
  return (
    <span className={cn(styles.root, styles[variant], className)} {...props}>
      {children}
    </span>
  );
}
