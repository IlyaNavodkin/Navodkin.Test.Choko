import { isNwjs, openExternal } from '@/lib/nwjs';
import { downloadInstaller, fetchLatestUpdate, isInstalledBuild, runInstallerAndQuit } from '@/services/updater';
import type { AppState, StoreGet, StoreSet } from '../app-store';

// ---------------------------------------------------------------------------
// GitHub-release auto-update (Windows / NW.js only). Polls for a newer release
// and, for installed builds, background-downloads the installer so the user can
// relaunch into it; portable/unsupported builds just link to the release page.
// ---------------------------------------------------------------------------

type UpdatesSlice = Pick<
  AppState,
  | 'updateStatus'
  | 'updateVersion'
  | 'updateProgress'
  | 'updateReleaseUrl'
  | 'checkForUpdate'
  | 'relaunchToUpdate'
  | 'openReleasePage'
>;

export function createUpdatesSlice(set: StoreSet, get: StoreGet): UpdatesSlice {
  // Path of the installer downloaded by `checkForUpdate`, handed to `relaunchToUpdate`.
  let downloadedInstaller: string | null = null;

  return {
    updateStatus: 'idle',
    updateVersion: null,
    updateProgress: 0,
    updateReleaseUrl: null,

    checkForUpdate: async () => {
      if (!isNwjs()) return; // dev preview / browser — nothing to update
      // Skip when a check is in flight or an update is already surfaced — re-polling would
      // re-download the (unchanging) installer and could clobber the "ready"/link banner on a
      // transient failure. A fresh check resumes after a restart, or from the 'error'/'idle' states.
      if (['checking', 'downloading', 'ready', 'unsupported'].includes(get().updateStatus)) return;
      set({ updateStatus: 'checking' });
      try {
        const info = await fetchLatestUpdate(__APP_VERSION__);
        if (!info) {
          set({ updateStatus: 'idle', updateVersion: null, updateReleaseUrl: null });
          return;
        }
        set({ updateStatus: 'available', updateVersion: info.version, updateReleaseUrl: info.htmlUrl });
        // Only installed builds can self-apply; portable builds just link to the release.
        const installable = info.setupUrl != null && (await isInstalledBuild());
        if (!installable) {
          set({ updateStatus: 'unsupported' });
          return;
        }
        set({ updateStatus: 'downloading', updateProgress: 0 });
        try {
          downloadedInstaller = await downloadInstaller(info.setupUrl!, info.version, (pct) =>
            set({ updateProgress: pct }),
          );
          set({ updateStatus: 'ready' });
        } catch {
          // Download failed — fall back to the manual release-page path.
          downloadedInstaller = null;
          set({ updateStatus: 'unsupported' });
        }
      } catch {
        // Network/API hiccup — stay quiet (no startup toast spam); retry next interval.
        set({ updateStatus: 'error' });
      }
    },

    relaunchToUpdate: () => {
      if (!downloadedInstaller) return;
      runInstallerAndQuit(downloadedInstaller);
    },

    openReleasePage: () => {
      const url = get().updateReleaseUrl;
      if (url) openExternal(url);
    },
  };
}
