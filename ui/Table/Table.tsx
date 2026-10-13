'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { clsx as cn } from 'clsx';
import { Icon, IconNames } from '../Icon/Icon';
import { IconButton } from '../IconButton/IconButton';
import { Select } from '../Select/Select';
import { useI18n } from '../i18n/provider';
import styles from './Table.module.css';

export type TableSortDirection = 'asc' | 'desc';

export type TableColumn<T> = {
  id: string;
  header: ReactNode;
  sortable?: boolean;
  sortValue?: (row: T) => string | number | null | undefined;
  width?: string;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => ReactNode;
};

export type TableProps<T> = {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  pageSize?: number;
  pageSizeOptions?: number[];
  toolbar?: ReactNode;
  empty?: ReactNode;
  className?: string;
  /** Adds a leading checkbox column and row-selection behaviour. */
  selectable?: boolean;
  /** Controlled selection, keyed by `rowKey`. */
  selectedKeys?: readonly string[];
  onSelectedKeysChange?: (keys: string[]) => void;
  /** Renders the row's checkbox as disabled. */
  rowDisabled?: (row: T) => boolean;
  /** Keeps the header row pinned while the surrounding container scrolls. */
  stickyHeader?: boolean;
  /** 32px rows instead of the default height. */
  dense?: boolean;
  rowClassName?: (row: T) => string | undefined;
  /** Clicking the row body (outside the checkbox) selects/opens the row. */
  onRowClick?: (row: T) => void;
};

function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true });
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50];

type PageItem = number | 'ellipsis';

/** Build a compact page list: 1 … 4 5 6 … 20 */
function buildPageItems(pageCount: number, current: number): PageItem[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index);
  }

  const items: PageItem[] = [0];
  const start = Math.max(1, current - 1);
  const end = Math.min(pageCount - 2, current + 1);

  if (start > 1) items.push('ellipsis');
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < pageCount - 2) items.push('ellipsis');
  items.push(pageCount - 1);

  return items;
}

type SelectionCheckboxProps = {
  'aria-label': string;
  checked: boolean;
  className?: string;
  disabled?: boolean;
  indeterminate?: boolean;
  stopPropagation?: boolean;
  onChange: (checked: boolean) => void;
};

/** Native checkbox with the visible control the selection column uses. */
function SelectionCheckbox({
  'aria-label': ariaLabel,
  checked,
  className,
  disabled = false,
  indeterminate = false,
  stopPropagation = false,
  onChange,
}: SelectionCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <span
      className={cn(styles.checkboxWrapper, className)}
      onClick={stopPropagation ? (event) => event.stopPropagation() : undefined}
    >
      <input
        ref={ref}
        aria-label={ariaLabel}
        checked={checked}
        className={styles.checkbox}
        disabled={disabled}
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
    </span>
  );
}

