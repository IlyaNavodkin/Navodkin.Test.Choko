'use client';

import {
  forwardRef,
  useCallback,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { clsx as cn } from 'clsx';
import { Icon, IconNames, type IconName } from '../Icon/Icon';
import { useI18n } from '../i18n/provider';
import {
  canMoveIntoFolder,
  flattenVisibleTree,
  resolveFileTree,
  type FileTreeRow,
} from './flattenTree';
import styles from './FileTree.module.css';

export type FileTreeNodeKind = 'folder' | 'file';

export type FileTreeNode = {
  id: string;
  kind: FileTreeNodeKind;
  name: string;
  parentId: string | null;
  /** Optional pre-built children; when omitted the tree is derived from parentId. */
  children?: FileTreeNode[];
  icon?: IconName;
  /** Small trailing element, e.g. a size label or a status pill. */
  meta?: ReactNode;
  /** Disables selection and drag/drop for this node (e.g. a file being converted). */
  disabled?: boolean;
};

export type FileTreeMovePayload = {
  nodeId: string;
  targetFolderId: string | null;
};

export type FileTreeProps = {
  nodes: FileTreeNode[];
  selectedId?: string | null;
  expandedIds?: readonly string[];
  defaultExpandedIds?: readonly string[];
  onSelect?: (node: FileTreeNode) => void;
  onToggle?: (node: FileTreeNode, expanded: boolean) => void;
  /** Enables HTML5 drag and drop of files onto folders (and onto the root). */
  onMove?: (payload: FileTreeMovePayload) => void;
  /** Rendered for the hovered/focused row; the caller owns the popover/menu. */
  rowActions?: (node: FileTreeNode) => ReactNode;
  emptyLabel?: string;
  className?: string;
  'aria-label'?: string;
};

/** Drag payload type of the tree; lets a drop target recognise an internal drag. */
const DRAG_MIME = 'application/x-codaa-file-tree';

const BASE_INDENT_PX = 8;
const INDENT_PX = 14;

function defaultIcon(node: FileTreeNode, expanded: boolean): IconName {
  if (node.kind === 'file') return IconNames.file;
  return expanded ? IconNames.folderOpen : IconNames.folder;
}

/**
 * Generic folder/file tree: selection, expand/collapse, a single tab stop with
 * arrow-key navigation and optional HTML5 drag and drop of files onto folders.
 */
export const FileTree = forwardRef<HTMLDivElement, FileTreeProps>(function FileTree(
  {
    nodes,
    selectedId = null,
    expandedIds,
    defaultExpandedIds,
    onSelect,
    onToggle,
    onMove,
    rowActions,
    emptyLabel,
    className = '',
    'aria-label': ariaLabel,
  },
  ref,
) {
  const { t } = useI18n();
  const instanceId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  /** Set on mousedown so a drag started on a control is not treated as a row drag. */
  const suppressDragRef = useRef(false);

  const [uncontrolledExpanded, setUncontrolledExpanded] = useState<readonly string[]>(
    defaultExpandedIds ?? [],
  );
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  /** `undefined` = no target, `null` = the root (empty area), otherwise a folder id. */
  const [dropTargetId, setDropTargetId] = useState<string | null | undefined>(undefined);

  useImperativeHandle(ref, () => rootRef.current as HTMLDivElement, []);

  const isExpandedControlled = expandedIds !== undefined;
  const expanded = expandedIds ?? uncontrolledExpanded;
  const expandedSet = useMemo(() => new Set(expanded), [expanded]);

  const rows = useMemo(() => flattenVisibleTree(nodes, expandedSet), [nodes, expandedSet]);
  const forest = useMemo(() => resolveFileTree(nodes), [nodes]);
  const dragEnabled = onMove !== undefined;

  /** Roving focus: the selected node wins, otherwise the first visible row. */
  const activeId = useMemo(() => {
    for (const candidate of [focusedId, selectedId]) {
      if (candidate !== null && candidate !== undefined && rows.some((row) => row.node.id === candidate)) {
        return candidate;
      }
    }
    return rows[0]?.node.id ?? null;
  }, [focusedId, rows, selectedId]);

  const rowElementId = (nodeId: string) =>
    `${instanceId}-${nodeId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  const setExpanded = useCallback(
    (node: FileTreeNode, next: boolean) => {
      onToggle?.(node, next);
      if (!isExpandedControlled) {
        setUncontrolledExpanded((current) =>
          next
            ? [...current.filter((id) => id !== node.id), node.id]
            : current.filter((id) => id !== node.id),
        );
      }
    },
    [isExpandedControlled, onToggle],
  );

  const toggleNode = useCallback(
    (node: FileTreeNode) => {
      setExpanded(node, !expandedSet.has(node.id));
    },
    [expandedSet, setExpanded],
  );

  const selectNode = useCallback(
    (node: FileTreeNode) => {
      if (node.disabled) return;
      onSelect?.(node);
    },
    [onSelect],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0) return;
    const index = Math.max(
      0,
      rows.findIndex((row) => row.node.id === activeId),
    );
    const row = rows[index];
    if (row === undefined) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setFocusedId(rows[Math.min(rows.length - 1, index + 1)].node.id);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusedId(rows[Math.max(0, index - 1)].node.id);
        break;
      case 'ArrowRight': {
        event.preventDefault();
        if (!row.hasChildren) break;
        if (!row.expanded) {
          toggleNode(row.node);
          break;
        }
        const firstChild = rows[index + 1];
        if (firstChild !== undefined && firstChild.depth > row.depth) {
          setFocusedId(firstChild.node.id);
        }
        break;
      }
      case 'ArrowLeft': {
        event.preventDefault();
        if (row.hasChildren && row.expanded) {
          toggleNode(row.node);
          break;
        }
        for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
          const candidate = rows[cursor];
          if (candidate.depth < row.depth) {
            setFocusedId(candidate.node.id);
            break;
          }
        }
        break;
      }
      case 'Home':
        event.preventDefault();
        setFocusedId(rows[0].node.id);
        break;
      case 'End':
        event.preventDefault();
        setFocusedId(rows[rows.length - 1].node.id);
        break;
      case 'Enter':
        event.preventDefault();
        selectNode(row.node);
        break;
      case ' ':
        event.preventDefault();
        if (row.hasChildren) toggleNode(row.node);
        break;
      default:
        break;
    }
  };

  const resetDrag = useCallback(() => {
    suppressDragRef.current = false;
    setDraggedId(null);
    setDropTargetId(undefined);
  }, []);

  const handleRowMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    suppressDragRef.current = target !== null && target.closest('button,input,[data-no-drag]') !== null;
  };

  const handleRowDragStart = (event: DragEvent<HTMLDivElement>, row: FileTreeRow) => {
    const target = event.target as HTMLElement | null;
    if (
      !dragEnabled ||
      row.node.disabled ||
      suppressDragRef.current ||
      (target !== null && target.closest('button,input,[data-no-drag]') !== null)
    ) {
      event.preventDefault();
      return;
    }

    setDraggedId(row.node.id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(DRAG_MIME, row.node.id);
    event.dataTransfer.setData('text/plain', row.node.name);
  };

  const canDropInto = (targetFolderId: string | null) =>
    draggedId !== null && dragEnabled && canMoveIntoFolder(forest, draggedId, targetFolderId);

  const handleRowDragOver = (event: DragEvent<HTMLDivElement>, row: FileTreeRow) => {
    // Rows never fall through to the root drop zone below them.
    event.stopPropagation();
    if (row.node.kind !== 'folder' || row.node.disabled || !canDropInto(row.node.id)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetId(row.node.id);
  };

  const handleRowDrop = (event: DragEvent<HTMLDivElement>, row: FileTreeRow) => {
    event.stopPropagation();
    if (row.node.kind !== 'folder' || row.node.disabled || !canDropInto(row.node.id)) return;
    event.preventDefault();
    const nodeId = draggedId;
    resetDrag();
    if (nodeId !== null) {
      onMove?.({ nodeId, targetFolderId: row.node.id });
    }
  };

  const handleRootDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!canDropInto(null)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetId(null);
  };

  const handleRootDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!canDropInto(null)) return;
    event.preventDefault();
    const nodeId = draggedId;
    resetDrag();
    if (nodeId !== null) {
      onMove?.({ nodeId, targetFolderId: null });
    }
  };

  const handleRootDragLeave = (event: DragEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next === null || !event.currentTarget.contains(next)) {
      setDropTargetId(undefined);
    }
  };

  return (
    <div
      ref={rootRef}
      role="tree"
      aria-label={ariaLabel ?? t('fileTree')}
      aria-activedescendant={activeId !== null ? rowElementId(activeId) : undefined}
      tabIndex={rows.length === 0 ? -1 : 0}
      className={cn(
        styles.tree,
        draggedId !== null && dropTargetId === null && styles.rootDrop,
        className,
      )}
      onKeyDown={handleKeyDown}
      onDragOver={handleRootDragOver}
      onDragLeave={handleRootDragLeave}
      onDrop={handleRootDrop}
    >
      {rows.length === 0 ? (
        <span className={styles.empty} role="presentation">
          {emptyLabel ?? t('noData')}
        </span>
      ) : (
        rows.map((row) => {
          const { node } = row;
          const isSelected = node.id === selectedId;
          const actions = rowActions?.(node);

          return (
            <div
              key={node.id}
              id={rowElementId(node.id)}
              role="treeitem"
              aria-level={row.depth + 1}
              aria-selected={isSelected}
              aria-expanded={row.hasChildren ? row.expanded : undefined}
              aria-disabled={node.disabled ? true : undefined}
              className={cn(
                styles.row,
                isSelected && styles.selected,
                node.id === activeId && styles.active,
                dropTargetId === node.id && styles.dropOver,
                node.disabled && styles.disabled,
              )}
              style={{ paddingLeft: `${BASE_INDENT_PX + row.depth * INDENT_PX}px` }}
              draggable={dragEnabled && !node.disabled}
              onMouseDown={handleRowMouseDown}
              onClick={(event) => {
                const target = event.target as HTMLElement | null;
                // A click inside `rowActions` belongs to the caller's own control.
                if (target !== null && target.closest('[data-no-drag]') !== null) return;
                rootRef.current?.focus({ preventScroll: true });
                setFocusedId(node.id);
                selectNode(node);
              }}
              onDragStart={(event) => handleRowDragStart(event, row)}
              onDragOver={(event) => handleRowDragOver(event, row)}
              onDrop={(event) => handleRowDrop(event, row)}
              onDragEnd={resetDrag}
            >
              <span
                className={cn(
                  styles.chevron,
                  row.expanded && styles.chevronOpen,
                  !row.hasChildren && styles.chevronHidden,
                )}
                aria-hidden="true"
                data-no-drag="true"
                onClick={(event) => {
                  event.stopPropagation();
                  if (row.hasChildren) {
                    toggleNode(node);
                  }
                }}
              >
                {row.hasChildren ? <Icon name={IconNames.chevronRight} size="xs" /> : null}
              </span>

              <span className={styles.icon} aria-hidden="true">
                <Icon name={node.icon ?? defaultIcon(node, row.expanded)} size="sm" />
              </span>

              <span className={styles.name} title={node.name}>
                {node.name}
              </span>

              {node.meta !== undefined ? <span className={styles.meta}>{node.meta}</span> : null}

              {actions !== undefined ? (
                <span className={styles.actions} data-no-drag="true">
                  {actions}
                </span>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
});

export type { FileTreeRow };
