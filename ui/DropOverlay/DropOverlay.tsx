'use client';

import type { HTMLAttributes, ReactElement, ReactNode } from 'react';
import { clsx as cn } from 'clsx';
import { Icon, IconNames } from '../Icon/Icon';
import styles from './DropOverlay.module.css';

export type DropOverlayProps = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  /** `none` (default) keeps the drop target underneath interactive. */
  pointerEvents?: 'none' | 'auto';
};

/**
 * Absolute overlay shown while a drag hovers a drop target. It stays
 * click-through by default so the target keeps receiving pointer events.
 */
export function DropOverlay({
  children,
  className,
  description,
  icon,
  pointerEvents = 'none',
  title,
  ...props
}: DropOverlayProps): ReactElement {
  return (
    <div
      {...props}
      className={cn(
        styles.root,
        pointerEvents === 'auto' ? styles.interactive : styles.passive,
        className,
      )}
    >
      <span aria-hidden="true" className={styles.halo}>
        {icon ?? <Icon name={IconNames.upload} size="lg" />}
      </span>
      <span className={styles.title}>{title}</span>
      {description !== undefined && description !== null ? (
        <span className={styles.description}>{description}</span>
      ) : null}
      {children}
    </div>
  );
}
