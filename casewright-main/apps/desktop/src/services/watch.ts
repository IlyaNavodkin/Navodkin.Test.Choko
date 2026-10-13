import { node } from '@/lib/node';

/**
 * Watch a repo's working tree for **external** changes (edits made outside the app —
 * Claude Code, an editor, `git checkout`/`pull`, …) and fire a debounced callback so
 * the store can reload from disk. The app's own writes are filtered out via
 * `isSelfWrite` (see `repo.ts` self-write tracking), so saves don't self-trigger.
 *
 * Uses Node's recursive `fs.watch` (supported on Windows/macOS); on a platform/host
 * where it's unavailable the watcher simply never fires.
 */
export interface RepoWatcher {
  close: () => void;
}

/** Paths we never care about (noise that shouldn't trigger a reload). */
function isIgnored(rel: string): boolean {
  const norm = rel.replace(/\\/g, '/');
  const parts = norm.split('/');
  const top = parts[0];
  if (top === '.git' || top === 'node_modules') return true;
  if (top === '.casewright' && parts[1] === 'cache') return true;
  const base = parts[parts.length - 1] ?? '';
  // editor temp/swap/lock files, git index lock, vim's 4913 probe
  if (/^\.#|~$|\.sw[px]$|\.tmp$|^4913$|\.lock$/.test(base)) return true;
  return false;
}

export function watchRepo(
  repoPath: string,
  onChange: () => void,
  opts: { isSelfWrite?: (rel: string) => boolean; debounceMs?: number } = {},
): RepoWatcher {
  const isSelfWrite = opts.isSelfWrite ?? (() => false);
  const debounceMs = opts.debounceMs ?? 300;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;

  const flush = () => {
    timer = null;
    if (!dirty) return;
    dirty = false;
    onChange();
  };

  void (async () => {
    try {
      const watcher = node.fsp().watch(repoPath, { recursive: true, signal: controller.signal });
      for await (const event of watcher) {
        const rel = event.filename ?? '';
        if (!rel || isIgnored(rel) || isSelfWrite(rel)) continue;
        dirty = true;
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, debounceMs);
      }
    } catch (err) {
      // AbortError on close() is expected; anything else means watching is unavailable
      // here (e.g. a plain browser, or recursive watch unsupported) — degrade silently.
      if ((err as { name?: string })?.name !== 'AbortError') {
        console.warn('repo watcher unavailable:', err);
      }
    }
  })();

  return {
    close: () => {
      if (timer) clearTimeout(timer);
      controller.abort();
    },
  };
}
