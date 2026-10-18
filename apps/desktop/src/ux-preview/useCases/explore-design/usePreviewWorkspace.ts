import { useState } from 'react';
import type { CaseOperation } from './caseOperations';
import type { GitAction } from './GitActionDialog';
import { getLayoutState, type LayoutStateId } from './layoutStates';
import { initializationPaths } from './PreviewStateDialogs';
import { useCaseOperations } from './useCaseOperations';
import { useExploreDesign } from './useExploreDesign';
import { usePreviewCaseEditor } from './usePreviewCaseEditor';
import { usePreviewChangeTracking } from './usePreviewChangeTracking';
import { usePreviewNavigation } from './usePreviewNavigation';
import { usePreviewRuns } from './usePreviewRuns';
import { usePreviewGlossary } from '../manage-glossary/usePreviewGlossary';
import { usePreviewAutomation } from '../manage-automation/usePreviewAutomation';
import type { AutomationState } from '../manage-automation/types';
import type { ReportKind, ReportSource } from '../export-report/types';
import { repositories } from './fixtures';
export type UsePreviewWorkspaceArgs = { onRestart?: () => void };
export type UsePreviewWorkspaceResult = ReturnType<typeof usePreviewWorkspaceState>;
function usePreviewWorkspaceState({ onRestart = () => undefined }: UsePreviewWorkspaceArgs = {}) {
  const [state, setState] = useState<LayoutStateId>('normal');
  const [reportSource, setReportSource] = useState<ReportSource | null>(null);
  const [showStates, setShowStates] = useState(false); const [showCreateRun, setShowCreateRun] = useState(false); const [showInit, setShowInit] = useState(false);
  const [closed, setClosed] = useState(false); const [gitAction, setGitAction] = useState<GitAction | null>(null);
  const blocked = getLayoutState(state).block;
  const model = useExploreDesign({ state });
  const cases = usePreviewCaseEditor({ blocked, failSave: state === 'saveFailed' });
  const runs = usePreviewRuns({ blocked, failSave: state === 'runSaveFailed' });
  // The preview has two fixed demo repositories. Independent hook instances retain
  // each repository's catalog, selection and form without storage or switch effects.
  const glossaryPayFlow = usePreviewGlossary({ repository: 0, blocked, failSave: state === 'saveFailed' });
  const glossaryMobile = usePreviewGlossary({ repository: 1, blocked, failSave: state === 'saveFailed' });
  const glossary = model.repository === 1 ? glossaryMobile : glossaryPayFlow;
  // Autotests live per repository too: the catalog, trust and executions of each demo repo stay independent.
  const automationState: AutomationState = state === 'trust' ? 'untrusted' : state === 'saveFailed' ? 'saveFailed' : 'normal';
  const automationPayFlow = usePreviewAutomation({ repository: 0, blocked, state: automationState, cases: cases.cases, environments: glossaryPayFlow.entries, onFiles: model.recordFiles });
  const automationMobile = usePreviewAutomation({ repository: 1, blocked, state: automationState, cases: cases.cases, environments: glossaryMobile.entries, onFiles: model.recordFiles });
  const automation = model.repository === 1 ? automationMobile : automationPayFlow;
  usePreviewChangeTracking({ cases: cases.cases, runs: runs.runs, recordFiles: model.recordFiles });
  const navigation = usePreviewNavigation({ participants: [
    { dirty: cases.dirty, saving: cases.saving, save: cases.save, discard: cases.discard },
    { dirty: runs.metadataDirty, saving: runs.saving, save: runs.saveMetadata, discard: runs.discard },
    { dirty: runs.guiding && runs.dirty, saving: runs.saving, save: () => runs.saveResult(false), discard: runs.discard },
    { dirty: glossary.dirty, saving: glossary.saving, save: glossary.save, discard: glossary.discard },
  ] });
  const operations = useCaseOperations({ editor: cases, state, onRecovery: () => setState('suiteRecovery') });
  function chooseState(next: LayoutStateId) {
    setShowStates(false);
    const apply = () => { const selected = getLayoutState(next); setState(next); if (model.repository === null) model.openRepository(0); model.setSection(selected.area); if (next === 'empty') cases.clear(); };
    if (getLayoutState(next).area !== model.section || next === 'empty') navigation.request(apply); else apply();
  }
  function openOperation(operation: CaseOperation) { navigation.request(() => operations.open(operation)); }
  function openReport(kind: ReportKind) {
    if (runs.saving || navigation.busy || reportSource) return;
    navigation.request(() => setReportSource({ kind, runs: runs.getSavedRuns(), runId: runs.run.id, repoName: repositories[model.repository ?? 0].name, generatedAt: new Date().toISOString() }));
  }
  return { state, blocked, model, cases, runs, glossary, automation, navigation, operations, showStates, showCreateRun, showInit, closed, gitAction, reportSource, openReport, closeReport: () => setReportSource(null),
    openGlossaryEntry: (id: string) => navigation.request(() => { glossary.setFilters({ search: '', kind: '', archive: 'all' }); glossary.selectEntry(id); model.setSection('glossary'); }),
    closeStates: () => setShowStates(false), openStates: () => setShowStates(true), chooseState,
    restartDemo: () => { setShowStates(false); navigation.request(onRestart); },
    closeCreateRun: () => setShowCreateRun(false), openCreateRun: () => navigation.request(() => setShowCreateRun(true)),
    closeInit: () => setShowInit(false), openInit: () => setShowInit(true),
    initialize: () => { setState('normal'); model.recordFiles(initializationPaths.map((path) => ({ path, kind: 'untracked', before: [], after: ['# Demo initialized content'] }))); },
    closeSimulation: () => navigation.request(() => setClosed(true)), reopen: () => setClosed(false),
    onGitAction: (action: GitAction) => navigation.request(() => setGitAction(action)), closeGitAction: () => setGitAction(null),
    resetState: () => setState('normal'), reloadExternal: () => { cases.discard(); setState('normal'); }, openOperation,
    chromeModel: { ...model, openRepository: (index: number | null) => navigation.request(() => model.openRepository(index)), setSection: (section: typeof model.section) => navigation.request(() => model.setSection(section)) },
    caseModel: { ...cases, selectCase: (id: string) => { if (id !== cases.selected?.id || cases.folder !== null) navigation.request(() => cases.selectCase(id, true)); }, selectFolder: (folder: string) => navigation.request(() => cases.selectFolder(folder, true)) },
    runModel: { ...runs, selectRun: (id: string) => navigation.request(() => runs.selectRun(id, true)), startGuide: (index?: number) => navigation.request(() => runs.startGuide(index, true)), endGuide: () => navigation.request(() => runs.endGuide(true)) },
    glossaryModel: { ...glossary,
      selectEntry: (id: string) => { if (id !== glossary.selected?.id || glossary.editing) navigation.request(() => glossary.selectEntry(id)); },
      create: () => navigation.request(glossary.create),
    },
  };
}
export function usePreviewWorkspace(args: UsePreviewWorkspaceArgs = {}): UsePreviewWorkspaceResult { return usePreviewWorkspaceState(args); }
