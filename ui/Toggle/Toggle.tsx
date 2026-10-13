import type { ButtonHTMLAttributes } from 'react';
import { clsx as cn } from 'clsx';
import styles from './Toggle.module.css';

export type ToggleProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

/** A small controlled switch for binary settings. */
export function Toggle({
  'aria-label': ariaLabel,
  checked,
  className,
  disabled,
  onCheckedChange,
  onClick,
  ...props
}: ToggleProps) {
  return (
    <button
      {...props}
      aria-checked={checked}
      aria-label={ariaLabel}
      className={cn(styles.root, checked && styles.checked, className)}
      disabled={disabled}
      role="switch"
      type="button"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onCheckedChange(!checked);
      }}
    >
      <span className={styles.thumb} />
    </button>
  );
}
