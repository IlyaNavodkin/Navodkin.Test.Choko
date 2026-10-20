import { describe, expect, it } from 'vitest';
import type { Case, Run, RunRow } from '@/types';
import {
  buildDefectDraft,
  defaultDefectSummary,
  defectWarnings,
  parseDefectFile,
  renderDefectMarkdown,
  serializeDefectFile,
  splitActualAndNotes,
} from './defect';

const kase: Case = {
  id: 'c1',
  displayId: 'RND-0002',
  title: 'Sequence Generator returns a complete permutation',
  status: 'active',
  tags: [],
  suite: 's1',
  objective: 'Verify the generator returns every integer exactly once.',
  systems: ['https://www.random.org/sequences/'],
  setup: [
    { name: 'Desktop browser', body: 'Open the page over **HTTPS**.' },
  ],
  steps: [
    { text: 'Open https://www.random.org/sequences/.', depth: 0 },
    { text: 'Enter the range to permute.', depth: 0 },
    { text: 'Set "smallest value" to {{today}}.', depth: 1 },
    { text: 'Click "Get sequence".', depth: 0 },
  ],
  expected: ['A permutation of the requested range is returned.'],
  modified: false,
};

const row: RunRow = {
  case_id: 'c1',
  display_id: 'RND-0002',
  title: 'Sequence Generator returns a complete permutation',
  result: 'fail',
  tester: 'jpatel',
  executed_at: '2026-10-20 15:49',
  notes: 'Cannot continue past the validation error.',
  checks: { 'step:0': 'pass', 'step:1': 'pass', 'step:2': 'fail', 'accept:0': 'fail' },
  failNotes: {
    'step:2': 'The field rejects values below 1; see requirement GOOGLE.RU.',
    'accept:0': 'No sequence generated.',
  },
  itemText: {},
  file: '.casewright/runs/2026-10-20-regression/001-RND-0002-sequence-generator.md',
};

const run: Run = {
  id: '.casewright/runs/2026-10-20-regression',
  name: 'Regression — randomness suite',
  file: '.casewright/runs/2026-10-20-regression',
  created: '2026-10-20',
  testDate: '2026-10-20',
  status: 'open',
  scope: 'repo',
  rows: [row],
  summary: '',
  notes: '',
  testerApproval: null,
  reviewerApproval: null,
  snapshot: {
    glossary: [],
    unresolved: [],
    arguments: {
      id: 'dev',
      revision: 'r1',
      title: 'Dev',
      description: '',
      values: [
        { key: 'smallest', type: 'number', value: 1 },
        { key: 'count', type: 'number', value: 10 },
      ],
    },
  },
};

const opts = { now: new Date('2026-10-20T15:52:00Z'), environment: 'Chrome 141 · Windows 11' };

