import { Alert, Badge, Button, EmptyState, FileTree, Icon, IconNames, Input, LoadingState, Markdown, Modal, PageBrand, PageTopbar, PageTopbarActions, Select } from '@codaa/ui';
import type { FileTreeNode } from '@codaa/ui';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { useRuntimeDiagnostics } from '../../../desktop-platform/useCases/runtime-diagnostics/useRuntimeDiagnostics';
import type { CatalogEntry, RunResource, SuiteRecovery } from '../../api/contracts';
import { useBrowseRepository } from './useBrowseRepository';
import type { RepositorySelection } from './types';
import styles from './RepositoryBrowserPage.module.css';
import { GitInspection } from '../inspect-git/GitInspection';
import { RunOverview } from '../execute-run/RunOverview';
import { RunGuideNavigation } from '../execute-run/RunGuideNavigation';
import { useRunNavigation } from '../execute-run/useRunNavigation';
import { RunDetailsEditor } from '../edit-run/RunDetailsEditor';
import { RunCaseEditor } from '../edit-run-case/RunCaseEditor';
import { CaseEditor, type CaseEditorHandle } from '../edit-case/CaseEditor';
import { useDraftCloseGuard } from '../edit-case/useDraftCloseGuard';
import { useSearchCases, type CaseStatusFilter } from '../search-cases/useSearchCases';
import { OrganizeSuiteDialog, SuiteActionButtons, SuiteRecoveryNotice, type SuiteMode } from '../organize-suite/OrganizeSuiteDialog';
import { OrganizeCaseDialog } from '../organize-case/OrganizeCaseDialog';
import { CreateRunDialog } from '../create-run/CreateRunDialog';
import { CreateSuiteDialog } from '../create-suite/CreateSuiteDialog';
import { CreateCaseDialog } from '../create-case/CreateCaseDialog';
import { InitializeRepositoryDialog } from '../initialize-repository/InitializeRepositoryDialog';
import { AutomationPanel } from '../../../automation/useCases/manage-automation/AutomationPanel';

const caseStatusKeys = { draft: 'repository.caseStatus.draft', active: 'repository.caseStatus.active', deprecated: 'repository.caseStatus.deprecated' } as const;
const runStatusKeys = { open: 'repository.runStatus.open', closed: 'repository.runStatus.closed' } as const;
const resultKeys = { not_run: 'repository.runResult.not_run', pass: 'repository.runResult.pass', fail: 'repository.runResult.fail', blocked: 'repository.runResult.blocked', in_progress: 'repository.runResult.in_progress', skipped: 'repository.runResult.skipped' } as const;
const checkKeys = { none: 'repository.checkState.none', pass: 'repository.checkState.pass', fail: 'repository.checkState.fail' } as const;

