import type { HTMLAttributes } from 'react';
import styles from './Toast.module.css';

export function Toast({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`${styles.toast} ${className}`.trim()} {...props} />;
}