describe('buildDefectDraft', () => {
  it('prefills the summary, metadata, environment and test data', () => {
    const d = buildDefectDraft(run, row, kase, opts);
    expect(d.summary).toBe('[RND-0002] Sequence Generator returns a complete permutation');
    expect(defaultDefectSummary(run, row)).toBe(d.summary);
    expect(d.displayId).toBe('RND-0002');
    expect(d.runName).toBe('Regression — randomness suite');
    expect(d.result).toBe('fail');
    expect(d.tester).toBe('jpatel');
    expect(d.testDate).toBe('2026-10-20');
    expect(d.environment).toBe('Chrome 141 · Windows 11');
    expect(d.testData).toContain('- **smallest**: 1');
    expect(d.testData).toContain('- **count**: 10');
    expect(d.source).toBe('manual');
  });

  it('derives preconditions, the lead-up to the failure, expected and actual', () => {
    const d = buildDefectDraft(run, row, kase, opts);
    expect(d.objective).toBe('Verify the generator returns every integer exactly once.');
    expect(d.preconditions).toContain('- **Desktop browser**');
    expect(d.steps).toContain('1. Open https://www.random.org/sequences/.');
    expect(d.steps).toContain('2. Enter the range to permute.');
    expect(d.steps).toContain('  2.1. Set "smallest value" to 2026-10-20.  ✗ The field rejects values below 1; see requirement GOOGLE.RU.');
    expect(d.steps).not.toContain('Click "Get sequence"'); // after the failure
    expect(d.expected).toBe('- A permutation of the requested range is returned.');
    expect(d.actual).toContain('2.1. Set "smallest value" to 2026-10-20. — The field rejects values below 1; see requirement GOOGLE.RU.');
    expect(d.actual).toContain('A permutation of the requested range is returned. — No sequence generated.');
    expect(d.notes).toBe('Cannot continue past the validation error.');
  });

  it('includes every step when includeAllSteps is set', () => {
    const d = buildDefectDraft(run, row, kase, { ...opts, includeAllSteps: true });
    expect(d.steps).toContain('3. Click "Get sequence".');
  });

  it('keeps {{today}} raw in tester notes but resolves it in case-derived text', () => {
    const tokenRow: RunRow = {
      ...row,
      checks: { 'step:0': 'fail' },
      failNotes: { 'step:0': 'note {{today}} stays raw' },
      notes: 'notes {{today}} stay raw',
    };
    const tokenCase: Case = { ...kase, steps: [{ text: 'Set date to {{today}}', depth: 0 }] };
    const d = buildDefectDraft({ ...run, testDate: '2026-06-10' }, tokenRow, tokenCase, opts);
    expect(d.steps).toContain('Set date to 2026-06-10');
    expect(d.actual).toContain('note {{today}} stays raw');
    expect(d.notes).toBe('notes {{today}} stay raw');
  });

  it('prefers the run snapshot text over a changed live case', () => {
    const changed: Case = {
      ...kase,
      setup: [{ name: 'Changed setup', body: 'Changed body' }],
      steps: [{ text: 'Changed step', depth: 0 }],
      expected: ['Changed expected'],
    };
    const snapRow: RunRow = {
      ...row,
      itemText: { 'setup:0': 'Original setup', 'step:0': 'Original step', 'accept:0': 'Original expected' },
      checks: { 'step:0': 'fail' },
      failNotes: { 'step:0': 'boom' },
      notes: '',
    };
    const d = buildDefectDraft(run, snapRow, changed, opts);
    expect(d.preconditions).toContain('**Original setup**');
    expect(d.steps).toContain('Original step');
    expect(d.expected).toContain('Original expected');
  });

  it('falls back to the snapshot when the live case is gone', () => {
    const gone: RunRow = {
      ...row,
      itemText: {
        'step:0': 'Open the page',
        'step:2': 'Set "smallest value" to 1',
        'accept:0': 'A permutation is returned',
      },
      checks: { 'step:0': 'pass', 'step:2': 'fail', 'accept:0': 'fail' },
    };
    const d = buildDefectDraft(run, gone, undefined, opts);
    expect(d.steps).toContain('2. Set "smallest value" to 1  ✗ The field rejects values below 1; see requirement GOOGLE.RU.');
    expect(d.preconditions).toBe('');
    expect(d.expected).toBe('');
    expect(d.actual).toContain('Set "smallest value" to 1');
  });

  it('drops a note that merely repeats a failed item description', () => {
    const d = buildDefectDraft(
      run,
      { ...row, notes: 'The field rejects values below 1; see requirement GOOGLE.RU.', failNotes: { 'step:2': 'The field rejects values below 1; see requirement GOOGLE.RU.' } },
      kase,
      opts,
    );
    expect(d.notes).toBe('');
    expect(d.actual).toContain('The field rejects values below 1');
  });

  it('uses the automation as the source when there is no manual execution', () => {
    const d = buildDefectDraft(
      run,
      { ...row, executed_at: '', tester: '', result: 'fail' },
      kase,
      {
        ...opts,
        automation: {
          executionId: 'e1',
          automationId: 'sequence-generator',
          project: 'chromium',
          status: 'failed',
          attempts: 2,
          error: 'expect(received).toEqual(expected)',
        },
      },
    );
    expect(d.source).toBe('automation');
    expect(d.automation?.automationId).toBe('sequence-generator');
  });
});

