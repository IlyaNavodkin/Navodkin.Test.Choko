'use client';

import { Fragment, type ReactNode } from 'react';
import { clsx as cn } from 'clsx';
import { Icon, IconNames } from '../Icon/Icon';
import { Popover, PopoverContent, PopoverTrigger } from '../Popover/Popover';
import { useI18n } from '../i18n/provider';
import styles from './Breadcrumbs.module.css';

export type BreadcrumbItem = {
  id: string;
  label: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
};

export type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  className?: string;
  /** Maximum visible items before the middle ones collapse. Defaults to 4. */
  maxItems?: number;
};

const DEFAULT_MAX_ITEMS = 4;

type RenderEntry =
  | { type: 'item'; item: BreadcrumbItem }
  | { type: 'ellipsis'; key: string; items: BreadcrumbItem[] };

function CrumbContent({ item }: { item: BreadcrumbItem }) {
  return (
    <>
      {item.icon ? (
        <span aria-hidden="true" className={styles.icon}>
          {item.icon}
        </span>
      ) : null}
      <span className={styles.label}>{item.label}</span>
    </>
  );
}

/** Ordered navigation trail. The last item is the current page and is never clickable. */
export function Breadcrumbs({ items, className, maxItems = DEFAULT_MAX_ITEMS }: BreadcrumbsProps) {
  const { t } = useI18n();

  if (items.length === 0) return null;

  const limit = Math.max(3, maxItems);
  const tailCount = limit - 2;
  const entries: RenderEntry[] =
    items.length > limit
      ? [
          { type: 'item', item: items[0] },
          {
            type: 'ellipsis',
            key: 'breadcrumbs-ellipsis',
            items: items.slice(1, items.length - tailCount),
          },
          ...items
            .slice(items.length - tailCount)
            .map((item): RenderEntry => ({ type: 'item', item })),
        ]
      : items.map((item): RenderEntry => ({ type: 'item', item }));

  return (
    <nav aria-label={t('breadcrumb')} className={cn(styles.nav, className)}>
      <ol className={styles.list}>
        {entries.map((entry, index) => {
          const isLast = index === entries.length - 1;
          const entryKey = entry.type === 'ellipsis' ? entry.key : entry.item.id;

          return (
            <Fragment key={entryKey}>
              {index > 0 ? (
                <li aria-hidden="true" className={styles.separator}>
                  <Icon name={IconNames.chevronRight} size="xs" />
                </li>
              ) : null}

              {entry.type === 'ellipsis' ? (
                <li className={styles.item}>
                  <Popover align="start" placement="bottom">
                    <PopoverTrigger
                      aria-label={t('more')}
                      className={styles.ellipsisTrigger}
                      title={t('more')}
                    >
                      <Icon name={IconNames.ellipsis} size="sm" />
                    </PopoverTrigger>
                    <PopoverContent aria-label={t('more')} className={styles.menu} role="menu">
                      {entry.items.map((item) => (
                        <button
                          key={item.id}
                          className={styles.menuItem}
                          role="menuitem"
                          type="button"
                          onClick={item.onClick}
                        >
                          <CrumbContent item={item} />
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>
                </li>
              ) : (
                <li className={cn(styles.item, isLast && styles.currentItem)}>
                  {isLast ? (
                    <span aria-current="page" className={cn(styles.crumb, styles.current)}>
                      <CrumbContent item={entry.item} />
                    </span>
                  ) : entry.item.onClick ? (
                    <button className={styles.crumb} type="button" onClick={entry.item.onClick}>
                      <CrumbContent item={entry.item} />
                    </button>
                  ) : (
                    <span className={styles.crumb}>
                      <CrumbContent item={entry.item} />
                    </span>
                  )}
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
