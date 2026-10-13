import type { HTMLAttributes } from 'react';
import styles from './PaginationIndicator.module.css';

export interface PaginationIndicatorProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  totalPageCount: number;
  currentPage: number;
}

export function PaginationIndicator({
  totalPageCount,
  currentPage,
  className = '',
  ...props
}: PaginationIndicatorProps) {
  return (
    <div
      className={`${styles.indicator} ${className}`.trim()}
      {...props}
    >
      {new Array(totalPageCount).fill(null).map((_, index) => (
        <span data-active={index + 1 === currentPage ? true : undefined} key={index} />
      ))}
    </div>
  );
}
