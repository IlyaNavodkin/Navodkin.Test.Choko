import type { ActiveRunRegistry } from './lifecycle';

// ---------------------------------------------------------------------------
// Quit guard (design §Решение 7, spec "Cancel and crash are distinct").
//
// On an orderly quit / repository close the app must stop in-flight Playwright processes and wait
// for their terminal state to be persisted, so the next open shows `interrupted`/`cancelled` rather
// than a phantom `running`. The wait is bounded: a wedged child never hangs the app, but a live run
// is never dropped silently either.
// ---------------------------------------------------------------------------

export interface QuitGuardDeps {
  runs: Pick<ActiveRunRegistry, 'stopAll' | 'size'>;
  /** How long to wait for terminal state before letting the window go. */
  timeoutMs?: number;
  /** Performs the real close once runs have settled. */
  close: () => void;
  /** Called when the stop took longer than the budget (diagnostic; still closes). */
  onTimeout?: (pending: number) => void;
}

/** Stop every run, wait (bounded) for its terminal state, then close. */
export async function closeAfterRunsSettle(deps: QuitGuardDeps): Promise<void> {
  const timeoutMs = deps.timeoutMs ?? 10_000;
  if (deps.runs.size > 0) {
    await Promise.race([
      deps.runs.stopAll(timeoutMs).then(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
    if (deps.runs.size > 0) deps.onTimeout?.(deps.runs.size);
  }
  deps.close();
}
