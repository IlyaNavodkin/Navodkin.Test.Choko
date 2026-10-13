import { node } from '@/lib/node';
import { isNwjs } from '@/lib/nwjs';
import { serializeCase } from '@/services/format/case';
import { caseFileName } from '@/services/format/filename';
import { serializeOrder } from '@/services/format/order';
import { flushPersist, schedulePersist } from '@/services/persist';
import {
  deletePath,
  loadRepo,
  openRepo as openRepoSvc,
  orderFileRel,
  readMaybe,
  syncFolderNote,
  wasSelfWrite,
  writeFileAt,
} from '@/services/repo';
import { watchRepo, type RepoWatcher } from '@/services/watch';
import type { Case, Change, Workspace } from '@/types';
import { baseName, buildSuiteIndex, findSuiteNode } from './tree-helpers';
import { createCaseHistory } from './history';
import type { AppState, StoreGet, StoreSet } from './app-store';

// ---------------------------------------------------------------------------
// Shared store internals — the cross-cutting private helpers (path derivation,
// optimistic disk persistence, the external-change watcher, change tracking)
// plus the undo/redo controller. Created once per store; the bigger slices
// (`./slices/*`) destructure what they need from the returned object, so their
// action bodies read exactly as they did inside the original store closure.
// ---------------------------------------------------------------------------

/** Key a change by its kind + ref so the dirty-list upserts in place. */
export const changeKey = (c: Change) => c.kind + ':' + c.refId;

