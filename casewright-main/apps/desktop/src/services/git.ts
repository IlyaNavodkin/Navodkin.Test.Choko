import { node } from '@/lib/node';
import type { Change, ChangeStatus } from '@/types';

/** Auth uses the system Git credential helper (PRD §6.6); the app stores no secrets. */
export class GitAuthError extends Error {
  constructor(message = 'Git authentication failed — check your system credential helper.') {
    super(message);
    this.name = 'GitAuthError';
  }
}

function git(repoPath: string) {
  return node.simpleGit()(repoPath);
}

const AUTH_RE = /authentication failed|could not read (username|password)|permission denied|access denied|terminal prompts disabled|invalid credentials|403|fatal: could not read/i;

function wrapAuth(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (AUTH_RE.test(msg)) throw new GitAuthError();
  throw err instanceof Error ? err : new Error(msg);
}

function fileStatus(index: string, working: string): ChangeStatus {
  if (index === 'D' || working === 'D') return 'D';
  if (index === 'A' || index === '?' || working === '?') return 'A';
  return 'M';
}

function changeKind(path: string): 'case' | 'run' {
  return path.endsWith('.csv') || /\/runs\//.test(path) ? 'run' : 'case';
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  changes: Change[];
  conflicted: string[];
}

/** Read working-tree + upstream state and map porcelain entries to `Change[]`. */
export async function status(repoPath: string): Promise<GitStatus> {
  const s = await git(repoPath).status();
  const changes: Change[] = s.files.map((f) => ({
    kind: changeKind(f.path),
    refId: f.path,
    path: f.path,
    status: fileStatus(f.index, f.working_dir),
    label: f.path.split('/').pop() ?? f.path,
  }));
  return {
    branch: s.current ?? 'main',
    ahead: s.ahead,
    behind: s.behind,
    changes,
    conflicted: s.conflicted,
  };
}

export interface RepoInfo {
  /** Configured Git identity (`user.name` / `user.email`); empty if unset. */
  userName: string;
  userEmail: string;
  /** `origin` remote URL, or '' if none. */
  remote: string;
  /** `git describe --tags --always` — the nearest tag or short SHA. */
  describe: string;
  /** Short HEAD commit SHA. */
  commit: string;
}

/** Gather repository metadata for the About dialog. Each field degrades to '' on error. */
export async function repoInfo(repoPath: string): Promise<RepoInfo> {
  const g = git(repoPath);
  const safe = async (fn: () => Promise<string>): Promise<string> => {
    try {
      return (await fn()).trim();
    } catch {
      return '';
    }
  };
  const [userName, userEmail, remote, describe, commit] = await Promise.all([
    safe(() => g.raw(['config', 'user.name'])),
    safe(() => g.raw(['config', 'user.email'])),
    safe(() => g.raw(['remote', 'get-url', 'origin'])),
    safe(() => g.raw(['describe', '--tags', '--always'])),
    safe(() => g.revparse(['--short', 'HEAD'])),
  ]);
  return { userName, userEmail, remote, describe, commit };
}

/** Stage the given repo-relative paths (or everything) and commit. */
export async function stageAndCommit(repoPath: string, paths: string[], message: string): Promise<void> {
  const g = git(repoPath);
  await g.add(paths.length ? paths : '.');
  await g.commit(message);
}

export async function push(repoPath: string): Promise<void> {
  try {
    await git(repoPath).push();
  } catch (e) {
    wrapAuth(e);
  }
}

/**
 * Update the remote-tracking refs (so a subsequent {@link status} reports the true
 * ahead/behind counts) without touching the working tree. Used by the background poll
 * that keeps the Pull badge current.
 */
export async function fetch(repoPath: string): Promise<void> {
  try {
    await git(repoPath).fetch();
  } catch (e) {
    wrapAuth(e);
  }
}

export interface PullResult {
  ok: boolean;
  conflicted: string[];
}

/** Fetch + merge. Returns `{ ok:false, conflicted }` on merge conflicts (rather than throwing). */
export async function pull(repoPath: string): Promise<PullResult> {
  try {
    await git(repoPath).pull();
    return { ok: true, conflicted: [] };
  } catch (e) {
    const conflicted = (await git(repoPath).status()).conflicted;
    if (conflicted.length) return { ok: false, conflicted };
    wrapAuth(e);
  }
}

export async function conflictedFiles(repoPath: string): Promise<string[]> {
  return (await git(repoPath).status()).conflicted;
}

/** Repo-relative untracked files under `path` (or the whole repo when omitted). */
async function untrackedUnder(repoPath: string, path?: string): Promise<string[]> {
  const args = ['ls-files', '--others', '--exclude-standard'];
  if (path) args.push('--', path);
  const out = await git(repoPath).raw(args);
  return out.split('\n').filter(Boolean);
}

/**
 * Unified diff of a path (file or folder) against HEAD — the working tree's full
 * pending change, staged or not. Untracked files don't appear in `git diff HEAD`,
 * so each one under `path` is appended as a synthesized new-file patch.
 */
