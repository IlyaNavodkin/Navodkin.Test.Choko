import { useEffect, useMemo, useState } from 'react';
import type { CatalogEntry, CaseDocument } from '../../api/contracts';

export type CaseStatusFilter = 'all' | CaseDocument['model']['status'];
export type CaseFilters = { search: string; tag: string; status: CaseStatusFilter };
export type UseSearchCasesArgs = { entries: CatalogEntry[]; scope: string };
const emptyFilters: CaseFilters = { search: '', tag: '', status: 'all' };
const normalize = (value: string) => value.normalize('NFKC').trim().toLowerCase();

export function filterCaseEntries(entries: CatalogEntry[], filters: CaseFilters): CatalogEntry[] {
  const search = normalize(filters.search);
  const tag = normalize(filters.tag);
  if (!search && !tag && filters.status === 'all') return entries;
  const folders = new Map(entries.flatMap((entry) => entry.kind === 'folder' ? [[entry.metadata.nodeId, entry] as const] : []));
  const included = new Set<string>();
  for (const entry of entries) {
    if (entry.kind !== 'case') continue;
    const metadata = entry.metadata;
    if (filters.status !== 'all' && metadata.status !== filters.status) continue;
    if (search && !normalize(metadata.title).includes(search) && !normalize(metadata.displayId).includes(search)) continue;
    if (tag && !metadata.tags.some((value) => normalize(value).includes(tag))) continue;
    included.add(metadata.resourceId);
    let parent = metadata.parentResourceId;
    while (parent && !included.has(parent)) {
      included.add(parent);
      parent = folders.get(parent)?.metadata.parentResourceId ?? null;
    }
  }
  return entries.filter((entry) => included.has(entry.kind === 'folder' ? entry.metadata.nodeId : entry.metadata.resourceId));
}

export function useSearchCases({ entries, scope }: UseSearchCasesArgs) {
  const [filters, setFilters] = useState(emptyFilters);
  useEffect(() => { setFilters(emptyFilters); }, [scope]);
  const filteredEntries = useMemo(() => filterCaseEntries(entries, filters), [entries, filters]);
  return { filters, filteredEntries, isFiltered: filteredEntries !== entries,
    matchCount: filteredEntries.filter((entry) => entry.kind === 'case').length,
    setSearch: (search: string) => setFilters((current) => ({ ...current, search })),
    setTag: (tag: string) => setFilters((current) => ({ ...current, tag })),
    setStatus: (status: CaseStatusFilter) => setFilters((current) => ({ ...current, status })),
    reset: () => setFilters(emptyFilters),
  };
}
export type UseSearchCasesResult = ReturnType<typeof useSearchCases>;
