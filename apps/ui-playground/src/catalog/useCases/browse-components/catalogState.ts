import { groupOrder, visualEntries } from '../../registry/inventory';
import type { VisualExport } from '../../registry/inventory';
import type { CatalogEntry } from './types';
export function filterEntries(query: string): CatalogEntry[] {
  const normalized = query.trim().toLocaleLowerCase('ru');
  return visualEntries.filter(e => e.name.toLocaleLowerCase('ru').includes(normalized) || e.group.toLocaleLowerCase('ru').includes(normalized))
    .sort((a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group) || a.name.localeCompare(b.name, 'en'));
}
export function reconcileSelection(selected: VisualExport | null, entries: CatalogEntry[]): VisualExport | null {
  if (entries.some(e => e.name === selected)) return selected;
  if (selected === null && entries.some(e => e.name === 'Button')) return 'Button';
  return entries[0]?.name ?? null;
}
