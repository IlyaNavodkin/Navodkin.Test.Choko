import { describe, expect, it } from 'vitest';
import type { PlaywrightJsonReport, ResolvedAutomationArg } from '@/schemas/automation';
import { dependencyProjects, groupInvocations, mayRunInParallel, parallelismWarning, type InvocationItem } from './grouping';

const arg = (key: string, value: string | number | boolean): ResolvedAutomationArg => ({
  key,
  type: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string',
  value,
  source: 'autotest',
});

const item = (automationId: string, project: string, args: ResolvedAutomationArg[] = []): InvocationItem => ({
  target: { test: { automationId, title: automationId }, project, variantId: 'default' },
  args,
});

describe('groupInvocations', () => {
  it('groups identical args + project and keeps first-appearance order', () => {
    const groups = groupInvocations([
      item('a', 'chromium', [arg('env', 'dev')]),
      item('b', 'chromium', [arg('env', 'stage')]),
      item('c', 'chromium', [arg('env', 'dev')]),
    ]);
    expect(groups.map((g) => g.items.map((i) => i.target.test.automationId))).toEqual([['a', 'c'], ['b']]);
    expect(groups[0].project).toBe('chromium');
  });

  it('treats a different project as a separate invocation', () => {
    const groups = groupInvocations([item('a', 'chromium', [arg('env', 'dev')]), item('a', 'firefox', [arg('env', 'dev')])]);
    expect(groups).toHaveLength(2);
  });

  it('is order-insensitive inside the fingerprint but not across items', () => {
    const groups = groupInvocations([
      item('a', 'p', [arg('x', 1), arg('y', 2)]),
      item('b', 'p', [arg('y', 2), arg('x', 1)]),
    ]);
    expect(groups).toHaveLength(1);
  });

  it('keeps false and 0 distinct from a missing value', () => {
    const groups = groupInvocations([
      item('a', 'p', [arg('flag', false), arg('n', 0)]),
      item('b', 'p', [arg('flag', true), arg('n', 0)]),
    ]);
    expect(groups).toHaveLength(2);
  });
});

describe('parallelism helpers', () => {
  const report = (workers?: number): Pick<PlaywrightJsonReport, 'config'> => ({
    config: { projects: [{ name: 'chromium', workers }] },
  });

  it('reads the project workers setting', () => {
    expect(mayRunInParallel(report(1), 'chromium')).toBe(false);
    expect(mayRunInParallel(report(4), 'chromium')).toBe(true);
    expect(mayRunInParallel(report(undefined), 'chromium')).toBe(true);
    expect(mayRunInParallel(null, 'chromium')).toBe(true);
  });

  it('warns only for multi-test invocations that may run in parallel', () => {
    const groups = groupInvocations([item('a', 'chromium', [arg('e', 'dev')]), item('b', 'chromium', [arg('e', 'dev')])]);
    expect(parallelismWarning(report(4), groups)).toMatch(/may run them in parallel/);
    expect(parallelismWarning(report(1), groups)).toBeNull();
  });

  it('lists dependency projects', () => {
    const r = {
      config: { projects: [{ name: 'setup' }, { name: 'chromium', dependencies: ['setup'] }] },
    } as unknown as Pick<PlaywrightJsonReport, 'config'>;
    expect(dependencyProjects(r)).toEqual(['setup']);
    expect(dependencyProjects(null)).toEqual([]);
  });
});
