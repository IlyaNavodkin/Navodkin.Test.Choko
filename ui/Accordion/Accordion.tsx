'use client';

import type { ReactNode } from 'react';
import { Icon, IconNames } from '../Icon/Icon';
import styles from './Accordion.module.css';

export type AccordionProps = {
  title: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  right?: ReactNode;
  className?: string;
};

/** Controlled accordion with a pointer cursor trigger (ported from Koster UiAccordion). */
export function Accordion({
  title,
  open,
  onOpenChange,
  children,
  right,
  className,
}: AccordionProps) {
  return (
    <section className={`${styles.root} ${className ?? ''}`.trim()}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <span className={styles.left}>
          <span className={styles.title}>{title}</span>
        </span>
        <span className={styles.right}>
          {right}
          <Icon name={open ? IconNames.chevronUp : IconNames.chevronDown} size="sm" />
        </span>
      </button>
      {open ? <div className={styles.content}>{children}</div> : null}
    </section>
  );
}
