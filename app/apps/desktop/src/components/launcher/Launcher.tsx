import { useEffect } from 'react';
import { I } from '@/components/icons';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui';
import { useApp } from '@/store/app-store';

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!then || Number.isNaN(then)) return '';
  const s = Math.floor((Date.now() - then) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m > 1 ? 's' : ''} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d > 1 ? 's' : ''} ago`;
  const w = Math.floor(d / 7);
  return `${w} week${w > 1 ? 's' : ''} ago`;
}

const repoName = (p: string): string => p.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || p;

export function Launcher() {
  const { openRepo, recents, loadRecents, loading, needsInit, emptyRepo, initRepo, repoPath } = useApp();

  useEffect(() => {
    void loadRecents();
  }, [loadRecents]);

  return (
    <div className="flex min-h-0 flex-1 justify-center bg-bg">
      <div className="flex min-h-0 w-full max-w-[660px] flex-col px-8 py-[clamp(28px,6vh,64px)]">
        <div className="mb-7 flex flex-none items-center gap-3">
          <Logo size={38} className="shrink-0 rounded-xl shadow-[0_2px_10px_var(--shadow)]" />
          <span className="text-[21px] font-semibold tracking-[-0.01em]">Casewright</span>
        </div>

        {needsInit && (
          <div className="mb-5 flex-none rounded-lg border border-accent-line bg-accent-soft p-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold">{I.repo({ size: 15 })} Not a Casewright repository yet</div>
            <div className="mt-1.5 text-[12.5px] text-ink-3">
              <span className="font-mono">{repoName(repoPath)}</span> is a Git repo but has no{' '}
              <span className="font-mono">.casewright/</span> folder.
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="primary" disabled={loading} onClick={() => void initRepo()}>
                {I.plus({ size: 14 })} {loading ? 'Initializing…' : 'Initialize .casewright/'}
              </Button>
              <Button disabled={loading} onClick={() => void openRepo()}>
                Choose another folder
              </Button>
            </div>
          </div>
        )}
        {emptyRepo && (
          <div className="mb-5 flex-none rounded-lg border border-border bg-panel-2 p-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold">{I.layers({ size: 15 })} No workspaces yet</div>
            <div className="mt-1.5 text-[12.5px] text-ink-3">
              <span className="font-mono">{repoName(repoPath)}</span> has a <span className="font-mono">.casewright/</span> folder but no
              workspaces. Add a <span className="font-mono">casewright.yaml</span> to a folder to declare one, then reload.
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="primary" disabled={loading} onClick={() => void openRepo(repoPath)}>
                {loading ? 'Reloading…' : 'Reload'}
              </Button>
            </div>
          </div>
        )}

        <div className="mb-7 flex flex-none flex-wrap items-center gap-2.5">
          <Button variant="primary" disabled={loading} onClick={() => void openRepo()}>
            {I.folderOpen({ size: 15 })} {loading ? 'Opening…' : 'Open repository…'}
          </Button>
          <span className="text-[12.5px] text-ink-faint">or pick up where you left off</span>
        </div>

        <div className="mb-2 flex flex-none items-center justify-between px-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">Recent repositories</span>
          {recents.length > 0 && <span className="font-mono text-[11px] text-ink-faint">{recents.length}</span>}
        </div>
        <div className="-mx-2 flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-2">
          {recents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-[14px] py-12 text-center text-[12.5px] text-ink-faint">
              No recent repositories yet. Open one to get started.
            </div>
          ) : (
            recents.map((r) => (
              <button
                key={r.path}
                disabled={loading}
                className="flex items-center gap-[13px] rounded-lg border border-border bg-panel px-[15px] py-[13px] text-left transition hover:border-accent-line hover:bg-accent-soft active:translate-y-px disabled:opacity-50"
                onClick={() => void openRepo(r.path)}
              >
                <div className="grid size-[36px] shrink-0 place-items-center rounded-[8px] border border-border bg-sunken text-ink-2">
                  {I.repo({ size: 18 })}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold">{r.name}</div>
                  <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11.5px] text-ink-3">{r.path}</div>
                </div>
                <div className="shrink-0 text-right text-[11.5px] text-ink-3">
                  <div className="inline-flex items-center gap-1 font-mono text-ink-2">
                    {I.branch({ size: 12 })} {r.branch}
                  </div>
                  <div className="mt-1">
                    {r.workspaces} workspace{r.workspaces === 1 ? '' : 's'} · {timeAgo(r.lastOpened)}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
