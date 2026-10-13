import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import styles from './Input.module.css';

export type InputSize = 'md' | 'sm' | 'xs';

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  leadingIcon?: ReactNode;
  trailingAction?: ReactNode;
  /** `xs` 28px and `sm` 32px are the thin controls of dense toolbars; `md` 46px the form field. */
  size?: InputSize;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ className = '', leadingIcon, trailingAction, size = 'md', ...props }, ref) {
    const sizeClass = size === 'xs' ? styles.xs : size === 'sm' ? styles.sm : '';
    const inputClassName = [
      styles.input,
      sizeClass,
      leadingIcon ? styles.withLeading : '',
      trailingAction ? styles.withTrailing : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');
    const input = <input ref={ref} className={inputClassName} {...props} />;
    if (!leadingIcon && !trailingAction) return input;

    return (
      <span className={[styles.control, sizeClass].filter(Boolean).join(' ')}>
        {leadingIcon ? (
          <span aria-hidden="true" className={styles.leading}>
            {leadingIcon}
          </span>
        ) : null}
        {input}
        {trailingAction ? <span className={styles.trailing}>{trailingAction}</span> : null}
      </span>
    );
  },
);
