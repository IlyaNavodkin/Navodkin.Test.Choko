import type { HTMLAttributes, ReactNode } from 'react';
import styles from './GroupLabel.module.css';

type GroupLabelProps = HTMLAttributes<HTMLElement> & { label: string; children: ReactNode };

export function GroupLabel({ label, className = '', children, ...props }: GroupLabelProps) {
  return (
    <section className={`${styles.group} ${className}`.trim()} aria-label={label} {...props}>
      <span className={styles.label}>{label}</span>
      <div className={styles.content}>{children}</div>
    </section>
  );
}

export type { GroupLabelProps };
