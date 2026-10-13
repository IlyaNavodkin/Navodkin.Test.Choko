'use client';

import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import { clsx as cn } from 'clsx';
import { Icon, IconNames } from '../Icon/Icon';
import { Menu } from '../Menu/Menu';
import { Spinner } from '../Spinner/Spinner';
import { useI18n } from '../i18n/provider';
import styles from './SplitButton.module.css';

export type SplitButtonProps = {
  children: ReactNode;
  icon?: ReactNode;
  onAction: () => void;
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md';
  disabled?: boolean;
  loading?: boolean;
  menu: ReactNode;
  menuAlign?: 'start' | 'end';
  menuLabel?: string;
  className?: string;
};

/**
 * One visual pill with two actions: the main half runs `onAction`, the caret
 * half opens the supplied menu anchored to itself.
 */
export function SplitButton({
  children,
  className = '',
  disabled = false,
  icon,
  loading = false,
  menu,
  menuAlign = 'start',
  menuLabel,
  onAction,
  size = 'sm',
  variant = 'primary',
}: SplitButtonProps): ReactElement {
  const { t } = useI18n();
  const caretRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const isDisabled = disabled || loading;
  const caretLabel = menuLabel ?? t('openMenu');

  return (
    <div
      className={cn(
        styles.root,
        styles[variant],
        styles[`size-${size}`],
        isDisabled && styles.disabled,
        className,
      )}
    >
      <button
        type="button"
        aria-busy={loading || undefined}
        className={styles.action}
        disabled={isDisabled}
        onClick={onAction}
      >
        {loading ? (
          <Spinner aria-hidden="true" size="sm" />
        ) : icon ? (
          <span aria-hidden="true" className={styles.icon}>
            {icon}
          </span>
        ) : null}
        <span className={styles.label}>{children}</span>
      </button>

      <button
        ref={caretRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={caretLabel}
        className={cn(styles.caret, open && styles.caretOpen)}
        disabled={isDisabled}
        title={caretLabel}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name={IconNames.chevronDown} size="xs" />
      </button>

      <Menu
        align={menuAlign}
        anchor={caretRef.current}
        open={open}
        onOpenChange={setOpen}
      >
        {menu}
      </Menu>
    </div>
  );
}
