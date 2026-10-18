import type { visualEntries, VisualExport } from '../../registry/inventory';
export type CatalogEntry = typeof visualEntries[number];
export type CatalogState = { query: string; selected: VisualExport | null };
