import {
  abortMerge as gitAbortMerge,
  diffPath,
  discardPaths,
  fetch as gitFetch,
  GitAuthError,
  keepStashedVersion,
  pull as gitPull,
  push as gitPush,
  stageAndCommit,
  stashPop,
  stashPush,
  status as gitStatus,
} from '@/services/git';
import { flushPersist } from '@/services/persist';
import type { Case, Change, Resolutions, Run, Step } from '@/types';
import { changeKey } from '../store-internals';
import type { AppState, StoreCtx, StoreGet, StoreSet } from '../app-store';

// ---------------------------------------------------------------------------
// Git: derived dirty state, the background fetch poll, and the interactive
// commit/push/pull/abort/merge ops. Every git invocation is serialized onto one
// chain so a background fetch never contends with a user op for the repo locks.
// ---------------------------------------------------------------------------

type GitSlice = Pick<
  AppState,
  | 'branch'
  | 'ahead'
  | 'behind'
  | 'changes'
  | 'gitBusy'
  | 'mergeBanner'
  | 'conflict'
  | 'refreshStatus'
  | 'fetchRemote'
  | 'changeDiff'
  | 'revertChange'
  | 'doCommit'
  | 'doPush'
  | 'doPull'
  | 'abortMerge'
  | 'completeMerge'
>;

/** The user-authored parts of a run-details sidecar, snapshotted around a pull so local
 *  edits to the (conflict-prone, regenerable) `_run.md` survive its pre-pull discard. */
type RunDetailsSnapshot = Pick<
  Run,
  'name' | 'scope' | 'testDate' | 'status' | 'notes' | 'testerApproval' | 'reviewerApproval'
>;

/** A generated run-details sidecar: `<anything>/runs/<run folder>/_run.md`. */
const isRunDetailsPath = (p: string): boolean => /(^|\/)runs\/[^/]+\/_run\.md$/.test(p);

