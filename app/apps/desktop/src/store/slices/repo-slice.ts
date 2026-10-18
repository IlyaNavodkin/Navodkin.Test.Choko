import { isNwjs, pickDirectory } from '@/lib/nwjs';
import { flushPersist, schedulePersist } from '@/services/persist';
import { addRecent, listRecents } from '@/services/recents';
import {
  derivePrefix,
  ensureWikiSafeFolder,
  initRepo as initRepoSvc,
  loadRepo,
  openRepo as openRepoSvc,
  syncFolderNote,
  toRepoRelative,
  writeWorkspacesList,
} from '@/services/repo';
import type { Workspace } from '@/types';
import { slug } from '@/utils/ids';
import { baseName, buildSuiteIndex, clone, findSuiteNode } from '../tree-helpers';
import type { StoreInternals } from '../store-internals';
import type { AppState, StoreGet, StoreSet } from '../app-store';

// ---------------------------------------------------------------------------
// Repository lifecycle + navigation: open/init a repo, manage workspaces, and
// the screen/selection navigation actions. Disk + watcher work is delegated to
// the shared store internals.
// ---------------------------------------------------------------------------

type RepoSlice = Pick<
  AppState,
  | 'loadRecents'
  | 'autoReopen'
  | 'openRepo'
  | 'initRepo'
  | 'goHome'
  | 'setWorkspace'
  | 'updateWorkspace'
  | 'addWorkspace'
  | 'editWorkspace'
  | 'removeWorkspace'
  | 'openCase'
  | 'openSuite'
  | 'openRunsList'
  | 'openRun'
  | 'openCreateRun'
  | 'startGuide'
  | 'guideGo'
  | 'exitGuide'
>;

