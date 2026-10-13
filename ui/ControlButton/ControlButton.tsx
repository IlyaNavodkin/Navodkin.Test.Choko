import { forwardRef, type ButtonHTMLAttributes } from 'react';
import styles from './ControlButton.module.css';

type ControlButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'success' | 'danger' | 'neutral' | 'leave';
  appearance?: 'solid' | 'utility' | 'ghost';
  size?: 'sm' | 'md';
  shape?: 'square' | 'round' | 'pill';
  active?: boolean;
  elevated?: boolean;
  tooltipText?: string;
};

export const ControlButton = forwardRef<HTMLButtonElement, ControlButtonProps>(
  function ControlButton(
    {
      variant = 'neutral',
      appearance = 'solid',
      size = 'md',
      shape = 'square',
      active = false,
      elevated = false,
      tooltipText,
      className = '',
      type = 'button',
      ...props
    },
    ref,
  ) {
    return (
      <button
        {...props}
        ref={ref}
        type={type}
        title={tooltipText ?? props.title}
        aria-pressed={active || undefined}
        className={`${styles.button} ${styles[`variant-${variant}`]} ${styles[`appearance-${appearance}`]} ${
          styles[`size-${size}`]
        } ${styles[`shape-${shape}`]} ${active ? styles.active : ''} ${
          elevated ? styles.elevated : ''
        } ${className}`.trim()}
      />
    );
  },
);

export type { ControlButtonProps };
