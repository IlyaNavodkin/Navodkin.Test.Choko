import type { HTMLAttributes } from 'react';
import styles from './Divider.module.css';

type DividerProps = HTMLAttributes<HTMLHRElement> & {
  orientation?: 'horizontal' | 'vertical';
};

export function Divider({ orientation = 'horizontal', className = '', ...props }: DividerProps) {
  return (
    <hr
      className={`${styles.divider} ${orientation === 'vertical' ? styles.vertical : ''} ${className}`.trim()}
      {...props}
    />
  );
}

export type { DividerProps };
