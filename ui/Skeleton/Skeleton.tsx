import type { CSSProperties, HTMLAttributes } from 'react';
import { clsx as cn } from 'clsx';
import styles from './Skeleton.module.css';

export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  height?: CSSProperties['height'];
  width?: CSSProperties['width'];
};

/** A non-semantic loading placeholder. */
export function Skeleton({ className, height, style, width, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(styles.root, className)}
      style={{ width, height, ...style }}
      {...props}
    />
  );
}
