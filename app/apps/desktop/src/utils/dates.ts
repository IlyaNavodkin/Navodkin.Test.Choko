import type { Run } from '@/types';

// ---------------------------------------------------------------------------
// Date helpers for the run list — relative labels for a run's `created` date and
// newest-first bucketing into date groups. `now` is injectable so the grouping is
// deterministic in tests; it defaults to the current date in the running app.
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

/** Parse an ISO `YYYY-MM-DD` (ignoring any time suffix) to a local midnight Date, or null. */
function parseDay(iso: string | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** Whole calendar-days from `then` up to `now` (both floored to local midnight). */
function dayDiff(then: Date, now: Date): number {
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((b - a) / MS_PER_DAY);
}

/** A short, human label for a run's created date, shown on its list card. */
export function formatRunDate(iso: string | undefined, now: Date = new Date()): string {
  const d = parseDay(iso);
  if (!d) return iso?.trim() || '—';
  const diff = dayDiff(d, now);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export interface RunGroup {
  label: string;
  runs: Run[];
}

const UNDATED = 'Undated';

/**
 * Sort runs newest-first (by `created`, tie-broken by `id`) and bucket them into date
 * groups: **Today / Yesterday / This week** (2–6 days), then **"Month YYYY"** for older
 * runs, with an **Undated** group last for blank/unparseable dates. Because the input is
 * sorted descending, groups come out in display order (newest first).
 */
export function runDateGroups(runs: Run[], now: Date = new Date()): RunGroup[] {
  const sorted = [...runs].sort(
    (a, b) => (b.created || '').localeCompare(a.created || '') || (b.id || '').localeCompare(a.id || ''),
  );

  const groups: RunGroup[] = [];
  const byLabel = new Map<string, Run[]>();
  const labelFor = (run: Run): string => {
    const d = parseDay(run.created);
    if (!d) return UNDATED;
    const diff = dayDiff(d, now);
    if (diff <= 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return 'This week';
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  for (const run of sorted) {
    const label = labelFor(run);
    let bucket = byLabel.get(label);
    if (!bucket) {
      bucket = [];
      byLabel.set(label, bucket);
      if (label !== UNDATED) groups.push({ label, runs: bucket }); // insertion order = newest-first
    }
    bucket.push(run);
  }

  // Undated always sorts last, regardless of when it was first encountered.
  const undated = byLabel.get(UNDATED);
  if (undated) groups.push({ label: UNDATED, runs: undated });
  return groups;
}
