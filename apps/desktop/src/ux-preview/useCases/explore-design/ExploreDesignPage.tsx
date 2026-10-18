import actionStyles from './PrimaryAction.module.css';
import { useState } from 'react';
import { Button, LoadingState } from '@codaa/ui';
import { CaseWorkspace } from './CaseWorkspace';
import { CaseOperationDialog } from './CaseOperationDialog';
import { CreateRunDialog } from './CreateRunDialog';
import { GitActionDialog } from './GitActionDialog';
import { GitWorkspace } from './GitWorkspace';
import { repositories } from './fixtures';
import { getLayoutState } from './layoutStates';
import { t } from './messages';
import { PreviewChrome, StartScreen } from './PreviewChrome';
import { InitializeDialog, LayoutStatesDialog, NavigationDialog, StateBanner } from './PreviewStateDialogs';
import { RunsWorkspace } from './RunsWorkspace';
import { GlossaryWorkspace } from '../manage-glossary/GlossaryWorkspace';
import { AutomationWorkspace } from '../manage-automation/AutomationWorkspace';
import { usePreviewWorkspace } from './usePreviewWorkspace';
import styles from './Preview.module.css';
import { ReportPreview } from '../export-report/ReportPreview';
export function ExploreDesignPage() {
  const [generation, setGeneration] = useState(0);
  return <PreviewWorkspace key={generation} onRestart={() => setGeneration((value) => value + 1)} />;
}
function PreviewWorkspace({ onRestart }: { onRestart: () => void }) {
  const m = usePreviewWorkspace({ onRestart });
  const panelOnly = ['loading', 'error', 'missingGit', 'trust', 'config', 'rootMoved', 'invalidSnapshot'].includes(m.state);
  return <div className={styles.app}>
    <PreviewChrome model={m.chromeModel} onStates={m.openStates} onClose={m.closeSimulation} />
    {!m.closed && <StateBanner state={m.state} onReset={m.resetState} onInit={m.openInit} onReload={m.reloadExternal} onRecovery={m.operations.showRecovery} onAbort={() => m.onGitAction({ type: 'abort' })} />}
    {m.closed ? <main className={styles.statePanel}><h1>{t('closedSimulation')}</h1><Button className={actionStyles.primaryAction} variant="primary" onClick={m.reopen}>{t('reopen')}</Button></main> : m.model.repository === null ? <StartScreen onOpen={m.chromeModel.openRepository} /> : panelOnly ? <main className={styles.statePanel}>{m.state === 'loading' ? <LoadingState title={t('loadingTitle')} /> : <><h1>{getLayoutState(m.state).label}</h1><p>{getLayoutState(m.state).detail}</p>{m.state === 'config' && <Button className={actionStyles.primaryAction} variant="primary" onClick={m.openInit}>{t('init')}</Button>}</>}</main> : m.model.section === 'cases' ? <CaseWorkspace key={m.model.repository} entries={m.glossary.entries} onOpenEntry={m.openGlossaryEntry} model={m.caseModel} workspace={repositories[m.model.repository].workspace} onOperation={m.openOperation} /> : m.model.section === 'runs' ? <RunsWorkspace model={m.runModel} onCreate={m.openCreateRun} onReport={m.openReport} /> : m.model.section === 'automation' ? <AutomationWorkspace key={m.model.repository} model={m.automation} /> : m.model.section === 'glossary' ? <GlossaryWorkspace model={m.glossaryModel} /> : <GitWorkspace model={m.model} onAction={m.onGitAction} />}
    <NavigationDialog model={m.navigation} />
    {m.reportSource && <ReportPreview source={m.reportSource} onClose={m.closeReport} />}
    <CaseOperationDialog model={m.operations} folders={m.cases.folders} />
    {m.showCreateRun && <CreateRunDialog cases={m.cases.cases} blocked={m.blocked} onClose={m.closeCreateRun} onCreate={m.runs.createRun} />}
    {m.showStates && <LayoutStatesDialog state={m.state} onSelect={m.chooseState} onClose={m.closeStates} onRestart={m.restartDemo} />}
    {m.showInit && <InitializeDialog onClose={m.closeInit} onSuccess={m.initialize} />}
    {m.gitAction && <GitActionDialog key={m.gitAction.type} action={m.gitAction} model={m.model} onClose={m.closeGitAction} onAbort={m.resetState} />}
  </div>;
}

