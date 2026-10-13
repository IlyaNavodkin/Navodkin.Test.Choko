import { useApp } from '@/store/app-store';
import { I } from '../icons';
import { Button } from '../ui';

/**
 * A slim banner announcing a newer release — mirrors the merge banner in App.tsx
 * but uses the accent (informational) palette. Installed builds download in the
 * background and offer "Relaunch to Update"; portable builds link to the release.
 */
export function UpdateBanner() {
  const { updateStatus, updateVersion, updateProgress, relaunchToUpdate, openReleasePage } = useApp();

  const base =
    'flex items-center gap-3 border-b border-accent-line bg-accent-soft px-4 py-2 text-[12.5px] text-accent-ink';

  if (updateStatus === 'downloading') {
    return (
      <div className={base}>
        <span className="shrink-0">{I.pull({ size: 14 })}</span>
        <span className="flex-1">
          Downloading update v{updateVersion}… {updateProgress}%
        </span>
      </div>
    );
  }

  if (updateStatus === 'ready') {
    return (
      <div className={base}>
        <span className="shrink-0">{I.check({ size: 14 })}</span>
        <span className="flex-1">Update v{updateVersion} is ready to install.</span>
        <Button size="sm" variant="primary" className="shrink-0" onClick={relaunchToUpdate}>
          Relaunch to Update
        </Button>
      </div>
    );
  }

  // Portable build, or the download failed — offer the manual release page.
  if (updateStatus === 'unsupported') {
    return (
      <div className={base}>
        <span className="shrink-0">{I.link({ size: 14 })}</span>
        <span className="flex-1">Casewright v{updateVersion} is available.</span>
        <Button size="sm" className="shrink-0" onClick={openReleasePage}>
          Open release page
        </Button>
      </div>
    );
  }

  // idle / checking / available / error — nothing to show yet.
  return null;
}
