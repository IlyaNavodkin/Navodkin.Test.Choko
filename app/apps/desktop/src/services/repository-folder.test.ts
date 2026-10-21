import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openRepositoryFolder } from './repository-folder';

let repo: string;
const openItem = vi.fn();
beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'choko repo folder '));
  await mkdir(join(repo, '.git'));
  openItem.mockClear();
  vi.stubGlobal('window', { nw: { Shell: { openItem } } });
});
afterEach(async () => { vi.unstubAllGlobals(); await rm(repo, { recursive: true, force: true }); });

it('opens the repository root without requiring any case/documentation directories', async () => {
  await openRepositoryFolder(repo);
  expect(openItem).toHaveBeenCalledExactlyOnceWith(repo);
});
it('opens the root even when case documents are nested in another folder', async () => {
  await mkdir(join(repo, 'areas', 'web-tools'), { recursive: true });
  await openRepositoryFolder(repo);
  expect(openItem).toHaveBeenCalledExactlyOnceWith(repo);
});
it('supports worktrees whose .git marker is a file', async () => {
  await rm(join(repo, '.git'), { recursive: true });
  await writeFile(join(repo, '.git'), 'gitdir: ../shared-repo/worktrees/example');
  await openRepositoryFolder(repo);
  expect(openItem).toHaveBeenCalledExactlyOnceWith(repo);
});
it('refuses files, missing folders, empty paths, and non-repository folders', async () => {
  await writeFile(join(repo, 'script.cmd'), 'echo test');
  await mkdir(join(repo, 'documents'));
  await expect(openRepositoryFolder(join(repo, 'script.cmd'))).rejects.toThrow('not a directory');
  await expect(openRepositoryFolder(join(repo, 'documents'))).rejects.toThrow('Git repository');
  await expect(openRepositoryFolder(join(repo, 'missing'))).rejects.toThrow();
  await expect(openRepositoryFolder('')).rejects.toThrow('No repository');
  expect(openItem).not.toHaveBeenCalled();
});
it('explains that opening folders is available in the desktop app', async () => {
  vi.stubGlobal('window', {});
  await expect(openRepositoryFolder(repo)).rejects.toThrow('desktop app');
});
