import { describe, expect, it } from 'vitest';
import { closeAfterRunsSettle } from './quit-guard';
import type { ActiveRunRegistry } from './lifecycle';

/** A registry double with a controllable settle. */
function registry(initial: number, settleAfterMs: number | null): ActiveRunRegistry & { stopped: number } {
  let size = initial;
  const double = {
    stopped: 0,
    get size() {
      return size;
    },
    async stopAll(): Promise<void> {
      double.stopped += size;
      if (settleAfterMs === null) return; // never settles
      await new Promise<void>((r) => setTimeout(r, settleAfterMs));
      size = 0;
    },
  };
  return double as unknown as ActiveRunRegistry & { stopped: number };
}

describe('closeAfterRunsSettle', () => {
  it('closes immediately when nothing is running', async () => {
    let closed = false;
    await closeAfterRunsSettle({ runs: registry(0, 0), close: () => (closed = true) });
    expect(closed).toBe(true);
  });

  it('stops in-flight runs, waits for them, then closes', async () => {
    const runs = registry(2, 10);
    let closed = false;
    const order: string[] = [];
    await closeAfterRunsSettle({
      runs: { ...runs, stopAll: async () => { order.push('stop'); await runs.stopAll(); order.push('settled'); } } as never,
      close: () => { order.push('close'); closed = true; },
    });
    expect(runs.stopped).toBe(2);
    expect(order).toEqual(['stop', 'settled', 'close']);
    expect(closed).toBe(true);
  });

  it('still closes when a run never settles, reporting the pending count', async () => {
    const runs = registry(1, null);
    let closed = false;
    let pending = -1;
    await closeAfterRunsSettle({
      runs: { ...runs, stopAll: () => runs.stopAll() } as never,
      timeoutMs: 20,
      close: () => (closed = true),
      onTimeout: (n) => (pending = n),
    });
    expect(closed).toBe(true);
    expect(pending).toBe(1);
  });
});
