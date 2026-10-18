import { describe, expect, it } from 'vitest';
import { applicableTests, keyOf, mergeBindings, mergeCatalog, selectionFrom } from '../src/automation/useCases/manage-automation/automationPlan';
import type { Catalog, StableKey } from '@testoritto/playwright-automation';

const test = (caseId: string, automationId: string, variantId = 'default') => ({ caseId, automationId, project: 'unit', variantId, title: automationId, file: 'case.spec.ts', expectedStatus: 'passed' as const });
const catalog = (executionId: string, tests: Catalog['tests']): Catalog => ({ schemaVersion: 1, executionId, profileId: 'local', profileRevision: 'a'.repeat(64), catalogRevision: 'b'.repeat(64), tests, dependencies: [] });

describe('automation plan', () => {
  it('объединяет постраничный каталог без дублей', () => {
    const merged = mergeCatalog(catalog('a0000000-0000-4000-8000-000000000001', [test('C1', 'A1')]), catalog('a0000000-0000-4000-8000-000000000001', [test('C2', 'A2'), test('C1', 'A1')]));
    expect(merged.tests.map((item) => item.automationId)).toEqual(['A1', 'A2']);
    expect(merged.catalogRevision).toBe('b'.repeat(64));
  });

  it('оставляет только тесты с кейсами выбранного прогона', () => {
    const result = applicableTests(catalog('a0000000-0000-4000-8000-000000000001', [test('C1', 'A1'), test('C2', 'A2')]), ['C2']);
    expect(result.map((item) => item.caseId)).toEqual(['C2']);
  });

  it('добавляет только недостающие привязки и сохраняет чужие профили', () => {
    const existing = [{ ...test('C2', 'A2'), profileId: 'other' }, { ...test('C1', 'A1'), profileId: 'local' }];
    const merged = mergeBindings(existing, [test('C1', 'A1'), test('C3', 'A3')], 'local');
    expect(merged).toHaveLength(3);
    expect(merged.filter((item) => item.profileId === 'local').map(keyOf)).toEqual([keyOf(test('C1', 'A1')), keyOf(test('C3', 'A3'))]);
  });

  it('формирует selection ровно из полей StableKey', () => {
    const source: StableKey = test('C1', 'A1', 'v2');
    expect(selectionFrom([{ ...source, title: 'ignored' } as StableKey])).toEqual([{ caseId: 'C1', automationId: 'A1', project: 'unit', variantId: 'v2' }]);
  });
});