/** Minimal client-side table with sorting, pagination, page-size select, and slots. */
export function Table<T>({
  columns,
  rows,
  rowKey,
  pageSize: initialPageSize = 10,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  toolbar,
  empty,
  className = '',
  selectable = false,
  selectedKeys,
  onSelectedKeysChange,
  rowDisabled,
  stickyHeader = true,
  dense = false,
  rowClassName,
  onRowClick,
}: TableProps<T>) {
  const { t } = useI18n();
  const rowsPerPageLabelId = useId();
  const [sortId, setSortId] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<TableSortDirection>('asc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);

  useEffect(() => {
    setPageSize(initialPageSize);
    setPage(0);
  }, [initialPageSize]);

  const sortedRows = useMemo(() => {
    if (!sortId) return rows;
    const column = columns.find((item) => item.id === sortId);
    if (!column?.sortable) return rows;
    const getValue =
      column.sortValue ??
      ((row: T) => {
        const rendered = column.render(row);
        return typeof rendered === 'string' || typeof rendered === 'number' ? rendered : '';
      });
    const next = [...rows];
    next.sort((left, right) => {
      const result = compareValues(getValue(left), getValue(right));
      return sortDir === 'asc' ? result : -result;
    });
    return next;
  }, [columns, rows, sortDir, sortId]);

  const total = sortedRows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(page, pageCount - 1);
  const start = total === 0 ? 0 : safePage * pageSize + 1;
  const end = Math.min(total, (safePage + 1) * pageSize);
  const pageRows = sortedRows.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const selectionEnabled = selectable === true;
  const selectedSet = useMemo(() => new Set(selectedKeys ?? []), [selectedKeys]);
  const selectableKeys = selectionEnabled
    ? pageRows.filter((row) => !rowDisabled?.(row)).map((row) => rowKey(row))
    : [];
  const selectedOnPage = selectableKeys.filter((key) => selectedSet.has(key)).length;
  const allPageSelected = selectableKeys.length > 0 && selectedOnPage === selectableKeys.length;

  const toggleKeys = (keys: string[], nextSelected: boolean) => {
    const next = new Set(selectedKeys ?? []);
    keys.forEach((key) => {
      if (nextSelected) next.add(key);
      else next.delete(key);
    });
    onSelectedKeysChange?.([...next]);
  };

  const toggleSort = (columnId: string) => {
    if (sortId === columnId) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortId(columnId);
      setSortDir('asc');
    }
    setPage(0);
  };

  return (
    <div className={cn(styles.root, dense && styles.dense, selectionEnabled && styles.selectable, className)}>
      {toolbar ? <div className={styles.toolbar}>{toolbar}</div> : null}

      {total === 0 ? (
        <div className={styles.empty}>{empty}</div>
      ) : (
        <div className={styles.surface}>
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {selectionEnabled ? (
                    <th className={cn(styles.th, styles.selectCell, stickyHeader && styles.stickyHead)}>
                      <SelectionCheckbox
                        aria-label={t('selectAllRows')}
                        checked={allPageSelected}
                        disabled={selectableKeys.length === 0}
                        indeterminate={selectedOnPage > 0 && !allPageSelected}
                        onChange={(checked) => toggleKeys(selectableKeys, checked)}
                      />
                    </th>
                  ) : null}
                  {columns.map((column) => (
                    <th
                      key={column.id}
                      className={cn(styles.th, stickyHeader && styles.stickyHead)}
                      style={{
                        width: column.width,
                        textAlign: column.align ?? 'left',
                      }}
                    >
                      {column.sortable ? (
                        <button
                          type="button"
                          className={`${styles.sortButton} ${sortId === column.id ? styles.sortActive : ''}`}
                          onClick={() => toggleSort(column.id)}
                        >
                          <span>{column.header}</span>
                          <Icon
                            name={
                              sortId === column.id && sortDir === 'desc'
                                ? IconNames.chevronDown
                                : IconNames.chevronUp
                            }
                            size="xs"
                          />
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const key = rowKey(row);
                  const rowIsSelected = selectionEnabled && selectedSet.has(key);

                  return (
                    <tr
                      key={key}
                      className={cn(
                        styles.tr,
                        rowIsSelected && styles.trSelected,
                        onRowClick && styles.trClickable,
                        rowClassName?.(row),
                      )}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                    >
                      {selectionEnabled ? (
                        <td className={cn(styles.td, styles.selectCell)}>
                          <SelectionCheckbox
                            aria-label={t('selectRow')}
                            checked={rowIsSelected}
                            disabled={rowDisabled?.(row) ?? false}
                            stopPropagation
                            onChange={(checked) => toggleKeys([key], checked)}
                          />
                        </td>
                      ) : null}
                      {columns.map((column) => (
                        <td
                          key={column.id}
                          className={styles.td}
                          style={{ textAlign: column.align ?? 'left' }}
                        >
                          {column.render(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.pagination}>
            <span className={`${styles.pageMeta} ${styles.pageRange}`}>
              {t('tableRange', { start, end, total })}
            </span>

            <div className={styles.pageControls}>
              <IconButton
                variant="ghost"
                size="sm"
                disabled={safePage === 0}
                aria-label={t('previousPage')}
                tooltipText={t('previousPage')}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                <Icon name={IconNames.chevronLeft} size="sm" />
              </IconButton>

              {buildPageItems(pageCount, safePage).map((item, index) =>
                item === 'ellipsis' ? (
                  <span key={`ellipsis-${index}`} className={styles.pageEllipsis} aria-hidden="true">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    className={`${styles.pageNumber} ${item === safePage ? styles.pageNumberActive : ''}`.trim()}
                    aria-label={`${item + 1}`}
                    aria-current={item === safePage ? 'page' : undefined}
                    onClick={() => setPage(item)}
                  >
                    {item + 1}
                  </button>
                ),
              )}

              <IconButton
                variant="ghost"
                size="sm"
                disabled={safePage >= pageCount - 1}
                aria-label={t('nextPage')}
                tooltipText={t('nextPage')}
                onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              >
                <Icon name={IconNames.chevronRight} size="sm" />
              </IconButton>
            </div>

            <div className={styles.pageSize}>
              <span className={styles.pageMeta} id={rowsPerPageLabelId}>
                {t('rowsPerPage')}
              </span>
              <Select
                aria-labelledby={rowsPerPageLabelId}
                className={styles.pageSizeSelect}
                size="sm"
                value={String(pageSize)}
                options={pageSizeOptions.map((option) => ({
                  value: String(option),
                  label: String(option),
                }))}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setPage(0);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
