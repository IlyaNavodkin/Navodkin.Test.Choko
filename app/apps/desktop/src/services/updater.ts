/**
 * Self-update against GitHub Releases (Windows / NW.js only).
 *
 * Flow: poll the repo's latest *stable* release, and if it's newer than the
 * running build, hand back the matching installer asset. The store downloads it
 * in the background, then `runInstallerAndQuit` launches the silent installer
 * and quits so it can replace the locked `.exe` and relaunch (see the `[Run]`
 * entry in `build-resources/casewright.iss`).
 *
 * Portable (unzipped) builds can't replace themselves while running, so we only
 * auto-apply for installed builds — `isInstalledBuild` distinguishes the two and
 * portable users are pointed at the release page instead.
 */
import { node } from '@/lib/node';
import { execPath, quitApp } from '@/lib/nwjs';
import { isNewer } from '@/utils/semver';

const REPO = 'jimbuck/casewright';
const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;

/** The Inno per-user install directory: %LocalAppData%\Programs\Casewright. */
const INSTALL_SUBPATH = ['AppData', 'Local', 'Programs', 'Casewright'];

export interface UpdateInfo {
  /** Latest version, tag without the leading `v` (e.g. "0.2.0"). */
  version: string;
  /** Download URL for the `Casewright-Setup-<v>.exe` asset, or null if absent. */
  setupUrl: string | null;
  /** The release page (shown to portable users who can't auto-apply). */
  htmlUrl: string;
}

interface GithubRelease {
  tag_name: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; browser_download_url: string }[];
}

/**
 * Fetch the latest stable release and return its info when it's newer than
 * `currentVersion`. Returns null when up to date or the latest is a draft/prerelease.
 */
export async function fetchLatestUpdate(currentVersion: string): Promise<UpdateInfo | null> {
  const res = await fetch(LATEST_RELEASE_API, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub API responded ${res.status}`);
  const rel = (await res.json()) as GithubRelease;
  if (rel.draft || rel.prerelease) return null; // stable channel only

  const version = rel.tag_name.replace(/^v/, '');
  if (!isNewer(version, currentVersion)) return null;

  const setup = rel.assets.find((a) => /^Casewright-Setup-.*\.exe$/i.test(a.name));
  return { version, setupUrl: setup?.browser_download_url ?? null, htmlUrl: rel.html_url };
}

/**
 * True when the running app is an installed (Inno) build that can self-update,
 * false for a portable unzip. Two independent signals; either one is conclusive:
 *   1. an `unins000.exe` next to the executable (deterministic for Inno installs)
 *   2. the executable lives under %LocalAppData%\Programs\Casewright
 */
export async function isInstalledBuild(): Promise<boolean> {
  const exe = execPath();
  if (!exe) return false;
  const path = node.path();
  const dir = path.dirname(exe);

  const uninstaller = path.join(dir, 'unins000.exe');
  const hasUninstaller = await node
    .fsp()
    .access(uninstaller)
    .then(() => true)
    .catch(() => false);
  if (hasUninstaller) return true;

  const installDir = path.join(node.os().homedir(), ...INSTALL_SUBPATH);
  return path.normalize(dir).toLowerCase().startsWith(path.normalize(installDir).toLowerCase());
}

/**
 * Download the installer to the OS temp directory, reporting 0..100 progress when
 * the server sends a content-length. Streams each chunk straight to a `.part` file
 * (never buffering the whole — potentially large — installer in memory) and renames
 * on completion, so a half-written installer can never be launched. A prior download
 * is cleared first, since Windows can't rename onto an existing file.
 */
export async function downloadInstaller(
  url: string,
  version: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const path = node.path();
  const fsp = node.fsp();
  const dest = path.join(node.os().tmpdir(), `Casewright-Setup-${version}.exe`);
  const part = `${dest}.part`;

  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);

  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const handle = await fsp.open(part, 'w');
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await handle.write(value);
      received += value.length;
      if (total && onProgress) onProgress(Math.round((received / total) * 100));
    }
  } catch (err) {
    await handle.close().catch(() => {});
    await fsp.rm(part, { force: true }).catch(() => {});
    throw err;
  }
  await handle.close();

  await fsp.rm(dest, { force: true }).catch(() => {}); // Windows rename won't overwrite
  await fsp.rename(part, dest);
  return dest;
}

/**
 * Launch the downloaded installer silently and quit the app so Windows releases
 * the executable's file lock. The installer closes any straggler instance
 * (`/CLOSEAPPLICATIONS`), overwrites the install, and relaunches us via its
 * `WizardSilent` `[Run]` entry. The short delay gives the child time to start
 * before we exit.
 */
export function runInstallerAndQuit(installerPath: string): void {
  const child = node
    .childProcess()
    .spawn(
      installerPath,
      ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CLOSEAPPLICATIONS', '/RESTARTAPPLICATIONS', '/NOICONS'],
      { detached: true, stdio: 'ignore' },
    );
  child.unref();
  setTimeout(quitApp, 150);
}
