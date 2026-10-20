import { customAlphabet } from 'nanoid';
import { node } from '@/lib/node';
import type { Run } from '@/types';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const gen11 = customAlphabet(ALPHABET, 11);

/** A stable lowercase-alphanumeric case id (~11 chars, `[a-z0-9]`; PRD §5.2). */
export function randomId(len = 11): string {
  return len === 11 ? gen11() : customAlphabet(ALPHABET, len)();
}

/**
 * A random RFC 4122 v4 uuid — the identity and file name of product-data records
 * (`.casewright/glossary/<uuid>.md`, later `.casewright/bugs/<uuid>/`). Unlike
 * {@link randomId} (short, human-facing, could collide) these are never displayed and
 * never derived from a title, so a rename can't move a file or break a link.
 */
export function randomUuid(): string {
  return node.crypto().randomUUID();
}

/**
 * Cyrillic → Latin transliteration for stable ASCII ids/filenames. Russian (and the
 * common Ukrainian letters) is enough for the case/run slugs; anything unmapped falls
 * through to the ASCII filter below.
 */
const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y',
  ь: '', э: 'e', ю: 'yu', я: 'ya', і: 'i', ї: 'yi', є: 'ye', ґ: 'g',
};

const transliterate = (s: string): string =>
  s.replace(/[\u0400-\u04FF]/g, (ch) => CYRILLIC[ch] ?? '');

/**
 * Filename-safe slug from a title (lowercase, hyphenated) — used for stable tree ids.
 * Truncates to `max` chars (default 48). Pass a larger `max` for an explicit, user-chosen
 * filename override where the auto-truncation would otherwise force a collision.
 */
export function slug(s: string, max = 48): string {
  return transliterate((s || '').toLowerCase())
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
