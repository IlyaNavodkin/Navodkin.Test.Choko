import { describe, expect, it } from 'vitest';
import type { PlaywrightJsonReport, PlaywrightTestResult } from '@/schemas/automation';
import {
  automationIdFromTags,
  automationTag,
  countSpecs,
  discoveredTests,
  discoveryIssues,
  parsePlaywrightReport,
  summarizeReport,
  summarizeResults,
  testKey,
} from './report';

/** A minimal one-test report with the identity annotations/tags the contract requires. */
function report(over: Partial<PlaywrightJsonReport> = {}): PlaywrightJsonReport {
  return {
    suites: [
      {
        title: 'login.spec.ts',
        file: 'tests/login.spec.ts',
        specs: [
          {
            title: 'login works',
            ok: true,
            tags: ['@tt:login'],
            annotations: [
              { type: 'testoritto.caseId', description: 'RND-0001' },
              { type: 'testoritto.automationId', description: 'login' },
              { type: 'testoritto.variantId', description: 'valid-user' },
            ],
            tests: [{ projectName: 'chromium', expectedStatus: 'passed', results: [{ status: 'passed', duration: 12 }] }],
            location: { file: 'tests/login.spec.ts', line: 5, column: 1 },
          },
        ],
      },
    ],
    ...over,
  } as unknown as PlaywrightJsonReport;
}

describe('parsePlaywrightReport', () => {
  it('parses a valid report and ignores unknown fields', () => {
    const raw = JSON.stringify({ suites: [], futureTopLevel: 1 });
    const res = parsePlaywrightReport(raw);
    expect(res.ok).toBe(true);
  });

  it('reports invalid JSON instead of throwing', () => {
    const res = parsePlaywrightReport('{ not json');
    expect(res).toEqual({ ok: false, error: expect.stringContaining('not valid JSON') });
  });

  it('reports a missing suites array', () => {
    const res = parsePlaywrightReport(JSON.stringify({ stats: {} }));
    expect(res).toEqual({ ok: false, error: expect.stringContaining('no "suites" array') });
  });

  it('rejects a report larger than the size guard', () => {
    const res = parsePlaywrightReport('x'.repeat(33 * 1024 * 1024));
    expect(res.ok).toBe(false);
  });
});

describe('discoveredTests', () => {
  it('reads identity from annotations and the project from the test', () => {
    const [t] = discoveredTests(report());
    expect(t.automationId).toBe('login');
    expect(t.caseId).toBe('RND-0001');
    expect(t.variantId).toBe('valid-user');
    expect(t.project).toBe('chromium');
    expect(t.file).toBe('tests/login.spec.ts');
    expect(t.line).toBe(5);
    expect(t.expectedStatus).toBe('passed');
    expect(countSpecs(report())).toBe(1);
    expect(testKey(t)).toBe('RND-0001::login::chromium::valid-user');
  });

  it('falls back to the @tt: tag when the automationId annotation is absent', () => {
    const text = JSON.stringify({
      suites: [{ title: 'f', specs: [{ title: 'x', tags: ['@tt:smoke'], tests: [{ projectName: 'p', results: [] }] }] }],
    });
    const parsed = parsePlaywrightReport(text);
    if (!parsed.ok) throw new Error(parsed.error);
    const [t] = discoveredTests(parsed.report);
    expect(t.automationId).toBe('smoke');
    expect(automationTag('smoke')).toBe('@tt:smoke');
    expect(automationIdFromTags(['@tt:a', '@tt:b'])).toBe('a');
  });

  it('accepts the report form without the leading @ (Playwright strips it)', () => {
    const parsed = parsePlaywrightReport(
      JSON.stringify({ suites: [{ title: 'f', specs: [{ title: 'x', tags: ['tt:smoke'], tests: [{ projectName: 'p', results: [] }] }] }] }),
    );
    if (!parsed.ok) throw new Error(parsed.error);
    expect(automationIdFromTags(['tt:smoke'])).toBe('smoke');
    expect(discoveredTests(parsed.report)[0].automationId).toBe('smoke');
  });

  it('drops the root file suite from the test-list title path', () => {
    const parsed = parsePlaywrightReport(
      JSON.stringify({
        suites: [
          {
            title: 'login.spec.ts',
            file: 'login.spec.ts',
            suites: [
              {
                title: 'auth',
                specs: [{ title: 'login works', tags: ['@tt:login'], tests: [{ projectName: 'chromium', results: [] }] }],
              },
            ],
          },
        ],
      }),
    );
    if (!parsed.ok) throw new Error(parsed.error);
    expect(discoveredTests(parsed.report)[0].titlePath).toEqual(['auth', 'login works']);
  });

  it('catalogues a test with neither annotation nor tag as unkeyed', () => {
    const parsed = parsePlaywrightReport(
      JSON.stringify({ suites: [{ title: 'f', specs: [{ title: 'x', tests: [{ results: [] }] }] }] }),
    );
    if (!parsed.ok) throw new Error(parsed.error);
    const tests = discoveredTests(parsed.report);
    expect(tests[0].automationId).toBeNull();
    expect(discoveryIssues(tests).unkeyed).toHaveLength(1);
  });
});

describe('discoveryIssues', () => {
  it('flags duplicate keys from one spec in two projects', () => {
    const parsed = parsePlaywrightReport(
      JSON.stringify({
        suites: [
          {
            title: 'f',
            specs: [
              {
                title: 'x',
                tags: ['@tt:login'],
                tests: [
                  { projectName: 'chromium', results: [] },
                  { projectName: 'chromium', results: [] },
                ],
              },
            ],
          },
        ],
      }),
    );
    if (!parsed.ok) throw new Error(parsed.error);
    const issues = discoveryIssues(discoveredTests(parsed.report));
    expect(issues.duplicates.map((d) => d.key)).toEqual([testKey({ caseId: null, automationId: 'login', project: 'chromium', variantId: null })]);
  });

  it('reports an empty catalog', () => {
    expect(discoveryIssues([]).empty).toBe(true);
  });
});

describe('summarizeResults / summarizeReport', () => {
  const results = (...statuses: PlaywrightTestResult['status'][]): PlaywrightTestResult[] =>
    statuses.map((status, i) => ({ status, duration: i + 1, retry: i }));

  it('marks a test that passed after a failure as flaky with every attempt', () => {
    const s = summarizeResults(results('failed', 'passed'));
    expect(s.status).toBe('passed');
    expect(s.flaky).toBe(true);
    expect(s.attempts).toBe(2);
    expect(s.duration).toBe(3);
  });

  it('does not mark a first-try pass as flaky', () => {
    expect(summarizeResults(results('passed')).flaky).toBe(false);
  });

  it('counts final statuses across the report', () => {
    const counts = summarizeReport({
      suites: [
        {
          title: 'f',
          specs: [
            { title: 'a', tests: [{ results: results('passed') }] },
            { title: 'b', tests: [{ results: results('failed', 'passed') }] },
            { title: 'c', tests: [{ results: results('skipped') }] },
          ],
        },
      ],
    } as unknown as PlaywrightJsonReport);
    expect(counts.passed).toBe(2);
    expect(counts.skipped).toBe(1);
  });
});
