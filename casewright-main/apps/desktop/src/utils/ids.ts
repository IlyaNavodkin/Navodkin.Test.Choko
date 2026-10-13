import { customAlphabet } from 'nanoid';
import type { Run } from '@/types';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const gen11 = customAlphabet(ALPHABET, 11);

/** A stable lowercase-alphanumeric case id (~11 chars, `[a-z0-9]`; PRD §5.2). */
export function randomId(len = 11): string {
  return len === 11 ? gen11() : customAlphabet(ALPHABET, len)();
}

/**
 * Filename-safe slug from a title (lowercase, hyphenated) — used for stable tree ids.
 * Truncates to `max` chars (default 48). Pass a larger `max` for an explicit, user-chosen
 * filename override where the auto-truncation would otherwise force a collision.
 */
export function slug(s: string, max = 48): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, max);
}

/**
 * Wiki/filesystem-safe folder name (and its matching `<name>.md` folder-note filename)
 * from a display name. Unlike {@link slug} (used for ids), this **preserves case** and
 * most characters. It follows the Azure DevOps wiki encoding so a folder + its sibling
 * `<name>.md` render as one page with the right title:
 *   - a literal `-` becomes `%2D` (AzDO reads a bare `-` as an encoded space, so a real
 *     hyphen must be escaped) — e.g. `"PAY-0042"` → `"PAY%2D0042"`;
 *   - spaces become the separator `-` — e.g. `"User Management"` → `"User-Management"`;
 *   - filesystem/wiki-illegal characters are dropped.
 */
export function folderSlug(name: string): string {
  return (name || '')
    .trim()
    .replace(/-/g, '%2D')
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** A `YYYY-MM-DD HH:MM` timestamp for the current moment (run `executed_at`). */
export function nowStamp(): string {
  return new Date().toISOString().slice(0, 16).replace('T', ' ');
}

/** Index of the first not-yet-run row, or 0. */
export function firstUnrun(run: Run): number {
  const i = run.rows.findIndex((r) => r.result === 'not_run');
  return i === -1 ? 0 : i;
}