export function RepositoryBrowserPage() {
  const { t, i18n } = useTranslation();
  const [gitBusy, setGitBusy] = useState(false);
  const [gitPending, setGitPending] = useState(false);
  const [editorBlocked, setEditorBlocked] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [creationPending, setCreationPending] = useState(false);
  const [suiteOperationMode, setSuiteOperationMode] = useState<SuiteMode | null>(null);
  const [suiteRecovery, setSuiteRecovery] = useState<{ sessionId: string; value: SuiteRecovery } | null>(null);
  const [suiteCreationOpen, setSuiteCreationOpen] = useState(false);
  const [runCreationOpen, setRunCreationOpen] = useState(false);
  const [operationMode, setOperationMode] = useState<'move' | 'delete' | 'rename' | null>(null);
  const [creationMode, setCreationMode] = useState<'new' | 'duplicate' | null>(null);
  const [initializationOpen, setInitializationOpen] = useState(false);
  const editorRef = useRef<CaseEditorHandle>(null);
  const browser = useBrowseRepository({ isNavigationBlocked: editorBlocked || gitBusy,
    isExternalRefreshBlocked: editorSaving || creationPending || creationMode !== null || suiteCreationOpen || suiteOperationMode !== null || operationMode !== null || runCreationOpen || initializationOpen,
  });
  const closeGuard = useDraftCloseGuard({ flush: browser.flush, blocked: gitBusy || editorBlocked || creationMode !== null || suiteCreationOpen || suiteOperationMode !== null || operationMode !== null || runCreationOpen || creationPending || browser.isOpening || browser.isClosing });
  useEffect(() => { if (!browser.repository?.needsInitialization) setInitializationOpen(false); }, [browser.repository?.needsInitialization]);
  const saveAndExit = async () => {
    if (gitPending || editorSaving || browser.isOpening || browser.isClosing) return;
    const saved = await editorRef.current?.save();
    if (saved) await closeGuard.confirmExit();
  };
  const diagnostics = useRuntimeDiagnostics({});
  const [tab, setTabState] = useState<'workspace' | 'runs' | 'git' | 'automation' | 'glossary'>('workspace');
  const changeTab = (value: 'workspace' | 'runs' | 'git' | 'automation' | 'glossary') => { if (!gitBusy && !editorBlocked && !creationPending) { setTabState(value); browser.select(null); } };
  const [gitFileCount, setGitFileCount] = useState<number | null>(null);
  useEffect(() => { setGitFileCount(null); }, [browser.repository?.sessionId]);
  const sections = [
    { value: 'workspace', label: t('repository.cases'), icon: IconNames.fileText },
    { value: 'runs', label: t('repository.runs'), icon: IconNames.play },
    { value: 'automation', label: t('automation.title'), icon: IconNames.play },
    { value: 'git', label: t('gitView.title'), icon: IconNames.gitBranch },
    { value: 'glossary', label: t('repository.glossary'), icon: IconNames.bookOpen },
  ] as const;

  const entries = browser.workspaceCatalog?.entries ?? [];
  const selectedCase = browser.selection?.kind === 'case' ? entries.find((entry) => entry.kind === 'case' && entry.metadata.resourceId === browser.selection?.resourceId) : undefined;
  const activeRecovery = suiteRecovery && suiteRecovery.sessionId === browser.repository?.sessionId ? suiteRecovery.value : null;
  const writeBlocked = Boolean(activeRecovery) || Boolean(browser.repository?.warnings.some((warning) => warning.code === 'SUITE_RECOVERY_REQUIRED'));
  const busy = browser.isBusy || creationPending || writeBlocked;
  const created = (path: string) => { browser.refreshWorkspace(path); search.reset(); };

  const search = useSearchCases({ entries, scope: `${browser.repository?.sessionId ?? ''}:${browser.workspacePath ?? ''}` });
  const treeNodes: FileTreeNode[] = tab === 'workspace' ? search.filteredEntries.map((entry) => toTreeNode(entry, t)) : [];
  const selectTreeNode = (node: FileTreeNode) => {
    if (creationPending) return;
    const item = entries.find((entry) => entry.kind === 'folder' ? entry.metadata.nodeId === node.id : entry.metadata.resourceId === node.id);
    if (!item) return;
    browser.select(item.kind === 'folder'
      ? { kind: 'folder', resourceId: item.metadata.nodeId }
      : { kind: 'case', resourceId: item.metadata.resourceId });
  };

  const selectedFolder = browser.selection?.kind === 'folder'
    ? entries.find((entry) => entry.kind === 'folder' && entry.metadata.nodeId === browser.selection?.resourceId)
    : undefined;
  const currentRun = browser.runsCatalog?.runs.find((run) => run.detailsResourceId === browser.selection?.resourceId || run.cases.some((item) => item.resourceId === browser.selection?.resourceId));
  const runNavigation = useRunNavigation({ sessionId: browser.repository?.sessionId, run: currentRun, selection: browser.selection, blocked: busy, select: browser.select });
  const setSelection = (selection: RepositorySelection) => browser.select(selection);

  return (
    <main className={styles.page}>
      <PageTopbar className={styles.topbar}>
        <PageBrand mark="T" title={t('app.name')} eyebrow={t('repository.title')} />
        {browser.repository && !browser.repository.needsInitialization ? <nav className={styles.nav} aria-label={t('repository.title')}>
          {sections.map((section) => <button key={section.value} type="button" aria-current={tab === section.value ? 'page' : undefined} onClick={() => changeTab(section.value)} disabled={gitBusy || editorBlocked || creationPending}>
            <Icon name={section.icon} size="sm" />{section.label}{section.value === 'git' && (gitFileCount ?? 0) > 0 ? <span className={styles.count}>{gitFileCount}</span> : null}
          </button>)}
        </nav> : null}
        <PageTopbarActions className={styles.topbarActions}>
          {browser.repository ? <Button variant="primary" onClick={browser.open} loading={browser.isOpening} disabled={!browser.isNativeRuntime || browser.isBusy || creationPending}>{t('repository.open')}</Button> : null}
          {browser.repository ? <Button onClick={browser.close} loading={browser.isClosing} disabled={browser.isBusy || creationPending}>{t('repository.close')}</Button> : null}
        </PageTopbarActions>
      </PageTopbar>

      {!browser.isNativeRuntime ? <Alert variant="warning"><strong>{t('repository.browserOnly')}</strong><p>{t('repository.chooseNative')}</p></Alert> : null}
      {editorBlocked ? <Alert variant="warning">{t(closeGuard.closeAttempted ? 'editor.closeBlocked' : 'editor.navigationBlocked')}</Alert> : null}
      {closeGuard.protectionFailed ? <Alert variant="danger">{t('editor.closeProtectionFailed')}</Alert> : null}
      {activeRecovery ? <SuiteRecoveryNotice recovery={activeRecovery} /> : null}
      {closeGuard.exitFailed ? <Alert variant="danger">{t('editor.exitFailed')}</Alert> : null}
      {browser.repository && (browser.externalChanges.pending || browser.externalChanges.healthFailed || browser.externalChanges.errorCode) ? <Alert variant="warning">
        <p>{t(browser.externalChanges.errorCode ? 'repository.externalReloadFailed' : browser.externalChanges.healthFailed ? 'repository.watcherFailed' : 'repository.externalPending')}</p>
        {browser.externalChanges.errorCode ? <p>{t(`repository.errors.${browser.externalChanges.errorCode}`)}</p> : null}
        <Button size="sm" disabled={busy || editorSaving || creationMode !== null || suiteCreationOpen || suiteOperationMode !== null || operationMode !== null || runCreationOpen || initializationOpen} onClick={browser.externalChanges.retry}>{t('repository.refresh')}</Button>
      </Alert> : null}
      {browser.errorCode ? <Alert variant="danger" className={styles.error}><strong>{t(browser.errorSource === 'close' ? 'repository.closeError' : browser.errorSource === 'recent' ? 'repository.openRecentError' : browser.errorSource === 'initialize' ? 'repository.initializeError' : 'repository.openError')}</strong><p>{t(`repository.errors.${browser.errorCode}`)}</p><Button size="sm" disabled={busy} onClick={browser.retryActionError}>{browser.errorSource === 'close' ? t('repository.close') : t('app.retry')}</Button></Alert> : null}

      {browser.isNativeRuntime && browser.repository ? <section className={styles.recents} aria-labelledby="recent-repositories-heading">
        <div className={styles.recentsHeader}><h2 id="recent-repositories-heading">{t('repository.recentTitle')}</h2><Button size="sm" onClick={browser.retryRecents} disabled={browser.isRecentsLoading || browser.isBusy}>{t('repository.refresh')}</Button></div>
        {browser.isRecentsLoading ? <LoadingState title={t('repository.loadingRecents')} /> : null}
        {browser.recentErrorCode ? <Alert variant="danger"><strong>{t('repository.recentError')}</strong><p>{t(`repository.errors.${browser.recentErrorCode}`)}</p><Button size="sm" onClick={browser.retryRecents}>{t('app.retry')}</Button></Alert> : null}
        {!browser.isRecentsLoading && !browser.recentErrorCode && browser.recentRepositories?.length ? <ul className={styles.recentList}>
          {browser.recentRepositories.map((recent) => <li key={recent.recentId}><button className={styles.recentItem} disabled={busy} onClick={() => browser.openRecent(recent.recentId)}>
            <strong>{recent.displayName}</strong><span>{formatRecentDate(recent.lastOpenedAtMs, i18n.language, t('repository.unknownDate'))}</span>
          </button></li>)}
        </ul> : null}
        {!browser.isRecentsLoading && !browser.recentErrorCode && browser.recentRepositories?.length === 0 ? <EmptyState title={t('repository.recentEmpty')} /> : null}
      </section> : null}

      {!browser.repository ? (
        <section className={styles.start}>
          <div className={styles.startHeading}>
            <p className={styles.eyebrow}>{t('repository.workspace')}</p>
            <h1>{t('repository.startTitle')}</h1>
            <p>{t('repository.noRepositoryDescription')}</p>
            <Button variant="primary" className={styles.openRepoButton} onClick={browser.open} loading={browser.isOpening} disabled={!browser.isNativeRuntime || browser.isBusy || creationPending} leadingIcon={<Icon name={IconNames.folderOpen} size="sm" />}>{t('repository.open')}</Button>
            <span className={styles.compatibility}>{t('repository.compatibleRepos')}</span>
          </div>
          {browser.isNativeRuntime ? <section className={styles.recents} aria-labelledby="recent-repositories-heading">
            <h2 id="recent-repositories-heading">{t('repository.recentTitle')}</h2>
            {browser.isRecentsLoading ? <LoadingState title={t('repository.loadingRecents')} /> : null}
            {browser.recentErrorCode ? <Alert variant="danger"><strong>{t('repository.recentError')}</strong><p>{t(`repository.errors.${browser.recentErrorCode}`)}</p><Button size="sm" onClick={browser.retryRecents}>{t('app.retry')}</Button></Alert> : null}
            {!browser.isRecentsLoading && !browser.recentErrorCode && browser.recentRepositories?.length ? <div>{browser.recentRepositories.map((recent) => <button className={styles.recent} key={recent.recentId} disabled={busy} onClick={() => browser.openRecent(recent.recentId)}>
              <Icon name={IconNames.folder} size="sm" /><span><strong>{recent.displayName}</strong><small>{formatRecentDate(recent.lastOpenedAtMs, i18n.language, t('repository.unknownDate'))}</small></span><span className={styles.recentMeta}>Git</span><Icon name={IconNames.chevronRight} size="sm" />
            </button>)}</div> : null}
            {!browser.isRecentsLoading && !browser.recentErrorCode && browser.recentRepositories?.length === 0 ? <EmptyState title={t('repository.recentEmpty')} /> : null}
          </section> : null}
        </section>
      ) : (
        <>
          <div className={styles.repoBar}><Button size="sm" disabled={busy || creationMode !== null || suiteCreationOpen || suiteOperationMode !== null || operationMode !== null || runCreationOpen || initializationOpen} onClick={browser.externalChanges.retry}>{t('repository.refreshAll')}</Button><div><h2>{browser.repository.displayName}</h2><span>{browser.repository.workspaces.length} {t('repository.workspace').toLocaleLowerCase()}</span></div><Badge variant={browser.repository.needsInitialization ? 'warning' : 'success'}>{browser.repository.needsInitialization ? t('repository.needsInitialization') : 'Git'}</Badge></div>
          {browser.repository.needsInitialization ? <Alert variant="info"><p>{t('repository.needsInitialization')}</p><Button onClick={() => setInitializationOpen(true)} disabled={busy}>{t('repository.initialize')}</Button></Alert> : null}
          <WarningList items={browser.repository.warnings} t={t} />
          {!browser.repository.needsInitialization ? <>
            {tab === 'automation' ? <AutomationPanel key={browser.repository.sessionId} sessionId={browser.repository.sessionId} runs={browser.runsCatalog} isRunsLoading={browser.isRunsLoading} runsErrorCode={browser.runsErrorCode} onRefreshRuns={browser.refreshRuns} blocked={writeBlocked || editorBlocked || creationPending || browser.isOpening || browser.isClosing} /> : tab === 'git' ? <GitInspection key={browser.repository.sessionId} sessionId={browser.repository.sessionId} blocked={writeBlocked || editorBlocked || creationPending || browser.isOpening || browser.isClosing} onBusyChange={setGitBusy} onPendingChange={setGitPending} onFileCountChange={setGitFileCount} onApplied={browser.applyGitResult} /> : tab === 'glossary' ? <section aria-label={t('repository.glossary')}><EmptyState title={t('repository.glossary')} description={t('repository.glossarySoon')} /></section> : <section className={styles.browser} aria-label={t('repository.title')}>
              <aside className={styles.sidebar}>
                {tab === 'workspace' ? <>
                  <label className={styles.workspaceLabel} htmlFor="workspace-select">{t('repository.workspace')}</label>
                  <Select id="workspace-select" aria-label={t('repository.workspace')} value={browser.workspacePath ?? ''} placeholder={browser.workspacePath === null ? t('repository.noAvailableWorkspace') : undefined} disabled={browser.workspacePath === null || browser.isBusy} options={browser.workspacePath === null ? [] : browser.repository.workspaces.map((workspace) => ({ value: workspace.path, label: workspace.name }))} onValueChange={browser.setWorkspacePath} />
                  {browser.preferenceErrorCode ? <Alert variant="warning"><p>{t('repository.preferenceSaveFailed')}</p><Button size="sm" onClick={browser.retryPreference}>{t('repository.retryWorkspaceSave')}</Button></Alert> : null}
                  <div className={styles.sidebarActions}><span>{t('repository.cases')}</span><Button size="sm" onClick={() => browser.refreshWorkspace()} disabled={browser.isWorkspaceLoading || busy} aria-label={t('repository.refresh')}>{t('repository.refresh')}</Button></div>
                  <Button size="sm" disabled={busy || browser.workspacePath === null || !browser.workspaceCatalog || browser.isWorkspaceLoading || Boolean(browser.workspaceErrorCode)} onClick={() => setRunCreationOpen(true)}>{t('runCreation.create')}</Button>
                  <div className={styles.caseActions}>
                    {selectedFolder?.kind === 'folder' ? <SuiteActionButtons disabled={busy || editorBlocked || editorSaving || browser.isWorkspaceLoading || Boolean(browser.workspaceErrorCode) || browser.externalChanges.pending} onSelect={setSuiteOperationMode} /> : null}
                    <Button size="sm" disabled={busy || browser.workspacePath === null || browser.isWorkspaceLoading || Boolean(browser.workspaceErrorCode)} onClick={() => setSuiteCreationOpen(true)}>{t('suiteCreation.create')}</Button>
                    <Button size="sm" disabled={busy || browser.workspacePath === null || browser.isWorkspaceLoading || Boolean(browser.workspaceErrorCode)} onClick={() => setCreationMode('new')}>{t('caseCreation.create')}</Button>
                    {selectedCase?.kind === 'case' ? <Button size="sm" disabled={busy || !browser.caseDocument?.model.id || !browser.caseDocument.revision} onClick={() => setCreationMode('duplicate')}>{t('caseCreation.duplicate')}</Button> : null}
                    {selectedCase?.kind === 'case' ? <><Button size="sm" disabled={busy || !browser.caseDocument?.model.id || !browser.caseDocument.revision} onClick={() => setOperationMode('rename')}>{t('caseOperations.rename')}</Button><Button size="sm" disabled={busy || !browser.caseDocument?.model.id || !browser.caseDocument.revision} onClick={() => setOperationMode('move')}>{t('caseOperations.move')}</Button><Button size="sm" variant="danger" disabled={busy || !browser.caseDocument?.model.id || !browser.caseDocument.revision} onClick={() => setOperationMode('delete')}>{t('caseOperations.delete')}</Button></> : null}
                  </div>
                  <div className={styles.filters}>
                    <label htmlFor="case-search">{t('repository.searchCases')}</label>
                    <Input id="case-search" value={search.filters.search} onChange={(event) => search.setSearch(event.target.value)} placeholder={t('repository.searchPlaceholder')} />
                    <label htmlFor="case-status-filter">{t('repository.status')}</label>
                    <Select id="case-status-filter" aria-label={t('repository.status')} value={search.filters.status} options={(['all', 'draft', 'active', 'deprecated'] as const).map((value) => ({ value, label: value === 'all' ? t('repository.allStatuses') : t(caseStatusKeys[value]) }))} onValueChange={(value) => search.setStatus(value as CaseStatusFilter)} />
                    <label htmlFor="case-tag-filter">{t('repository.tags')}</label>
                    <Input id="case-tag-filter" value={search.filters.tag} onChange={(event) => search.setTag(event.target.value)} />
                    {search.isFiltered ? <div role="status">{t('repository.matchCount', { count: search.matchCount })} <Button size="sm" onClick={search.reset}>{t('repository.resetFilters')}</Button></div> : null}
                  </div>
                  <WarningList items={browser.workspaceCatalog?.warnings ?? []} t={t} />
                  {browser.workspaceErrorCode ? <Alert variant="danger">{t(`repository.errors.${browser.workspaceErrorCode}`)} <Button size="sm" onClick={() => browser.refreshWorkspace()}>{t('repository.refresh')}</Button></Alert> : null}
                  {browser.workspacePath === null ? <EmptyState title={t('repository.noAvailableWorkspace')} /> : browser.isWorkspaceLoading ? <LoadingState title={t('repository.loadingCatalog')} /> : <FileTree aria-label={t('repository.cases')} nodes={treeNodes} selectedId={browser.selection?.kind === 'case' || browser.selection?.kind === 'folder' ? browser.selection.resourceId : null} defaultExpandedIds={entries.filter((entry) => entry.kind === 'folder').map((entry) => entry.metadata.nodeId)} onSelect={selectTreeNode} emptyLabel={t(search.isFiltered ? 'repository.noMatches' : 'repository.emptyCatalog')} />}
                </> : <>
                  <div className={styles.sidebarActions}><span>{t('repository.runs')}</span><Button size="sm" onClick={() => browser.refreshRuns()} disabled={browser.isRunsLoading || browser.isBusy}>{t('repository.refresh')}</Button></div>
                  <WarningList items={browser.runsCatalog?.warnings ?? []} t={t} />
                  {browser.runsErrorCode ? <Alert variant="danger">{t(`repository.errors.${browser.runsErrorCode}`)} <Button size="sm" onClick={() => browser.refreshRuns()}>{t('repository.refresh')}</Button></Alert> : null}
                  {browser.isRunsLoading ? <LoadingState title={t('repository.loadingCatalog')} /> : browser.runsCatalog?.runs.length ? <div className={styles.runList}>{browser.runsCatalog.runs.map((run) => <section key={run.runId} className={styles.runGroup}>
                    <button disabled={browser.isBusy} className={styles.runButton} onClick={() => setSelection(run.detailsResourceId ? { kind: 'run-details', resourceId: run.detailsResourceId } : run.cases[0] ? { kind: 'run-case', resourceId: run.cases[0].resourceId } : null)}>
                      <strong>{run.name}</strong><span>{run.testDate} · {t(runStatusKeys[run.status])}</span>
                    </button>
                    {run.cases.map((item) => <button key={item.resourceId} className={styles.sidecarButton} disabled={browser.isBusy} onClick={() => setSelection({ kind: 'run-case', resourceId: item.resourceId })}>{item.displayId} · {item.title}<Badge>{t(resultKeys[item.result])}</Badge></button>)}
                  </section>)}</div> : <EmptyState title={t('repository.emptyRuns')} />}
                </>}
              </aside>
              <section className={styles.reader} aria-live="polite">
                {currentRun ? runNavigation.isGuide ? <RunGuideNavigation navigation={runNavigation} total={currentRun.cases.length} blocked={busy} /> : <RunOverview key={`${browser.repository?.sessionId}:${currentRun.runId}`} run={currentRun} blocked={busy} onOpen={(resourceId) => browser.select({ kind: 'run-case', resourceId })} onGuide={runNavigation.begin} /> : null}
                {browser.isDocumentLoading ? <LoadingState title={t('repository.loadingDocument')} /> : null}
                {browser.documentErrorCode ? <Alert variant="danger">{t(`repository.errors.${browser.documentErrorCode}`)} <Button size="sm" onClick={() => browser.documentErrorCode === 'INVALID_RESOURCE' || browser.documentErrorCode === 'STALE_RESOURCE' ? (browser.selection?.kind === 'case' ? browser.refreshWorkspace() : browser.refreshRuns()) : browser.retryDocument()}>{t('app.retry')}</Button></Alert> : null}
                {selectedFolder?.kind === 'folder' ? <FolderReader entry={selectedFolder} t={t} /> : null}
                {browser.caseDocument && browser.selection?.kind === 'case' && browser.repository ? closeGuard.protectionFailed || writeBlocked ? <CaseReader model={browser.caseDocument.model} warnings={browser.caseDocument.warnings} t={t} /> : <CaseEditor ref={editorRef} key={`${browser.repository.sessionId}:${browser.selection.resourceId}`} document={browser.caseDocument} sessionId={browser.repository.sessionId} resourceId={browser.selection.resourceId} onBlockedChange={setEditorBlocked} onSavingChange={setEditorSaving} onDocumentChange={browser.updateCaseDocument}><CaseReader model={browser.caseDocument.model} warnings={browser.caseDocument.warnings} t={t} /></CaseEditor> : null}
                {browser.runDocument && browser.repository && browser.selection && !closeGuard.protectionFailed && !writeBlocked ? browser.runDocument.kind === 'case' ?
                  <RunCaseEditor guideMode={runNavigation.isGuide} onAdvance={runNavigation.saved} key={`${browser.repository.sessionId}:${browser.selection.resourceId}:${runNavigation.isGuide}` } ref={editorRef} document={browser.runDocument} sessionId={browser.repository.sessionId} resourceId={browser.selection.resourceId} onBlockedChange={setEditorBlocked} onSavingChange={setEditorSaving} onDocumentChange={browser.updateRunDocument}><RunReader key={browser.selection?.resourceId} resource={browser.runDocument} t={t} run={currentRun} /></RunCaseEditor> :
                  <RunDetailsEditor key={`${browser.repository.sessionId}:${browser.selection.resourceId}`} ref={editorRef} document={browser.runDocument} sessionId={browser.repository.sessionId} resourceId={browser.selection.resourceId} onBlockedChange={setEditorBlocked} onSavingChange={setEditorSaving} onDocumentChange={browser.updateRunDocument}><RunReader key={browser.selection?.resourceId} resource={browser.runDocument} t={t} run={currentRun} /></RunDetailsEditor> : browser.runDocument ? <RunReader key={browser.selection?.resourceId} resource={browser.runDocument} t={t} run={currentRun} /> : null}
                {!browser.isDocumentLoading && !selectedFolder && !browser.caseDocument && !browser.runDocument ? <EmptyState title={t('repository.selectItem')} description="" /> : null}
              </section>
            </section>}
          </> : null}
        </>
      )}
      <footer className={styles.footer}><span>{t('app.diagnosticsTitle')}: {diagnostics.diagnostics?.appVersion ?? (diagnostics.isLoading ? t('app.checking') : diagnostics.isNativeRuntime ? t('app.errorTitle') : t('app.unsupportedTitle'))}</span></footer>
      <Modal open={closeGuard.closeAttempted} onOpenChange={(open) => { if (!open && !editorSaving && !gitPending && !creationPending && !browser.isOpening && !browser.isClosing) closeGuard.cancelClose(); }} title={t('editor.closeTitle')} closeOnBackdrop={false}
        actions={<><Button disabled={closeGuard.isExiting || editorSaving || gitPending || creationPending || browser.isOpening || browser.isClosing} onClick={closeGuard.cancelClose}>{t('editor.keepEditing')}</Button>{!creationMode && !suiteCreationOpen && !suiteOperationMode && !operationMode && !runCreationOpen ? <Button variant="primary" loading={editorSaving} disabled={closeGuard.isExiting || gitPending || editorSaving || browser.isOpening || browser.isClosing || !editorRef.current} onClick={() => void saveAndExit()}>{t('editor.saveAndExit')}</Button> : null}<Button variant="danger" disabled={closeGuard.isExiting || gitPending || editorSaving || creationPending || browser.isOpening || browser.isClosing} onClick={() => void closeGuard.confirmExit()}>{t('editor.exitWithoutSaving')}</Button></>}>
        <p>{t(creationPending || browser.isOpening || browser.isClosing ? 'editor.operationPending' : suiteOperationMode ? 'suiteOperations.closeDescription' : suiteCreationOpen ? 'suiteCreation.closeDescription' : creationMode ? 'caseCreation.closeDescription' : operationMode ? 'caseOperations.closeDescription' : runCreationOpen ? 'runCreation.closeDescription' : 'editor.closeDescription')}</p><p>{browser.caseDocument?.model.displayId} · {browser.caseDocument?.model.title}</p>
      </Modal>
      {suiteOperationMode && browser.repository && browser.workspacePath !== null && selectedFolder?.kind === 'folder' ? <OrganizeSuiteDialog key={`${browser.repository.sessionId}:${selectedFolder.metadata.nodeId}:${suiteOperationMode}`} mode={suiteOperationMode}
        sessionId={browser.repository.sessionId} workspacePath={browser.workspacePath} resourceId={selectedFolder.metadata.nodeId} path={selectedFolder.metadata.path} initialParent={selectedFolder.metadata.parentResourceId} folders={entries}
        onCancel={() => setSuiteOperationMode(null)} onCompleted={(path) => { browser.refreshWorkspace(path ?? undefined, 'folder'); search.reset(); }} onRecovery={(value) => setSuiteRecovery({ sessionId: browser.repository!.sessionId, value })} onPendingChange={setCreationPending} /> : null}
      {suiteCreationOpen && browser.repository && browser.workspacePath !== null ? <CreateSuiteDialog key={`${browser.repository.sessionId}:${browser.workspacePath}`}
        sessionId={browser.repository.sessionId} workspacePath={browser.workspacePath} folders={entries}
        initialParent={selectedFolder?.kind === 'folder' ? selectedFolder.metadata.nodeId : selectedCase?.kind === 'case' ? selectedCase.metadata.parentResourceId : null}
        onCancel={() => setSuiteCreationOpen(false)} onCreated={(path) => { browser.refreshWorkspace(path, 'folder'); search.reset(); }} onPendingChange={setCreationPending} /> : null}
      {creationMode && browser.repository && browser.workspacePath !== null ? <CreateCaseDialog key={`${browser.repository.sessionId}:${creationMode}:${browser.workspacePath}`}
        sessionId={browser.repository.sessionId} workspacePath={browser.workspacePath} folders={entries}
        initialParent={selectedFolder?.kind === 'folder' ? selectedFolder.metadata.nodeId : selectedCase?.kind === 'case' ? selectedCase.metadata.parentResourceId : null}
        initialTitle={creationMode === 'duplicate' ? t('caseCreation.copyTitle', { title: browser.caseDocument?.model.title ?? '' }) : ''}
        source={creationMode === 'duplicate' && browser.selection?.kind === 'case' && browser.caseDocument?.revision ? { resourceId: browser.selection.resourceId, expectedRevision: browser.caseDocument.revision } : null}
        onCancel={() => setCreationMode(null)} onCreated={created} onPendingChange={setCreationPending} /> : null}
      {operationMode && browser.repository && browser.workspacePath !== null && selectedCase?.kind === 'case' && browser.caseDocument?.revision ? <OrganizeCaseDialog key={`${browser.repository.sessionId}:${selectedCase.metadata.resourceId}:${operationMode}`} mode={operationMode}
        sessionId={browser.repository.sessionId} workspacePath={browser.workspacePath} resourceId={selectedCase.metadata.resourceId} revision={browser.caseDocument.revision}
        path={selectedCase.metadata.path} initialParent={selectedCase.metadata.parentResourceId} folders={entries}
        onCancel={() => setOperationMode(null)} onCompleted={(path) => { browser.refreshWorkspace(path ?? undefined); search.reset(); }} onPendingChange={setCreationPending} /> : null}
      {runCreationOpen && browser.repository && browser.workspacePath !== null ? <CreateRunDialog key={`${browser.repository.sessionId}:${browser.workspacePath}`}
        sessionId={browser.repository.sessionId} workspacePath={browser.workspacePath} entries={entries} initialResourceId={browser.selection?.kind === 'case' ? browser.selection.resourceId : null}
        onCancel={() => setRunCreationOpen(false)} onCreated={(runId) => { setRunCreationOpen(false); setTabState('runs'); browser.refreshRuns(runId); }} onPendingChange={setCreationPending} /> : null}
      <InitializeRepositoryDialog open={initializationOpen} isPending={browser.isOpening} displayName={browser.repository?.displayName ?? ''} errorCode={browser.errorSource === 'initialize' ? browser.errorCode : null} onCancel={() => setInitializationOpen(false)} onConfirm={browser.initialize} />
    </main>
  );
}

