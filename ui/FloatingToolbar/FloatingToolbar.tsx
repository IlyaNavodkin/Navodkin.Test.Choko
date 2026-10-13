'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { Divider } from '../Divider/Divider';
import { Icon, IconNames } from '../Icon/Icon';
import styles from './FloatingToolbar.module.css';

type FloatingToolbarProps = HTMLAttributes<HTMLDivElement> & {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  collapseLabel?: string;
  expandLabel?: string;
};

export function FloatingToolbar({
  collapsed,
  onCollapsedChange,
  collapseLabel = 'Свернуть панель',
  expandLabel = 'Развернуть панель',
  className = '',
  children,
  ...props
}: FloatingToolbarProps) {
  const label = collapsed ? expandLabel : collapseLabel;

  return (
    <div className={`${styles.toolbar} ${className}`.trim()} {...props}>
      <div className={styles.panel} data-open={!collapsed} aria-hidden={collapsed}>
        <div className={styles.content}>{children}</div>
        <Divider orientation="vertical" className={styles.divider} />
      </div>
      <button
        className={styles.toggle}
        type="button"
        aria-expanded={!collapsed}
        aria-label={label}
        title={label}
        onClick={() => onCollapsedChange(!collapsed)}
      >
        <Icon
          name={IconNames.chevronLeft}
          size="md"
          className={collapsed ? styles.chevronCollapsed : styles.chevron}
        />
      </button>
    </div>
  );
}

export function FloatingToolbarGroup({
  label,
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { label: string; children: ReactNode }) {
  return (
    <section className={`${styles.group} ${className}`.trim()} aria-label={label} {...props}>
      <span className={styles.groupLabel}>{label}</span>
      <div className={styles.groupContent}>{children}</div>
    </section>
  );
}

export type { FloatingToolbarProps };
