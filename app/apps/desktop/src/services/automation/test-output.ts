import { AUTOMATION_LIMITS, type PlaywrightTestStatus } from '@/schemas/automation';

export interface TestAttemptOutput {
  retry: number;
  status: PlaywrightTestStatus;
  duration: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
  error?: string;
}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};

/** Terminal colour codes have no meaning in a plain text panel. Keep the saved output intact. */
export const plainConsoleText = (text: string): string => text.replace(/\u001b\[[0-9;]*m/g, '');

function readStream(value: unknown): { text: string; truncated: boolean } {
  let text = '';
  let truncated = false;
  for (const item of Array.isArray(value) ? value : []) {
    const chunk = record(item);
    let part = typeof chunk.text === 'string' ? chunk.text : '';
    if (typeof chunk.buffer === 'string') {
      // JSONReportSTDIOEntry is { text } or { buffer: base64 } (Playwright's own types).
      const encodedLimit = Math.ceil(AUTOMATION_LIMITS.maxLogTailChars / 3) * 4;
      const encoded = chunk.buffer.slice(0, encodedLimit);
      try {
        const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
        part = new TextDecoder().decode(bytes);
        truncated ||= encoded.length < chunk.buffer.length;
      } catch { /* An invalid entry must not hide the rest of a test's output. */ }
    }
    const remaining = AUTOMATION_LIMITS.maxLogTailChars - text.length;
    text += part.slice(0, remaining);
    truncated ||= part.length > remaining;
  }
  return { text, truncated };
}

/** Only a test's reporter-owned streams; process-wide output cannot be attributed to a test. */
export function collectAttemptOutput(results: readonly unknown[]): TestAttemptOutput[] {
  return results.map((value, index) => {
    const result = record(value);
    const stdout = readStream(result.stdout);
    const stderr = readStream(result.stderr);
    const status = ['passed', 'failed', 'timedOut', 'skipped', 'interrupted'].includes(String(result.status))
      ? result.status as PlaywrightTestStatus : 'interrupted';
    const error = record(result.error).message;
    return {
      retry: typeof result.retry === 'number' && Number.isFinite(result.retry) ? result.retry : index,
      status,
      duration: typeof result.duration === 'number' && Number.isFinite(result.duration) ? result.duration : 0,
      stdout: stdout.text,
      stderr: stderr.text,
      truncated: stdout.truncated || stderr.truncated,
      ...(typeof error === 'string' ? { error } : {}),
    };
  });
}