function formatRecentDate(timestamp: number, locale: string, fallback: string): string {
  try {
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return fallback;
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  } catch {
    return fallback;
  }
}

function toTreeNode(entry: CatalogEntry, t: TFunction): FileTreeNode {
  if (entry.kind === 'folder') return { id: entry.metadata.nodeId, kind: 'folder', name: entry.metadata.name, parentId: entry.metadata.parentResourceId };
  const { displayId, title, status } = entry.metadata;
  return { id: entry.metadata.resourceId, kind: 'file', name: `${displayId} · ${title.trim() || t('repository.untitled')}`, parentId: entry.metadata.parentResourceId, meta: t(caseStatusKeys[status]) };
}

function FolderReader({ entry, t }: { entry: Extract<CatalogEntry, { kind: 'folder' }>; t: TFunction }) {
  return <article><p className={styles.eyebrow}>{t('repository.folder')}</p><h2>{entry.metadata.name}</h2><p>{t('suiteOperations.folderPath')}: <code>{entry.metadata.path}</code></p><dl className={styles.metadata}><dt>{t('repository.displayId')}</dt><dd>{entry.metadata.displayIdPrefix || '—'}</dd></dl>{entry.metadata.description ? <Markdown className={styles.readerMarkup} content={entry.metadata.description} /> : null}</article>;
}

