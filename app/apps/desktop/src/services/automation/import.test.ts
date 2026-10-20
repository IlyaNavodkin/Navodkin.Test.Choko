import { describe, expect, it } from 'vitest';
import type { Run, RunRow } from '@/types';
import { importedResults, isAlreadyImported, matchImport, parseJUnit, parsePlaywrightImport, previewImport } from './import';
import type { AutomationBinding } from '@/schemas/automation-store';

const row = (over: Partial<RunRow> = {}): RunRow => ({
  case_id: 'RND-0001',
  display_id: 'RND-0001',
  title: 'login works',
  result: 'not_run',
  tester: '',
  executed_at: '',
  notes: '',
  checks: {},
  failNotes: {},
  file: '.casewright/runs/r1/001-RND-0001.md',
  ...over,
});

const run = (rows: RunRow[] = [row()]): Run => ({
  id: '.casewright/runs/r1',
  name: 'r1',
  file: '.casewright/runs/r1',
  created: '2026-10-19',
  status: 'open',
  scope: '',
  rows,
  summary: '',
  notes: '',
  testerApproval: null,
  reviewerApproval: null,
});

const junit = (cases: string): string => `<testsuites><testsuite name="s">${cases}</testsuite></testsuites>`;

describe('project identity and explicit UI bindings', () => {
  const binding = (project: string, caseId: string): AutomationBinding => ({ id: project, caseId, automationId: 'login', project, variantId: 'default', enabled: true, archived: false, arguments: {} });
  const payload = JSON.stringify({ suites: [{ title: 'auth', file: 'auth/login.spec.ts', specs: [{ title: 'validates credentials', tags: ['@tt:login'], tests: [
    { projectName: 'chromium', results: [{ status: 'passed', duration: 10 }] },
    { projectName: 'firefox', results: [{ status: 'failed', duration: 20 }] },
  ] }] }] });
  it('preserves each project and matches the selected Case without matching titles or case annotations', () => {
    const preview = previewImport(payload, 'playwright-json', run([row(), row({ case_id: 'c2', display_id: 'CASE-2' })]), [binding('chromium', 'RND-0001'), binding('firefox', 'c2')]);
    expect(preview.ok).toBe(true);
    expect(preview.matched.map(({ test, rowIndex }) => [test.project, test.status, rowIndex])).toEqual([['chromium', 'passed', 0], ['firefox', 'failed', 1]]);
    expect(importedResults(preview, run(), 'external').map((r) => r.project)).toEqual(['chromium', 'firefox']);
  });
  it('does not guess a Case for a project-less report with ambiguous bindings', () => {
    const preview = previewImport(junit('<testcase name="validates credentials @tt:login" />'), 'junit', run([row(), row({ case_id: 'c2' })]), [binding('chromium', 'RND-0001'), binding('firefox', 'c2')]);
    expect(preview.ok).toBe(false);
    expect(preview.unmatched).toHaveLength(1);
  });
});

describe('parseJUnit', () => {
  it('reads passed, failed and skipped testcases without executing anything', () => {
    const res = parseJUnit(
      junit(
        '<testcase classname="auth" name="login @tt:login" time="1.5" />' +
          '<testcase classname="auth" name="logout @tt:logout" time="2"><failure message="no"/></testcase>' +
          '<testcase classname="auth" name="signup" time="0.1"><skipped/></testcase>',
      ),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.tests.map((t) => [t.automationId, t.status, t.duration])).toEqual([
      ['login', 'passed', 1500],
      ['logout', 'failed', 2000],
      [null, 'skipped', 100],
    ]);
  });

  it('refuses a DTD or entity declarations (fail-closed, no XXE surface)', () => {
    expect(parseJUnit('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><testsuites/>')).toMatchObject({ ok: false });
    expect(parseJUnit('<!DOCTYPE testsuites><testsuites/>')).toMatchObject({ ok: false });
  });

  it('rejects a payload that is not JUnit or has no cases', () => {
    expect(parseJUnit('<html><body>nope</body></html>')).toMatchObject({ ok: false });
    expect(parseJUnit(junit(''))).toMatchObject({ ok: false });
  });
});

describe('parsePlaywrightImport', () => {
  it('reads tests, tags and flaky attempts from a JSON report', () => {
    const res = parsePlaywrightImport(
      JSON.stringify({
        suites: [
          {
            title: 'login.spec.ts',
            file: 'tests/login.spec.ts',
            specs: [
              {
                title: 'login works',
                tags: ['@tt:login'],
                tests: [{ projectName: 'chromium', results: [{ status: 'failed', duration: 5 }, { status: 'passed', duration: 6 }] }],
              },
            ],
          },
        ],
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.tests[0]).toMatchObject({ automationId: 'login', status: 'passed', flaky: true, attempts: 2, duration: 11 });
  });

  it('rejects corrupt JSON', () => {
    expect(parsePlaywrightImport('{ nope')).toMatchObject({ ok: false });
  });
});

describe('previewImport / matchImport', () => {
  it('matches by caseId, then file, then title', () => {
    const preview = previewImport(
      junit(
        '<testcase classname="auth" name="login works" time="1" />' +
          '<testcase classname="auth" name="other" file="001-RND-0001.md" time="1" />' +
          '<testcase classname="auth" name="unknown" time="1" />',
      ),
      'junit',
      run([row()]),
    );
    expect(preview.matched).toHaveLength(2);
    expect(preview.unmatched.map((t) => t.title)).toEqual(['auth › unknown']);
    expect(preview.importId).toMatch(/^[0-9a-f]{64}$/);
  });

  it('treats a foreign report as not importable and applies nothing', () => {
    const preview = previewImport(junit('<testcase classname="x" name="foreign" time="1" />'), 'junit', run());
    expect(preview.ok).toBe(false);
    expect(preview.problems[0]).toMatch(/No test in this report matches/);
    expect(importedResults(preview, run(), 'e1')).toEqual([]);
  });

  it('flags duplicates but still shows the mapping', () => {
    const preview = previewImport(junit('<testcase classname="auth" name="login works" time="1" /><testcase classname="auth" name="login works" time="2" />'), 'junit', run());
    expect(preview.duplicates).toHaveLength(1);
    expect(preview.problems.some((p) => /more than once/.test(p))).toBe(true);
  });

  it('is idempotent: the same payload has the same importId', () => {
    const payload = junit('<testcase classname="auth" name="login works" time="1" />');
    expect(previewImport(payload, 'junit', run()).importId).toBe(previewImport(payload, 'junit', run()).importId);
  });
});

describe('importedResults / isAlreadyImported', () => {
  it('maps a matched test onto its row for the apply path', () => {
    const payload = junit('<testcase classname="auth" name="login works" time="1.5" />');
    const preview = previewImport(payload, 'junit', run());
    const results = importedResults(preview, run(), 'exec-1');
    expect(results).toEqual([
      expect.objectContaining({ executionId: 'exec-1', caseRowIndex: 0, status: 'passed', duration: 1500, attempts: 1 }),
    ]);
  });

  it('detects an already-imported payload by its id', async () => {
    const payload = junit('<testcase classname="auth" name="login works" time="1" />');
    const preview = previewImport(payload, 'junit', run());
    const file = JSON.stringify({ importId: preview.importId });
    expect(await isAlreadyImported(async () => file, 'x', preview)).toBe(true);
    expect(await isAlreadyImported(async () => JSON.stringify({ importId: 'other' }), 'x', preview)).toBe(false);
    expect(await isAlreadyImported(async () => null, 'x', preview)).toBe(false);
  });
});