export function createGitSlice(set: StoreSet, get: StoreGet, ctx: StoreCtx): GitSlice {
  const { casePath, lastCasePath, reloadFromDisk } = ctx;

  // Guards the background `fetchRemote` poll so overlapping ticks (e.g. a slow fetch) don't pile up.
  let fetchingRemote = false;

  // When a pull hits merge conflicts after doPull auto-stashed, the stash (and the run-details
  // snapshots) wait here; abortMerge restores them along with the pre-pull tree.
  let pendingPull: { stashed: boolean; details: Array<[string, RunDetailsSnapshot]> } | null = null;

  // Serialize every git invocation (background fetch + interactive commit/push/pull/abort) onto one
  // chain so a background fetch and a user-triggered op never run concurrently and contend for the
  // repo's `.git` locks or remote-tracking refs. Each op runs after the previous settles, pass or fail.
  let gitChain: Promise<unknown> = Promise.resolve();
  const runGit = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = gitChain.then(fn, fn);
    gitChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  /** Collapse raw per-file git changes into user-facing entities: one row per test run (its whole
   *  folder, not its files) and one per test case, labelled by run name / case title rather than
   *  the raw path. A run's `path` is its folder, so committing it stages every file inside. */
  const groupChanges = (raw: Change[]): Change[] => {
    const { runs, cases } = get();
    const caseByPath = new Map<string, Case>();
    cases.forEach((c) => {
      caseByPath.set(casePath(c), c);
      const last = lastCasePath.get(c.id);
      if (last) caseByPath.set(last, c);
    });
    const runFolderOf = (p: string): string | null => {
      const known = runs.find((r) => p === r.file || p.startsWith(r.file + '/'));
      if (known) return known.file;
      const m = /^(.*\/runs\/[^/]+)(?:\/|$)/.exec(p);
      return m ? m[1] : null;
    };

    const out: Change[] = [];
    const idx = new Map<string, number>();
    for (const ch of raw) {
      const folder = ch.kind === 'run' ? runFolderOf(ch.path) : null;
      if (folder) {
        const at = idx.get(folder);
        if (at === undefined) {
          idx.set(folder, out.length);
          const run = runs.find((r) => r.file === folder);
          out.push({ kind: 'run', refId: folder, path: folder, status: ch.status, label: run?.name ?? folder.split('/').pop() ?? folder });
        } else if (out[at].status !== ch.status) {
          out[at] = { ...out[at], status: 'M' }; // mixed adds/mods/deletes in one run folder → modified
        }
      } else {
        const c = caseByPath.get(ch.path);
        out.push({ ...ch, kind: 'case', refId: c?.id ?? ch.refId, label: c?.title ?? ch.label });
      }
    }
    return out;
  };

  /** Reapply snapshotted run-details fields to the (reloaded) runs and re-serialize their
   *  `_run.md` — the "regen" half of the pull flow's drop-then-regenerate handling. */
  const restoreRunDetails = async (details: Array<[string, RunDetailsSnapshot]>) => {
    for (const [runId, snap] of details) {
      if (!get().runs.some((r) => r.id === runId)) continue; // run deleted upstream — nothing to restore
      set((s) => ({ runs: s.runs.map((r) => (r.id === runId ? { ...r, ...snap } : r)) }));
      await get().rewriteRunDetails(runId);
    }
  };

  const applyMerge = (resolutions: Resolutions) => {
    const conflict = get().conflict;
    if (!conflict) return;
    conflict.files.forEach((file) => {
      if (file.kind === 'case') {
        const apply: Partial<Case> = {};
        file.elements.forEach((el) => {
          const rk = file.path + '::' + el.key;
          let v: unknown;
          if (el.conflict) {
            const r = resolutions[rk];
            if (!r || r.text == null) return;
            if (el.kind === 'steps') {
              v = r.text.split('\n').map((l): Step => {
                const spaces = l.match(/^ */)?.[0].length ?? 0;
                const tabs = l.match(/^\t*/)?.[0].length ?? 0;
                return { text: l.trim(), depth: Math.floor(spaces / 2) || tabs };
              });
            } else if (el.kind === 'list') {
              v = r.text.split('\n').filter((x) => x.trim());
            } else {
              v = r.text;
            }
          } else {
            if (el.auto === 'same') return;
            if (el.kind === 'tags') v = el.merged;
            else v = el.auto === 'ours' ? el.ours : el.theirs;
          }
          (apply as Record<string, unknown>)[el.key] = v;
        });
        set((s) => ({ cases: s.cases.map((c) => (c.id === file.caseId ? { ...c, ...apply } : c)) }));
      } else {
        set((s) => ({
          runs: s.runs.map((run) => {
            const fileName = file.path.split('/').pop() ?? '';
            if (!run.file.endsWith(fileName)) return run;
            return {
              ...run,
              rows: run.rows.map((row) => {
                const rr = file.rows.find((x) => x.case_id === row.case_id);
                if (!rr) return row;
                if (rr.conflict) {
                  const r = resolutions[file.path + '::' + rr.case_id];
                  if (!r) return row;
                  const val = r.choice === 'ours' ? rr.ours : rr.theirs;
                  return val ? { ...row, ...val } : row;
                }
                if (rr.auto === 'theirs' && rr.value) return { ...row, ...rr.value };
                return row;
              }),
            };
          }),
        }));
      }
    });
  };

  return {
    branch: 'main',
    ahead: 0,
    behind: 0,
    changes: [],
    gitBusy: false,
    mergeBanner: null,
    conflict: null,

    refreshStatus: async () => {
      const { repoPath } = get();
      if (!repoPath) return;
      try {
        const s = await gitStatus(repoPath);
        set({ branch: s.branch, ahead: s.ahead, behind: s.behind, changes: groupChanges(s.changes) });
      } catch {
        /* status read failed — keep optimistic values */
      }
    },

    fetchRemote: async () => {
      const { repoPath, gitBusy } = get();
      // Skip while a push/pull/commit is in flight (avoid git lock contention) or a fetch is running.
      if (!repoPath || gitBusy || fetchingRemote) return;
      fetchingRemote = true;
      try {
        await runGit(() => gitFetch(repoPath));
        await get().refreshStatus();
      } catch {
        /* background poll — ignore offline / auth / no-remote failures */
      } finally {
        fetchingRemote = false;
      }
    },

    doCommit: (selectedKeys, msg) => {
      const { repoPath, changes } = get();
      const paths = changes.filter((c) => selectedKeys.includes(changeKey(c))).map((c) => c.path);
      set({ modal: null, gitBusy: true });
      void (async () => {
        try {
          await flushPersist();
          if (repoPath) await runGit(() => stageAndCommit(repoPath, paths, msg || 'Update test cases'));
          set((s) => ({
            cases: s.cases.map((c) => (selectedKeys.includes('case:' + c.id) ? { ...c, modified: false } : c)),
          }));
          await get().refreshStatus();
          get().toast(`Committed ${paths.length || selectedKeys.length} change(s)`);
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) });
          get().toast('Commit failed');
        } finally {
          set({ gitBusy: false });
        }
      })();
    },

    doPush: async () => {
      const { repoPath, ahead } = get();
      if (!repoPath || !ahead) return;
      set({ gitBusy: true });
      try {
        await runGit(() => gitPush(repoPath));
        await get().refreshStatus();
        get().toast(`Pushed to origin/${get().branch}`);
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
        get().toast(e instanceof GitAuthError ? 'Push failed — check Git credentials' : 'Push failed');
      } finally {
        set({ gitBusy: false });
      }
    },

    doPull: async () => {
      const { repoPath } = get();
      if (!repoPath) return;
      set({ gitBusy: true, mergeBanner: null });
      try {
        await flushPersist();

        // 1. Snapshot + drop local edits to generated run-details sidecars (`_run.md`). They
        //    churn with every recorded result, so letting them into the merge invites pointless
        //    conflicts; the user-authored fields (name / notes / approvals / dates) are captured
        //    from the store and reapplied — then re-serialized — once the pull lands.
        const pre = await runGit(() => gitStatus(repoPath));
        const detailPaths = pre.changes.filter((c) => c.status === 'M' && isRunDetailsPath(c.path)).map((c) => c.path);
        const details: Array<[string, RunDetailsSnapshot]> = [];
        for (const p of detailPaths) {
          const folder = p.slice(0, -'/_run.md'.length);
          const run = get().runs.find((r) => r.file === folder);
          if (run)
            details.push([
              run.id,
              {
                name: run.name,
                scope: run.scope,
                testDate: run.testDate,
                status: run.status,
                notes: run.notes,
                testerApproval: run.testerApproval,
                reviewerApproval: run.reviewerApproval,
              },
            ]);
        }
        if (detailPaths.length) await runGit(() => discardPaths(repoPath, detailPaths));

        // 2. Stash everything else (case edits, run sidecars, new files — untracked included)
        //    so the merge itself always runs on a clean tree.
        const stashed = await runGit(() => stashPush(repoPath, 'casewright: auto-stash before pull'));

        // 3. Pull. A failure here means divergent *committed* history — banner as before; the
        //    stash and snapshots are parked and restored when the user aborts the merge.
        const res = await runGit(() => gitPull(repoPath));
        if (!res.ok) {
          pendingPull = { stashed, details };
          set({
            mergeBanner: `Pull produced conflicts in ${res.conflicted.length} file(s) — resolve via Git, or abort the merge${
              stashed ? ' (your uncommitted edits are stashed and come back on abort)' : ''
            }.`,
          });
          await get().refreshStatus();
          return;
        }

        // 4. Pop the stash onto the pulled tree. Files both sides touched conflict here; keep
        //    the local (stashed) version — the tree stays the user's, and the kept files remain
        //    ordinary uncommitted changes they can diff or revert in the commit window.
        let kept: string[] = [];
        let unresolved: string[] = [];
        if (stashed) {
          const pop = await runGit(() => stashPop(repoPath));
          if (!pop.ok) {
            unresolved = await runGit(() => keepStashedVersion(repoPath, pop.conflicted));
            kept = pop.conflicted.filter((x) => !unresolved.includes(x));
          }
        }

        // 5. Reload the merged tree, then regenerate the dropped `_run.md` files: snapshotted
        //    details + a summary recomputed from the merged rows.
        await reloadFromDisk();
        await restoreRunDetails(details);
        await get().refreshStatus();

        if (unresolved.length) {
          set({
            mergeBanner: `Pulled, but ${unresolved.length} file(s) could not be merged automatically — resolve them in Git, or discard them from the commit window.`,
          });
        }
        get().toast(
          kept.length
            ? `Pulled — kept your local edits to ${kept.length} conflicting file(s)`
            : stashed || detailPaths.length
              ? 'Pulled — local edits reapplied'
              : 'Pulled — up to date',
        );
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
        get().toast(e instanceof GitAuthError ? 'Pull failed — check Git credentials' : 'Pull failed');
      } finally {
        set({ gitBusy: false });
      }
    },

    abortMerge: async () => {
      const { repoPath } = get();
      if (!repoPath) return;
      set({ gitBusy: true });
      try {
        await runGit(() => gitAbortMerge(repoPath));
        // Bring back what doPull set aside before the failed merge: the stash applies cleanly
        // (the tree is back at the exact HEAD it was made from) and the run-details snapshots
        // rewrite the `_run.md` files that were discarded pre-pull.
        const pending = pendingPull;
        pendingPull = null;
        if (pending?.stashed) await runGit(() => stashPop(repoPath));
        await reloadFromDisk();
        if (pending) await restoreRunDetails(pending.details);
        await get().refreshStatus();
        set({ mergeBanner: null });
        get().toast('Merge aborted');
      } catch {
        get().toast('Could not abort merge');
      } finally {
        set({ gitBusy: false });
      }
    },

    changeDiff: (change) => {
      const { repoPath } = get();
      if (!repoPath) return Promise.resolve('');
      return runGit(() => diffPath(repoPath, change.path));
    },

    revertChange: async (change) => {
      const { repoPath } = get();
      if (!repoPath) return;
      const noun = change.kind === 'run' ? 'test run' : 'test case';
      const ok = await get().confirm({
        title: `Discard changes to ${noun} "${change.label}"?`,
        message:
          change.status === 'A'
            ? 'It has never been committed — discarding removes it from disk entirely.'
            : 'Its files go back to the last committed version.',
        confirmLabel: 'Discard',
        danger: true,
      });
      if (!ok) return;
      set({ gitBusy: true });
      try {
        await runGit(() => discardPaths(repoPath, [change.path]));
        await reloadFromDisk();
        await get().refreshStatus();
        get().toast(`Discarded changes to "${change.label}"`);
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
        get().toast('Discard failed');
      } finally {
        set({ gitBusy: false });
      }
    },

    completeMerge: (resolutions) => {
      applyMerge(resolutions);
      set({ modal: null, conflict: null });
      void get().refreshStatus();
      get().toast('Merge resolved');
    },
  };
}
