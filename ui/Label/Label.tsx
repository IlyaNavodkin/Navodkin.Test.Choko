import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Label.module.css';

export type LabelProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  children: ReactNode;
};

/** Compact field label ported from Koster UI. */
export function Label({ label, children, className = '', ...props }: LabelProps) {
  return (
    <div className={`${styles.root} ${className}`.trim()} {...props}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{children}</span>
    </div>
  );
}
