'use client';

import type { ButtonHTMLAttributes, FC, HTMLAttributes, ReactNode } from 'react';
import { clsx as cn } from 'clsx';
import styles from './FilterChips.module.css';

export type FilterChipTone = 'neutral' | 'success' | 'brand' | 'warning' | 'danger';

export type FilterChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  tone?: FilterChipTone;
  dot?: boolean;
  count?: number;
  icon?: ReactNode;
};

export type FilterChipGroupProps = HTMLAttributes<HTMLDivElement>;

/** Bordered container that groups filter chips into a single toolbar segment. */
export const FilterChipGroup: FC<FilterChipGroupProps> = ({ children, className, ...props }) => (
  <div {...props} className={cn(styles.group, className)}>
    {children}
  </div>
);

/**
 * Toggle chip for toolbars. `tone` colours the status dot and tints the chip
 * once it becomes `active`.
 */
export const FilterChip: FC<FilterChipProps> = ({
  active = false,
  children,
  className,
  count,
  dot = false,
  icon,
  tone = 'neutral',
  type = 'button',
  ...props
}) => (
  <button
    {...props}
    type={type}
    aria-pressed={active}
    className={cn(
      styles.chip,
      styles[`tone-${tone}`],
      active && styles.active,
      active && styles[`active-${tone}`],
      className,
    )}
  >
    {dot ? <span aria-hidden="true" className={styles.dot} /> : null}
    {icon ? (
      <span aria-hidden="true" className={styles.icon}>
        {icon}
      </span>
    ) : null}
    <span className={styles.label}>{children}</span>
    {count !== undefined ? <span className={styles.count}>{count}</span> : null}
  </button>
);
