import { describe, expect, it } from 'vitest';
import {
  parseRunCase,
  parseRunDetails,
  serializeRunCase,
  serializeRunDetails,
  type RunCaseFile,
  type RunDetails,
} from './run';

const SAMPLE_CASE: RunCaseFile = {
  caseId: '9f3a7c1e8b',
  displayId: 'PAY-0042',
  title: 'User can reset password — from the login screen',
  result: 'fail',
  tester: 'amartin',
  executedAt: '2026-06-01 09:14',
  notes: 'See defect DEF-2291.',
  setup: [{ key: 'setup:0', text: 'Confirm Auth service is available and reachable.', state: 'pass', failNote: '' }],
  steps: [
    { key: 'step:0', text: 'Navigate to the login screen', state: 'pass', failNote: '' },
    { key: 'step:1', text: 'Click "Forgot password"', state: 'fail', failNote: 'button 500s, no email sent' },
    { key: 'step:2', text: 'Enter the emailed token', state: 'none', failNote: '' },
  ],
  accept: [{ key: 'accept:0', text: 'A reset email arrives within 60s', state: 'fail', failNote: 'never arrived' }],
};

describe('run-case sidecar', () => {
  it('round-trips tri-state checks and a failure note', () => {
    const { runCase, warnings } = parseRunCase(serializeRunCase(SAMPLE_CASE));
    expect(warnings).toHaveLength(0);
    expect(runCase).toEqual(SAMPLE_CASE);
  });

  it('encodes checkbox states as [ ] / [x] / [-]', () => {
    const md = serializeRunCase(SAMPLE_CASE);
    expect(md).toContain('- [x] Navigate to the login screen');
    expect(md).toContain('- [-] Click "Forgot password" !! button 500s, no email sent');
    expect(md).toContain('- [ ] Enter the emailed token');
  });

  it('omits the failure note when a fail item has none', () => {
    const one: RunCaseFile = { ...SAMPLE_CASE, steps: [{ key: 'step:0', text: 'Do a thing', state: 'fail', failNote: '' }] };
    const md = serializeRunCase(one);
    expect(md).toContain('- [-] Do a thing\n');
    const { runCase } = parseRunCase(md);
    expect(runCase.steps[0]).toEqual({ key: 'step:0', text: 'Do a thing', state: 'fail', failNote: '' });
  });

  it('tolerates a numbered ordinal on a step line', () => {
    const md = '---\ncase_id: x1\n---\n\n## Steps\n\n1. [x] First step\n- [x] 2. Second step\n';
    const { runCase } = parseRunCase(md);
    expect(runCase.steps.map((s) => s.text)).toEqual(['First step', 'Second step']);
    expect(runCase.steps.every((s) => s.state === 'pass')).toBe(true);
  });

  it('splits the failure note on the last `!!` sentinel, so dashes survive in the item text', () => {
    const md = '---\ncase_id: x1\n---\n\n## Steps\n\n- [-] Reset link — emailed within 60s !! never arrived\n';
    const { runCase } = parseRunCase(md);
    expect(runCase.steps[0].text).toBe('Reset link — emailed within 60s');
    expect(runCase.steps[0].failNote).toBe('never arrived');
  });

  it('uses the last sentinel when one appears in the item text too', () => {
    const md = '---\ncase_id: x1\n---\n\n## Steps\n\n- [-] Tap Save !! Confirm !! crashed on save\n';
    const { runCase } = parseRunCase(md);
    expect(runCase.steps[0].text).toBe('Tap Save !! Confirm');
    expect(runCase.steps[0].failNote).toBe('crashed on save');
  });

  it('keeps an em-dash inside a passing item as text', () => {
    const md = '---\ncase_id: x1\n---\n\n## Steps\n\n- [x] Title — with dash\n';
    const { runCase } = parseRunCase(md);
    expect(runCase.steps[0]).toMatchObject({ text: 'Title — with dash', state: 'pass', failNote: '' });
  });

  it('coerces an unknown checkbox glyph to none with a warning', () => {
    const md = '---\ncase_id: x1\n---\n\n## Steps\n\n- [?] Mystery\n';
    const { runCase, warnings } = parseRunCase(md);
    expect(runCase.steps[0]).toMatchObject({ text: 'Mystery', state: 'none' });
    expect(warnings.some((w) => w.code === 'checkbox')).toBe(true);
  });

  it('preserves out-of-schema sections verbatim', () => {
    const md = serializeRunCase(SAMPLE_CASE, '## Custom\n\nkept');
    const { extra } = parseRunCase(md);
    expect(extra).toContain('## Custom');
    expect(extra).toContain('kept');
  });

  it('is round-trip stable', () => {
    const once = parseRunCase(serializeRunCase(SAMPLE_CASE)).runCase;
    const twice = parseRunCase(serializeRunCase(once)).runCase;
    expect(twice).toEqual(once);
  });

  it('emits and round-trips a per-case test-date override', () => {
    const overridden: RunCaseFile = { ...SAMPLE_CASE, testDate: '2026-07-01' };
    const md = serializeRunCase(overridden);
    expect(md).toContain('test_date: "2026-07-01"');
    expect(parseRunCase(md).runCase.testDate).toBe('2026-07-01');
  });

  it('omits test_date when the case inherits the run date', () => {
    const md = serializeRunCase(SAMPLE_CASE);
    expect(md).not.toContain('test_date');
    expect(parseRunCase(md).runCase.testDate).toBeUndefined();
  });
});

const SAMPLE_DETAILS: RunDetails = {
  name: 'Regression — Sprint 13',
  status: 'open',
  created: '2026-06-09',
  testDate: '2026-06-09',
  scope: 'custom (4 cases)',
  testerApproval: { name: 'amartin', at: '2026-06-09 14:22' },
  reviewerApproval: { name: 'okeefe', at: '2026-06-09 16:01' },
  summary: 'All payment flows verified.',
  notes: 'Gateway sandbox was flaky.',
};

describe('run-details sidecar', () => {
  it('round-trips with both approvals', () => {
    const { details, warnings } = parseRunDetails(serializeRunDetails(SAMPLE_DETAILS));
    expect(warnings).toHaveLength(0);
    expect(details).toEqual(SAMPLE_DETAILS);
  });

  it('writes the run test date and round-trips it', () => {
    const md = serializeRunDetails(SAMPLE_DETAILS);
    expect(md).toContain('test_date: "2026-06-09"');
    expect(parseRunDetails(md).details.testDate).toBe('2026-06-09');
  });

  it('round-trips with no approvals', () => {
    const bare: RunDetails = { ...SAMPLE_DETAILS, testerApproval: null, reviewerApproval: null };
    const md = serializeRunDetails(bare);
    expect(md).not.toContain('tester_approval');
    expect(md).not.toContain('reviewer_approval');
    expect(parseRunDetails(md).details).toEqual(bare);
  });

  it('round-trips with only a tester approval', () => {
    const half: RunDetails = { ...SAMPLE_DETAILS, reviewerApproval: null };
    expect(parseRunDetails(serializeRunDetails(half)).details).toEqual(half);
  });

  it('defaults a missing status to open', () => {
    const { details } = parseRunDetails('---\nname: Bare\n---\n');
    expect(details.status).toBe('open');
    expect(details.testerApproval).toBeNull();
  });

  it('coerces a malformed approval to null', () => {
    const { details } = parseRunDetails('---\nname: X\ntester_approval: not-a-map\n---\n');
    expect(details.testerApproval).toBeNull();
  });
});
