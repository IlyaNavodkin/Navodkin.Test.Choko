import { describe, expect, it } from 'vitest';
import { applicableTests, autotestFor, bindingFor, boundKeys, keyOf, mergeCatalog, runnableInvocations, selectionFrom } from '../src/automation/useCases/manage-automation/automationPlan';
import type { DiscoveryV2, StableKey } from '@testoritto/playwright-automation';

const test = (caseId: string, automationId: string, variantId = 'default') => ({ caseId, automationId, project: 'unit', variantId, title: automationId, file: 'case.spec.ts', expectedStatus: 'passed' as const });
const catalog = (executionId: string, tests: DiscoveryV2['tests']): DiscoveryV2 => ({ schemaVersion: 2, executionId, profileId: 'local', profileRevision: 'a'.repeat(64), catalogRevision: 'b'.repeat(64), tests, dependencies: [] });
const autotest = (id: string, automationId: string, variantId = 'default') => ({ schemaVersion: 2 as const, id, title: automationId, description: '', archived: false, revision: 'rev-1', profileId: 'local', selector: { automationId, project: 'unit', variantId }, argumentDefinitions: [], defaults: {} });
const binding = (id: string, caseId: string, autotestId: string, enabled = true) => ({ schemaVersion: 2 as const, id, caseId, autotestId, revision: 'rev-1', enabled, argumentOverrides: {} });

describe('automation plan', () => {
  it('объединяет постраничный v2-каталог без дублей', () => {
    const merged = mergeCatalog(catalog('a0000000-0000-4000-8000-000000000001', [test('C1', 'A1')]), catalog('a0000000-0000-4000-8000-000000000001', [test('C2', 'A2'), test('C1', 'A1')]));
    expect(merged.tests.map((item) => item.automationId)).toEqual(['A1', 'A2']);
    expect(merged.catalogRevision).toBe('b'.repeat(64));
    expect(merged.schemaVersion).toBe(2);
  });

  it('оставляет только тесты с кейсами выбранного прогона', () => {
    const result = applicableTests(catalog('a0000000-0000-4000-8000-000000000001', [test('C1', 'A1'), test('C2', 'A2')]), ['C2']);
    expect(result.map((item) => item.caseId)).toEqual(['C2']);
  });

  it('считает связанными только ключи с существующим автотестом и привязкой', () => {
    const bound = boundKeys([binding('b1', 'C1', 'at1'), binding('b2', 'C2', 'missing')], [autotest('at1', 'A1')]);
    expect([...bound]).toEqual([keyOf(test('C1', 'A1'))]);
  });

  it('создаёт v2-автотест и привязку из обнаруженного теста', () => {
    const row = test('C1', 'A1');
    const created = autotestFor(row, 'local', 'at1', 'rev-1');
    expect(created.selector).toEqual({ automationId: 'A1', project: 'unit', variantId: 'default' });
    expect(created.argumentDefinitions).toEqual([]);
    const link = bindingFor(row, created.id, 'b1', 'rev-1');
    expect(link).toMatchObject({ caseId: 'C1', autotestId: 'at1', enabled: true, argumentOverrides: {} });
  });

  it('отбирает invocation по выбранным ключам и включённым привязкам', () => {
    const source = catalog('a0000000-0000-4000-8000-000000000001', [test('C1', 'A1'), test('C2', 'A2'), test('C3', 'A3')]);
    const selected = new Set([keyOf(test('C1', 'A1')), keyOf(test('C2', 'A2')), keyOf(test('C3', 'A3'))]);
    const invocations = runnableInvocations(source, [test('C1', 'A1'), test('C2', 'A2')], selected, [binding('b1', 'C1', 'at1'), binding('b2', 'C2', 'at2', false), binding('b3', 'C3', 'at3')], [autotest('at1', 'A1'), autotest('at2', 'A2'), autotest('at3', 'A3')]);
    expect(invocations.map((item) => item.bindingId)).toEqual(['b1']);
    expect(invocations[0]?.key.caseId).toBe('C1');
  });

  it('формирует selection ровно из полей StableKey', () => {
    const source: StableKey = test('C1', 'A1', 'v2');
    expect(selectionFrom([{ ...source, title: 'ignored' } as StableKey])).toEqual([{ caseId: 'C1', automationId: 'A1', project: 'unit', variantId: 'v2' }]);
  });
});