export async function diffPath(repoPath: string, path: string): Promise<string> {
  const g = git(repoPath);
  let tracked = '';
  try {
    tracked = await g.raw(['diff', 'HEAD', '--', path]);
  } catch {
    /* unborn HEAD (no commits yet) — everything is untracked below */
  }
  const parts = [tracked];
  for (const rel of await untrackedUnder(repoPath, path)) {
    try {
      const content = await node.fsp().readFile(node.path().join(repoPath, rel), 'utf8');
      const lines = content.split('\n');
      if (lines[lines.length - 1] === '') lines.pop(); // final newline is not a line
      parts.push(
        [
          `diff --git a/${rel} b/${rel}`,
          'new file mode 100644',
          '--- /dev/null',
          `+++ b/${rel}`,
          `@@ -0,0 +1,${lines.length} @@`,
          ...lines.map((l) => `+${l}`),
          '',
        ].join('\n'),
      );
    } catch {
      /* unreadable (binary / mid-write) — skip rather than fail the whole diff */
    }
  }
  return parts.filter(Boolean).join('');
}

/**
 * Discard every working-tree change under the given paths: tracked files are restored
 * from HEAD (this also resolves unmerged entries to the committed version) and untracked
 * files/folders are deleted. The unit of revert is a whole change row (a case file or a
 * run folder), so partial restores aren't a concern here.
 */
export async function discardPaths(repoPath: string, paths: string[]): Promise<void> {
  if (!paths.length) return;
  const g = git(repoPath);
  for (const p of paths) {
    try {
      await g.raw(['checkout', 'HEAD', '--', p]);
    } catch {
      /* nothing under `p` exists in HEAD (brand-new path) — clean below removes it */
    }
  }
  await g.raw(['clean', '-fd', '--', ...paths]);
}

/**
 * Stash all local changes, including untracked files. Returns false when the tree was
 * already clean (git prints "No local changes to save" and stashes nothing).
 */
export async function stashPush(repoPath: string, message: string): Promise<boolean> {
  const out = await git(repoPath).raw(['stash', 'push', '--include-untracked', '-m', message]);
  return !/no local changes to save/i.test(out);
}

export interface StashPopResult {
  ok: boolean;
  /** Paths left unmerged by the pop. Git keeps the stash entry when this is non-empty. */
  conflicted: string[];
}

/**
 * Re-apply the newest stash. Returns conflicts (rather than throwing) like {@link pull}.
 * A conflicted pop doesn't reliably reject through simple-git (git exits 1 but the
 * conflict report goes to stdout), so the unmerged state is read from status either way.
 */
export async function stashPop(repoPath: string): Promise<StashPopResult> {
  const g = git(repoPath);
  try {
    await g.raw(['stash', 'pop']);
  } catch (e) {
    const conflicted = (await g.status()).conflicted;
    if (conflicted.length) return { ok: false, conflicted };
    throw e instanceof Error ? e : new Error(String(e));
  }
  const conflicted = (await g.status()).conflicted;
  return conflicted.length ? { ok: false, conflicted } : { ok: true, conflicted: [] };
}

/**
 * Resolve stash-pop conflicts by keeping the stashed (local) version of each path —
 * in a stash pop, merge stage 3 ("theirs") is the stash, i.e. the user's own edits.
 * Resolved paths become ordinary unstaged modifications on top of the pulled tree, and
 * the stash entry (which a conflicted pop keeps) is dropped once everything resolved.
 *
 * Returns the paths it could NOT resolve (e.g. deleted-by-us conflicts with no stash
 * side) — those stay unmerged for the caller to surface.
 */
export async function keepStashedVersion(repoPath: string, paths: string[]): Promise<string[]> {
  const g = git(repoPath);
  const resolved: string[] = [];
  const unresolved: string[] = [];
  for (const p of paths) {
    try {
      await g.raw(['checkout', '--theirs', '--', p]);
      resolved.push(p);
    } catch {
      unresolved.push(p);
    }
  }
  if (resolved.length) {
    await g.add(resolved); // clears the unmerged index entries
    await g.raw(['reset', '--', ...resolved]); // back to plain unstaged modifications
  }
  if (unresolved.length === 0) await g.raw(['stash', 'drop']);
  return unresolved;
}

/** Read a merge stage (1=base, 2=ours, 3=theirs) of a path — for the deferred merge engine. */
export async function readStage(repoPath: string, stage: 1 | 2 | 3, path: string): Promise<string> {
  return git(repoPath).show([`:${stage}:${path}`]);
}

/** Commit the resolved merge. */
export async function completeMerge(repoPath: string, message: string): Promise<void> {
  const g = git(repoPath);
  await g.add('.');
  await g.commit(message);
}

/** Abort an in-progress merge, restoring a clean tree. */
export async function abortMerge(repoPath: string): Promise<void> {
  await git(repoPath).raw(['merge', '--abort']);
}
