import { forwardRef, type ButtonHTMLAttributes } from 'react';
import styles from './IconButton.module.css';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'ghost' | 'brand' | 'danger' | 'success';
  size?: 'sm' | 'md';
  active?: boolean;
  /**
   * Colour of the `active` state. The red tint reads as «this switch enables something
   * destructive» and is right for the selection mode; neutral toggles — a page-list switch, a
   * reader tool — take the accent instead.
   */
  activeVariant?: 'danger' | 'accent';
  tooltipText?: string;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    variant = 'default',
    size = 'sm',
    active = false,
    activeVariant = 'danger',
    tooltipText,
    className = '',
    type = 'button',
    ...props
  },
  ref,
) {
  const activeClass = active
    ? activeVariant === 'accent'
      ? styles.activeAccent
      : styles.active
    : '';

  return (
    <button
      {...props}
      ref={ref}
      type={type}
      title={tooltipText ?? props.title}
      aria-pressed={active || undefined}
      className={`${styles.button} ${styles[variant]} ${styles[`size-${size}`]} ${activeClass} ${className}`.trim()}
    />
  );
});

export type { IconButtonProps };