export function createStoreInternals(set: StoreSet, get: StoreGet) {
  // suite paths in the tree are full repo-relative (workspaces are top-level folders)
  const casePath = (c: Case): string => {
    const dir = buildSuiteIndex(get().tree).path[c.suite] ?? '';
    return dir ? `${dir}/${caseFileName(c)}` : caseFileName(c);
  };

  /* ---- disk persistence (optimistic in-memory + write; reload on error) ---- */
  const suiteRel = (suiteId: string): string => buildSuiteIndex(get().tree).path[suiteId] ?? '';

  /** The workspace owning a given repo-relative path (longest matching prefix). The
   *  repo-root workspace (`path === ''`) owns everything; a more specific workspace wins. */
  const workspaceOfPath = (full: string): Workspace | null => {
    const matches = get().workspaces.filter((w) => w.path === '' || full === w.path || full.startsWith(w.path + '/'));
    return matches.sort((a, b) => b.path.length - a.path.length)[0] ?? null;
  };

  /** Derive a case's owning workspace from its suite path (PRD §4 req 18). */
  const caseWorkspace = (caseId: string): Workspace | null => {
    const c = get().cases.find((x) => x.id === caseId);
    if (!c) return null;
    return workspaceOfPath(buildSuiteIndex(get().tree).path[c.suite] ?? '');
  };

  // the path each case was last written to — drives rename-on-write cleanup
  const lastCasePath = new Map<string, string>();
  // Seed from the case's *actual* on-disk path when known (`paths`, straight from a load).
  // The on-disk name can differ from the canonical `caseFileName(c)` — after a title change
  // or a filename-scheme change (e.g. dropping displayId) — and seeding from the canonical
  // name would make the next write skip the delete and orphan the old file (two files, one id).
  // After our own writes, `reseed()` calls this with no map: the just-written canonical name
  // is then authoritative, so falling back to `casePath(c)` is correct.
  const seedPaths = (paths?: Record<string, string>) => {
    lastCasePath.clear();
    get().cases.forEach((c) => lastCasePath.set(c.id, paths?.[c.id] ?? casePath(c)));
  };

  // recompute git-derived dirty state shortly after writes settle
  const scheduleRefresh = () => schedulePersist('git:status', () => get().refreshStatus(), 250);
  const reseed = () => {
    seedPaths();
    scheduleRefresh();
  };

  const reloadFromDisk = async () => {
    const { repoPath, workspaces } = get();
    if (!repoPath || !workspaces.length) return;
    try {
      const loaded = await loadRepo(repoPath, workspaces);
      set({ tree: loaded.tree, cases: loaded.cases, runs: loaded.runs, warnings: loaded.warnings });
      seedPaths(loaded.paths);
    } catch {
      /* keep optimistic state if even the reload fails */
    }
  };

  /** Re-discover workspaces + rebuild the tree after we add/remove a `casewright.yaml`
   *  ourselves. Preserves the active workspace + case selection when they survive. */
  const refreshWorkspaces = async () => {
    const repoPath = get().repoPath;
    if (!repoPath) return;
    await flushPersist();
    const opened = await openRepoSvc(repoPath);
    const loaded = await loadRepo(repoPath, opened.workspaces);
    set((s) => {
      const ws = opened.workspaces.find((w) => w.id === s.workspace?.id) ?? opened.workspaces[0] ?? null;
      const empty = opened.workspaces.length === 0;
      const keepSel = s.sel.kind === 'case' && !!s.sel.id && loaded.cases.some((c) => c.id === s.sel.id);
      return {
        workspaces: opened.workspaces,
        workspace: ws,
        branch: opened.branch,
        tree: loaded.tree,
        cases: loaded.cases,
        runs: loaded.runs,
        warnings: [...opened.warnings, ...loaded.warnings],
        emptyRepo: empty,
        screen: empty ? 'launcher' : 'main',
        sel: keepSel ? s.sel : { ...s.sel, id: loaded.cases[0]?.id },
      };
    });
    seedPaths(loaded.paths);
    void get().refreshStatus();
  };

  /* ---- external-change watcher: live-reload when files change outside the app ---- */
  let repoWatcher: RepoWatcher | null = null;
  let reloadingExternal = false;
  let queuedReload = false;

  const stopWatch = () => {
    repoWatcher?.close();
    repoWatcher = null;
  };

  // Re-run discovery + load so externally added/removed workspaces, suites, cases and
  // runs all appear; preserve the active workspace + selection when they still exist.
  const reloadAfterExternalChange = async () => {
    const repoPath = get().repoPath;
    if (!repoPath) return;
    await flushPersist(); // land any pending in-app edits first (ours win on a same-file clash)
    const opened = await openRepoSvc(repoPath);
    if (opened.needsInit) {
      stopWatch();
      set({
        needsInit: true,
        emptyRepo: false,
        screen: 'launcher',
        workspace: null,
        workspaces: [],
        tree: [],
        cases: [],
        runs: [],
        warnings: opened.warnings,
      });
      return;
    }
    const loaded = await loadRepo(repoPath, opened.workspaces);
    set((s) => {
      const ws = opened.workspaces.find((w) => w.id === s.workspace?.id) ?? opened.workspaces[0] ?? null;
      const keepSel = s.sel.kind === 'case' && !!s.sel.id && loaded.cases.some((c) => c.id === s.sel.id);
      return {
        workspaces: opened.workspaces,
        workspace: ws,
        branch: opened.branch,
        tree: loaded.tree,
        cases: loaded.cases,
        runs: loaded.runs,
        warnings: [...opened.warnings, ...loaded.warnings],
        emptyRepo: opened.workspaces.length === 0,
        sel: keepSel ? s.sel : { ...s.sel, id: loaded.cases[0]?.id },
      };
    });
    seedPaths(loaded.paths);
    void get().refreshStatus();
    get().toast('Reloaded — external changes detected');
  };

  // Serialize reloads; if changes land mid-reload, run once more after (don't drop them).
  const handleExternalChange = async () => {
    if (reloadingExternal) {
      queuedReload = true;
      return;
    }
    reloadingExternal = true;
    try {
      do {
        queuedReload = false;
        try {
          await reloadAfterExternalChange();
        } catch {
          /* transient (a file mid-write by the external tool) — a later event retries */
        }
      } while (queuedReload);
    } finally {
      reloadingExternal = false;
    }
  };

  const startWatch = (repoPath: string) => {
    stopWatch();
    if (!repoPath || !isNwjs()) return; // watching needs the NW.js/Node runtime
    repoWatcher = watchRepo(repoPath, () => void handleExternalChange(), { isSelfWrite: wasSelfWrite });
  };

  const onWriteError = (e: unknown) => {
    set({ error: e instanceof Error ? e.message : String(e) });
    get().toast('Write failed — reloading from disk');
    void reloadFromDisk();
  };

  // Persist a folder's child ordering to its `.order` file (Azure DevOps wiki format: one
  // child key per line — a case's filename stem or a subfolder basename). `force` lets an
  // explicit reorder *create* the file; otherwise we only keep an *existing* `.order` current
  // (so ordinary create/delete never litters never-reordered folders). We never delete it —
  // once a folder is ordered it stays ordered, even if the order matches alphabetical.
  const syncOrder = async (nodeId: string | null, opts?: { force?: boolean }) => {
    const rp = get().repoPath;
    if (!rp || !nodeId) return;
    const n = findSuiteNode(get().tree, nodeId);
    if (!n) return;
    const rel = orderFileRel(n.path);
    const existing = await readMaybe(node.path().join(rp, rel));
    if (!opts?.force && existing == null) return; // maintain-only: nothing to keep in sync
    const byId = new Map(get().cases.map((c) => [c.id, c]));
    const keys: string[] = [];
    for (const ch of n.children) {
      if (ch.type === 'case') {
        const c = byId.get(ch.id);
        if (c) keys.push(caseFileName(c).replace(/\.md$/, '')); // skip stale (deleted) case nodes
      } else {
        keys.push(baseName(ch.path));
      }
    }
    const content = serializeOrder(keys);
    if (existing === content) return;
    try {
      await writeFileAt(rp, rel, content);
      scheduleRefresh();
    } catch (e) {
      onWriteError(e);
    }
  };

  const writeCaseNow = async (id: string) => {
    const { repoPath } = get();
    const c = get().cases.find((x) => x.id === id);
    if (!repoPath || !c) return;
    const rel = casePath(c);
    const { suite: _s, modified: _m, ...parsed } = c;
    try {
      await writeFileAt(repoPath, rel, serializeCase(parsed));
      const prev = lastCasePath.get(id);
      if (prev && prev !== rel) {
        await deletePath(repoPath, prev);
        // The filename (its `.order` key) changed — keep any existing `.order` current.
        void syncOrder(c.suite);
      }
      lastCasePath.set(id, rel);
      scheduleRefresh();
    } catch (e) {
      onWriteError(e);
    }
  };

  const deleteCaseOnDisk = async (rel: string, id: string) => {
    const { repoPath } = get();
    if (!repoPath) return;
    try {
      await deletePath(repoPath, rel);
      lastCasePath.delete(id);
      scheduleRefresh();
    } catch (e) {
      onWriteError(e);
    }
  };

  // Persist a workspace's metadata to its (lazy) sibling folder note — written only when
  // it carries a custom name / prefix / description, else removed. Root → config.yaml.
  const writeWorkspaceNote = async (wsId: string) => {
    const rp = get().repoPath;
    const ws = get().workspaces.find((w) => w.id === wsId);
    if (!rp || !ws) return;
    try {
      await syncFolderNote(rp, ws.path, { name: ws.name, prefix: ws.prefix, description: ws.description });
      scheduleRefresh();
    } catch (e) {
      onWriteError(e);
    }
  };

  // Persist a suite's metadata to its (lazy) sibling folder note (frontmatter only — the
  // folder is not moved; clearing every field removes the note).
  const writeSuiteNote = async (suiteId: string) => {
    const rp = get().repoPath;
    const n = findSuiteNode(get().tree, suiteId);
    const rel = suiteRel(suiteId);
    if (!rp || !n || n.type !== 'suite' || !rel) return;
    try {
      await syncFolderNote(rp, rel, { name: n.name, prefix: n.prefix, description: n.description });
      scheduleRefresh();
    } catch (e) {
      onWriteError(e);
    }
  };

  // upsert a change by its kind:refId key, preserving list order
  const upsertChange = (change: Change) =>
    set((s) => {
      const k = changeKey(change);
      return s.changes.some((c) => changeKey(c) === k)
        ? { changes: s.changes.map((c) => (changeKey(c) === k ? { ...c, ...change } : c)) }
        : { changes: [...s.changes, change] };
    });

  // Undo/redo controller — created here so the case-write helpers it composes
  // (casePath / upsertChange / writeCaseNow) are all defined by now.
  const history = createCaseHistory({ get, set, casePath, upsertChange, writeCaseNow });

  return {
    casePath,
    suiteRel,
    workspaceOfPath,
    caseWorkspace,
    lastCasePath,
    seedPaths,
    reseed,
    scheduleRefresh,
    reloadFromDisk,
    refreshWorkspaces,
    stopWatch,
    startWatch,
    onWriteError,
    syncOrder,
    writeCaseNow,
    deleteCaseOnDisk,
    writeWorkspaceNote,
    writeSuiteNote,
    upsertChange,
    history,
  };
}

export type StoreInternals = ReturnType<typeof createStoreInternals>;
