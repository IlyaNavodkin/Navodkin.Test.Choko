import type { Catalog, StableKey } from '@testoritto/playwright-automation';
import type { AutomationView } from '../../api/contracts';

export type Binding = AutomationView['bindings'][number];

export function keyOf(key: StableKey): string {
  return JSON.stringify([key.caseId, key.automationId, key.project, key.variantId]);
}

export function mergeCatalog(previous: Catalog | null, next: Catalog): Catalog {
  if (!previous) return next;
  const tests = new Map(previous.tests.map((test) => [keyOf(test), test]));
  for (const test of next.tests) tests.set(keyOf(test), test);
  return { ...next, tests: [...tests.values()] };
}

export function applicableTests(catalog: Catalog, caseIds: Iterable<string>): Catalog['tests'] {
  const known = new Set(caseIds);
  return catalog.tests.filter((test) => known.has(test.caseId));
}

export function mergeBindings(
  existing: readonly Binding[],
  tests: readonly StableKey[],
  profileId: string,
): Binding[] {
  const merged = existing.slice();
  const seen = new Set(merged.map(keyOf));
  for (const test of tests) {
    const key = keyOf(test);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...test, profileId });
  }
  return merged;
}

export function selectionFrom(tests: readonly StableKey[]): StableKey[] {
  return tests.map(({ caseId, automationId, project, variantId }) => ({
    caseId,
    automationId,
    project,
    variantId,
  }));
}
