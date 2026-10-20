import { node } from '@/lib/node';
import { markWrite } from './repo-self-write';

// ---------------------------------------------------------------------------
// Low-level, repo-relative fs ops (PRD §6.2–6.5). The reads back the loaders;
// the writes are what the store composes with the serializers + its path/tree
// knowledge. Every write records a self-write so the watcher ignores it.
// ---------------------------------------------------------------------------

/** Read a file as UTF-8, or `null` if it doesn't exist / can't be read. */
export async function readMaybe(file: string): Promise<string | null> {
  try {
    return await node.fsp().readFile(file, 'utf8');
  } catch {
    return null;
  }
}

/** Whether `p` exists and is a directory. */
export async function isDir(p: string): Promise<boolean> {
  try {
    return (await node.fsp().stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** Write `content` to `<repoPath>/<rel>`, creating parent dirs as needed. */
export async function writeFileAt(repoPath: string, rel: string, content: string): Promise<void> {
  const path = node.path();
  const abs = path.join(repoPath, rel);
  markWrite(rel);
  await node.fsp().mkdir(path.dirname(abs), { recursive: true });
  await node.fsp().writeFile(abs, content);
}

/** Delete `<repoPath>/<rel>` (file or directory, recursive). */
export async function deletePath(repoPath: string, rel: string): Promise<void> {
  markWrite(rel);
  await node.fsp().rm(node.path().join(repoPath, rel), { recursive: true, force: true });
}

/** Move/rename `<repoPath>/<fromRel>` → `<repoPath>/<toRel>`, creating the target's parent. */
export async function renamePath(repoPath: string, fromRel: string, toRel: string): Promise<void> {
  if (fromRel === toRel) return;
  const path = node.path();
  const to = path.join(repoPath, toRel);
  markWrite(fromRel);
  markWrite(toRel);
  await node.fsp().mkdir(path.dirname(to), { recursive: true });
  await node.fsp().rename(path.join(repoPath, fromRel), to);
}

/** Create directory `<repoPath>/<rel>` (recursive, idempotent). */
export async function makeDir(repoPath: string, rel: string): Promise<void> {
  markWrite(rel);
  await node.fsp().mkdir(node.path().join(repoPath, rel), { recursive: true });
}

// ---------------------------------------------------------------------------
// Guarded, atomic writes for product data (`.casewright/*`): a relative path may not
// escape the repository — neither lexically nor through a symlinked directory or file —
// and the bytes land via a temp file + rename so a reader never sees a half-written file.
// ---------------------------------------------------------------------------

/** A write was refused because its target escaped the repository or was a symlink. */
export class RepoPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepoPathError';
  }
}

const isInside = (parentAbs: string, childAbs: string): boolean => {
  const path = node.path();
  const rel = path.relative(parentAbs, childAbs);
  if (rel === '') return true;
  return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
};

async function realOr(p: string): Promise<string> {
  try {
    return await node.fsp().realpath(p);
  } catch {
    return p; // doesn't exist (yet) — the lexical path stands in for it
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await node.fsp().stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Absolute path to write `<repoPath>/<rel>` to, verified to stay inside the repository:
 * the deepest existing ancestor is resolved (`realpath`) and must remain within the repo,
 * the remaining segments are appended, and a symlinked target is refused. Throws
 * {@link RepoPathError} otherwise.
 */
export async function resolveRepoWritePath(repoPath: string, rel: string): Promise<string> {
  const path = node.path();
  const norm = rel.replace(/\\/g, '/');
  if (!norm || path.isAbsolute(rel) || norm.split('/').some((s) => s === '..' || s === '')) {
    throw new RepoPathError(`Refusing a write outside the repository: ${rel}`);
  }
  const repoReal = await realOr(repoPath);
  const abs = path.join(repoPath, rel);

  // Walk up to the deepest ancestor that exists: a symlink anywhere on the way
  // (`.casewright` or `glossary` pointing elsewhere) would otherwise redirect the write.
  const missing: string[] = [];
  let ancestor = path.dirname(abs);
  while (!(await exists(ancestor)) && path.dirname(ancestor) !== ancestor) {
    missing.unshift(path.basename(ancestor));
    ancestor = path.dirname(ancestor);
  }
  const baseReal = await realOr(ancestor);
  const target = path.join(baseReal, ...missing, path.basename(abs));
  if (!isInside(repoReal, baseReal) || !isInside(repoReal, target)) {
    throw new RepoPathError(`Refusing a write outside the repository: ${rel}`);
  }
  let stat: import('node:fs').Stats | null = null;
  try {
    stat = await node.fsp().lstat(target);
  } catch {
    stat = null; // a new file
  }
  if (stat?.isSymbolicLink()) throw new RepoPathError(`Refusing a write through a symlink: ${rel}`);
  return target;
}

let tempSeq = 0;

/**
 * Write `content` to `<repoPath>/<rel>` atomically after the {@link resolveRepoWritePath}
 * containment check: the bytes go to a sibling temp file (which the repo watcher ignores,
 * `*.tmp`) that is then renamed over the target. Marks the write for the watcher.
 */
export async function writeFileAtomic(repoPath: string, rel: string, content: string): Promise<void> {
  const path = node.path();
  const fsp = node.fsp();
  const target = await resolveRepoWritePath(repoPath, rel);
  markWrite(rel);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${tempSeq++}${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    await fsp.writeFile(temp, content);
    await fsp.rename(temp, target);
  } catch (e) {
    try {
      await fsp.rm(temp, { force: true });
    } catch {
      /* best effort — the rename never happened */
    }
    throw e;
  }
}
