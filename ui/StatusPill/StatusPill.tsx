import type { HTMLAttributes, ReactNode } from 'react';
import { clsx as cn } from 'clsx';
import styles from './StatusPill.module.css';

export type StatusPillTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand';
export type StatusPillSize = 'sm' | 'md';

export type StatusPillProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusPillTone;
  children: ReactNode;
  /** Shows an animated leading dot. Respects reduced-motion preferences. */
  pulse?: boolean;
  size?: StatusPillSize;
  icon?: ReactNode;
};

/** Compact semantic state chip: tinted background, tinted border, micro mono label. */
export function StatusPill({
  tone = 'neutral',
  children,
  pulse = false,
  size = 'md',
  icon,
  className,
  ...props
}: StatusPillProps) {
  return (
    <span className={cn(styles.root, styles[tone], styles[`size-${size}`], className)} {...props}>
      {pulse ? <span aria-hidden="true" className={styles.dot} /> : null}
      {icon ? (
        <span aria-hidden="true" className={styles.icon}>
          {icon}
        </span>
      ) : null}
      <span className={styles.label}>{children}</span>
    </span>
  );
}
