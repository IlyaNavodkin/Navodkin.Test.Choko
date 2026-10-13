'use client';

import type { HTMLAttributes, ReactElement, ReactNode } from 'react';
import { clsx as cn } from 'clsx';
import { Icon, IconNames } from '../Icon/Icon';
import { IconButton } from '../IconButton/IconButton';
import { useI18n } from '../i18n/provider';
import styles from './SelectionBar.module.css';

export type SelectionBarProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  meta?: ReactNode;
  onClear?: () => void;
  clearLabel?: string;
};

/** Slim strip above a toolbar summarising the current selection. */
export function SelectionBar({
  children,
  className,
  clearLabel,
  label,
  meta,
  onClear,
  ...props
}: SelectionBarProps): ReactElement {
  const { t } = useI18n();
  const resolvedClearLabel = clearLabel ?? t('clearSelection');

  return (
    <div {...props} className={cn(styles.root, className)}>
      <span className={styles.label}>{label}</span>

      {meta !== undefined && meta !== null ? (
        <span className={styles.meta}>
          <span aria-hidden="true" className={styles.dot}>
            ·
          </span>
          {meta}
        </span>
      ) : null}

      {children ? <div className={styles.actions}>{children}</div> : null}

      {onClear ? (
        <IconButton
          aria-label={resolvedClearLabel}
          className={styles.clear}
          size="sm"
          tooltipText={resolvedClearLabel}
          variant="ghost"
          onClick={onClear}
        >
          <Icon name={IconNames.x} size="sm" />
        </IconButton>
      ) : null}
    </div>
  );
}
