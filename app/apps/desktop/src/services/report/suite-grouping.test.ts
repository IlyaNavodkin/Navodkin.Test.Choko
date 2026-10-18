import { describe, expect, it } from 'vitest';
import type { Case, Run, RunRow, TreeNode } from '@/types';
import { groupRunBySuite } from './suite-grouping';

const mkCase = (id: string, suite: string): Case => ({
  id,
  displayId: id.toUpperCase(),
  title: id,
  status: 'active',
  tags: [],
  suite,
  objective: '',
  systems: [],
  setup: [],
  steps: [],
  expected: [],
  modified: false,
});

const mkRow = (case_id: string, result: RunRow['result']): RunRow => ({
  case_id,
  display_id: case_id.toUpperCase(),
  title: case_id,
  result,
  tester: '',
  executed_at: '',
  notes: '',
  checks: {},
  failNotes: {},
  file: `.casewright/runs/r1/${case_id}.md`,
});

const tree: TreeNode[] = [
  { type: 'suite', id: 's1', name: 'Authentication', path: 'Authentication', children: [] },
  { type: 'suite', id: 's2', name: 'Billing', path: 'Billing', children: [] },
];

const cases = [mkCase('c1', 's1'), mkCase('c2', 's1'), mkCase('c3', 's2')];

const baseRun: Run = {
  id: '.casewright/runs/r1',
  name: 'r1',
  file: '.casewright/runs/r1',
  created: '2026-06-10',
  status: 'open',
  scope: 'repo',
  rows: [],
  summary: '',
  notes: '',
  testerApproval: null,
  reviewerApproval: null,
};

describe('groupRunBySuite', () => {
  it('buckets rows by the live case suite name and tallies results', () => {
    const run: Run = {
      ...baseRun,
      rows: [mkRow('c1', 'pass'), mkRow('c2', 'fail'), mkRow('c3', 'blocked')],
    };
    const rows = groupRunBySuite(run, cases, tree);
    expect(rows.map((r) => r.name)).toEqual(['Authentication', 'Billing']);
    const auth = rows.find((r) => r.name === 'Authentication')!;
    expect(auth.total).toBe(2);
    expect(auth.counts).toMatchObject({ pass: 1, fail: 1, blocked: 0, skipped: 0, not_run: 0 });
    // every case that ran under the suite is listed, in run order, with its result
    expect(auth.cases.map((c) => c.display_id)).toEqual(['C1', 'C2']);
    expect(auth.cases.map((c) => c.result)).toEqual(['pass', 'fail']);
    const billing = rows.find((r) => r.name === 'Billing')!;
    expect(billing.total).toBe(1);
    expect(billing.counts).toMatchObject({ blocked: 1, pass: 0, fail: 0 });
    expect(billing.cases.map((c) => c.display_id)).toEqual(['C3']);
  });

  it('tracks each result distinctly (skipped vs not_run) for the suite distribution bar', () => {
    const run: Run = {
      ...baseRun,
      rows: [mkRow('c1', 'pass'), mkRow('c2', 'not_run'), mkRow('c3', 'skipped')],
    };
    const rows = groupRunBySuite(run, cases, tree);
    const auth = rows.find((r) => r.name === 'Authentication')!;
    expect(auth.counts).toMatchObject({ pass: 1, not_run: 1, skipped: 0 });
    const billing = rows.find((r) => r.name === 'Billing')!;
    expect(billing.counts).toMatchObject({ skipped: 1, not_run: 0 });
  });

  it('groups rows for deleted cases under "Unknown / Deleted", listed last', () => {
    const run: Run = {
      ...baseRun,
      rows: [mkRow('c1', 'pass'), mkRow('gone-1', 'fail'), mkRow('gone-2', 'not_run')],
    };
    const rows = groupRunBySuite(run, cases, tree);
    expect(rows.map((r) => r.name)).toEqual(['Authentication', 'Unknown / Deleted']);
    const unknown = rows[rows.length - 1];
    expect(unknown.name).toBe('Unknown / Deleted');
    expect(unknown.total).toBe(2);
    expect(unknown.counts).toMatchObject({ fail: 1, not_run: 1 });
    expect(unknown.cases.map((c) => c.display_id)).toEqual(['GONE-1', 'GONE-2']);
  });

  it('keeps suites that share a display name separate (buckets by id, not name)', () => {
    // Two distinct suite ids resolving to the same name — e.g. duplicate folder names
    // across workspaces. They must not merge into one bucket.
    const dupTree: TreeNode[] = [
      { type: 'suite', id: 's1', name: 'Billing', path: 'a/Billing', children: [] },
      { type: 'suite', id: 's2', name: 'Billing', path: 'b/Billing', children: [] },
    ];
    const run: Run = { ...baseRun, rows: [mkRow('c1', 'pass'), mkRow('c3', 'fail')] }; // c1→s1, c3→s2
    const rows = groupRunBySuite(run, cases, dupTree);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.name)).toEqual(['Billing', 'Billing']);
    expect(rows[0].counts).toMatchObject({ pass: 1, fail: 0 });
    expect(rows[1].counts).toMatchObject({ pass: 0, fail: 1 });
  });

  it('falls back to the raw suite id when the tree has no matching node', () => {
    const run: Run = { ...baseRun, rows: [mkRow('c1', 'pass')] };
    const rows = groupRunBySuite(run, cases, []);
    expect(rows[0].name).toBe('s1');
  });

  it('returns an empty array for a run with no rows', () => {
    expect(groupRunBySuite(baseRun, cases, tree)).toEqual([]);
  });
});
