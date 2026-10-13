import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Spinner } from '../Spinner/Spinner';
import styles from './Button.module.css';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'ghost'
  | 'ghost-danger'
  | 'ghost-success';

export type ButtonSize = 'sm' | 'md';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  tooltipText?: string;
  leadingIcon?: ReactNode;
  children?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    tooltipText,
    leadingIcon,
    disabled,
    className = '',
    type = 'button',
    children,
    ...props
  },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      title={tooltipText ?? props.title}
      className={`${styles.button} ${styles[variant]} ${styles[`size-${size}`]} ${className}`.trim()}
    >
      {loading ? <Spinner size="sm" aria-hidden="true" /> : null}
      {!loading && leadingIcon ? <span className={styles.leadingIcon}>{leadingIcon}</span> : null}
      {children}
    </button>
  );
});

export type { ButtonProps };
