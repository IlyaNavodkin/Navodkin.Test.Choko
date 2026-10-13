import type { HTMLAttributes } from 'react';
import buttonStyles from '../Button/Button.module.css';
import styles from './ButtonGroup.module.css';

export function ButtonGroup({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`lk-button-group ${styles.group} ${className}`.trim()} {...props} />;
}

export function ButtonGroupMenu({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`lk-button-group-menu ${styles.menu} ${className}`.trim()} {...props} />;
}

export function ButtonGroupLabel({ className = '', ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={`lk-button ${buttonStyles.button} ${className}`.trim()} {...props} />;
}
