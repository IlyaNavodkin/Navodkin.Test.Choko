import type { HTMLAttributes } from 'react';
import styles from './Spinner.module.css';
import { useI18n } from '../i18n/provider';

type SpinnerProps = HTMLAttributes<HTMLSpanElement> & {
  size?: 'sm' | 'md' | 'lg';
};

export function Spinner({ size = 'md', className = '', 'aria-label': ariaLabel, ...props }: SpinnerProps) {
  const { t } = useI18n();
  return (
    <span
      role="status"
      aria-label={ariaLabel ?? t('loading')}
      className={`${styles.spinner} ${styles[`size-${size}`]} ${className}`.trim()}
      {...props}
    />
  );
}

export type { SpinnerProps };
