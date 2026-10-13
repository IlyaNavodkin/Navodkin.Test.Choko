import { describe, expect, it } from 'vitest';
import type { Run } from '@/types';
import { formatRunDate, runDateGroups } from './dates';

// June 17, 2026 — local midnight reference for deterministic buckets.
const NOW = new Date(2026, 5, 17);

/** A minimal Run — the date helpers only read `created` + `id`. */
const mk = (created: string, id = created): Run => ({ id, created } as unknown as Run);

describe('formatRunDate', () => {
  it('labels today / yesterday relatively', () => {
    expect(formatRunDate('2026-06-17', NOW)).toBe('Today');
    expect(formatRunDate('2026-06-16', NOW)).toBe('Yesterday');
  });

  it('shows a short date for the same year and includes the year otherwise', () => {
    expect(formatRunDate('2026-06-13', NOW)).toBe('Jun 13');
    expect(formatRunDate('2025-06-13', NOW)).toBe('Jun 13, 2025');
  });

  it('falls back for a blank or unparseable date', () => {
    expect(formatRunDate('', NOW)).toBe('—');
    expect(formatRunDate('not-a-date', NOW)).toBe('not-a-date');
  });
});

describe('runDateGroups', () => {
  it('buckets newest-first into Today / Yesterday / This week / Month / Undated', () => {
    const runs = [
      mk('2026-05-28'),
      mk(''), // undated
      mk('2026-06-17'),
      mk('2026-06-14'), // 3 days → this week
      mk('2026-06-10'), // 7 days → month bucket
      mk('2026-06-16'),
    ];
    const groups = runDateGroups(runs, NOW);
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'This week', 'June 2026', 'May 2026', 'Undated']);
    expect(groups[0].runs.map((r) => r.created)).toEqual(['2026-06-17']);
    expect(groups[3].runs.map((r) => r.created)).toEqual(['2026-06-10']);
    expect(groups[5].runs.map((r) => r.created)).toEqual(['']);
  });

  it('sorts within a bucket newest-first, tie-broken by id', () => {
    const groups = runDateGroups([mk('2026-06-17', 'b'), mk('2026-06-17', 'a')], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].runs.map((r) => r.id)).toEqual(['b', 'a']);
  });
});