function CaseReader({ model, warnings, t }: { model: import('../../api/contracts').CaseDocument['model']; warnings: import('../../api/contracts').CaseDocument['warnings']; t: TFunction }) {
  return <article>
    <p className={styles.eyebrow}>{t('repository.case')}</p><h2>{model.displayId ? `${model.displayId} · ${model.title.trim() || t('repository.untitled')}` : model.title.trim() || t('repository.untitled')}</h2>
    <dl className={styles.metadata}><dt>{t('repository.stableId')}</dt><dd>{model.id ?? '—'}</dd><dt>{t('repository.status')}</dt><dd>{t(caseStatusKeys[model.status])}</dd></dl>
    {!model.id || warnings.some((warning) => warning.code === 'missing-id' || warning.code === 'invalid-id') ? <Alert variant="warning">{t('repository.noId')}</Alert> : null}
    <WarningList items={warnings} t={t} />
    {model.tags.length ? <p className={styles.tags}>{t('repository.tags')}: {model.tags.join(', ')}</p> : null}
    <MarkdownSection title={t('repository.objective')} content={model.objective} />
    <MarkdownSection title={t('repository.systems')} content={model.systems.map((item) => `- ${item}`).join('\n')} />
    <MarkdownSection title={t('repository.setup')} content={model.setup.map((item) => `### ${item.name}\n\n${item.body}`).join('\n\n')} />
    <MarkdownSection title={t('repository.steps')} content={model.steps.map((item) => `${'  '.repeat(item.depth)}- ${item.text}`).join('\n')} />
    <MarkdownSection title={t('repository.acceptance')} content={model.acceptanceCriteria.map((item) => `- ${item}`).join('\n')} />
  </article>;
}

