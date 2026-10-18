/**
 * A tiny per-key debounce + flush queue for disk writes. Keeps editing snappy
 * (optimistic in-memory updates) while coalescing rapid changes (typing) into one
 * write ~400ms later; pending writes are flushed on selection/navigation changes.
 */
type Job = () => void | Promise<void>;

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const jobs = new Map<string, Job>();

async function fire(key: string): Promise<void> {
  const job = jobs.get(key);
  jobs.delete(key);
  const t = timers.get(key);
  if (t) clearTimeout(t);
  timers.delete(key);
  if (job) await job();
}

/** Schedule `job` for `key`, replacing any pending job for the same key. */
export function schedulePersist(key: string, job: Job, ms = 400): void {
  jobs.set(key, job);
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  // Catch here so a failing job doesn't surface as an unhandled rejection (the
  // timer callback isn't awaited anywhere).
  timers.set(
    key,
    setTimeout(() => {
      fire(key).catch((err) => console.error(`persist job "${key}" failed:`, err));
    }, ms),
  );
}

/** Run all pending jobs now (call before reads/commits/navigation). Drains jobs
 * enqueued while flushing (e.g. a post-write status refresh). */
export async function flushPersist(): Promise<void> {
  let guard = 0;
  while (jobs.size && guard++ < 100) {
    const key = jobs.keys().next().value as string;
    await fire(key);
  }
}
