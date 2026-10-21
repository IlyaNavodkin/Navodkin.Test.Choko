import { node } from '@/lib/node';

/** Open the active Git root from AppState.repoPath, independent of case/document storage. */
export async function openRepositoryFolder(repoPath: string): Promise<void> {
  const shell = typeof window === 'undefined' ? undefined : window.nw?.Shell;
  if (!shell?.openItem) throw new Error('Opening folders requires the desktop app.');
  if (!repoPath.trim()) throw new Error('No repository is open.');
  const repo = await node.fsp().realpath(repoPath);
  if (!(await node.fsp().stat(repo)).isDirectory()) throw new Error('The repository path is not a directory.');
  try {
    // Both repositories (.git directory) and worktrees (.git file) are supported.
    await node.fsp().stat(node.path().join(repo, '.git'));
  } catch {
    throw new Error('The selected folder is not a Git repository root.');
  }
  shell.openItem(repo);
}
