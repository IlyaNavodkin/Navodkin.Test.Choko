import type { ReactNode } from 'react';
import { clsx as cn } from 'clsx';
import { Icon, IconNames } from '../Icon/Icon';
import { IconButton } from '../IconButton/IconButton';
import type { InputSize } from '../Input/Input';
import { SearchInput } from '../SearchInput/SearchInput';
import { useI18n } from '../i18n/provider';
import styles from './DataTableToolbar.module.css';

export type DataTableToolbarProps = {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /**
   * The height of the search field. `md` (default) is the 46 px form control; pass `sm`/`xs` when
   * the toolbar's filters are thin `Select`s of that size, so the whole strip reads as one row.
   */
  searchSize?: InputSize;
  /** Filter controls rendered between the search field and the meta/actions. */
  children?: ReactNode;
  actions?: ReactNode;
  totalCount?: number;
  selectedCount?: number;
  onClearSelection?: () => void;
  className?: string;
};

/** Single-row table toolbar: search, filters, selection meta, and actions. */
export function DataTableToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  searchSize = 'md',
  children,
  actions,
  totalCount,
  selectedCount,
  onClearSelection,
  className,
}: DataTableToolbarProps) {
  const { t } = useI18n();

  const meta: string[] = [];
  if (totalCount !== undefined) meta.push(String(totalCount));
  if (selectedCount !== undefined && selectedCount > 0) {
    meta.push(`${selectedCount} ${t('selected')}`);
  }

  return (
    <div className={cn(styles.root, className)}>
      <div className={styles.search}>
        <SearchInput
          aria-label={t('search')}
          placeholder={searchPlaceholder ?? t('search')}
          size={searchSize}
          value={searchValue ?? ''}
          onValueChange={onSearchChange}
        />
      </div>

      {children ? <div className={styles.filters}>{children}</div> : null}

      <div className={styles.spacer} />

      {meta.length ? <span className={styles.meta}>{meta.join(' · ')}</span> : null}

      {selectedCount !== undefined && selectedCount > 0 && onClearSelection ? (
        <IconButton
          aria-label={t('clear')}
          size="sm"
          tooltipText={t('clear')}
          variant="ghost"
          onClick={onClearSelection}
        >
          <Icon name={IconNames.x} size="sm" />
        </IconButton>
      ) : null}

      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