export function createRepoSlice(set: StoreSet, get: StoreGet, internals: StoreInternals): RepoSlice {
  const { history, stopWatch, startWatch, seedPaths, writeWorkspaceNote, refreshWorkspaces, onWriteError, workspaceOfPath } =
    internals;

  return {
    loadRecents: async () => {
      set({ recents: await listRecents() });
    },

    autoReopen: async () => {
      const recents = await listRecents();
      set({ recents });
      // Only the desktop app can actually read a repo from disk; in the browser/dev preview
      // just surface the recents on the launcher. Skip if a repo is already open (e.g. a
      // fast re-entry) so we never clobber an active session.
      if (!isNwjs() || get().repoPath || get().screen !== 'launcher') return;
      const last = recents[0];
      if (last) await get().openRepo(last.path); // openRepo handles missing/invalid paths gracefully
    },

    openRepo: async (path) => {
      const target = path ?? (await pickDirectory());
      if (!target) return;
      history.resetHistory(); // a different repo's cases are about to load — old undo entries no longer apply
      set({ loading: true, error: null, needsInit: false, emptyRepo: false });
      try {
        const opened = await openRepoSvc(target);
        // No `.casewright/` yet — stay on the launcher and offer to scaffold it (req 2).
        // Clear any previously-open repo's slices so the launcher never reads stale data.
        if (opened.needsInit) {
          stopWatch();
          set({
            loading: false,
            repoPath: opened.repoPath,
            branch: opened.branch,
            needsInit: true,
            emptyRepo: false,
            warnings: opened.warnings,
            screen: 'launcher',
            workspaces: [],
            workspace: null,
            tree: [],
            cases: [],
            runs: [],
            changes: [],
            conflict: null,
            ahead: 0,
            behind: 0,
            sel: { kind: 'case', id: undefined, runId: null },
          });
          return;
        }
        const loaded = await loadRepo(opened.repoPath, opened.workspaces);
        // active workspace = the one holding the initially-selected case (else the first)
        const firstCase = loaded.cases[0];
        const firstCasePath = firstCase ? buildSuiteIndex(loaded.tree).path[firstCase.suite] ?? '' : '';
        const ws =
          opened.workspaces.find((w) => firstCasePath === w.path || firstCasePath.startsWith(w.path + '/')) ??
          opened.workspaces[0] ??
          null;
        const empty = opened.workspaces.length === 0; // `.casewright/` present but no markers (req 11)
        set({
          repoPath: opened.repoPath,
          workspaces: opened.workspaces,
          workspace: ws,
          branch: opened.branch,
          tree: loaded.tree,
          cases: loaded.cases,
          runs: loaded.runs,
          warnings: [...opened.warnings, ...loaded.warnings],
          changes: [],
          conflict: null,
          ahead: 0,
          behind: 0,
          needsInit: false,
          emptyRepo: empty,
          screen: empty ? 'launcher' : 'main',
          view: 'editor',
          sel: { kind: 'case', id: loaded.cases[0]?.id, runId: null },
          loading: false,
          error: null,
        });
        seedPaths(loaded.paths);
        void get().refreshStatus();
        startWatch(opened.repoPath); // live-reload on external file changes
        const recents = await addRecent({
          path: opened.repoPath,
          name: baseName(opened.repoPath),
          branch: opened.branch,
          remote: '',
          lastOpened: new Date().toISOString(),
          workspaces: opened.workspaces.length,
          lastWorkspaceId: ws?.id ?? null,
        });
        set({ recents });
      } catch (e) {
        set({ loading: false, error: e instanceof Error ? e.message : String(e) });
        get().toast('Could not open repository');
      }
    },

    initRepo: async () => {
      const target = get().repoPath;
      if (!target) return;
      set({ loading: true, error: null });
      try {
        await initRepoSvc(target);
        set({ needsInit: false });
        await get().openRepo(target); // re-open the now-initialized repo
        get().toast('Initialized .casewright/');
      } catch (e) {
        set({ loading: false, error: e instanceof Error ? e.message : String(e) });
        get().toast('Could not initialize repository');
      }
    },

    goHome: () => {
      void flushPersist();
      stopWatch();
      history.resetHistory(); // leaving the repo — don't let undo replay these edits into the next one opened
      set({ screen: 'launcher' });
    },

    // all workspaces are loaded eagerly; this just sets the active context for new items
    setWorkspace: async (w) => {
      set({ workspace: w });
    },

    updateWorkspace: (wsId, patch) => {
      const ws = get().workspaces.find((w) => w.id === wsId);
      if (!ws) return;
      const next: Workspace = { ...ws, ...patch };
      set((s) => {
        let tree = s.tree;
        if (patch.name !== undefined) {
          tree = clone(s.tree);
          const n = findSuiteNode(tree, wsId);
          if (n) n.name = next.name;
        }
        return {
          workspaces: s.workspaces.map((w) => (w.id === wsId ? next : w)),
          workspace: s.workspace?.id === wsId ? next : s.workspace,
          tree,
        };
      });
      schedulePersist('ws:' + wsId, () => writeWorkspaceNote(wsId));
    },

    addWorkspace: async () => {
      const { repoPath, workspaces } = get();
      if (!repoPath) return;
      const picked = await pickDirectory();
      if (!picked) return;
      const pickedRel = toRepoRelative(repoPath, picked);
      if (pickedRel == null) {
        get().toast('Pick a folder inside this repository');
        return;
      }
      // Already a workspace → just open it for editing.
      const existing = workspaces.find((w) => w.path === pickedRel);
      if (existing) {
        set({ modal: 'workspace', wsModalId: existing.id });
        return;
      }
      // Workspaces can't nest (one folder can't be inside another workspace).
      const within = (a: string, b: string) => b === '' || a === b || a.startsWith(b + '/');
      if (workspaces.some((w) => within(pickedRel, w.path) || within(w.path, pickedRel))) {
        get().toast('Workspaces cannot be nested inside one another');
        return;
      }
      let rel = pickedRel;
      try {
        // Hyphenate the folder if the picked name has spaces (wiki-safe), then declare it
        // in config.yaml and write its folder note (lazy — workspaces always carry a prefix).
        rel = await ensureWikiSafeFolder(repoPath, pickedRel);
        const name = baseName(rel) || baseName(repoPath);
        const ws: Workspace = { id: slug(rel) || 'workspace', name, path: rel, description: '', prefix: derivePrefix(name) };
        await writeWorkspacesList(repoPath, [...workspaces.map((w) => w.path), rel]);
        await syncFolderNote(repoPath, rel, { name: ws.name, prefix: ws.prefix, description: ws.description });
      } catch (e) {
        onWriteError(e);
        return;
      }
      await refreshWorkspaces();
      const added = get().workspaces.find((w) => w.path === rel);
      if (added) {
        set({ modal: 'workspace', wsModalId: added.id, workspace: added });
        get().toast(`Added workspace "${added.name}"`);
      }
    },

    editWorkspace: () => {
      const ws = get().workspace;
      if (!ws) return;
      set({ modal: 'workspace', wsModalId: ws.id });
    },

    removeWorkspace: async () => {
      const { repoPath, workspace, workspaces } = get();
      if (!repoPath || !workspace) return;
      if (
        !(await get().confirm({
          title: `Remove workspace "${workspace.name}"?`,
          message:
            'This only removes it from .casewright/config.yaml — the folder, its cases, and its folder note are left untouched.',
          confirmLabel: 'Remove',
          danger: true,
        }))
      )
        return;
      try {
        await writeWorkspacesList(
          repoPath,
          workspaces.filter((w) => w.id !== workspace.id).map((w) => w.path),
        );
      } catch (e) {
        onWriteError(e);
        return;
      }
      const name = workspace.name;
      await refreshWorkspaces();
      get().toast(`Removed workspace "${name}"`);
    },

    openCase: (id) => {
      void flushPersist();
      const c = get().cases.find((x) => x.id === id);
      const ws = c ? workspaceOfPath(buildSuiteIndex(get().tree).path[c.suite] ?? '') : null;
      set((s) => ({ sel: { ...s.sel, kind: 'case', id }, view: 'editor', workspace: ws ?? s.workspace }));
    },
    openSuite: (suiteId) => {
      void flushPersist();
      const node = findSuiteNode(get().tree, suiteId);
      const ws = node ? workspaceOfPath(node.path) : null;
      set((s) => ({ sel: { ...s.sel, kind: 'suite', suiteId }, view: 'suite', workspace: ws ?? s.workspace }));
    },
    openRunsList: () => {
      void flushPersist();
      set({ view: 'runs' });
    },
    openRun: (runId) => {
      void flushPersist();
      set((s) => ({ sel: { ...s.sel, kind: 'run', runId }, view: 'run' }));
    },
    openCreateRun: () => set({ modal: 'createRun' }),
    startGuide: (runId, index = 0) => {
      void flushPersist();
      set((s) => ({ sel: { ...s.sel, kind: 'run', runId, guideIndex: index }, view: 'guide' }));
    },
    guideGo: (index) => set((s) => ({ sel: { ...s.sel, guideIndex: index } })),
    exitGuide: () => set({ view: 'run' }),
  };
}
