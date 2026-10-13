import type { HTMLAttributes } from 'react';
import { clsx as cn } from 'clsx';
import styles from './Progress.module.css';

export type ProgressTone = 'brand' | 'warning' | 'success' | 'danger';

export type ProgressProps = Omit<HTMLAttributes<HTMLDivElement>, 'aria-valuenow'> & {
  /** Completion ratio, 0..1 (clamped). */
  value: number;
  tone?: ProgressTone;
  /** The accessible name: what the bar measures. */
  label: string;
};

/** A determinate progress bar (role="progressbar", value 0..1). */
export function Progress({ className, value, tone = 'brand', label, ...props }: ProgressProps) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn(styles.root, className)}
      {...props}
    >
      <div className={cn(styles.fill, styles[tone])} style={{ width: `${percent}%` }} />
    </div>
  );
}
