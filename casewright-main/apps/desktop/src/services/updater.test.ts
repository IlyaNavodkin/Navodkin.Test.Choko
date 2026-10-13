import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { win32 as winPath } from 'node:path';

// Control the executable path (install-vs-portable detection reads it).
let mockExePath: string | null = null;
vi.mock('@/lib/nwjs', () => ({
  execPath: () => mockExePath,
  quitApp: vi.fn(),
}));

// Back path/os with the real node modules, but keep fsp.access controllable so we
// can simulate the presence/absence of the Inno uninstaller.
let uninstallerExists = false;
vi.mock('@/lib/node', () => ({
  node: {
    path: () => winPath,
    os: () => ({ homedir: () => 'C:\\Users\\tester' }),
    fsp: () => ({
      access: (p: string) =>
        uninstallerExists && p.endsWith('unins000.exe') ? Promise.resolve() : Promise.reject(new Error('ENOENT')),
    }),
    childProcess: () => ({ spawn: vi.fn(() => ({ unref: vi.fn() })) }),
  },
}));

import { fetchLatestUpdate, isInstalledBuild } from './updater';

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response)),
  );
}

const release = (over: Partial<Record<string, unknown>> = {}) => ({
  tag_name: 'v0.2.0',
  html_url: 'https://github.com/jimbuck/casewright/releases/tag/v0.2.0',
  draft: false,
  prerelease: false,
  assets: [
    { name: 'Casewright-Setup-0.2.0.exe', browser_download_url: 'https://example/Casewright-Setup-0.2.0.exe' },
    { name: 'Casewright-0.2.0-win-x64.zip', browser_download_url: 'https://example/Casewright-0.2.0-win-x64.zip' },
  ],
  ...over,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('fetchLatestUpdate', () => {
  it('returns the newer version and its Setup asset URL', async () => {
    mockFetchOnce(release());
    const info = await fetchLatestUpdate('0.1.0');
    expect(info).toEqual({
      version: '0.2.0',
      setupUrl: 'https://example/Casewright-Setup-0.2.0.exe',
      htmlUrl: 'https://github.com/jimbuck/casewright/releases/tag/v0.2.0',
    });
  });

  it('returns null when already up to date or older', async () => {
    mockFetchOnce(release({ tag_name: 'v0.1.0' }));
    expect(await fetchLatestUpdate('0.1.0')).toBeNull();
    mockFetchOnce(release({ tag_name: 'v0.1.0' }));
    expect(await fetchLatestUpdate('0.2.0')).toBeNull();
  });

  it('ignores drafts and prereleases', async () => {
    mockFetchOnce(release({ draft: true }));
    expect(await fetchLatestUpdate('0.1.0')).toBeNull();
    mockFetchOnce(release({ prerelease: true }));
    expect(await fetchLatestUpdate('0.1.0')).toBeNull();
  });

  it('reports a null setupUrl when no installer asset is published', async () => {
    mockFetchOnce(
      release({
        assets: [{ name: 'Casewright-0.2.0-win-x64.zip', browser_download_url: 'https://example/portable.zip' }],
      }),
    );
    const info = await fetchLatestUpdate('0.1.0');
    expect(info?.version).toBe('0.2.0');
    expect(info?.setupUrl).toBeNull();
  });

  it('throws when the API call fails', async () => {
    mockFetchOnce({}, false, 503);
    await expect(fetchLatestUpdate('0.1.0')).rejects.toThrow('503');
  });
});

describe('isInstalledBuild', () => {
  beforeEach(() => {
    uninstallerExists = false;
    mockExePath = null;
  });

  it('is true when an Inno uninstaller sits next to the exe', async () => {
    mockExePath = 'D:\\Somewhere\\Portable\\Casewright.exe';
    uninstallerExists = true;
    expect(await isInstalledBuild()).toBe(true);
  });

  it('is true when running from the per-user install directory', async () => {
    mockExePath = 'C:\\Users\\tester\\AppData\\Local\\Programs\\Casewright\\Casewright.exe';
    expect(await isInstalledBuild()).toBe(true);
  });

  it('is false for a portable unzip outside the install dir', async () => {
    mockExePath = 'D:\\Downloads\\casewright-portable\\Casewright.exe';
    expect(await isInstalledBuild()).toBe(false);
  });

  it('is false when the executable path is unknown', async () => {
    mockExePath = null;
    expect(await isInstalledBuild()).toBe(false);
  });
});