function RunReader({ resource, t, run }: { resource: RunResource; t: TFunction; run?: { name: string; testDate: string; created: string; status: 'open' | 'closed'; scope: string } }) {
  if (resource.kind === 'details') {
    const { model, warnings } = resource.document;
    return <article><p className={styles.eyebrow}>{t('repository.run')} · {t('repository.details')}</p><h2>{model.name || run?.name}</h2>
      <dl className={styles.metadata}><dt>{t('repository.status')}</dt><dd>{t(runStatusKeys[model.status])}</dd><dt>{t('repository.created')}</dt><dd>{model.created || run?.created || '—'}</dd><dt>{t('repository.testDate')}</dt><dd>{model.testDate || run?.testDate || '—'}</dd><dt>{t('repository.scope')}</dt><dd>{model.scope || run?.scope || '—'}</dd></dl>
      <Approval title={t('repository.testerApproval')} approval={model.testerApproval?.name ? `${model.testerApproval.name} · ${model.testerApproval.at}` : ''} />
      <Approval title={t('repository.reviewerApproval')} approval={model.reviewerApproval?.name ? `${model.reviewerApproval.name} · ${model.reviewerApproval.at}` : ''} />
      <WarningList items={warnings} t={t} />
      <MarkdownSection title={t('runDetailsEditor.summary')} content={model.summary} /><MarkdownSection title={t('repository.notes')} content={model.notes} />
    </article>;
  }
  const { model, warnings } = resource.document;
  return <article><p className={styles.eyebrow}>{t('repository.run')} · {t('repository.case')}</p><h2>{model.displayId} · {model.title.trim() || t('repository.untitled')}</h2>
    <dl className={styles.metadata}><dt>{t('repository.result')}</dt><dd>{t(resultKeys[model.result])}</dd><dt>{t('repository.tester')}</dt><dd>{model.tester || '—'}</dd><dt>{t('repository.executedAt')}</dt><dd>{model.executedAt || '—'}</dd><dt>{t('repository.testDate')}</dt><dd>{model.testDate ?? run?.testDate ?? '—'}</dd></dl>
    <WarningList items={warnings} t={t} />
    <Checklist title={t('repository.setup')} items={model.setup} t={t} /><Checklist title={t('repository.steps')} items={model.steps} t={t} /><Checklist title={t('repository.acceptance')} items={model.accept} t={t} />
    <MarkdownSection title={t('repository.notes')} content={model.notes} />
    {resource.document.snapshot ? <details><summary>{t('runCreation.snapshot')}</summary><CaseReader model={resource.document.snapshot.model} warnings={resource.document.snapshot.warnings} t={t} /></details> : null}
  </article>;
}

