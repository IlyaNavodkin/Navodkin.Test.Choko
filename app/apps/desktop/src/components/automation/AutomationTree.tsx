import type { ReactNode } from 'react';
import { I } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { CatalogEntry } from '@/schemas/automation-store';
import { automationEntryKey, buildAutomationTree, type AutomationTreeNode } from '@/utils/automation-workflow';

export function AutomationTree({ entries, selectedKey, onSelect, renderMeta }: {
  entries: CatalogEntry[];
  selectedKey: string | null;
  onSelect: (entry: CatalogEntry) => void;
  renderMeta?: (entry: CatalogEntry) => ReactNode;
}) {
  const render = (node: AutomationTreeNode): ReactNode => {
    if (node.kind !== 'test') return (
      <details key={node.path} open className="automation-tree-branch">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-raise">
          <span className="automation-tree-chevron text-ink-faint">{I.chevronDown({ size: 12 })}</span>
          <span className={node.kind === 'file' ? 'text-accent' : 'text-ink-3'}>{node.kind === 'file' ? I.file({ size: 14 }) : I.folder({ size: 14 })}</span>
          <span className="truncate" title={node.path}>{node.name}</span>
        </summary>
        <div className="ml-3 border-l border-border pl-1">{node.children.map(render)}</div>
      </details>
    );
    const active = selectedKey === automationEntryKey(node.entry);
    return (
      <button key={node.path} type="button" aria-pressed={active} onClick={() => onSelect(node.entry)} title={`${node.entry.file ?? ''}\n${node.name} · ${node.entry.project}`}
        className={cn('my-0.5 flex w-full items-start gap-2 rounded-md border border-transparent px-2 py-2 text-left text-[12px] text-ink-2 hover:bg-raise focus-visible:outline-2 focus-visible:outline-accent', active && 'border-accent-line bg-accent-soft text-accent-ink')}>
        <span className="mt-0.5 shrink-0 text-ink-3">{I.test({ size: 15 })}</span>
        <span className="min-w-0 flex-1">
          <span className="block leading-[1.45]">{node.name}</span>
          <span className="mt-0.5 block text-[10px] text-ink-3">{node.entry.project || 'default project'}{node.entry.variantId ? ` · ${node.entry.variantId}` : ''}</span>
        </span>
        {renderMeta?.(node.entry)}
      </button>
    );
  };
  return <div className="min-h-0 flex-1 overflow-auto p-2" aria-label="Project test files">{entries.length ? buildAutomationTree(entries).map(render) : <div className="p-4 text-[12px] text-ink-3">Nothing matches.</div>}</div>;
}
