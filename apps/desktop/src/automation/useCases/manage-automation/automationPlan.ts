import type { Autotest, CaseAutotestBinding, DiscoveryV2, StableKey } from '@testoritto/playwright-automation';
import type { AutomationView } from '../../api/contracts';

export type Binding = AutomationView['bindings'][number];
export type DiscoveredTest = DiscoveryV2['tests'][number];

export function keyOf(key: StableKey): string {
  return JSON.stringify([key.caseId, key.automationId, key.project, key.variantId]);
}
/** Селектор теста: automationId, проект и вариант без привязки к кейсу. */
export function selectorOf(key: StableKey): string {
  return JSON.stringify([key.automationId, key.project, key.variantId]);
}
export function mergeCatalog(previous: DiscoveryV2 | null, next: DiscoveryV2): DiscoveryV2 {
  if (!previous) return next;
  const tests = new Map(previous.tests.map((test) => [keyOf(test), test]));
  for (const test of next.tests) tests.set(keyOf(test), test);
  return { ...next, tests: [...tests.values()] };
}
export function applicableTests(catalog: DiscoveryV2, caseIds: Iterable<string>): DiscoveredTest[] {
  const known = new Set(caseIds);
  return catalog.tests.filter((test) => known.has(test.caseId));
}
/** Ключи, у которых уже есть привязка к автотесту текущего каталога. */
export function boundKeys(bindings: readonly CaseAutotestBinding[], autotests: readonly Autotest[]): Set<string> {
  const selectors = new Map(autotests.map((autotest) => [autotest.id, autotest.selector]));
  const bound = new Set<string>();
  for (const binding of bindings) {
    const selector = selectors.get(binding.autotestId);
    if (!selector) continue;
    bound.add(keyOf({ caseId: binding.caseId, automationId: selector.automationId, project: selector.project, variantId: selector.variantId }));
  }
  return bound;
}
export function autotestFor(row: DiscoveredTest, profileId: string, id: string, revision: string): Autotest {
  return {
    schemaVersion: 2, id, title: row.title, description: row.file, archived: false, revision, profileId,
    selector: { automationId: row.automationId, project: row.project, variantId: row.variantId },
    argumentDefinitions: [], defaults: {},
  };
}
export function bindingFor(key: StableKey, autotestId: string, id: string, revision: string): CaseAutotestBinding {
  return { schemaVersion: 2, id, caseId: key.caseId, autotestId, revision, enabled: true, argumentOverrides: {} };
}
/** Отобранные и готовые к запуску invocation: только привязки с совпадающим селектором. */
export function runnableInvocations(
  catalog: DiscoveryV2,
  applicable: readonly DiscoveredTest[],
  selected: ReadonlySet<string>,
  bindings: readonly CaseAutotestBinding[],
  autotests: readonly Autotest[],
): { bindingId: string; key: StableKey }[] {
  const runnable = new Set(applicable.map(keyOf));
  const selectors = new Map(autotests.map((autotest) => [autotest.id, autotest.selector]));
  const result: { bindingId: string; key: StableKey }[] = [];
  for (const test of catalog.tests) {
    const key = { caseId: test.caseId, automationId: test.automationId, project: test.project, variantId: test.variantId };
    if (!selected.has(keyOf(key)) || !runnable.has(keyOf(key))) continue;
    const binding = bindings.find((item) => {
      const selector = selectors.get(item.autotestId);
      return item.enabled && item.caseId === key.caseId && selector?.automationId === key.automationId && selector.project === key.project && selector.variantId === key.variantId;
    });
    if (binding && !result.some((item) => item.bindingId === binding.id)) result.push({ bindingId: binding.id, key });
  }
  return result;
}
export function selectionFrom(tests: readonly StableKey[]): StableKey[] {
  return tests.map(({ caseId, automationId, project, variantId }) => ({ caseId, automationId, project, variantId }));
}
