import type { AutomationArgDefinition, AutomationArgLayer } from '@/schemas/automation';
import type { AutomationBinding, CatalogEntry } from '@/schemas/automation-store';
import type { ReferenceDoc } from '@/services/reference-book';
import type { RunAutomationResult } from '@/services/automation/run-results';
import { coerceReferenceValue } from '@/services/automation/arguments';

export const automationEntryKey = (e: Pick<CatalogEntry, 'automationId' | 'project' | 'variantId'>): string =>
  JSON.stringify([e.automationId, e.project, e.variantId || 'default']);

export type AutomationTreeNode =
  | { kind: 'folder' | 'file'; name: string; path: string; children: AutomationTreeNode[] }
  | { kind: 'test'; name: string; path: string; entry: CatalogEntry };

/** Real source paths drive the hierarchy; titles never become guessed folders. */
export function buildAutomationTree(entries: readonly CatalogEntry[]): AutomationTreeNode[] {
  const root: AutomationTreeNode[] = [];
  for (const entry of entries) {
    const parts = (entry.file?.replace(/\\/g, '/') || '(No source file)').split('/').filter(Boolean);
    let children = root;
    let path = '';
    parts.forEach((name, index) => {
      path += (path ? '/' : '') + name;
      let node = children.find((n) => n.kind !== 'test' && n.path === path);
      if (!node || node.kind === 'test') {
        node = { kind: index === parts.length - 1 ? 'file' : 'folder', name, path, children: [] };
        children.push(node);
      }
      children = node.children;
    });
    children.push({ kind: 'test', name: entry.title || entry.automationId, path: automationEntryKey(entry), entry });
  }
  const sort = (nodes: AutomationTreeNode[]): void => {
    nodes.sort((a, b) => (a.kind === 'folder' ? 0 : 1) - (b.kind === 'folder' ? 0 : 1) || a.name.localeCompare(b.name));
    nodes.forEach((n) => { if (n.kind !== 'test') sort(n.children); });
  };
  sort(root);
  return root;
}

/** Explicit reassignment replaces legacy multi-Case links for this invocation only. */
export function assignAutomationCase(
  bindings: readonly AutomationBinding[], entry: CatalogEntry, caseId: string | null, newId: string,
): AutomationBinding[] {
  const matches = (b: AutomationBinding) => automationEntryKey(b) === automationEntryKey(entry);
  const previous = bindings.find(matches);
  const others = bindings.filter((b) => !matches(b));
  if (!caseId) return others;
  return [...others, {
    id: previous?.id ?? newId, caseId, automationId: entry.automationId,
    project: entry.project, variantId: entry.variantId ?? 'default',
    enabled: previous?.enabled ?? true, archived: false, arguments: previous?.arguments ?? {},
  }];
}

export function planReferenceArguments(entry: CatalogEntry, doc: ReferenceDoc): {
  definitions: AutomationArgDefinition[]; values: AutomationArgLayer; problems: string[];
} {
  const problems: string[] = [];
  const values: AutomationArgLayer = {};
  if (doc.readonly || doc.entry.archived || doc.entry.kind !== 'arguments') {
    return { definitions: entry.arguments, values, problems: ['Choose an active, readable arguments set.'] };
  }
  const definitions: AutomationArgDefinition[] = entry.arguments.length ? entry.arguments : (doc.entry.values ?? []).map((v) => ({
    key: v.key, type: v.type, required: true, ...(v.options ? { options: v.options } : {}),
  }));
  for (const def of definitions) {
    const value = doc.entry.values?.find((v) => v.key === def.key);
    if (!value) {
      if (def.required && def.default === undefined) problems.push(`${def.key}: missing from this set.`);
      continue;
    }
    const checked = coerceReferenceValue(def, value);
    if ('problem' in checked) problems.push(`${def.key}: ${checked.problem}.`);
    else values[def.key] = { kind: 'reference', entryId: doc.id, key: def.key, revision: doc.revision };
  }
  return { definitions, values, problems };
}

/** Execution IDs are sortable timestamps. Keep only the latest status per test/project. */
export function latestAutomationResults(results: readonly RunAutomationResult[]): RunAutomationResult[] {
  const latest = new Map<string, RunAutomationResult>();
  for (const result of results) {
    const key = JSON.stringify([result.automationId, result.project]);
    const previous = latest.get(key);
    if (!previous || (result.recordedAt ?? result.executionId) >= (previous.recordedAt ?? previous.executionId)) latest.set(key, result);
  }
  return [...latest.values()];
}

export function runAutomationEntries(
  catalog: readonly CatalogEntry[], bindings: readonly AutomationBinding[], caseIds: readonly string[],
): CatalogEntry[] {
  const keys = new Set(bindings.filter((b) => b.enabled && !b.archived && caseIds.includes(b.caseId)).map(automationEntryKey));
  return catalog.filter((e) => !e.archived && keys.has(automationEntryKey(e)));
}
