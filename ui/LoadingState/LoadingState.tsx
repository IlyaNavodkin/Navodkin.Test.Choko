import type { HTMLAttributes, ReactNode } from 'react';
import { useI18n } from '../i18n/provider';
import { Spinner, type SpinnerProps } from '../Spinner/Spinner';
import styles from './LoadingState.module.css';

export type LoadingStateProps = HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
  description?: ReactNode;
  size?: SpinnerProps['size'];
};

/** Content-area loading panel: Spinner + label, sibling to EmptyState. */
export function LoadingState({
  title,
  description,
  size = 'md',
  className = '',
  ...props
}: LoadingStateProps) {
  const { t } = useI18n();
  const label = title ?? t('loading');

  return (
    <section
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`${styles.root} ${className}`.trim()}
      {...props}
    >
      <Spinner aria-hidden="true" size={size} />
      <div className={styles.text}>
        <p className={styles.title}>{label}</p>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
    </section>
  );
}
