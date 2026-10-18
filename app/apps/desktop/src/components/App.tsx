import { useEffect } from 'react';
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
import { CaseEditor } from './editor/CaseEditor';
import { RunsList } from './runs/RunsList';
import { RunGrid } from './runs/RunGrid';
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

function Center() {
  const { view, sel } = useApp();
  if (view === 'suite') return <SuiteSummary />;
  if (view === 'runs') return <RunsList />;
  if (view === 'guide') return <RunGuide />;
  if (view === 'run') return <RunGrid />;
  if (sel.id) return <CaseEditor />;
  return <EmptyCenter />;
}

function Workbench() {
  const { screen, modal, workspace, mergeBanner, abortMerge } = useApp();

  return (
    <div className="flex h-full flex-col overflow-hidden bg-panel">
      <TitleBar />
      {screen === 'launcher' || !workspace ? (
        <Launcher />
      ) : (
        <>
          <TopBar />
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
            <div className="flex min-h-0 flex-1">
              <Sidebar />
              <Center />
            </div>
          </div>
          {modal === 'commit' && <CommitModal />}
          {modal === 'workspace' && <WorkspaceModal />}
          {modal === 'createRun' && <CreateRunModal />}
          {modal === 'addCases' && <AddCasesModal />}
          {modal === 'about' && <AboutModal />}
          {modal === 'merge' && <MergeResolver />}
          <Toasts />
        </>
      )}
      <AppDialog />
    </div>
  );
}

export function App() {
  // On launch, reopen the most recently used repository so the user lands back where they
  // left off (the launcher only shows when there is no recent repo, or outside the desktop app).
  const autoReopen = useAppStore((s) => s.autoReopen);
  useEffect(() => {
    void autoReopen();
  }, [autoReopen]);

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
