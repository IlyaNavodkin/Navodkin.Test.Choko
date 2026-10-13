import type { InputHTMLAttributes, ReactNode } from 'react';
import { clsx as cn } from 'clsx';
import { Icon, IconNames } from '../Icon/Icon';
import styles from './Checkbox.module.css';

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> & {
  children?: ReactNode;
  onCheckedChange?: (checked: boolean) => void;
};

/** Native checkbox with a consistently styled visible control. */
export function Checkbox({
  children,
  className,
  id,
  onCheckedChange,
  checked,
  defaultChecked,
  disabled,
  ...props
}: CheckboxProps) {
  return (
    <label className={cn(styles.root, disabled && styles.disabled, className)}>
      <input
        {...props}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        id={id}
        type="checkbox"
        onChange={(event) => onCheckedChange?.(event.target.checked)}
      />
      <span aria-hidden="true" className={styles.control}>
        <Icon name={IconNames.check} size="sm" />
      </span>
      {children ? <span className={styles.label}>{children}</span> : null}
    </label>
  );
}
