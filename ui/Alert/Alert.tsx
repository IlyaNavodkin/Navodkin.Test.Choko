import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Alert.module.css';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

export type AlertProps = HTMLAttributes<HTMLDivElement> & {
  variant?: AlertVariant;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
};

/** Inline status banner with variant styling and optional icon/action slots. */
export function Alert({
  variant = 'info',
  icon,
  action,
  className = '',
  children,
  role = 'alert',
  ...props
}: AlertProps) {
  return (
    <div
      role={role}
      className={`${styles.alert} ${styles[variant]} ${className}`.trim()}
      {...props}
    >
      {icon ? <span className={styles.icon}>{icon}</span> : null}
      <div className={styles.body}>{children}</div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
