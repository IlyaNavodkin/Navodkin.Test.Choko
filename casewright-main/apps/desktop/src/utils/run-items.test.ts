import { describe, expect, it } from 'vitest';
import type { Case, Run, RunRow } from '@/types';
import { buildDefectText, buildRunSummary, deriveItems, serializeRunSummary } from './run-items';

const kase: Case = {
  id: 'c1',
  displayId: 'PAY-0042',
  title: 'Reset password',
  status: 'active',
  tags: [],
  suite: 's1',
  objective: 'Verify the self-service reset flow.',
  systems: ['Auth service'],
  setup: [{ name: 'Test account', body: 'A verified user with a known password.' }],
  steps: [
    { text: 'Open login', depth: 0 },
    { text: 'Click forgot password', depth: 0 },
  ],
  expected: ['Email arrives'],
  modified: false,
};

const baseRow: RunRow = {
  case_id: 'c1',
  display_id: 'PAY-0042',
  title: 'Reset password',
  result: 'fail',
  tester: 'amartin',
  executed_at: '2026-06-09 14:19',
  notes: 'see below',
  checks: { 'setup:0': 'pass', 'step:0': 'pass', 'step:1': 'fail', 'accept:0': 'fail' },
  failNotes: { 'step:1': 'button 500s', 'accept:0': 'never arrived' },
  itemText: {},
  file: '.casewright/runs/r1/001-PAY-0042-reset-password.md',
};

const run: Run = {
  id: '.casewright/runs/r1',
  name: 'Sprint 13',
  file: '.casewright/runs/r1',
  created: '2026-06-09',
  status: 'open',
  scope: 'repo',
  rows: [baseRow],
  summary: '',
  notes: '',
  testerApproval: null,
  reviewerApproval: null,
};

describe('deriveItems', () => {
  it('produces stable positional keys', () => {
    const d = deriveItems(kase);
    expect(d.setup.map((i) => i.key)).toEqual(['setup:0']);
    expect(d.steps.map((i) => i.key)).toEqual(['step:0', 'step:1']);
    expect(d.accept.map((i) => i.key)).toEqual(['accept:0']);
    expect(d.steps[1].num).toBe('2');
  });

  it('derives setup from the case setup items (name + body), not the systems list', () => {
    const d = deriveItems(kase);
    expect(d.setup).toEqual([{ key: 'setup:0', text: 'Test account', body: 'A verified user with a known password.' }]);
  });

  it('returns empty groups for a missing case', () => {
    expect(deriveItems(undefined)).toEqual({ setup: [], steps: [], accept: [] });
  });
});

describe('buildDefectText', () => {
  it('shows the steps leading up to the failure and drops the run folder path', () => {
    const text = buildDefectText(run, baseRow, kase);
    expect(text).toContain('# PAY-0042 — Reset password');
    expect(text).toContain('**Objective:** Verify the self-service reset flow.');
    expect(text).toContain('**Run:** Sprint 13');
    expect(text).not.toContain('.casewright/runs/r1'); // run folder path removed
    expect(text).toContain('## Steps to reproduce');
    expect(text).toContain('1. Open login'); // the lead-up (passing) step is now included
    expect(text).toContain('2. Click forgot password  ✗ button 500s');
    expect(text).toContain('## Failed acceptance criteria');
    expect(text).toContain('- Email arrives — never arrived');
  });

  it('indents nested steps to their depth in the reproduction list', () => {
    const nested: Case = {
      ...kase,
      steps: [
        { text: 'Open login', depth: 0 },
        { text: 'Expand advanced', depth: 0 },
        { text: 'Toggle the secret flag', depth: 1 },
      ],
    };
    const row: RunRow = { ...baseRow, checks: { 'step:2': 'fail' }, failNotes: { 'step:2': 'flag ignored' }, notes: '' };
    const text = buildDefectText(run, row, nested);
    expect(text).toContain('1. Open login');
    expect(text).toContain('2. Expand advanced');
    expect(text).toContain('  2.1. Toggle the secret flag  ✗ flag ignored'); // depth-1 → 2-space indent + outline number
  });

  it('falls back to snapshot text when the live case is gone', () => {
    const row: RunRow = { ...baseRow, itemText: { 'step:1': 'Click forgot password' } };
    const text = buildDefectText(run, row, undefined);
    expect(text).toContain('- Click forgot password — button 500s');
  });

  it('resolves {{today}} in case-derived text against the test date, leaving tester text raw', () => {
    const tokenCase: Case = {
      ...kase,
      objective: 'Reset before {{today+7}}.',
      steps: [
        { text: 'Open login', depth: 0 },
        { text: 'Submit by {{today+7}}', depth: 0 },
      ],
      expected: ['Email by {{today+1}}'],
    };
    const row: RunRow = {
      ...baseRow,
      title: 'Reset {{today}}',
      checks: { 'step:1': 'fail', 'accept:0': 'fail' },
      failNotes: { 'step:1': 'still {{today}} raw', 'accept:0': 'never arrived' },
      notes: 'note {{today}} kept',
    };
    const text = buildDefectText({ ...run, testDate: '2026-06-10' }, row, tokenCase);
    expect(text).toContain('# PAY-0042 — Reset 2026-06-10');
    expect(text).toContain('**Objective:** Reset before 2026-06-17.');
    expect(text).toContain('2. Submit by 2026-06-17');
    expect(text).toContain('- Email by 2026-06-11');
    expect(text).toContain('still {{today}} raw'); // failure note untouched
    expect(text).toContain('note {{today}} kept'); // tester notes untouched
  });

  it('uses the per-case override date when set', () => {
    const tokenCase: Case = { ...kase, expected: ['Due {{today}}'] };
    const row: RunRow = { ...baseRow, testDate: '2027-01-15', checks: { 'accept:0': 'fail' }, failNotes: {}, notes: '' };
    const text = buildDefectText({ ...run, testDate: '2026-06-10' }, row, tokenCase);
    expect(text).toContain('Due 2027-01-15');
  });
});

