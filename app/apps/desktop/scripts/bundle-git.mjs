import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

// Official Git for Windows MinGit, pinned with its release-asset SHA-256.
export const MINGIT = {
  version: '2.56.0.2',
  url: 'https://github.com/git-for-windows/git/releases/download/v2.56.0.windows.2/MinGit-2.56.0.2-64-bit.zip',
  sha256: 'da35e72aa21c005a5a0d298cfbae110bc1609a815730ea0dde84b01a1b3cd3be',
};
export function verifyGitArchive(bytes) {
  if (createHash('sha256').update(bytes).digest('hex') !== MINGIT.sha256) throw new Error('MinGit archive checksum mismatch. Packaging stopped.');
}
export async function ensureBundledGit(cacheDir) {
  if (process.platform !== 'win32') throw new Error('Windows packaging requires Windows to extract MinGit.');
  const root = resolve(cacheDir, `mingit-${MINGIT.version}`);
  const archive = join(resolve(cacheDir), `mingit-${MINGIT.version}.zip`);
  mkdirSync(cacheDir, { recursive: true });
  if (!existsSync(archive)) {
    console.log(`  • downloading official MinGit ${MINGIT.version}`);
    const response = await fetch(MINGIT.url);
    if (!response.ok) throw new Error(`MinGit download failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    verifyGitArchive(bytes);
    writeFileSync(archive, bytes);
  }
  verifyGitArchive(readFileSync(archive));
  if (!existsSync(join(root, 'cmd', 'git.exe'))) {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command',
      'Expand-Archive -LiteralPath $env:CHOKO_GIT_ARCHIVE -DestinationPath $env:CHOKO_GIT_TARGET -Force'], {
      windowsHide: true, stdio: 'inherit', env: { ...process.env, CHOKO_GIT_ARCHIVE: archive, CHOKO_GIT_TARGET: root },
    });
    if (result.status !== 0) throw new Error('MinGit extraction failed.');
  }
  const binary = join(root, 'cmd', 'git.exe');
  const check = spawnSync(binary, ['--version'], { encoding: 'utf8', windowsHide: true });
  if (check.status !== 0) throw new Error('Bundled Git does not start.');
  console.log(`  ✓ ${check.stdout.trim()}`);
  writeFileSync(join(root, 'CHOKO-SOURCE.txt'), `Git for Windows ${MINGIT.version}\nBinary: ${MINGIT.url}\nCorresponding source and licenses: https://github.com/git-for-windows/git/tree/v2.56.0.windows.2\nOriginal licenses are included with this distribution.\n`);
  return root;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(await ensureBundledGit(resolve('.nwcache')));
}
