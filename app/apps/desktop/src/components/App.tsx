import { useEffect, useState } from 'react';
import { useApp, useAppStore } from '@/store/app-store';
import { isNwjs } from '@/lib/nwjs';
import { I } from './icons';
import { Button } from './ui';
import { TitleBar } from './chrome/TitleBar';
import { TopBar } from './chrome/TopBar';
import { Toasts } from './chrome/Toasts';
import { UpdateBanner } from './chrome/UpdateBanner';
import { Launcher } from './launcher/Launcher';
import { Sidebar } from './sidebar/Sidebar';
import { ModuleNav } from './sidebar/ModuleNav';
import { CaseEditor } from './editor/CaseEditor';
import { RunsList } from './runs/RunsList';
import { RunGrid } from './runs/RunGrid';
import { RunAutomationPage } from './runs/RunAutomationPage';
import { RunGuide } from './guide/RunGuide';
import { CreateRunModal } from './runs/CreateRunModal';
import { AddCasesModal } from './runs/AddCasesModal';
import { CommitModal } from './common/CommitModal';
import { WorkspaceModal } from './common/WorkspaceModal';
import { AboutModal } from './common/AboutModal';
import { AppDialog } from './common/AppDialog';
import { EmptyCenter } from './common/EmptyCenter';
import { MergeResolver } from './merge/MergeResolver';
import { SuiteSummary } from './summary/SuiteSummary';
import { ReferenceBook } from './reference/ReferenceBook';
import { ReferencePickerHost } from './reference/ReferencePicker';
import { AutomationBook } from './automation/AutomationBook';
import { activeRuns } from '@/services/automation/lifecycle';
import { closeAfterRunsSettle } from '@/services/automation/quit-guard';
import { nwWindow } from '@/lib/nwjs';

function Center() {
  const { view, sel } = useApp();
  if (view === 'automation') return <AutomationBook />;
  if (view === 'glossary') return <ReferenceBook />;
  if (view === 'suite') return <SuiteSummary />;
  if (view === 'runs') return <RunsList />;
  if (view === 'runAutomation') return <RunAutomationPage />;
  if (view === 'guide') return <RunGuide />;
  if (view === 'run') return <RunGrid />;
  if (sel.id) return <CaseEditor />;
  return <EmptyCenter />;
}

function Workbench() {
  const { screen, view, modal, workspace, mergeBanner, abortMerge } = useApp();
  const [casesSidebarOpen, setCasesSidebarOpen] = useState(true);
  const casesActive = view === 'editor' || view === 'suite';
  const projectOpen = screen !== 'launcher' && !!workspace;

  return (
    <div className="flex h-full overflow-hidden bg-panel">
      {projectOpen && <ModuleNav casesSidebarOpen={casesSidebarOpen} onToggleCases={() => setCasesSidebarOpen((open) => !open)} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="brand-chrome">
          <TitleBar />
          {projectOpen && <TopBar />}
        </header>
        {screen === 'launcher' || !workspace ? (
          <Launcher />
        ) : (
          <>
            {mergeBanner && (
              <div className="flex items-center gap-3 border-b border-[oklch(0.85_0.07_80)] bg-blocked-soft px-4 py-2 text-[12.5px] text-[oklch(0.5_0.12_66)]">
                <span className="shrink-0">{I.warn({ size: 14 })}</span>
                <span className="flex-1">{mergeBanner}</span>
                <Button size="sm" className="shrink-0" onClick={() => void abortMerge()}>
                  Abort merge
                </Button>
              </div>
            )}
            <UpdateBanner />
            <div className="flex min-h-0 flex-1">
              <Sidebar hidden={!casesActive || !casesSidebarOpen} onHide={() => setCasesSidebarOpen(false)} />
              <Center />
            </div>
            {modal === 'commit' && <CommitModal />}
            {modal === 'workspace' && <WorkspaceModal />}
            {modal === 'createRun' && <CreateRunModal />}
            {modal === 'addCases' && <AddCasesModal />}
            {modal === 'about' && <AboutModal />}
            {modal === 'merge' && <MergeResolver />}
            {modal === 'refPicker' && <ReferencePickerHost />}
            <Toasts />
          </>
        )}
        <AppDialog />
      </div>
    </div>
  );
}

export function App() {
  // The launcher loads recent projects; opening a project is an explicit user action.

  // An unsaved reference-book draft lives in memory only, so closing the window would lose
  // it silently — ask first (the browser/NW.js shows its own confirm for a non-null return).
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!useAppStore.getState().refDirty) return;
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Orderly quit: stop in-flight Playwright runs and wait (bounded) for their terminal state to be
  // saved, so the next open does not show a phantom "running" execution. An installed 'close'
  // listener suppresses NW.js's default close, so every path must call close(true) explicitly.
  useEffect(() => {
    if (!isNwjs()) return;
    const win = nwWindow();
    if (!win) return;
    let closing = false;
    const onClose = () => {
      if (closing) return;
      closing = true;
      void closeAfterRunsSettle({
        runs: activeRuns,
        close: () => win.close(true),
        onTimeout: (pending) => useAppStore.getState().toast(`${pending} autotest run(s) did not stop in time; closing anyway.`),
      });
    };
    win.on('close', onClose);
    return () => win.removeListener('close', onClose);
  }, []);

  // Poll GitHub for a newer release: once shortly after launch (off the critical
  // path), then on a slow interval. No-ops outside NW.js (dev preview / browser).
  const checkForUpdate = useAppStore((s) => s.checkForUpdate);
  useEffect(() => {
    if (!isNwjs()) return;
    const first = setTimeout(() => void checkForUpdate(), 8_000);
    const interval = setInterval(() => void checkForUpdate(), 6 * 60 * 60 * 1000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [checkForUpdate]);

  // Periodically `git fetch` so the Pull button's commits-behind badge stays current and the
  // user knows when they need to update before continuing. No-ops outside NW.js.
  const fetchRemote = useAppStore((s) => s.fetchRemote);
  useEffect(() => {
    if (!isNwjs()) return;
    const first = setTimeout(() => void fetchRemote(), 5_000);
    const interval = setInterval(() => void fetchRemote(), 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [fetchRemote]);

  return <Workbench />;
}
