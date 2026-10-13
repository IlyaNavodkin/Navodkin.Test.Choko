import type { ReactNode } from 'react';
import styles from './ErrorLabel.module.css';

export function ErrorLabel({ children, id }: { children: ReactNode; id?: string }) {
  if (!children) return null;
  return <p className={styles.error} id={id} role="alert">{children}</p>;
}
