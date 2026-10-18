import { useState } from 'react';
import { filterEntries, reconcileSelection } from './catalogState';
import type { CatalogEntry, CatalogState } from './types';
import type { VisualExport } from '../../registry/inventory';
export type UseComponentCatalogArgs = Record<string, never>;
export type UseComponentCatalogResult = CatalogState & { entries: CatalogEntry[]; searchEpoch: number; clearQuery: () => void; setQuery: (query: string) => void; select: (name: VisualExport) => void };
export function useComponentCatalog(_args: UseComponentCatalogArgs = {}): UseComponentCatalogResult {
  const [state, setState] = useState<CatalogState>({ query: '', selected: 'Button' });
  const [searchEpoch, setSearchEpoch] = useState(0);
  return { ...state, searchEpoch, entries: filterEntries(state.query),
    clearQuery: () => { setSearchEpoch(v => v + 1); setState(previous => ({ query: '', selected: reconcileSelection(previous.selected, filterEntries('')) })); },
    setQuery: query => setState(previous => ({ query, selected: reconcileSelection(previous.selected, filterEntries(query)) })),
    select: selected => setState(previous => previous.selected === selected ? previous : { ...previous, selected }),
  };
}
