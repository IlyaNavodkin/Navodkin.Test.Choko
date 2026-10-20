import type { AutomationArgDefinition, AutomationArgLayer, ResolvedAutomationArg } from '@/schemas/automation';
import type { AutomationBinding, CatalogEntry } from '@/schemas/automation-store';
import type { RunAutomationResult } from './run-results';

// ---------------------------------------------------------------------------
// Planning a run's automation set (spec "Run from a test run and save results", "Deterministic
// grouping and ordering"). Pure: the store supplies the catalog/bindings and the resolved argument
// layers; this module decides which invocations exist, in which order, and what blocks the start.
// ---------------------------------------------------------------------------

export interface RunAutomationCandidate {
  binding: AutomationBinding;
  entry: CatalogEntry;
  /** Resolved values for this binding (already checked by arguments.ts). */
  args: ResolvedAutomationArg[];
  /** Test-list path facts needed by selection.ts. */
  selection: {
    automationId: string;
    caseId: string | null;
    variantId: string | null;
    title: string;
    titlePath: string[];
    project: string;
    file: string | null;
    line: number | null;
    tags: string[];
  };
}

export interface RunAutomationGroup {
  id: string;
  project: string;
  candidates: RunAutomationCandidate[];
  args: ResolvedAutomationArg[];
}

export interface RunAutomationPlan {
  ok: boolean;
  groups: RunAutomationGroup[];
  problems: string[];
  /** Bindings whose case is not in the run (skipped, reported). */
  skipped: string[];
}

/** Stable fingerprint of resolved args (same rule as grouping.ts). */
const fingerprint = (args: readonly ResolvedAutomationArg[]): string =>
  [...args]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((a) => `${a.key}=${JSON.stringify(a.value)}`)
    .join('&');

/**
 * Group candidates by project + resolved arguments, preserving the run row / binding order. Blocked
 * when a candidate is archived or has no key, or when two enabled bindings collapse to the same
 * identity (the run would be ambiguous).
 */
export function planRunAutomation(
  candidates: readonly RunAutomationCandidate[],
  runCaseIds: readonly string[],
): RunAutomationPlan {
  const problems: string[] = [];
  const skipped: string[] = [];
  const seenKeys = new Set<string>();
  const accepted: RunAutomationCandidate[] = [];

  for (const c of candidates) {
    if (!runCaseIds.includes(c.binding.caseId)) {
      skipped.push(c.binding.id);
      continue;
    }
    if (c.binding.archived || c.entry.archived) {
      problems.push(`The autotest "${c.entry.title || c.entry.automationId}" is archived; enable or restore it before running.`);
      continue;
    }
    if (!c.binding.enabled) continue;
    const key = `${c.binding.caseId}::${c.selection.automationId}::${c.selection.project}::${c.selection.variantId ?? 'default'}`;
    if (seenKeys.has(key)) {
      problems.push(`Two enabled bindings point at the same test ${key}; remove one to avoid running it twice.`);
      continue;
    }
    seenKeys.add(key);
    accepted.push(c);
  }

  const groups: RunAutomationGroup[] = [];
  const index = new Map<string, RunAutomationGroup>();
  for (const c of accepted) {
    const id = `${c.selection.project}::${fingerprint(c.args)}`;
    let group = index.get(id);
    if (!group) {
      group = { id, project: c.selection.project, candidates: [], args: [...c.args] };
      index.set(id, group);
      groups.push(group);
    }
    group.candidates.push(c);
  }

  return { ok: problems.length === 0, groups, problems, skipped };
}

/** Declared arguments are the entry's; per-binding values are the layer above the test's own. */
export const bindingLayer = (binding: AutomationBinding): AutomationArgLayer => ({ ...binding.arguments });

/** Default argument definitions for an entry (never undefined). */
export const entryArgs = (entry: CatalogEntry): AutomationArgDefinition[] => entry.arguments ?? [];

/** The automation results that map onto a row, for the panel's badge. */
export const resultsForRow = (results: readonly RunAutomationResult[], rowIndex: number): RunAutomationResult[] =>
  results.filter((r) => r.caseRowIndex === rowIndex);
