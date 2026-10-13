/**
 * Pure tree helpers for `FileTree`.
 *
 * Kept in a separate module so the ordering/flattening rules can be covered by a
 * unit test without a DOM or a renderer. Everything here is domain-agnostic.
 */
import type { FileTreeNode } from './FileTree';

/** One visible row of the tree, in render order. */
export type FileTreeRow = {
  node: FileTreeNode;
  /** `0` for a root-level node. */
  depth: number;
  /** Whether the node has children that can be expanded. */
  hasChildren: boolean;
  expanded: boolean;
  /** Parent id inside the rendered tree (`null` at the root level). */
  parentId: string | null;
};

/** Folders sortable-first, then by name — the ordering rule of every level. */
export function compareFileTreeNodes(left: FileTreeNode, right: FileTreeNode): number {
  if (left.kind !== right.kind) {
    return left.kind === 'folder' ? -1 : 1;
  }
  return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
}

function resolveNested(list: readonly FileTreeNode[], seen: Set<string>): FileTreeNode[] {
  const result: FileTreeNode[] = [];

  for (const node of list) {
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    const children = node.children === undefined ? undefined : resolveNested(node.children, seen);
    result.push(children === node.children ? node : { ...node, children });
  }

  return result.sort(compareFileTreeNodes);
}

function resolveFromParentIds(nodes: readonly FileTreeNode[]): FileTreeNode[] {
  const knownIds = new Set(nodes.map((node) => node.id));
  const byParent = new Map<string | null, FileTreeNode[]>();

  for (const node of nodes) {
    const parentId = node.parentId !== null && knownIds.has(node.parentId) ? node.parentId : null;
    const bucket = byParent.get(parentId);
    if (bucket === undefined) {
      byParent.set(parentId, [node]);
    } else {
      bucket.push(node);
    }
  }

  const seen = new Set<string>();
  const build = (parentId: string | null): FileTreeNode[] => {
    const result: FileTreeNode[] = [];
    for (const node of [...(byParent.get(parentId) ?? [])].sort(compareFileTreeNodes)) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      const children = build(node.id);
      result.push(children.length > 0 ? { ...node, children } : node);
    }
    return result;
  };

  return build(null);
}

/**
 * Resolves the forest to render: explicit `children` win when any node carries
 * them, otherwise the nesting is derived from `parentId`. A parent that is not
 * part of `nodes` makes the node a root instead of hiding it.
 */
export function resolveFileTree(nodes: readonly FileTreeNode[]): FileTreeNode[] {
  if (nodes.some((node) => node.children !== undefined)) {
    return resolveNested(nodes, new Set());
  }
  return resolveFromParentIds(nodes);
}

/**
 * Depth-first list of the rows that are actually visible: a collapsed folder
 * hides its whole subtree.
 */
export function flattenVisibleTree(
  nodes: readonly FileTreeNode[],
  expandedIds: ReadonlySet<string> | readonly string[],
): FileTreeRow[] {
  const expanded = expandedIds instanceof Set ? expandedIds : new Set(expandedIds);
  const rows: FileTreeRow[] = [];

  const walk = (list: readonly FileTreeNode[], depth: number, parentId: string | null): void => {
    for (const node of list) {
      const children = node.children ?? [];
      const hasChildren = children.length > 0;
      const isExpanded = hasChildren && expanded.has(node.id);
      rows.push({ node, depth, hasChildren, expanded: isExpanded, parentId });
      if (isExpanded) {
        walk(children, depth + 1, node.id);
      }
    }
  };

  walk(resolveFileTree(nodes), 0, null);
  return rows;
}

function findFileTreeNode(nodes: readonly FileTreeNode[], nodeId: string): FileTreeNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const found = node.children === undefined ? null : findFileTreeNode(node.children, nodeId);
    if (found !== null) return found;
  }
  return null;
}

/** Ids of every node nested under `nodeId` (its subtree, excluding itself). */
export function collectDescendantIds(
  nodes: readonly FileTreeNode[],
  nodeId: string,
): Set<string> {
  const descendants = new Set<string>();
  const walk = (list: readonly FileTreeNode[]): void => {
    for (const node of list) {
      if (descendants.has(node.id)) continue;
      descendants.add(node.id);
      walk(node.children ?? []);
    }
  };

  const root = findFileTreeNode(resolveFileTree(nodes), nodeId);
  if (root !== null) {
    walk(root.children ?? []);
  }
  return descendants;
}

/**
 * A node may move into any folder except itself and its own descendants
 * (`null` = the root of the tree).
 */
export function canMoveIntoFolder(
  nodes: readonly FileTreeNode[],
  nodeId: string,
  targetFolderId: string | null,
): boolean {
  if (targetFolderId === null) return true;
  if (targetFolderId === nodeId) return false;
  return !collectDescendantIds(nodes, nodeId).has(targetFolderId);
}
