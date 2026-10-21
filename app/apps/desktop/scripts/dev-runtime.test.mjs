import { describe, expect, it, vi } from 'vitest';
import { resolveDevRuntime } from './dev-runtime.mjs';

describe('desktop dev runtime', () => {
  it('fails with a repair command when an install omitted the native runtime', async () => {
    await expect(resolveDevRuntime(async () => 'C:\\missing\\nw.exe', () => false)).rejects.toThrow('pnpm --filter @choko/desktop rebuild nw');
  });
  it('returns the native executable path without going through a shell shim', async () => {
    const executable = 'C:\\project with spaces\\nw.exe';
    const exists = vi.fn(() => true);
    expect(await resolveDevRuntime(async () => executable, exists)).toBe(executable);
    expect(exists).toHaveBeenCalledExactlyOnceWith(executable);
  });
});
