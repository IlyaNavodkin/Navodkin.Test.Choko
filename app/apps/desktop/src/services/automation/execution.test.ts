import { describe, expect, it } from 'vitest';
import { canTransition, classifyTerminal, ExecutionCursor, reportKeys } from './execution';
import { parsePlaywrightReport } from './report';

const validReport = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
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
            ],
            tests: [{ projectName: 'chromium', results: [{ status: 'passed', duration: 5 }] }],
          },
        ],
      },
    ],
    ...over,
  });

describe('lifecycle transitions', () => {
  it('allows the happy path and forbids resurrecting a terminal state', () => {
    expect(canTransition('queued', 'starting')).toBe(true);
    expect(canTransition('starting', 'running')).toBe(true);
    expect(canTransition('running', 'finishing')).toBe(true);
    expect(canTransition('finishing', 'completed')).toBe(true);
    expect(canTransition('completed', 'running')).toBe(false);
    expect(canTransition('cancelled', 'completed')).toBe(false);
  });

  it('guards transitions through ExecutionCursor', () => {
    const c = new ExecutionCursor();
    expect(c.current).toBe('queued');
    expect(c.terminal).toBe(false);
    c.move('starting');
    c.move('running');
    c.move('cancelled');
    expect(c.terminal).toBe(true);
    expect(() => c.move('running')).toThrow(/Illegal execution transition/);
  });
});

describe('classifyTerminal', () => {
  const base = { exitCode: 0, cancelled: false, interrupted: false, reportRaw: null } as const;

  it('lets interruption and cancellation win', () => {
    expect(classifyTerminal({ ...base, interrupted: true, reportRaw: validReport() }).state).toBe('interrupted');
    expect(classifyTerminal({ ...base, cancelled: true }).state).toBe('cancelled');
  });

  it('treats exit 0 with no report as runner_error, never success', () => {
    const out = classifyTerminal({ ...base });
    expect(out.state).toBe('runner_error');
    expect(out.error).toMatch(/wrote no JSON report/);
  });

  it('treats a non-zero exit with no report as runner_error (config likely failed)', () => {
    const out = classifyTerminal({ ...base, exitCode: 1 });
    expect(out.state).toBe('runner_error');
    expect(out.error).toMatch(/before writing a report/);
  });

  it('reports a structurally broken report', () => {
    const out = classifyTerminal({ ...base, reportRaw: '{ broken' });
    expect(out.state).toBe('runner_error');
  });

  it('reports an empty report', () => {
    const out = classifyTerminal({ ...base, reportRaw: JSON.stringify({ suites: [] }) });
    expect(out.state).toBe('runner_error');
    expect(out.error).toMatch(/contains no tests/);
  });

  it('completes when the report is valid, even with a non-zero exit (failed checks)', () => {
    const out = classifyTerminal({ ...base, exitCode: 1, reportRaw: validReport() });
    expect(out.state).toBe('completed');
    expect(out.report).not.toBeNull();
  });

  it('completes when the report contains the whole selection', () => {
    const out = classifyTerminal({
      ...base,
      reportRaw: validReport(),
      selectionKeys: ['RND-0001::login::chromium::default'],
    });
    expect(out.state).toBe('completed');
  });

  it('fails closed when the report is missing part of the selection', () => {
    const out = classifyTerminal({
      ...base,
      reportRaw: validReport(),
      selectionKeys: ['RND-0001::login::chromium::default', 'RND-0001::logout::chromium::default'],
    });
    expect(out.state).toBe('runner_error');
    expect(out.error).toMatch(/does not contain/);
  });
});

describe('reportKeys', () => {
  it('derives the same identity tuple discovery uses', () => {
    const parsed = parsePlaywrightReport(validReport());
    if (!parsed.ok) throw new Error(parsed.error);
    expect([...reportKeys(parsed.report)]).toEqual(['RND-0001::login::chromium::default']);
  });
});
