import { describe, expect, it } from 'vitest';
import type { AutomationBinding, CatalogEntry } from '@/schemas/automation-store';
import type { ResolvedAutomationArg } from '@/schemas/automation';
import { planRunAutomation, resultsForRow, type RunAutomationCandidate } from './run-plan';

const arg = (key: string, value: string | number | boolean): ResolvedAutomationArg => ({
  key,
  type: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string',
  value,
  source: 'binding',
});

const entry = (over: Partial<CatalogEntry> = {}): CatalogEntry => ({
  automationId: 'login',
  caseId: 'RND-0001',
  variantId: null,
  project: 'chromium',
  title: 'login works',
  titlePath: ['login.spec.ts', 'login works'],
  file: 'tests/login.spec.ts',
  line: 3,
  tags: ['@tt:login'],
  expectedStatus: 'passed',
  arguments: [],
  archived: false,
  revision: 'r1',
  ...over,
});

const binding = (over: Partial<AutomationBinding> = {}): AutomationBinding => ({
  id: 'b1',
  caseId: 'RND-0001',
  automationId: 'login',
  project: 'chromium',
  variantId: 'default',
  enabled: true,
  arguments: {},
  archived: false,
  ...over,
});

const candidate = (over: Partial<Omit<RunAutomationCandidate, 'binding' | 'entry'>> & { entry?: Partial<CatalogEntry>; binding?: Partial<AutomationBinding> } = {}): RunAutomationCandidate => {
  const b = binding(over.binding);
  const e = entry({ ...over.entry, automationId: b.automationId, caseId: b.caseId });
  return {
    binding: b,
    entry: e,
    args: over.args ?? [],
    selection: over.selection ?? {
      automationId: e.automationId,
      caseId: e.caseId,
      variantId: e.variantId,
      title: e.title,
      titlePath: e.titlePath,
      project: e.project,
      file: e.file,
      line: e.line,
      tags: e.tags,
    },
  };
};

describe('planRunAutomation', () => {
  it('groups by project + resolved args and keeps order', () => {
    const plan = planRunAutomation(
      [
        candidate({ args: [arg('env', 'dev')] }),
        candidate({ binding: { id: 'b2', automationId: 'logout' }, entry: { automationId: 'logout' }, args: [arg('env', 'stage')] }),
        candidate({ binding: { id: 'b3', automationId: 'reset' }, entry: { automationId: 'reset' }, args: [arg('env', 'dev')] }),
      ],
      ['RND-0001'],
    );
    expect(plan.ok).toBe(true);
    expect(plan.groups.map((g) => g.candidates.map((c) => c.binding.automationId))).toEqual([['login', 'reset'], ['logout']]);
  });

  it('skips bindings whose case is not in the run', () => {
    const plan = planRunAutomation([candidate({ binding: { caseId: 'OTHER' } })], ['RND-0001']);
    expect(plan.groups).toEqual([]);
    expect(plan.skipped).toEqual(['b1']);
  });

  it('ignores disabled bindings', () => {
    expect(planRunAutomation([candidate({ binding: { enabled: false } })], ['RND-0001']).groups).toEqual([]);
  });

  it('blocks archived entries', () => {
    const plan = planRunAutomation([candidate({ entry: { archived: true } })], ['RND-0001']);
    expect(plan.ok).toBe(false);
    expect(plan.problems[0]).toMatch(/archived/);
  });

  it('blocks duplicate enabled bindings for the same identity', () => {
    const plan = planRunAutomation(
      [candidate(), candidate({ binding: { id: 'b2' } })],
      ['RND-0001'],
    );
    expect(plan.ok).toBe(false);
    expect(plan.problems[0]).toMatch(/same test/);
  });

  it('separates groups by project', () => {
    const plan = planRunAutomation(
      [candidate(), candidate({ binding: { id: 'b2', project: 'firefox' }, entry: { project: 'firefox' } })],
      ['RND-0001'],
    );
    expect(plan.groups).toHaveLength(2);
  });
});

describe('resultsForRow', () => {
  it('selects only results mapped to the row', () => {
    const results = [
      { executionId: 'e1', automationId: 'a', project: 'p', caseId: 'c', caseRowIndex: 0, status: 'passed' as const, flaky: false, attempts: 1, duration: 1 },
      { executionId: 'e1', automationId: 'b', project: 'p', caseId: 'c', caseRowIndex: 1, status: 'failed' as const, flaky: false, attempts: 1, duration: 1 },
    ];
    expect(resultsForRow(results, 0).map((r) => r.automationId)).toEqual(['a']);
  });
});
