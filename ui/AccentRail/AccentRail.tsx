'use client';

import {
  createElement,
  forwardRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import styles from './AccentRail.module.css';

export type AccentRailVariant = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

type AccentRailSharedProps = {
  children: ReactNode;
  /** Left slot (avatar, color dot, queue badge, …). */
  left?: ReactNode;
  /** Right slot (actions, chevron, …). */
  right?: ReactNode;
  active?: boolean;
  variant?: AccentRailVariant;
  /** Custom rail color; overrides variant token. */
  color?: string;
  className?: string;
};

type AccentRailDivProps = AccentRailSharedProps &
  Omit<HTMLAttributes<HTMLDivElement>, 'color' | 'children'> & {
    as?: 'div';
  };

type AccentRailArticleProps = AccentRailSharedProps &
  Omit<HTMLAttributes<HTMLElement>, 'color' | 'children'> & {
    as: 'article';
  };

type AccentRailButtonProps = AccentRailSharedProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color' | 'children'> & {
    as: 'button';
  };

export type AccentRailProps = AccentRailDivProps | AccentRailArticleProps | AccentRailButtonProps;

/** List/card shell with an optional left accent rail and left/body/right slots. */
export const AccentRail = forwardRef<HTMLElement, AccentRailProps>(function AccentRail(
  props,
  ref,
) {
  const {
    as = 'div',
    children,
    left,
    right,
    active = false,
    variant = 'brand',
    color,
    className,
    style,
    ...rest
  } = props;

  const mergedStyle = {
    ...(style as CSSProperties | undefined),
    ...(color ? ({ ['--accent-rail-color' as string]: color } as CSSProperties) : undefined),
  };

  const hasLeft = left != null;
  const hasRight = right != null;

  const classNames = [
    styles.root,
    styles[`variant-${variant}`],
    active ? styles.active : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  const content = (
    <>
      {hasLeft ? <div className={styles.left}>{left}</div> : null}
      <div className={styles.body}>{children}</div>
      {hasRight ? <div className={styles.right}>{right}</div> : null}
    </>
  );

  return createElement(
    as,
    {
      ...rest,
      ref,
      className: classNames,
      style: mergedStyle,
      'data-active': active || undefined,
      'data-slots': hasLeft && hasRight ? 'left-body-right' : hasLeft ? 'left-body' : hasRight ? 'body-right' : 'body',
    },
    content,
  );
});
