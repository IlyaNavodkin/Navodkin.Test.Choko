'use client';

import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { clsx as cn } from 'clsx';
import styles from './DotChip.module.css';

export type DotChipProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  /** Fills the default leading color dot. Ignored when `leading` is set. */
  color?: string;
  /** Optional leading slot (custom marker). Defaults to a color dot when `color` is set. */
  leading?: ReactNode;
  size?: 'sm' | 'md';
};

/** Compact chip with an optional colored leading marker (role/status labels). */
export function DotChip({
  children,
  className,
  color,
  leading,
  size = 'sm',
  style,
  ...props
}: DotChipProps) {
  const marker =
    leading ??
    (color ? (
      <i aria-hidden="true" className={styles.dot} style={{ background: color, color }} />
    ) : null);

  return (
    <span
      className={cn(styles.root, styles[`size-${size}`], className)}
      style={
        color
          ? ({
              ...style,
              '--dot-chip-color': color,
            } as CSSProperties)
          : style
      }
      {...props}
    >
      {marker}
      <span className={styles.label}>{children}</span>
    </span>
  );
}
