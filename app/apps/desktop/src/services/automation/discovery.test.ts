import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DiscoverySpec } from './discovery';
import { buildDiscoveryInvocation, discoverTests, type CliRunner } from './discovery';
import { AutomationRuntimeError } from './runtime';

const spec = (): DiscoverySpec => ({
  repoPath: 'C:\\repo',
  node: { command: 'C:\\nodejs\\node.exe', version: 'v22.23.1' },
  playwright: { cliPath: 'C:\\repo\\node_modules\\@playwright\\test\\cli.js', version: '1.44.1' },
});

/** A `--list`-style report: identity in annotations/tags, no results yet. */
const listReport = (over: { tags?: string[]; tests?: unknown[] } = {}): string =>
  JSON.stringify({
    suites: [
      {
        title: 'login.spec.ts',
        file: 'tests/login.spec.ts',
        specs: [
          {
            title: 'login works',
            tags: over.tags ?? ['@tt:login'],
            annotations: [
              { type: 'testoritto.caseId', description: 'RND-0001' },
              { type: 'testoritto.automationId', description: 'login' },
            ],
            tests: over.tests ?? [{ projectName: 'chromium', results: [] }],
          },
        ],
      },
    ],
  });

const runner =
  (out: Partial<{ exitCode: number | null; stdout: string; stderr: string }>): CliRunner =>
  async () => ({ exitCode: 0, stdout: '', stderr: '', ...out });

describe('buildDiscoveryInvocation', () => {
  it('lists from the autotest project with the json reporter on stdout (no output-name override)', () => {
    const inv = buildDiscoveryInvocation(spec());
    expect(inv.command).toBe('C:\\nodejs\\node.exe');
    expect(inv.args).toEqual([spec().playwright.cliPath, 'test', '--list', '--reporter=json']);
    expect(inv.options.shell).toBe(false);
    expect(inv.options.cwd).toBe(join('C:\\repo', '.ch', 'autotests'));
    expect((inv.options.env as Record<string, string>).PLAYWRIGHT_JSON_OUTPUT_NAME).toBeUndefined();
  });
});

describe('discoverTests', () => {
  it('returns a catalog when discovery succeeds', async () => {
    const res = await discoverTests(spec(), runner({ stdout: listReport() }));
    expect(res.ok).toBe(true);
    expect(res.tests.map((t) => t.automationId)).toEqual(['login']);
    expect(res.problems).toEqual([]);
  });

  it('flags tests with no identity', async () => {
    const res = await discoverTests(
      spec(),
      runner({
        stdout: JSON.stringify({ suites: [{ title: 'f', specs: [{ title: 'x', tests: [{ results: [] }] }] }] }),
      }),
    );
    expect(res.ok).toBe(true);
    expect(res.problems.map((p) => p.code)).toContain('no-tests');
    expect(res.issues.unkeyed).toHaveLength(1);
  });

  it('flags duplicate keys', async () => {
    const res = await discoverTests(
      spec(),
      runner({ stdout: listReport({ tests: [{ projectName: 'chromium', results: [] }, { projectName: 'chromium', results: [] }] }) }),
    );
    expect(res.issues.duplicates).toHaveLength(1);
    expect(res.problems.some((p) => /duplicated/.test(p.message))).toBe(true);
  });

  it('reports an empty catalog', async () => {
    const res = await discoverTests(spec(), runner({ stdout: JSON.stringify({ suites: [] }) }));
    expect(res.ok).toBe(true);
    expect(res.problems.map((p) => p.code)).toEqual(['no-tests']);
  });

  it('diagnoses an unparseable report with the stderr tail', async () => {
    const res = await discoverTests(spec(), runner({ exitCode: 1, stdout: 'garbage', stderr: 'Error: config not found' }));
    expect(res.ok).toBe(false);
    expect(res.problems[0]).toMatchObject({ code: 'bad-report' });
    expect(res.problems[0].message).toContain('config not found');
  });

  it('surfaces a missing Node as a clear problem', async () => {
    const res = await discoverTests(spec(), async () => {
      throw new AutomationRuntimeError('no-node', 'External Node.js 22+ was not found on PATH.');
    });
    expect(res.ok).toBe(false);
    expect(res.problems[0].code).toBe('no-node');
  });
});