describe('buildRunSummary', () => {
  const clear = { checks: {}, failNotes: {}, notes: '' };
  const multi: Run = {
    ...run,
    rows: [
      baseRow, // fail — with two failed checklist items
      { ...baseRow, ...clear, case_id: 'c2', display_id: 'PAY-0001', title: 'Login', result: 'pass' },
      { ...baseRow, ...clear, case_id: 'c3', display_id: 'PAY-0002', title: 'Checkout', result: 'blocked', notes: 'env down' },
      { ...baseRow, ...clear, case_id: 'c4', display_id: 'PAY-0003', title: 'Search', result: 'skipped' },
      { ...baseRow, ...clear, case_id: 'c5', display_id: 'PAY-0004', title: 'Export', result: 'not_run' },
    ],
  };

  it('buckets results and excludes not_run from the pass rate', () => {
    const s = buildRunSummary(multi, [kase]);
    expect(s.total).toBe(5);
    expect(s.executed).toBe(4); // not_run excluded
    expect(s.counts).toEqual({ pass: 1, fail: 1, blocked: 1, in_progress: 0, skipped: 1, not_run: 1 });
    expect(s.passRate).toBe(25); // 1 pass / 4 executed
    expect(s.passed.map((e) => e.display_id)).toEqual(['PAY-0001']);
    expect(s.attention.map((e) => e.result)).toEqual(['fail', 'blocked']);
    expect(s.remaining.map((e) => e.result)).toEqual(['skipped', 'not_run']);
  });

  it('counts in_progress as executed and lists it under remaining', () => {
    const r: Run = {
      ...run,
      rows: [
        { ...baseRow, ...clear, case_id: 'c2', display_id: 'PAY-0001', title: 'Login', result: 'pass' },
        { ...baseRow, ...clear, case_id: 'c7', display_id: 'PAY-0007', title: 'Import', result: 'in_progress' },
      ],
    };
    const s = buildRunSummary(r, [kase]);
    expect(s.counts.in_progress).toBe(1);
    expect(s.executed).toBe(2); // in_progress counts as executed, unlike not_run
    expect(s.remaining.map((e) => e.result)).toEqual(['in_progress']);
    expect(serializeRunSummary(s)).toContain('1 in progress');
  });

  it('surfaces resolved failed steps + notes on non-passing rows', () => {
    const s = buildRunSummary(multi, [kase]);
    expect(s.attention[0].failures).toEqual([
      { text: '2. Click forgot password', note: 'button 500s' },
      { text: 'Email arrives', note: 'never arrived' },
    ]);
    // a blocked row with no failed checks still carries its note
    expect(s.attention[1].failures).toEqual([]);
    expect(s.attention[1].notes).toBe('env down');
  });

  it('renders markdown with a needs-attention section for the sidecar', () => {
    const md = serializeRunSummary(buildRunSummary(run, [kase]));
    expect(md).toContain('0% pass rate');
    expect(md).toContain('### Needs attention');
    expect(md).toContain('**PAY-0042 — Reset password** · Fail');
    expect(md).toContain('- 2. Click forgot password — button 500s');
  });

  it('is empty for a run with no rows', () => {
    expect(serializeRunSummary(buildRunSummary({ ...run, rows: [] }, [kase]))).toBe('');
  });

  it('resolves {{today}} in summary titles and failures against the run test date', () => {
    const tokenCase: Case = { ...kase, title: 'Due {{today+7}}', expected: ['Email by {{today+1}}'] };
    const r: Run = {
      ...run,
      testDate: '2026-06-10',
      rows: [{ ...baseRow, title: 'Due {{today+7}}', checks: { 'accept:0': 'fail' }, failNotes: { 'accept:0': 'late' } }],
    };
    const s = buildRunSummary(r, [tokenCase]);
    expect(s.attention[0].title).toBe('Due 2026-06-17');
    expect(s.attention[0].failures).toEqual([{ text: 'Email by 2026-06-11', note: 'late' }]);
    const md = serializeRunSummary(s);
    expect(md).toContain('Due 2026-06-17');
    expect(md).toContain('- Email by 2026-06-11 — late');
  });
});
