// ---------------------------------------------------------------------------
// Self-write tracking — lets the file watcher (services/watch.ts) ignore the
// app's own writes so they don't trigger an external-change reload. The
// low-level fs writers (repo-fs.ts) call `markWrite`; the watcher calls
// `wasSelfWrite`. Both share this module's singleton `recentWrites` map.
// ---------------------------------------------------------------------------

const SELF_WRITE_TTL = 4000; // ms a path stays "recently written by us"
const recentWrites = new Map<string, number>();

/** Record that we just wrote `rel` (and its parent dir, since fs.watch also fires for it). */
export function markWrite(rel: string): void {
  const norm = rel.replace(/\\/g, '/');
  const now = Date.now();
  recentWrites.set(norm, now);
  const slash = norm.lastIndexOf('/');
  if (slash > 0) recentWrites.set(norm.slice(0, slash), now);
}

/** True if `rel` was written by us within the TTL (prunes stale entries as it goes). */
export function wasSelfWrite(rel: string): boolean {
  const now = Date.now();
  for (const [k, t] of recentWrites) if (now - t > SELF_WRITE_TTL) recentWrites.delete(k);
  const t = recentWrites.get(rel.replace(/\\/g, '/'));
  return t != null && now - t <= SELF_WRITE_TTL;
}
