import { I } from '@/components/icons';
import { Button } from '@/components/ui';
import { useApp } from '@/store/app-store';
import { useEffect } from 'react';
import { openRepositoryFolder } from '@/services/repository-folder';

const baseName = (p: string): string => p.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || 'repository';

export function TopBar() {
  const { workspace, workspaces, repoPath, branch, ahead, behind, changes, gitBusy, doPush, doPull, setModal,
    canNavigateBack, canNavigateForward, navigateBack, navigateForward, modal, refPicker, dialog, toast } = useApp();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || modal || refPicker || dialog) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        if (event.key === 'ArrowLeft') navigateBack();
        else navigateForward();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigateBack, navigateForward, modal, refPicker, dialog]);
  const dirty = changes.length;
  if (!workspace) return null;
  const repoName = baseName(repoPath);

  return (
    <div className="flex h-[46px] flex-none items-center gap-2.5 border-b border-border bg-panel-2 px-3">
      <nav aria-label="Navigation history" className="flex shrink-0 gap-0.5 border-r border-border pr-2">
        <Button variant="ghost" size="sm" aria-label="Go back" title="Go back (Alt+Left)" disabled={!canNavigateBack || !!modal || !!dialog || !!refPicker} onClick={navigateBack}>
          {I.back({ size: 16 })}
        </Button>
        <Button variant="ghost" size="sm" aria-label="Go forward" title="Go forward (Alt+Right)" disabled={!canNavigateForward || !!modal || !!dialog || !!refPicker} onClick={navigateForward}>
          {I.chevron({ size: 16 })}
        </Button>
      </nav>
      <div className="flex min-w-0 items-baseline gap-2" title={`${workspaces.length} workspace(s) · .ch/`}>
        <span className="whitespace-nowrap font-semibold">{repoName}</span>
        <span className="whitespace-nowrap font-mono text-[12px] text-ink-3">
          {workspaces.length} workspace{workspaces.length === 1 ? '' : 's'}
        </span>
      </div>

      <Button variant="ghost" size="sm" aria-label="Open Git repository folder" title={`Open Git repository folder · ${repoPath}`}
        onClick={() => void openRepositoryFolder(repoPath).catch((error: unknown) => toast(error instanceof Error ? error.message : String(error)))}>
        {I.folderOpen({ size: 16 })}
      </Button>

      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-panel px-[9px] py-[3px] font-mono text-[12px] text-ink-2">
        {I.branch({ size: 13 })}
        {branch}
        {ahead || behind ? (
          <span className={'inline-flex items-center gap-0.5' + (dirty ? ' text-blocked' : '')}>
            {behind ? <span>↓{behind}</span> : null}
            {ahead ? <span>↑{ahead}</span> : null}
          </span>
        ) : null}
        {dirty ? (
          <span className="inline-flex items-center gap-0.5 text-blocked" title={dirty + ' uncommitted file(s)'}>
            <span className="size-[7px] rounded-full bg-blocked" />
            {dirty}
          </span>
        ) : null}
      </span>

      <div className="ml-auto flex items-center gap-[7px]">
        <Button
          onClick={doPull}
          disabled={gitBusy}
          title={
            behind
              ? `Pull ${behind} commit${behind > 1 ? 's' : ''} waiting on origin/${branch}`
              : `Up to date with origin/${branch}`
          }
        >
          {I.pull({ size: 15 })}Pull
          {behind ? (
            <span className="inline-grid h-4 min-w-4 place-items-center rounded-full bg-blocked-soft px-[5px] font-mono text-[10.5px] font-semibold text-[oklch(0.5_0.12_66)]">
              {behind}
            </span>
          ) : null}
        </Button>
        <Button onClick={() => setModal('commit')} disabled={gitBusy}>
          {I.commit({ size: 15 })}Commit
          {dirty ? (
            <span className="inline-grid h-4 min-w-4 place-items-center rounded-full bg-accent-soft px-[5px] font-mono text-[10.5px] font-semibold text-accent-ink">
              {dirty}
            </span>
          ) : null}
        </Button>
        <Button variant="primary" onClick={doPush} disabled={!ahead || gitBusy}>
          {I.push({ size: 15 })}Push
          {ahead ? (
            <span className="inline-grid h-4 min-w-4 place-items-center rounded-full bg-[oklch(1_0_0/0.22)] px-[5px] font-mono text-[10.5px] font-semibold text-white">
              {ahead}
            </span>
          ) : null}
        </Button>
      </div>
    </div>
  );
}
