import { node } from '@/lib/node';
import type { LintWarning } from '@/schemas';
import type { ReferenceEntry } from '@/schemas/reference-book';
import {
  GLOSSARY_DIR,
  TESTORITTO_DIR,
  glossaryRel,
  isSafeEntryId,
  parseReferenceEntry,
  serializeReferenceEntry,
} from './format/reference-book';
import { sha256Hex } from './hash';
import { RepoPathError, resolveRepoWritePath, writeFileAtomic } from './repo-fs';

/** The layout this module owns — re-exported so consumers never reach into the format layer for it. */
export { GLOSSARY_DIR, TESTORITTO_DIR, glossaryRel, isSafeEntryId } from './format/reference-book';

// ---------------------------------------------------------------------------
// Reference book fs layer (`.testoritto/glossary/`): read the catalog, read one record,
// and write one record atomically with a stale/conflict guard.
//
// Non-negotiable rules (design §9, spec "Compatible storage and no-write open"):
//   · opening a repository writes nothing — a missing `.testoritto/` is an empty catalog;
//   · every write is atomic and containment-checked (never outside the repo, never through
//     a symlink) and marked as a self-write for the watcher;
//   · a record the app cannot represent is never rewritten;
//   · a record changed outside the app between read and save is refused, not clobbered.
// ---------------------------------------------------------------------------

/** One record on disk, with the file facts the UI and run snapshots need. */
export interface ReferenceDoc {
  /** The record's identity — the file's stem, which is also what links point at. */
  id: string;
  /** Repo-relative path of the file. */
  rel: string;
  entry: ReferenceEntry;
  /** Unknown front-matter fields, carried through a save. */
  extra: Record<string, unknown>;
  /** Line ending of the file, kept on save. */
  eol: '\n' | '\r\n';
  /** sha256 of the file's bytes as read — the record's revision (used by run snapshots). */
  revision: string;
  /** Shown with `issues` and never rewritten (invalid YAML, unknown kind, wrong value type, …). */
  readonly: boolean;
  issues: LintWarning[];
}

/** How a save decides whether it is allowed to touch the file. */
export type WriteGuard =
  /** Only when no file exists yet. */
  | { kind: 'create' }
  /** Only when the file still hashes to what was read. */
  | { kind: 'replace'; revision: string }
  /** The user explicitly chose to overwrite whatever is there. */
  | { kind: 'force' };

export class ReferenceStaleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferenceStaleError';
  }
}

export class ReferenceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferenceConflictError';
  }
}

export class ReferenceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferenceNotFoundError';
  }
}

export class ReferenceReadonlyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferenceReadonlyError';
  }
}

