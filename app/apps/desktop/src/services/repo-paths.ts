import { node } from '@/lib/node';

// ---------------------------------------------------------------------------
// `.casewright/` layout + pure path/string helpers shared across the repo
// service modules. No fs writes here — just constants and path math.
//
// The repo is identified by `.casewright/`; `config.yaml` lists the workspace
// folders; each workspace/suite folder may have an optional sibling "folder
// note" (`<folder>.md`) for its name/prefix/description; runs are centralized
// in `.casewright/runs/`.
// ---------------------------------------------------------------------------

export const CASEWRIGHT_DIR = '.casewright';
export const CONFIG_REL = '.casewright/config.yaml';
export const RUNS_REL = '.casewright/runs';
export const WORKSPACE_MARKER = 'casewright.yaml'; // legacy workspace marker — read only (migration + fallback)
export const LEGACY_SUITE_FILE = '_suite.md'; // legacy suite metadata — read only (migration + fallback)
export const ORDER_FILE = '.order'; // Azure DevOps wiki ordering file (one child key per line)

/**
 * Join repo-relative path segments, treating the repo root (`'.'` or `''`) as empty
 * so we never emit a `./foo` prefix or a leading slash. Returns `''` for the root
 * itself — which is also how the store represents "no parent dir" (see `casePath`).
 */
export function relJoin(...parts: string[]): string {
  return parts.flatMap((p) => (p === '.' || p === '' ? [] : p.split('/'))).join('/');
}

/**
 * Convert an absolute path to a repo-relative, forward-slash path (the form workspaces
 * use). Returns `''` for the repo root itself, or `null` if `abs` lies outside the repo.
 */
export function toRepoRelative(repoPath: string, abs: string): string | null {
  const path = node.path();
  const rel = path.relative(repoPath, abs);
  if (rel === '') return ''; // the repo root itself
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

/** Parse a standalone YAML document (e.g. `casewright.yaml`) by wrapping it as front matter. */
export function parseYamlDoc(raw: string): Record<string, unknown> {
  const wrapped = `---\n${raw.replace(/\r\n/g, '\n').trim()}\n---\n`;
  return (node.matter()(wrapped).data ?? {}) as Record<string, unknown>;
}

/** Derive a placeholder display-ID prefix from a workspace name (PRD §4 req 13). */
export function derivePrefix(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('');
  const cleaned = (initials || name).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return cleaned.slice(0, 4) || 'CW';
}

/** Last path segment (folder basename) of a repo-relative path. */
export function baseOf(rel: string): string {
  return rel.split('/').pop() ?? rel;
}

/** Parent directory of a repo-relative path (`''` for a top-level entry). */
export function parentOf(rel: string): string {
  return rel.split('/').slice(0, -1).join('/');
}

/**
 * Repo-relative path of the sibling folder note for a folder. Uses the **literal**
 * (already wiki-safe) folder basename — never the id `slug()`. The repo root (`''`) has
 * no parent dir for a sibling note, so its metadata lives in `config.yaml` instead.
 */
export function folderNoteRel(folderRel: string): string {
  if (folderRel === '' || folderRel === '.') return CONFIG_REL;
  return relJoin(parentOf(folderRel), `${baseOf(folderRel)}.md`);
}

/** Repo-relative path of a folder's `.order` file (lives *inside* the folder it orders). */
export function orderFileRel(folderRel: string): string {
  return relJoin(folderRel, ORDER_FILE);
}

/**
 * Whether a folder note carries anything worth persisting: a custom display name (one
 * that differs from the folder basename), a display-ID prefix, or a description. When
 * none hold, the folder is left note-less (its name is used as the display name).
 */
export function noteNeeded(basename: string, meta: { name?: string; prefix?: string; description?: string }): boolean {
  const name = (meta.name ?? '').trim();
  return (!!name && name !== basename) || !!(meta.prefix ?? '').trim() || !!(meta.description ?? '').trim();
}

/**
 * Whether an existing folder basename must be normalized for an Azure DevOps wiki: it
 * contains whitespace or a filesystem/wiki-illegal character. A bare `-` is a valid encoded
 * separator, so we deliberately do NOT flag plain kebab-case folders (avoids churning a repo
 * full of `user-management/`-style names); only the names we *generate* encode `-` as `%2D`.
 * When a flagged folder is renamed, `folderSlug` still encodes any literal `-` it contains.
 */
export function needsWikiFix(base: string): boolean {
  return /[\s/\\:*?"<>|]/.test(base);
}
