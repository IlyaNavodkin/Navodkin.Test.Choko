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
