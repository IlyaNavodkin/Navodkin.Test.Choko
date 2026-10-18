import { useEffect, useState, type ReactNode } from 'react';
import { I } from '@/components/icons';
import { Logo } from '@/components/Logo';
import { Button, Modal, ModalBody, ModalFooter, ModalHeader, Tag } from '@/components/ui';
import { openExternal, runtimeVersions } from '@/lib/nwjs';
import { repoInfo, type RepoInfo } from '@/services/git';
import { useApp } from '@/store/app-store';

export const GITHUB_URL = 'https://github.com/jimbuck/casewright';
export const WEBSITE_URL = 'https://casewright.dev/';
export const DOCS_URL = `${WEBSITE_URL}docs`;

const baseName = (p: string): string => p.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || 'repository';

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-[88px] shrink-0 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-faint">
        {label}
      </span>
      <span className="min-w-0 flex-1 text-[12.5px] text-ink">{children}</span>
    </div>
  );
}

function Copyable({ value, onCopy }: { value: string; onCopy: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 align-bottom">
      <span className="truncate font-mono text-[12px] text-ink-2">{value}</span>
      <button
        className="grid size-[18px] shrink-0 place-items-center rounded-sm text-ink-faint hover:bg-raise hover:text-ink"
        title="Copy"
        onClick={onCopy}
      >
        {I.copy({ size: 12 })}
      </button>
    </span>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 mt-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-faint">{children}</div>
  );
}

const updateLabel: Record<string, string | null> = {
  idle: null,
  checking: 'Checking…',
  available: 'Update available',
  downloading: 'Downloading…',
  ready: 'Update ready',
  unsupported: 'Update available',
  error: 'Check failed',
};

export function AboutModal() {
  const { repoPath, branch, ahead, behind, changes, workspaces, setModal, toast } = useApp();
  const { updateStatus, updateVersion, checkForUpdate } = useApp();
  const close = () => setModal(null);
  const updateText = updateStatus === 'idle' ? null : `${updateLabel[updateStatus] ?? ''}${updateVersion ? ` · v${updateVersion}` : ''}`;
  const [info, setInfo] = useState<RepoInfo | null>(null);

  useEffect(() => {
    if (!repoPath) return;
    let alive = true;
    repoInfo(repoPath)
      .then((r) => {
        if (alive) setInfo(r);
      })
      .catch(() => {
        /* not in NW.js / not a repo — show what we have */
      });
    return () => {
      alive = false;
    };
  }, [repoPath]);

  const rt = runtimeVersions();
  const copy = (label: string, value: string) => {
    navigator.clipboard
      ?.writeText(value)
      .then(() => toast(`Copied ${label}`))
      .catch(() => {});
  };

  const dirty = changes.length;
  const identity = info && (info.userName || info.userEmail);

  return (
    <Modal onClose={close} maxWidth={520}>
      <ModalHeader>
        <Logo size={26} className="rounded-[6px]" />
        <h3>Casewright</h3>
        <Tag className="ml-auto font-mono">v{__APP_VERSION__}</Tag>
      </ModalHeader>
      <ModalBody className="flex flex-col gap-4">
        <p className="m-0 text-[12.5px] leading-relaxed text-ink-2">
          A bespoke editor for manual test cases — the Git repository is the data store.
          <span className="text-ink-faint"> Local-first · no telemetry · MIT licensed.</span>
        </p>

        <div className="rounded-md border border-border bg-panel-2 px-3.5 py-3">
          <SectionLabel>Repository</SectionLabel>
          <div className="flex flex-col gap-1.5">
            <InfoRow label="Name">{baseName(repoPath)}</InfoRow>
            <InfoRow label="Path">
              <Copyable value={repoPath} onCopy={() => copy('path', repoPath)} />
            </InfoRow>
            <InfoRow label="Branch">
              <span className="inline-flex items-center gap-1.5 font-mono text-[12px]">
                {I.branch({ size: 13 })}
                {branch}
                {(ahead > 0 || behind > 0) && (
                  <span className="text-ink-3">
                    {behind > 0 ? `↓${behind}` : ''} {ahead > 0 ? `↑${ahead}` : ''}
                  </span>
                )}
                <span className="text-ink-faint">· {dirty ? `${dirty} uncommitted` : 'clean'}</span>
              </span>
            </InfoRow>
            <InfoRow label="Workspaces">{workspaces.length}</InfoRow>
            {info?.describe && (
              <InfoRow label="Version">
                <span className="font-mono text-[12px] text-ink-2">{info.describe}</span>
              </InfoRow>
            )}
            {info?.remote && (
              <InfoRow label="Remote">
                <Copyable value={info.remote} onCopy={() => copy('remote URL', info.remote)} />
              </InfoRow>
            )}
            <InfoRow label="Author">
              {identity ? (
                <span className="inline-flex flex-wrap items-baseline gap-1.5">
                  <span>{info?.userName || '—'}</span>
                  {info?.userEmail && (
                    <Copyable value={info.userEmail} onCopy={() => copy('email', info.userEmail)} />
                  )}
                </span>
              ) : (
                <span className="text-ink-faint">Git identity not configured</span>
              )}
            </InfoRow>
          </div>
        </div>

        {(rt.nw || rt.chromium || rt.node) && (
          <div className="rounded-md border border-border bg-panel-2 px-3.5 py-3">
            <SectionLabel>Runtime</SectionLabel>
            <div className="flex flex-col gap-1.5">
              {rt.nw && <InfoRow label="NW.js">{rt.nw}</InfoRow>}
              {rt.chromium && <InfoRow label="Chromium">{rt.chromium}</InfoRow>}
              {rt.node && <InfoRow label="Node">{rt.node}</InfoRow>}
            </div>
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={() => openExternal(GITHUB_URL)}>
          {I.link({ size: 14 })} GitHub
        </Button>
        <Button
          variant="ghost"
          className="mr-auto"
          disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
          onClick={() => void checkForUpdate()}
        >
          {I.sync({ size: 14 })} Check for updates
        </Button>
        {updateText && <span className="text-[11.5px] text-ink-faint">{updateText}</span>}
        <Button variant="primary" onClick={close}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
}
