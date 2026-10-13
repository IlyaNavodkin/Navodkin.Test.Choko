import { useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { I } from '@/components/icons';
import { Button, Input, RowContextMenu, type MenuItem } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app-store';
import type { Case, Status, SuiteNode, TreeNode } from '@/types';

interface FlatRow {
  id: string;
  type: 'case' | 'suite';
  depth: number;
  node: TreeNode;
  open?: boolean;
}
interface DropPos {
  gap: number;
  depth: number;
  y: number;
}

function findSuiteNode(nodes: TreeNode[], id: string): SuiteNode | null {
  for (const n of nodes) {
    if (n.type === 'suite' && n.id === id) return n;
    const r = n.type === 'suite' ? findSuiteNode(n.children, id) : null;
    if (r) return r;
  }
  return null;
}

/* resizable-sidebar bounds (px); width persists in localStorage */
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 560;
const SIDEBAR_DEFAULT = 290;
const SIDEBAR_KEY = 'cw:sidebarWidth';

const rowBase =
  'group relative flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-sm px-1.5 text-ink hover:bg-raise';
const selBefore =
  "before:absolute before:bottom-1 before:left-0 before:top-1 before:w-[2.5px] before:rounded-[2px] before:bg-accent before:content-['']";

export function Sidebar() {
  const {
    cases,
    tree,
    sel,
    view,
    openCase,
    openSuite,
    openRunsList,
    collapsed,
    setCollapsed,
    renaming,
    setRenaming,
    createSuite,
    createCase,
    renameSuite,
    deleteSuite,
    deleteCase,
    duplicateCase,
    moveNodeToParent,
    regenerateDisplayIds,
    casePath,
    toast,
  } = useApp();

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [width, setWidth] = useState(() => {
    const v = Number(localStorage.getItem(SIDEBAR_KEY));
    return v >= SIDEBAR_MIN && v <= SIDEBAR_MAX ? v : SIDEBAR_DEFAULT;
  });

  // Drag the right edge to resize; width is clamped and persisted on release.
  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    let last = startW;
    const onMove = (ev: PointerEvent) => {
      last = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW + ev.clientX - startX));
      setWidth(last);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem(SIDEBAR_KEY, String(last));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  const resetWidth = () => {
    setWidth(SIDEBAR_DEFAULT);
    localStorage.setItem(SIDEBAR_KEY, String(SIDEBAR_DEFAULT));
  };
  const [drag, setDrag] = useState<string | null>(null);
  const [dropPos, setDropPos] = useState<DropPos | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => Object.fromEntries(cases.map((c) => [c.id, c])), [cases]);
  const allTags = useMemo(() => {
    const s = new Set<string>();
    cases.forEach((c) => c.tags.forEach((t) => s.add(t)));
    return [...s].sort();
  }, [cases]);

  const filtering = !!(q || status || tag);

  const matches = (c: Case | undefined): c is Case => {
    if (!c) return false;
    if (status && c.status !== status) return false;
    if (tag && !c.tags.includes(tag)) return false;
    if (q) {
      const hay = (
        c.title +
        ' ' +
        c.displayId +
        ' ' +
        c.objective +
        ' ' +
        c.steps.map((s) => s.text).join(' ') +
        ' ' +
        c.systems.join(' ') +
        ' ' +
        c.expected.join(' ') +
        ' ' +
        c.tags.join(' ')
      ).toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  };

  const subtreeHas = (node: TreeNode): boolean => {
    if (node.type === 'case') return matches(byId[node.id]);
    return node.children.some(subtreeHas);
  };

  const commitRename = () => {
    if (renaming && renaming.value.trim()) renameSuite(renaming.id, renaming.value.trim());
    setRenaming(null);
  };

  // ---- flattened visible rows (drag excluded), for the steps-style insertion line ----
  const flat = useMemo(() => {
    const out: FlatRow[] = [];
    const walk = (nodes: TreeNode[], depth: number) =>
      nodes.forEach((n) => {
        if (n.id === drag) return; // skip the dragged subtree entirely
        if (n.type === 'case') {
          const c = byId[n.id];
          if (filtering && !matches(c)) return;
          out.push({ id: n.id, type: 'case', depth, node: n });
        } else {
          if (filtering && !subtreeHas(n)) return;
          out.push({ id: n.id, type: 'suite', depth, node: n, open: !collapsed[n.id] });
          if (!collapsed[n.id]) walk(n.children, depth + 1);
        }
      });
    walk(tree, 0);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, drag, collapsed, q, status, tag, cases]);
  const flatIndex = useMemo(() => {
    const m: Record<string, number> = {};
    flat.forEach((f, i) => (m[f.id] = i));
    return m;
  }, [flat]);

  // deepest nesting allowed at a gap = (suite just above → its depth + 1) else (sibling depth)
  const maxDepthAt = (gap: number) => {
    const above = flat[gap - 1];
    if (!above) return 0;
    return above.type === 'suite' ? above.depth + 1 : above.depth;
  };
  // resolve a (gap, depth) into a concrete parent suite + insertion index
  const resolveDrop = (gap: number, depth: number) => {
    let parentId: string | null = null;
    if (depth > 0) {
      for (let i = gap - 1; i >= 0; i--) {
        const f = flat[i];
        if (f.type === 'suite' && f.depth === depth - 1) {
          parentId = f.id;
          break;
        }
        if (f.depth < depth - 1) break;
      }
      if (parentId == null)
        for (let i = gap - 1; i >= 0; i--) {
          const f = flat[i];
          if (f.type === 'suite' && f.depth < depth) {
            parentId = f.id;
            break;
          }
        }
    }
    const parent = parentId ? findSuiteNode(tree, parentId) : null;
    const arr = parent ? parent.children : tree;
    let index = 0;
    arr.forEach((ch) => {
      const cfi = flatIndex[ch.id];
      if (cfi != null && cfi < gap) index++;
    });
    return { parentId, index };
  };

  // ---- drag-and-drop (overlay indicator — never reflows rows, so no flicker) ----
  const onRowDragOver = (node: TreeNode) => (e: DragEvent) => {
    if (drag == null || filtering) return;
    e.preventDefault();
    e.stopPropagation();
    const fi = flatIndex[node.id];
    if (fi == null) return; // this is the dragged row
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const before = e.clientY - r.top < r.height / 2;
    const gap = before ? fi : fi + 1;
    const maxD = maxDepthAt(gap);
    const baseLeft = innerRef.current ? innerRef.current.getBoundingClientRect().left : r.left;
    let depth = Math.round((e.clientX - baseLeft - 22) / 15);
    depth = Math.max(0, Math.min(maxD, depth));
    const y = before ? el.offsetTop : el.offsetTop + el.offsetHeight;
    setDropPos((p) => (p && p.gap === gap && p.depth === depth && p.y === y ? p : { gap, depth, y }));
  };
  const onTreeDragOver = (e: DragEvent) => {
    if (drag == null || filtering) return;
    if ((e.target as HTMLElement).closest?.('.tree-section-h')) return;
    e.preventDefault();
    const y = tailRef.current ? tailRef.current.offsetTop : 0;
    setDropPos((p) => (p && p.gap === flat.length && p.depth === 0 && p.y === y ? p : { gap: flat.length, depth: 0, y }));
  };
  const doDrop = (e?: DragEvent) => {
    if (drag == null || dropPos == null) {
      endDrag();
      return;
    }
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const { parentId, index } = resolveDrop(dropPos.gap, dropPos.depth);
    moveNodeToParent(drag, parentId, index);
    endDrag();
  };
  const endDrag = () => {
    setDrag(null);
    setDropPos(null);
  };

  // ---- context-menu items ----
  const menuItems = (node: TreeNode | undefined): MenuItem[] => {
    if (!node) return [];
    if (node.type === 'case') {
      const c = byId[node.id];
      if (!c) return [];
      return [
        { icon: I.eye, label: 'Open', on: () => openCase(c.id) },
        { icon: I.copy, label: 'Duplicate', on: () => duplicateCase(c.id) },
        { icon: I.file, label: 'New case in this suite', on: () => createCase(c.suite) },
        { sep: true },
        { icon: I.tag, label: 'Copy ID', sub: c.displayId, on: () => toast('Copied ' + c.displayId) },
        { icon: I.link, label: 'Copy path', on: () => toast('Copied path') },
        { icon: I.folderOpen, label: 'Reveal in File Explorer', desktop: true, on: () => toast('nw.Shell.showItemInFolder — ' + casePath(c).split('/').pop()) },
        { icon: I.code, label: 'Open in default editor', desktop: true, on: () => toast('nw.Shell.openItem — opened externally') },
        { sep: true },
        { icon: I.trash, label: 'Delete', danger: true, on: () => deleteCase(c.id) },
      ];
    }
    if (node.isWorkspace) {
      return [
        { icon: I.file, label: 'New case', on: () => createCase(node.id) },
        { icon: I.folder, label: 'New suite', on: () => createSuite(node.id) },
        {
          icon: collapsed[node.id] ? I.chevronDown : I.chevron,
          label: collapsed[node.id] ? 'Expand' : 'Collapse',
          on: () => setCollapsed((s) => ({ ...s, [node.id]: !collapsed[node.id] })),
        },
        { sep: true },
        { icon: I.sync, label: 'Clean up display IDs', on: () => void regenerateDisplayIds(node.id) },
        { sep: true },
        { icon: I.link, label: 'Copy workspace path', sub: node.path, on: () => toast('Copied ' + node.path) },
        { icon: I.folderOpen, label: 'Reveal in File Explorer', desktop: true, on: () => toast('nw.Shell.showItemInFolder — ' + node.name) },
      ];
    }
    return [
      { icon: I.file, label: 'New case', on: () => createCase(node.id) },
      { icon: I.folder, label: 'New nested suite', on: () => createSuite(node.id) },
      { icon: I.edit, label: 'Rename', on: () => setRenaming({ id: node.id, value: node.name }) },
      {
        icon: collapsed[node.id] ? I.chevronDown : I.chevron,
        label: collapsed[node.id] ? 'Expand' : 'Collapse',
        on: () => setCollapsed((s) => ({ ...s, [node.id]: !collapsed[node.id] })),
      },
      { sep: true },
      { icon: I.sync, label: 'Clean up display IDs', on: () => void regenerateDisplayIds(node.id) },
      { sep: true },
      { icon: I.link, label: 'Copy folder path', sub: node.path, on: () => toast('Copied ' + node.path) },
      { icon: I.folderOpen, label: 'Reveal in File Explorer', desktop: true, on: () => toast('nw.Shell.showItemInFolder — ' + node.name) },
      { sep: true },
      { icon: I.trash, label: 'Delete suite', danger: true, on: () => deleteSuite(node.id) },
    ];
  };

  const renderNode = (node: TreeNode, depth: number) => {
    if (node.type === 'case') {
      const c = byId[node.id];
      if (!matches(c)) return null;
      const active = sel.kind === 'case' && sel.id === c.id;
      return (
        <div key={c.id}>
          <RowContextMenu items={menuItems(node)}>
            <div
              className={cn(rowBase, active && cn('bg-accent-soft', selBefore), drag === c.id && 'opacity-40')}
              style={{ paddingLeft: 8 + depth * 15 }}
              draggable={!filtering}
              onDragStart={(e) => {
                if (filtering) {
                  e.preventDefault();
                  return;
                }
                setDrag(c.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={endDrag}
              onDragOver={onRowDragOver(node)}
              onDrop={doDrop}
              onClick={() => openCase(c.id)}
            >
              <span className="grid size-4 shrink-0 place-items-center text-ink-faint" />
              <span className={cn('grid shrink-0 place-items-center', active ? 'text-accent-ink' : 'text-ink-3')}>
                {I.file({ size: 14 })}
              </span>
              <span
                className={cn(
                  'min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px]',
                  c.status === 'deprecated' && 'text-ink-faint',
                )}
              >
                {c.title}
              </span>
              {c.modified && <span className="size-1.5 shrink-0 rounded-full bg-blocked" title="Unsaved / uncommitted" />}
              <span className={cn('shrink-0 font-mono text-[11px]', active ? 'text-accent-ink' : 'text-ink-faint')}>
                {c.displayId}
              </span>
            </div>
          </RowContextMenu>
        </div>
      );
    }
    if (!subtreeHas(node) && filtering) return null;
    const isOpen = !collapsed[node.id];
    const count = node.children.filter((n) => n.type === 'case').length;
    const isRenaming = !!renaming && renaming.id === node.id;
    const suiteActive = view === 'suite' && sel.suiteId === node.id;
    return (
      <div key={node.id}>
        <RowContextMenu items={menuItems(node)}>
          <div
            className={cn(rowBase, suiteActive && cn('bg-accent-soft', selBefore), drag === node.id && 'opacity-40')}
            style={{ paddingLeft: 6 + depth * 15 }}
            draggable={!filtering && !isRenaming && !node.isWorkspace}
            onDragStart={(e) => {
              if (filtering || isRenaming || node.isWorkspace) {
                e.preventDefault();
                return;
              }
              setDrag(node.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={endDrag}
            onDragOver={onRowDragOver(node)}
            onDrop={doDrop}
            onClick={() => !isRenaming && openSuite(node.id)}
          >
            <span
              className="-ml-0.5 grid size-[18px] shrink-0 place-items-center rounded-sm text-ink-faint hover:bg-accent-line/40 hover:text-ink-2"
              title={isOpen ? 'Collapse' : 'Expand'}
              onClick={(e) => {
                e.stopPropagation();
                setCollapsed((s) => ({ ...s, [node.id]: isOpen }));
              }}
            >
              {isOpen ? I.chevronDown({ size: 13 }) : I.chevron({ size: 13 })}
            </span>
            <span className={cn('grid shrink-0 place-items-center', node.isWorkspace ? 'text-accent' : 'text-ink-3')}>
              {node.isWorkspace ? I.workspace({ size: 15 }) : isOpen ? I.folderOpen({ size: 15 }) : I.folder({ size: 15 })}
            </span>
            {isRenaming ? (
              <input
                className="min-w-0 flex-1 rounded-sm border border-accent bg-panel px-[5px] py-px text-[13px] font-medium text-ink shadow-[0_0_0_2px_var(--accent-soft)] focus:outline-none"
                autoFocus
                value={renaming!.value}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setRenaming({ id: node.id, value: e.target.value })}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenaming(null);
                }}
              />
            ) : (
              <span
                className={cn(
                  'min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px]',
                  node.isWorkspace ? 'font-semibold' : 'font-medium',
                )}
                onDoubleClick={
                  node.isWorkspace
                    ? undefined
                    : (e) => {
                        e.stopPropagation();
                        setRenaming({ id: node.id, value: node.name });
                      }
                }
              >
                {node.name}
              </span>
            )}
            <span className="ml-auto hidden shrink-0 items-center gap-0.5 group-hover:flex">
              <button
                className="flex h-[22px] items-center gap-0.5 rounded-sm border-0 bg-transparent px-1 text-ink-3 hover:bg-accent-soft hover:text-accent-ink"
                title="Add case"
                aria-label="Add case"
                onClick={(e) => {
                  e.stopPropagation();
                  createCase(node.id);
                }}
              >
                {I.plus({ size: 12 })}
                {I.file({ size: 13 })}
              </button>
              <button
                className="flex h-[22px] items-center gap-0.5 rounded-sm border-0 bg-transparent px-1 text-ink-3 hover:bg-accent-soft hover:text-accent-ink"
                title={node.isWorkspace ? 'Add suite' : 'Add nested suite'}
                aria-label={node.isWorkspace ? 'Add suite' : 'Add nested suite'}
                onClick={(e) => {
                  e.stopPropagation();
                  createSuite(node.id);
                }}
              >
                {I.plus({ size: 12 })}
                {I.folder({ size: 13 })}
              </button>
            </span>
            {!isRenaming && <span className="font-mono text-[11px] text-ink-faint group-hover:hidden">{count || ''}</span>}
          </div>
        </RowContextMenu>
        {isOpen && node.children.map((ch) => renderNode(ch, depth + 1))}
      </div>
    );
  };

  const anyVisible = tree.some(subtreeHas);
  const runsActive = view === 'runs' || view === 'run' || view === 'guide';

  return (
    <aside
      className="relative flex min-h-0 flex-none flex-col border-r border-border bg-panel-2"
      style={{ width }}
    >
      <div className="flex gap-0.5 px-2.5 pt-2">
        <button
          className={cn(
            'inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent bg-transparent text-[12.5px] font-medium text-ink-2 hover:bg-raise',
            !runsActive && 'border-border bg-panel text-ink shadow-[0_1px_2px_var(--shadow)]',
          )}
          onClick={() => sel.id && openCase(sel.id)}
        >
          {I.layers({ size: 14 })} Cases
        </button>
        <button
          className={cn(
            'inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent bg-transparent text-[12.5px] font-medium text-ink-2 hover:bg-raise',
            runsActive && 'border-border bg-panel text-ink shadow-[0_1px_2px_var(--shadow)]',
          )}
          onClick={openRunsList}
        >
          {I.grid({ size: 14 })} Runs
        </button>
      </div>

      <div className="flex flex-col gap-2 border-b border-border p-2.5">
        <div className="relative flex items-center">
          <span className="pointer-events-none absolute left-2 text-ink-faint">{I.search({ size: 14 })}</span>
          <Input className="h-[30px] pl-7" placeholder="Search cases…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['active', 'draft', 'deprecated'] as Status[]).map((s) => (
            <button
              key={s}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border border-border bg-panel px-2 py-0.5 text-[11.5px] capitalize text-ink-2 hover:bg-raise',
                status === s && 'border-accent-line bg-accent-soft font-semibold text-accent-ink',
              )}
              onClick={() => setStatus(status === s ? null : s)}
            >
              <span
                className="size-[7px] rounded-full"
                style={{
                  background: s === 'active' ? 'var(--pass)' : s === 'draft' ? 'var(--blocked)' : 'var(--ink-faint)',
                }}
              />
              {s}
            </button>
          ))}
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((t) => (
              <button
                key={t}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border border-border bg-panel px-2 py-0.5 text-[11.5px] text-ink-2 hover:bg-raise',
                  tag === t && 'border-accent-line bg-accent-soft font-semibold text-accent-ink',
                )}
                onClick={() => setTag(tag === t ? null : t)}
              >
                <span className="font-mono">#</span>
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2 pb-[14px] pt-1.5" ref={treeRef} onDragOver={onTreeDragOver} onDrop={doDrop}>
        <div className="relative" ref={innerRef}>
          <div className="tree-section-h flex items-center justify-between px-1.5 pb-1 pt-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">Workspaces</span>
            <span className="flex gap-0.5">
              <Button size="sm" variant="ghost" className="h-[22px] gap-1 px-[7px] text-[11.5px] text-ink-3 hover:bg-accent-soft hover:text-accent-ink" title="New top-level case" onClick={() => createCase(null)}>
                {I.file({ size: 13 })} Case
              </Button>
              <Button size="sm" variant="ghost" className="h-[22px] gap-1 px-[7px] text-[11.5px] text-ink-3 hover:bg-accent-soft hover:text-accent-ink" title="New top-level suite" onClick={() => createSuite(null)}>
                {I.folder({ size: 13 })} Suite
              </Button>
            </span>
          </div>
          {anyVisible ? (
            tree.map((n) => renderNode(n, 0))
          ) : (
            <div className="px-[14px] py-6 text-center text-[12.5px] text-ink-faint">
              No cases match.
              <br />
              Adjust search or filters.
            </div>
          )}
          <div className="min-h-9" ref={tailRef} />
          {drag != null && dropPos && (
            <div
              className="pointer-events-none absolute right-2 z-[5] m-0 h-0.5 -translate-y-px rounded-[2px] bg-accent before:absolute before:-left-0.5 before:top-1/2 before:size-[7px] before:-translate-y-1/2 before:rounded-full before:bg-accent before:shadow-[0_0_0_2px_var(--panel)] before:content-['']"
              style={{ top: dropPos.y, left: 10 + dropPos.depth * 15 }}
            />
          )}
        </div>
      </div>

      {/* right-edge resize handle (double-click resets) */}
      <div
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize · double-click to reset"
        onPointerDown={startResize}
        onDoubleClick={resetWidth}
        className="absolute -right-0.5 top-0 z-20 h-full w-1.5 cursor-col-resize transition-colors hover:bg-accent/30 active:bg-accent/50"
      />
    </aside>
  );
}
