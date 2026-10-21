import { node } from '@/lib/node';
import { resolveRepoWritePath, writeFileAtomic } from './repo-fs';
import { CHOKO_DIR } from './repo-paths';

// This is the only reader for the previous product's data-folder name.
const LEGACY_DIR = '.casewright';
const JOURNAL = `${CHOKO_DIR}/.migration-paths.json`;
const SKIP = new Set(['.git', 'node_modules', '.cache', '.turbo', '.nwdev', '.nwdev-automation', 'dist', 'build', 'cache']);
const TEXT = /\.(?:md|json|ya?ml|[cm]?js|tsx?|txt|gitignore)$/i;
const eligible = (rel: string) => !rel.includes('\\') && !rel.split('/').some(part => SKIP.has(part) || part === '..' || part === '') && (TEXT.test(rel) || rel.endsWith('/.gitignore'));

async function statOrNull(path: string) {
  try { return await node.fsp().lstat(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

/** Move the old data folder once, then atomically rewrite references. A journal makes interrupted rewrites resumable. */
export async function migrateChokoData(repoPath: string): Promise<boolean> {
  const fsp = node.fsp();
  const path = node.path();
  const oldAbs = path.join(repoPath, LEGACY_DIR);
  const newAbs = path.join(repoPath, CHOKO_DIR);
  const old = await statOrNull(oldAbs);
  const current = await statOrNull(newAbs);
  if (old && current) throw new Error('Repository contains both old and .ch data folders. Move one aside before migration; nothing was merged.');
  if (old && (!old.isDirectory() || old.isSymbolicLink())) throw new Error('The legacy data folder must be a real directory.');
  if (current && (!current.isDirectory() || current.isSymbolicLink())) throw new Error('The .ch data folder must be a real directory.');
  if (!old && !current) return false;

  if (old) {
    const pending: string[] = [];
    const walk = async (rel: string): Promise<void> => {
      for (const entry of await fsp.readdir(path.join(repoPath, rel), { withFileTypes: true })) {
        if (SKIP.has(entry.name) || entry.isSymbolicLink()) continue;
        const child = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await walk(child);
        else if (entry.isFile() && eligible(child)) {
          const raw = await fsp.readFile(path.join(repoPath, child), 'utf8');
          if (raw.includes(LEGACY_DIR)) pending.push(child.startsWith(`${LEGACY_DIR}/`) ? CHOKO_DIR + child.slice(LEGACY_DIR.length) : child);
        }
      }
    };
    await walk('');
    // Write before renaming: a crash immediately after the rename still leaves a recovery list.
    const legacyJournal = `${LEGACY_DIR}/.migration-paths.json`;
    await writeFileAtomic(repoPath, legacyJournal, JSON.stringify(pending));
    try { await fsp.rename(oldAbs, newAbs); }
    catch (error) {
      if (['EBUSY', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        throw new Error('Project data folder is in use. Close terminals, editor tabs and other app instances using it, then reopen the repository to migrate to .ch. Data was not removed.');
      }
      throw error;
    }
  }

  const journalAbs = path.join(repoPath, JOURNAL);
  if (!(await statOrNull(journalAbs))) return false;
  await resolveRepoWritePath(repoPath, JOURNAL);
  const pending: unknown = JSON.parse(await fsp.readFile(journalAbs, 'utf8'));
  if (!Array.isArray(pending) || !pending.every((rel): rel is string => typeof rel === 'string' && eligible(rel))) {
    throw new Error('Invalid Choko migration journal. No references were rewritten.');
  }
  for (const rel of pending as string[]) {
    const abs = await resolveRepoWritePath(repoPath, rel);
    const raw = await fsp.readFile(abs, 'utf8');
    const next = raw.replaceAll(LEGACY_DIR, CHOKO_DIR);
    if (next !== raw) await writeFileAtomic(repoPath, rel, next);
  }
  await fsp.unlink(journalAbs);
  return true;
}
