import { validateArgDefinitions, type CatalogEntry } from '@/schemas/automation-store';
import type { AutomationArgDefinition } from '@/schemas/automation';
import type { LintWarning } from '@/schemas';

// ---------------------------------------------------------------------------
// Catalog view helpers (pure): search/filter and argument-definition editing. The store slice owns
// loading/saving; the section renders through these so its behavior is directly testable.
// ---------------------------------------------------------------------------

export type AutomationFilter = 'all' | 'runnable' | 'archived';

export interface CatalogSearch {
  query: string;
  filter: AutomationFilter;
  project: string;
}

/** Whether an entry matches the search (title, automationId, caseId, file, tags) and filters. */
export function matchesCatalogEntry(entry: CatalogEntry, search: CatalogSearch): boolean {
  if (search.filter === 'archived') {
    if (!entry.archived) return false;
  } else if (entry.archived) return false;
  if (search.filter === 'runnable' && !entry.automationId) return false;
  if (search.project && entry.project !== search.project) return false;
  const q = search.query.trim().toLowerCase();
  if (!q) return true;
  return [entry.title, entry.automationId, entry.caseId ?? '', entry.file ?? '', ...entry.tags].some((f) =>
    f.toLowerCase().includes(q),
  );
}

/** Distinct project names in the catalog, sorted (for the filter dropdown). */
export const catalogProjects = (entries: readonly CatalogEntry[]): string[] =>
  [...new Set(entries.map((e) => e.project).filter(Boolean))].sort((a, b) => a.localeCompare(b));

/** Entries with a usable key, newest discovery first (the catalog is already sorted). */
export const runnableEntries = (entries: readonly CatalogEntry[]): CatalogEntry[] =>
  entries.filter((e) => !!e.automationId && !e.archived);

/** A blank definition row for the editor (key empty, the user fills it in). */
export const blankArgDefinition = (): AutomationArgDefinition => ({ key: '', type: 'string' });

/** Replace one definition by index, returning a new array. */
export const patchArgDefinition = (
  defs: readonly AutomationArgDefinition[],
  index: number,
  patch: Partial<AutomationArgDefinition>,
): AutomationArgDefinition[] => defs.map((d, i) => (i === index ? { ...d, ...patch } : d));

/** Remove one definition by index. */
export const removeArgDefinition = (defs: readonly AutomationArgDefinition[], index: number): AutomationArgDefinition[] =>
  defs.filter((_, i) => i !== index);

/** Problems with the definitions plus the editor's own diagnostics as lint warnings. */
export function definitionIssues(defs: readonly AutomationArgDefinition[]): LintWarning[] {
  return validateArgDefinitions(defs).map((message) => ({ code: 'automation-arguments', message }));
}

/** Whether the catalog entry is startable (has an identity and is not archived). */
export const isRunnable = (entry: CatalogEntry): boolean => !!entry.automationId && !entry.archived;
