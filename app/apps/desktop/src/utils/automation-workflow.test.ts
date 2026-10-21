import { describe, expect, it } from 'vitest';
import type { CatalogEntry, AutomationBinding } from '@/schemas/automation-store';
import type { ReferenceDoc } from '@/services/reference-book';
import { assignAutomationCase, automationEntryKey, buildAutomationTree, latestAutomationResults, planReferenceArguments } from './automation-workflow';

export const entry = (over: Partial<CatalogEntry> = {}): CatalogEntry => ({
  automationId: 'integers', caseId: null, variantId: null, project: 'chromium',
  title: 'Returns integers', titlePath: ['Returns integers'], file: 'tests/generators/integers.spec.ts',
  line: 12, tags: ['@tt:integers'], expectedStatus: 'passed', arguments: [], archived: false, revision: 'r1', ...over,
});
const binding = (over: Partial<AutomationBinding> = {}): AutomationBinding => ({
  id: 'b1', caseId: 'c1', automationId: 'integers', project: 'chromium', variantId: 'default',
  enabled: true, arguments: { count: { kind: 'literal', value: 0 } }, archived: false, ...over,
});
const doc = (over: Partial<ReferenceDoc['entry']> = {}): ReferenceDoc => ({
  id: 'stage', rel: '.ch/glossary/stage.md', revision: 'rev-stage', readonly: false, issues: [], extra: {}, eol: '\n',
  entry: { id: 'stage', kind: 'arguments', title: 'Stage', aliases: [], archived: false, description: '',
    values: [{ key: 'count', type: 'number', value: 0 }, { key: 'enabled', type: 'boolean', value: false }], ...over },
});

describe('project test tree', () => {
  it('retains folders and files and gives sibling projects distinct test identities', () => {
    const tree = buildAutomationTree([entry(), entry({ project: 'firefox' }), entry({ automationId: 'dice', file: 'tests\\games\\dice.spec.ts' })]);
    expect(tree[0]).toMatchObject({ kind: 'folder', name: 'tests' });
    expect(JSON.stringify(tree)).toContain('integers.spec.ts');
    expect(JSON.stringify(tree)).toContain('games');
    expect(automationEntryKey(entry())).not.toBe(automationEntryKey(entry({ project: 'firefox' })));
  });
});

describe('single Case assignment', () => {
  it('replaces legacy links only for this test identity, preserving arguments and other tests', () => {
    const other = binding({ id: 'other', automationId: 'dice' });
    const result = assignAutomationCase([binding(), binding({ id: 'legacy', caseId: 'c2' }), other], entry(), 'c3', 'new');
    expect(result.filter((b) => b.automationId === 'integers')).toHaveLength(1);
    expect(result.find((b) => b.automationId === 'integers')).toMatchObject({ caseId: 'c3', arguments: binding().arguments });
    expect(result).toContainEqual(other);
  });
  it('allows multiple different autotests to cover one Case and explicit unbinding', () => {
    const second = entry({ automationId: 'dice' });
    const result = assignAutomationCase([binding()], second, 'c1', 'b2');
    expect(result.map((b) => b.caseId)).toEqual(['c1', 'c1']);
    expect(assignAutomationCase(result, second, null, 'unused')).toEqual([binding()]);
  });
});

describe('Reference book argument sets', () => {
  it('derives types without copying values and preserves false and zero as reference values', () => {
    const plan = planReferenceArguments(entry(), doc());
    expect(plan.problems).toEqual([]);
    expect(plan.definitions).toEqual([{ key: 'count', type: 'number', required: true }, { key: 'enabled', type: 'boolean', required: true }]);
    expect(plan.values.count).toEqual({ kind: 'reference', entryId: 'stage', key: 'count', revision: 'rev-stage' });
    expect(plan.values.enabled.kind).toBe('reference');
  });
  it('rejects incompatible types, missing required values, and archived sets', () => {
    expect(planReferenceArguments(entry({ arguments: [{ key: 'count', type: 'url', required: true }] }), doc()).problems.length).toBeGreaterThan(0);
    expect(planReferenceArguments(entry({ arguments: [{ key: 'baseUrl', type: 'url', required: true }] }), doc()).problems.length).toBeGreaterThan(0);
    expect(planReferenceArguments(entry(), doc({ archived: true })).problems.length).toBeGreaterThan(0);
  });
});

describe('latest execution results', () => {
  it('orders imported and native reports by their recorded time rather than import hash', () => {
    const base = { automationId: 'integers', project: 'chromium', caseId: 'c1', caseRowIndex: 0, flaky: false, attempts: 1, duration: 20 };
    const latest = latestAutomationResults([
      { ...base, executionId: 'import:ffff', recordedAt: '2026-10-20T09:00:00Z', status: 'failed' },
      { ...base, executionId: '2026-10-20T12', recordedAt: '2026-10-20T12:00:00Z', status: 'passed' },
    ]);
    expect(latest[0].status).toBe('passed');
  });
  it('does not rerun a historical failure after the same project passed', () => {
    const base = { automationId: 'integers', caseId: 'c1', caseRowIndex: 0, flaky: false, attempts: 1, duration: 20 };
    const latest = latestAutomationResults([
      { ...base, project: 'chromium', executionId: '2026-10-20T10', status: 'failed' },
      { ...base, project: 'firefox', executionId: '2026-10-20T11', status: 'failed' },
      { ...base, project: 'chromium', executionId: '2026-10-20T12', status: 'passed' },
    ]);
    expect(latest.filter((r) => r.status === 'failed').map((r) => r.project)).toEqual(['firefox']);
  });
});
