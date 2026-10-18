import { I } from '@/components/icons';
import { Button } from '@/components/ui';
import { useApp } from '@/store/app-store';

const baseName = (p: string): string => p.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || 'repository';

export function TopBar() {
  const { workspace, workspaces, repoPath, branch, ahead, behind, changes, gitBusy, doPush, doPull, setModal } = useApp();
  const dirty = changes.length;
  if (!workspace) return null;
  const repoName = baseName(repoPath);

  return (
    <div className="flex h-[46px] flex-none items-center gap-2.5 border-b border-border bg-panel-2 px-3">
      <div className="flex min-w-0 items-baseline gap-2" title={`${workspaces.length} workspace(s) · .casewright/`}>
        <span className="whitespace-nowrap font-semibold">{repoName}</span>
        <span className="whitespace-nowrap font-mono text-[12px] text-ink-3">
          {workspaces.length} workspace{workspaces.length === 1 ? '' : 's'}
        </span>
      </div>

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