export interface GlossaryLoad {
  docs: ReferenceDoc[];
  /** Problems that are not about one record (an unreadable folder, a skipped symlink). */
  issues: LintWarning[];
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** The first product-path segment that exists but is not a directory (`null` when the path is clear). */
async function nonDirectoryOnPath(repoPath: string): Promise<string | null> {
  for (const rel of [TESTORITTO_DIR, GLOSSARY_DIR]) {
    try {
      if (!(await node.fsp().stat(node.path().join(repoPath, rel))).isDirectory()) return rel;
    } catch {
      /* absent */
    }
  }
  return null;
}

const byName = (a: { name: string }, b: { name: string }): number => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

async function readBytes(abs: string): Promise<Buffer | null> {
  try {
    return await node.fsp().readFile(abs);
  } catch {
    return null;
  }
}

/** Build a doc from one file's bytes (the parse never throws — problems become issues). */
function docFromBytes(rel: string, id: string, bytes: Buffer): ReferenceDoc {
  const parsed = parseReferenceEntry(bytes.toString('utf8'), id);
  return {
    id: parsed.entry.id || id,
    rel,
    entry: parsed.entry,
    extra: parsed.extra,
    eol: parsed.eol,
    revision: sha256Hex(bytes),
    readonly: parsed.status === 'readonly',
    issues: parsed.issues,
  };
}

/**
 * Read the whole catalog, sorted by file name. A missing `.testoritto/` (or a missing
 * `glossary/` folder) is simply an empty catalog — this never creates anything.
 */
export async function loadGlossary(repoPath: string): Promise<GlossaryLoad> {
  const path = node.path();
  const issues: LintWarning[] = [];
  let entries: import('node:fs').Dirent[];
  try {
    entries = await node.fsp().readdir(path.join(repoPath, GLOSSARY_DIR), { withFileTypes: true });
  } catch (e) {
    // ENOENT means "nothing there yet" — but Windows also reports it when a path segment
    // is a plain file, so check that explicitly before calling the catalog empty.
    const blocked = await nonDirectoryOnPath(repoPath);
    if (blocked) {
      issues.push({
        code: 'glossary-read',
        message: `${blocked} exists but is not a directory; the reference book cannot be read.`,
        file: blocked,
      });
    } else if ((e as { code?: string }).code !== 'ENOENT') {
      issues.push({ code: 'glossary-read', message: `Could not read ${GLOSSARY_DIR}: ${errText(e)}`, file: GLOSSARY_DIR });
    }
    return { docs: [], issues };
  }

  const docs: ReferenceDoc[] = [];
  for (const entry of entries.filter((e) => e.name.endsWith('.md')).sort(byName)) {
    const rel = `${GLOSSARY_DIR}/${entry.name}`;
    // A link inside the catalog could point anywhere — never follow one.
    if (!entry.isFile()) {
      issues.push({
        code: 'glossary-entry-skipped',
        message: `${rel} is not a regular file and was skipped.`,
        file: rel,
      });
      continue;
    }
    const bytes = await readBytes(path.join(repoPath, rel));
    if (!bytes) {
      issues.push({ code: 'glossary-entry-read', message: `Could not read ${rel}.`, file: rel });
      continue;
    }
    docs.push(docFromBytes(rel, entry.name.replace(/\.md$/, ''), bytes));
  }
  return { docs, issues };
}

/** Read one record by id. `null` when it is absent, unreadable, or not a regular file. */
export async function readGlossaryEntry(repoPath: string, id: string): Promise<ReferenceDoc | null> {
  if (!isSafeEntryId(id)) return null;
  const rel = glossaryRel(id);
  const abs = node.path().join(repoPath, rel);
  let stat: import('node:fs').Stats;
  try {
    stat = await node.fsp().lstat(abs);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  const bytes = await readBytes(abs);
  return bytes ? docFromBytes(rel, id, bytes) : null;
}

/**
 * Write one record atomically. The guard decides which file states are acceptable:
 * `create` (nothing there yet), `replace` (unchanged since it was read) or `force`
 * (the user chose to overwrite). Refuses ids that could escape the glossary folder and
 * targets outside the repository. Returns the record as it now reads from disk.
 */
export async function saveGlossaryEntry(
  repoPath: string,
  entry: ReferenceEntry,
  guard: WriteGuard,
  opts: { extra?: Record<string, unknown>; eol?: '\n' | '\r\n' } = {},
): Promise<ReferenceDoc> {
  if (!isSafeEntryId(entry.id)) {
    throw new RepoPathError(`Not a usable reference id: ${JSON.stringify(entry.id)}`);
  }
  const rel = glossaryRel(entry.id);
  // Containment first (so a symlinked folder is refused before we even read through it).
  const target = await resolveRepoWritePath(repoPath, rel);
  const current = await readBytes(target);
  const currentRevision = current ? sha256Hex(current) : null;

  if (guard.kind === 'create' && currentRevision !== null) {
    throw new ReferenceConflictError(`A record already exists at ${rel}.`);
  }
  if (guard.kind === 'replace') {
    if (currentRevision === null) {
      throw new ReferenceStaleError(`${rel} was deleted outside the app since it was read.`);
    }
    if (currentRevision !== guard.revision) {
      throw new ReferenceStaleError(`${rel} changed outside the app since it was read.`);
    }
  }

  await writeFileAtomic(repoPath, rel, serializeReferenceEntry(entry, opts));
  const saved = await readGlossaryEntry(repoPath, entry.id);
  if (!saved) throw new ReferenceStaleError(`${rel} could not be read back after saving.`);
  return saved;
}

/**
 * Archive or restore a record: a revision-checked, read-modify-write of the `archived` flag
 * that leaves every other field (and the file's line ending) alone.
 */
export async function setGlossaryArchived(repoPath: string, id: string, archived: boolean): Promise<ReferenceDoc> {
  const doc = await readGlossaryEntry(repoPath, id);
  if (!doc) throw new ReferenceNotFoundError(`No reference record at ${glossaryRel(id)}.`);
  if (doc.readonly) {
    throw new ReferenceReadonlyError(doc.issues[0]?.message ?? `${glossaryRel(id)} cannot be edited in the app.`);
  }
  return saveGlossaryEntry(
    repoPath,
    { ...doc.entry, archived },
    { kind: 'replace', revision: doc.revision },
    { extra: doc.extra, eol: doc.eol },
  );
}