function MarkdownSection({ title, content }: { title: string; content: string }) {
  return content ? <section className={styles.contentSection}><h3>{title}</h3><Markdown className={styles.readerMarkup} content={content} /></section> : null;
}
function WarningList({ items, t }: { items: Array<{ code: string; message: string; path?: string; resourceId?: string; line?: number | null }>; t: TFunction }) {
  const [visible, setVisible] = useState(5);
  if (items.length === 0) return null;
  return <section className={styles.warningList} aria-label={t('repository.warning')}>
    <p>{t('repository.warning')}: {items.length}</p>
    {items.slice(0, visible).map((item, index) => <Alert key={`${item.code}-${item.path ?? item.resourceId ?? index}`} variant="warning"><strong>{item.path ?? (item.line ? `${t('repository.line')} ${item.line} · ${item.code}` : item.code)}</strong><span> — {item.message}</span></Alert>)}
    {items.length > 5 ? <Button size="sm" onClick={() => setVisible((count) => count >= items.length ? 5 : Math.min(count + 5, items.length))}>{visible >= items.length ? t('repository.showLess') : t('repository.showMore')}</Button> : null}
  </section>;
}
function Approval({ title, approval }: { title: string; approval: string }) { return approval ? <p className={styles.approval}><strong>{title}:</strong> {approval}</p> : null; }
function Checklist({ title, items, t }: { title: string; items: Array<{ key: string; text: string; state: 'none' | 'pass' | 'fail'; failNote: string }>; t: TFunction }) {
  return items.length ? <section className={styles.contentSection}><h3>{title}</h3><ul className={styles.checklist}>{items.map((item) => <li key={item.key}><Badge variant={item.state === 'fail' ? 'danger' : item.state === 'pass' ? 'success' : 'neutral'}>{t(checkKeys[item.state])}</Badge><span>{item.text}</span>{item.failNote ? <small>{item.failNote}</small> : null}</li>)}</ul></section> : null;
}

