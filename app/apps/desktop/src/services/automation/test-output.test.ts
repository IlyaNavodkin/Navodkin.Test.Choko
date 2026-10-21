import { describe, expect, it } from 'vitest';
import { collectAttemptOutput, plainConsoleText } from './test-output';
import { AUTOMATION_LIMITS } from '@/schemas/automation';

describe('per-test output', () => {
  it('removes terminal colour codes for display while retaining whitespace', () => {
    expect(plainConsoleText('\u001b[31mExpected 50\u001b[39m\nReceived 40')).toBe('Expected 50\nReceived 40');
  });
  it('keeps stdout/stderr and retries separate and decodes Playwright buffer entries as UTF-8', () => {
    const attempts = collectAttemptOutput([
      { status: 'failed', duration: 5, retry: 0, stdout: [{ text: 'first\n' }], stderr: [{ text: 'failure\n' }], error: { message: 'expected 50, received 40' } },
      { status: 'passed', duration: 3, retry: 1, stdout: [{ buffer: Buffer.from('успех\n').toString('base64') }], stderr: [] },
    ]);
    expect(attempts).toMatchObject([
      { stdout: 'first\n', stderr: 'failure\n', retry: 0, status: 'failed', error: 'expected 50, received 40' },
      { stdout: 'успех\n', stderr: '', retry: 1, status: 'passed' },
    ]);
  });
  it('bounds noisy output and reports truncation, tolerating malformed entries', () => {
    const attempts = collectAttemptOutput([{ status: 'passed', duration: 1,
      stdout: [null, { buffer: '!!' }, { text: 'a'.repeat(AUTOMATION_LIMITS.maxLogTailChars + 12) }, { text: 'tail' }], stderr: 'invalid' }]);
    expect(attempts[0].stdout).toHaveLength(AUTOMATION_LIMITS.maxLogTailChars);
    expect(attempts[0].stderr).toBe('');
    expect(attempts[0].truncated).toBe(true);
  });
});
