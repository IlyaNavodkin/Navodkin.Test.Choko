import { describe, expect, it } from 'vitest';
import type { DiscoveredTest } from '@/schemas/automation';
import { byProject, planSelection, selectionArgs, selectionKeys, testListLine } from './selection';

const test = (over: Partial<DiscoveredTest> = {}): DiscoveredTest => ({
  automationId: 'login',
  caseId: 'RND-0001',
  variantId: null,
  title: 'login works',
  titlePath: ['login.spec.ts', 'auth', 'login works'],
  project: 'chromium',
  file: 'tests/login.spec.ts',
  line: 12,
  expectedStatus: 'passed',
  tags: ['@tt:login'],
  ...over,
});

describe('testListLine', () => {
  it('renders the fully-qualified [project] › file:line › suites › title form', () => {
    expect(testListLine(test(), 'chromium')).toBe('[chromium] › tests/login.spec.ts:12 › login.spec.ts › auth › login works');
  });
});

describe('planSelection', () => {
  it('uses --test-list on Playwright 1.60+', () => {
    const plan = planSelection([{ test: test(), project: 'chromium', variantId: 'default' }], { version: '1.60.0' });
    expect(plan.ok).toBe(true);
    expect(plan.args).toEqual(['--project', 'chromium', '--test-list', '<test-list>']);
    expect(plan.testList?.content).toContain('[chromium] › tests/login.spec.ts:12');
    expect(selectionArgs(plan, 'C:\\tmp\\list.txt')).toEqual(['--project', 'chromium', '--test-list', 'C:\\tmp\\list.txt']);
  });

  it('falls back to an anchored --grep on the tag before 1.60', () => {
    const plan = planSelection([{ test: test(), project: 'chromium', variantId: 'default' }], { version: '1.44.1' }, [test()]);
    expect(plan.ok).toBe(true);
    expect(plan.args).toEqual(['--project', 'chromium', '--grep', '^@tt:login$']);
    expect(plan.testList).toBeUndefined();
  });

  it('joins several tags into one alternation grep (still scoped to the project)', () => {
    const logout = test({ automationId: 'logout', tags: ['@tt:logout'] });
    const plan = planSelection(
      [
        { test: test(), project: 'chromium', variantId: 'default' },
        { test: logout, project: 'chromium', variantId: 'default' },
      ],
      { version: '1.44.1' },
      [test(), logout],
    );
    expect(plan.args).toEqual(['--project', 'chromium', '--grep', '@tt:login|@tt:logout']);
  });

  it('blocks the grep path when the tag also matches an unselected sibling variant', () => {
    const sibling = test({ variantId: 'other', title: 'login works (other)' });
    const plan = planSelection([{ test: test(), project: 'chromium', variantId: 'default' }], { version: '1.44.1' }, [test(), sibling]);
    expect(plan.ok).toBe(false);
    expect(plan.problems[0]).toMatch(/Upgrade Playwright to 1.60\+/);
  });

  it('blocks the grep path when exclusivity cannot be proven', () => {
    const plan = planSelection([{ test: test(), project: 'chromium', variantId: 'default' }], { version: '1.44.1' });
    expect(plan.ok).toBe(false);
    expect(plan.problems[0]).toMatch(/Cannot prove the tag is exclusive/);
  });

  it('does not let a test-list selection be blocked by siblings', () => {
    const sibling = test({ variantId: 'other' });
    const plan = planSelection([{ test: test(), project: 'chromium', variantId: 'default' }], { version: '1.60.0' }, [test(), sibling]);
    expect(plan.ok).toBe(true);
  });

  it('blocks a test with no automationId instead of guessing by title', () => {
    const plan = planSelection([{ test: test({ automationId: null }), project: 'chromium', variantId: 'default' }], { version: '1.60.0' });
    expect(plan.ok).toBe(false);
    expect(plan.problems[0]).toMatch(/no automationId/);
  });

  it('blocks an ambiguous selection (same tag twice)', () => {
    const plan = planSelection(
      [
        { test: test(), project: 'chromium', variantId: 'default' },
        { test: test(), project: 'chromium', variantId: 'default' },
      ],
      { version: '1.60.0' },
    );
    expect(plan.ok).toBe(false);
    expect(plan.problems[0]).toMatch(/ambiguous/);
  });

  it('blocks a selection spanning several projects', () => {
    const plan = planSelection(
      [
        { test: test(), project: 'chromium', variantId: 'default' },
        { test: test({ automationId: 'signup' }), project: 'firefox', variantId: 'default' },
      ],
      { version: '1.60.0' },
    );
    expect(plan.ok).toBe(false);
    expect(plan.problems[0]).toMatch(/one project/);
  });

  it('never forces workers=1 or reorders the project’s own parallelism', () => {
    for (const version of ['1.44.1', '1.60.0']) {
      const plan = planSelection([{ test: test(), project: 'chromium', variantId: 'default' }], { version }, [test()]);
      expect(plan.args.some((a) => /^--workers/.test(a))).toBe(false);
      expect(plan.args.some((a) => /^--fully-parallel/.test(a))).toBe(false);
    }
  });

  it('accepts an empty selection', () => {
    expect(planSelection([], { version: '1.60.0' })).toEqual({ ok: true, args: [], problems: [] });
  });

  it('omits --project for the default (unnamed) project', () => {
    const plan = planSelection([{ test: test({ project: '' }), project: '', variantId: 'default' }], { version: '1.60.0' }, [test({ project: '' })]);
    expect(plan.ok).toBe(true);
    expect(plan.args).toEqual(['--test-list', '<test-list>']);
    expect(plan.testList?.content.startsWith('tests/login.spec.ts:12')).toBe(true);
  });
});

describe('byProject / selectionKeys', () => {
  it('groups in caller order and derives correlation keys', () => {
    const a = { test: test(), project: 'chromium', variantId: 'default' };
    const b = { test: test({ automationId: 'signup' }), project: 'firefox', variantId: 'v2' };
    const grouped = byProject([a, b, a]);
    expect([...grouped.keys()]).toEqual(['chromium', 'firefox']);
    expect(grouped.get('chromium')).toHaveLength(2);
    expect(selectionKeys([a, b])).toEqual(['RND-0001::login::chromium::default', 'RND-0001::signup::firefox::v2']);
  });
});
