import { cases, recents, runs, trees, workspaces } from './sample';
import { useAppStore } from '@/store/app-store';
import type { TreeNode } from '@/types';
import { installAutomationDemo } from './automation-demo';

/** Use the real UI with disposable, in-memory data for browser layout reviews. */
export function initBrowserMockup(): void {
  const tree: TreeNode[] = workspaces.map((workspace) => {
    const children = structuredClone(trees[workspace.id] ?? []);
    const qualifyPaths = (nodes: TreeNode[]): void => {
      for (const node of nodes) {
        if (node.type !== 'suite') continue;
        node.path = `${workspace.path}/${node.path}`;
        qualifyPaths(node.children);
      }
    };
    qualifyPaths(children);
    return {
      type: 'suite',
      isWorkspace: true,
      id: workspace.id,
      name: workspace.name,
      path: workspace.path,
      prefix: workspace.prefix,
      description: workspace.description,
      children,
    };
  });
  const desktopOnly = () => useAppStore.getState().toast('HTTP-мокап: эта операция доступна в desktop-приложении');
  useAppStore.setState({
    cases: structuredClone(cases),
    tree,
    runs: structuredClone(runs),
    workspaces: structuredClone(workspaces),
    workspace: structuredClone(workspaces[0]),
    // An empty repo path keeps the existing persistence helpers in memory only.
    repoPath: '',
    recents: structuredClone(recents),
    branch: 'main',
    screen: 'main',
    view: 'editor',
    sel: { kind: 'case', id: cases[0].id, runId: null },
    autoReopen: async () => {},
    openRepo: async () => desktopOnly(),
    doPull: async () => desktopOnly(),
    doPush: async () => desktopOnly(),
    doCommit: desktopOnly,
  });

  installAutomationDemo();
  const view = new URLSearchParams(window.location.search).get('view');
  const store = useAppStore.getState();
  if (view === 'projects') store.goHome();
  else if (view === 'suite') store.openSuite('generators');
  else if (view === 'runs') store.openRunsList();
  else if (view === 'run') store.openRun(runs[0].id);
  else if (view === 'run-autotests') store.openRunAutomation(runs[0].id);
  else if (view === 'guide') store.startGuide(runs[0].id);
  else if (view === 'glossary') store.openReferenceBook();
  else if (view === 'automation') store.openAutomationSection();
}
