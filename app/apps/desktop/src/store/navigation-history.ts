import type { StoreApi } from 'zustand';
import type { AppState } from './app-store';
import { flushPersist } from '@/services/persist';
import { findSuiteNode } from './tree-helpers';
import { automationEntryKey } from '@/utils/automation-workflow';
import type { RunRowFilter } from '@/types';

type Destination =
  | { view: 'editor' | 'suite'; id: string | null }
  | { view: 'runs'; year?: number; date?: string | null }
  | { view: 'run' | 'runAutomation' | 'guide'; id: string | null; index?: number; test?: string | null; filter?: RunRowFilter }
  | { view: 'glossary' | 'automation'; id: string | null };

function destination(s: AppState): Destination {
  switch (s.view) {
    case 'editor': return { view: s.view, id: s.sel.id ?? null };
    case 'suite': return { view: s.view, id: s.sel.suiteId ?? null };
    case 'runs': return { view: s.view, year: s.sel.activityYear, date: s.sel.activityDate };
    case 'run': return { view: s.view, id: s.sel.runId ?? null, filter: s.sel.runFilter };
    case 'runAutomation': return { view: s.view, id: s.sel.runId ?? null, test: s.sel.automationKey ?? null };
    case 'guide': return { view: s.view, id: s.sel.runId ?? null, index: s.sel.guideIndex ?? 0 };
    case 'glossary': return { view: s.view, id: s.refSelId };
    case 'automation': return { view: s.view, id: s.automationSelId };
  }
}

function exists(s: AppState, route: Destination): boolean {
  if (route.view === 'runs' || !route.id) return true;
  switch (route.view) {
    case 'editor': return s.cases.some((c) => c.id === route.id);
    case 'suite': return !!findSuiteNode(s.tree, route.id);
    case 'glossary': return s.refs.some((r) => r.id === route.id);
    case 'automation': return s.automationCatalog.some((e) => e.automationId === route.id || automationEntryKey(e) === route.id);
    default: return s.runs.some((r) => r.id === route.id);
  }
}

/** Session-only locations, separate from content Undo/Redo. All navigation paths are observed. */
export function installNavigationHistory(store: StoreApi<AppState>): () => void {
  let routes: Destination[] = [];
  let cursor = -1;
  let replaying = false;
  let repository = store.getState().repoPath;
  const nextIndex = (step: number): number => {
    for (let i = cursor + step; i >= 0 && i < routes.length; i += step) {
      if (exists(store.getState(), routes[i])) return i;
    }
    return -1;
  };
  const syncButtons = () => {
    const s = store.getState();
    const canNavigateBack = nextIndex(-1) >= 0;
    const canNavigateForward = nextIndex(1) >= 0;
    if (s.canNavigateBack !== canNavigateBack || s.canNavigateForward !== canNavigateForward) {
      store.setState({ canNavigateBack, canNavigateForward });
    }
  };
  const navigate = (step: number): void => {
    const s = store.getState();
    const index = nextIndex(step);
    if (index < 0 || s.modal || s.dialog || s.refPicker || s.screen !== 'main' || s.loading) return;
    if (!s.guardRefLeave(step < 0 ? 'the previous location' : 'the next location', () => navigate(step))) return;
    const route = routes[index];
    replaying = true;
    try {
      void flushPersist();
      switch (route.view) {
        case 'editor':
          if (route.id) s.openCase(route.id);
          else store.setState({ view: 'editor', sel: { kind: 'case' } });
          break;
        case 'suite': if (route.id) s.openSuite(route.id); break;
        case 'runs':
          s.openRunsList();
          store.setState((state) => ({ sel: { ...state.sel, activityYear: route.year, activityDate: route.date } }));
          break;
        case 'run': if (route.id) s.openRun(route.id, route.filter); break;
        case 'guide': if (route.id) s.startGuide(route.id, route.index); break;
        case 'runAutomation':
          if (route.id) s.openRunAutomation(route.id);
          store.setState((state) => ({ sel: { ...state.sel, automationKey: route.test ?? null } }));
          break;
        case 'automation':
          s.openAutomationSection();
          s.selectAutomationEntry(route.id);
          break;
        case 'glossary':
          s.openReferenceBook();
          if (route.id) s.selectRefEntry(route.id);
          else store.setState({ refSelId: null, refDraft: null, refDraftBase: null, refDirty: false, refSaveError: null });
          break;
      }
      cursor = index;
    } finally {
      replaying = false;
      syncButtons();
    }
  };
  store.setState({ navigateBack: () => navigate(-1), navigateForward: () => navigate(1) });
  const observe = (s: AppState) => {
    if (replaying) return;
    if (s.repoPath !== repository || s.screen !== 'main' || s.loading) {
      repository = s.repoPath;
      routes = [];
      cursor = -1;
    }
    if (s.screen === 'main' && !s.loading) {
      const route = destination(s);
      if (JSON.stringify(routes[cursor]) !== JSON.stringify(route)) {
        routes = [...routes.slice(0, cursor + 1), route].slice(-100);
        cursor = routes.length - 1;
      }
    }
    syncButtons();
  };
  observe(store.getState());
  return store.subscribe(observe);
}
