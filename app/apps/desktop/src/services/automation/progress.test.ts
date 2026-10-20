import { describe, expect, it } from 'vitest';
import { LogTail, ProgressTracker } from './progress';

describe('LogTail', () => {
  it('bounds its buffer and flags truncation', () => {
    const tail = new LogTail(10);
    tail.push('12345');
    tail.push('67890');
    expect(tail.text).toBe('1234567890');
    expect(tail.truncated).toBe(false);
    tail.push('abcdef');
    expect(tail.text).toBe('7890abcdef');
    expect(tail.truncated).toBe(true);
  });
});

describe('ProgressTracker', () => {
  it('reads the announced total and counts finished tests from line output', () => {
    const p = new ProgressTracker();
    p.push('Running 3 tests using 2 workers\n');
    p.push('  ✓  1 login works (1.2s)\n');
    p.push('  ✘  2 logout failed\n');
    p.push('  ✓  3 signup works\n');
    const s = p.snapshot();
    expect(s.total).toBe(3);
    expect(s.completed).toBe(3);
    expect(s.passed).toBe(2);
    expect(s.failed).toBe(1);
    expect(s.currentLine).toBe('✓  3 signup works');
  });

  it('splits on carriage returns (the line reporter rewrites one line)', () => {
    const p = new ProgressTracker();
    const lines = p.push('  ✓  1 a\r  ✓  2 b\r');
    expect(lines).toEqual(['  ✓  1 a', '  ✓  2 b']);
    expect(p.snapshot().completed).toBe(2);
  });

  it('degrades to the summary when per-test lines are not parseable', () => {
    const p = new ProgressTracker();
    p.push('some opaque progress output without markers\n');
    p.push('  2 passed (3.5s)\n');
    expect(p.snapshot().passed).toBe(2);
  });

  it('reports stall based on the injected clock', () => {
    let clock = 0;
    const p = new ProgressTracker(null, () => clock);
    p.push('Running 1 test\n');
    expect(p.snapshot().stalled).toBe(false);
    clock = 10_000_000;
    expect(p.snapshot().stalled).toBe(true);
  });
});
