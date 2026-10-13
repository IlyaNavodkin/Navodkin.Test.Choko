import type { HTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName, type IconSize } from '../Icon/Icon';
import styles from './EmptyState.module.css';

export type EmptyStateProps = HTMLAttributes<HTMLElement> & {
  title: ReactNode;
  description?: ReactNode;
  direction?: 'column' | 'row';
  icon?: IconName;
  iconSize?: IconSize;
};

/** Informational empty-state panel ported from Koster UI. */
export function EmptyState({
  title,
  description,
  direction = 'column',
  icon,
  iconSize = 'md',
  className = '',
  ...props
}: EmptyStateProps) {
  return (
    <section className={`${styles.root} ${styles[direction]} ${className}`.trim()} {...props}>
      {icon ? <Icon aria-hidden="true" className={styles.icon} name={icon} size={iconSize} /> : null}
      <div className={styles.text}>
        <p className={styles.title}>{title}</p>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
    </section>
  );
}
