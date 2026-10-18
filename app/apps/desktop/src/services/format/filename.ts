import type { Case, RunRow } from '@/types';
import { slug } from '@/utils/ids';

/** Largest explicit filename stem we allow (without the `.md`). Generous vs. the 48-char
 *  auto-slug cap so similar titles can be given distinct, non-truncated names. */
export const CASE_STEM_MAX = 120;

/** Normalize an explicit filename-stem override to a safe slug (no `.md`). */
export function caseStem(override: string): string {
  return slug(override, CASE_STEM_MAX);
}

/**
 * Canonical case filename: `<slug>.md`, e.g. `user-can-reset-password.md`. Uses the
 * explicit `slug` override when set, else derives from `title`. The mutable `displayId`
 * is deliberately *not* part of the name — baking it in renamed the file (and churned Git)
 * every time the id changed. Freely renamable since `id` (in frontmatter) is the source of truth.
 */
export function caseFileName(c: Pick<Case, 'title' | 'slug'>): string {
  const override = c.slug ? caseStem(c.slug) : '';
  return `${override || slug(c.title) || 'untitled'}.md`;
}

/** Canonical run folder stem: `<YYYY-MM-DD>-<slug(name)>` (one folder per run). */
export function runFileStem(name: string, date: string): string {
  const day = (date || '').slice(0, 10) || '0000-00-00';
  return `${day}-${slug(name) || 'run'}`;
}

/**
 * Per-case sidecar filename within a run folder: `NNN-<display_id>-<slug(title)>.md`.
 * The 3-digit `seq` prefix keeps the results table in seed order across reloads.
 */
export function runCaseFileName(index: number, row: Pick<RunRow, 'display_id' | 'title'>): string {
  const seq = String(index + 1).padStart(3, '0');
  const stem = [row.display_id.trim(), slug(row.title)].filter(Boolean).join('-') || 'case';
  return `${seq}-${stem}.md`;
}