describe('splitActualAndNotes', () => {
  it('returns the notes as actual when there are no failed items', () => {
    expect(splitActualAndNotes([], 'env down')).toEqual({ actual: 'env down', notes: '' });
  });

  it('deduplicates exact/normalized notes', () => {
    expect(splitActualAndNotes([{ text: 'Step', note: 'Button 500s' }], '  button   500s ')).toEqual({
      actual: '- Step — Button 500s',
      notes: '',
    });
  });
});

describe('renderDefectMarkdown', () => {
  it('renders a self-contained report without the run folder path', () => {
    const d = buildDefectDraft(run, row, kase, opts);
    d.evidence = [{ path: 'RND-0002.evidence/001.png', name: '001.png' }];
    const md = renderDefectMarkdown(d);
    expect(md).toContain('# [RND-0002] Sequence Generator returns a complete permutation');
    expect(md).toContain('**Case:** RND-0002 · **Run:** Regression — randomness suite · **Test date:** 2026-10-20');
    expect(md).toContain('**Environment:** Chrome 141 · Windows 11');
    expect(md).toContain('## Objective');
    expect(md).not.toContain('## Requirement');
    expect(md).toContain('## Steps to reproduce');
    expect(md).toContain('  ✗ The field rejects values below 1');
    expect(md).toContain('## Actual result');
    expect(md).toContain('## Evidence\n\n- 001.png (RND-0002.evidence/001.png)');
    expect(md).toContain('## Notes\n\nCannot continue past the validation error.');
    expect(md).not.toContain('.casewright/runs');
  });

  it('includes the automation failure and source label', () => {
    const d = buildDefectDraft(run, { ...row, executed_at: '', tester: '' }, kase, {
      ...opts,
      automation: {
        executionId: 'e1',
        automationId: 'sequence-generator',
        project: 'chromium',
        status: 'failed',
        attempts: 2,
        error: 'expect(received).toEqual(expected)',
      },
    });
    const md = renderDefectMarkdown(d);
    expect(md).toContain('**Source:** Autotest — sequence-generator (chromium)');
    expect(md).toContain('## Autotest failure');
    expect(md).toContain('expect(received).toEqual(expected)');
  });
});

describe('serializeDefectFile / parseDefectFile', () => {
  it('round-trips the draft through the on-disk format', () => {
    const d = buildDefectDraft(run, row, kase, opts);
    d.summary = '[RND-0002] Validation rejects a valid smallest value';
    d.environment = 'Chrome 141 · Windows 11 · https://www.random.org/sequences/';
    d.evidence = [{ path: 'RND-0002.evidence/001.png', name: '001.png' }];
    const parsed = parseDefectFile(serializeDefectFile(d));
    expect(parsed).not.toBeNull();
    expect(parsed!.displayId).toBe('RND-0002');
    expect(parsed!.runFile).toBe(d.runFile);
    expect(parsed!.summary).toBe(d.summary);
    expect(parsed!.objective).toBe(d.objective);
    expect(parsed!.steps).toBe(d.steps);
    expect(parsed!.expected).toBe(d.expected);
    expect(parsed!.actual).toBe(d.actual);
    expect(parsed!.testData).toBe(d.testData);
    expect(parsed!.notes).toBe(d.notes);
    expect(parsed!.environment).toBe(d.environment);
    expect(parsed!.evidence).toEqual(d.evidence);
  });

  it('returns null for a non-defect file', () => {
    expect(parseDefectFile('# just a markdown file')).toBeNull();
  });
});

describe('defectWarnings', () => {
  it('warns about a default summary, empty actual and missing evidence', () => {
    const d = buildDefectDraft(run, row, kase, opts);
    d.actual = '';
    const codes = defectWarnings(d, defaultDefectSummary(run, row)).map((w) => w.code);
    expect(codes).toContain('summary-default');
    expect(codes).toContain('actual-empty');
    expect(codes).toContain('evidence-empty');
    expect(codes).not.toContain('requirement-empty');
  });

  it('does not warn when the report has the required content', () => {
    const d = buildDefectDraft(run, row, kase, opts);
    d.summary = '[RND-0002] Validation rejects a valid smallest value';
    d.evidence = [{ path: 'e/001.png', name: '001.png' }];
    expect(defectWarnings(d, defaultDefectSummary(run, row))).toEqual([]);
  });
});
