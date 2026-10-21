import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { node } from '@/lib/node';
import { openRepo, loadRepo } from './repo';
import { createProject, initializeProject } from './project';

const roots: string[] = [];
async function parent() { const root = await mkdtemp(join(tmpdir(), 'choko-project-')); roots.push(root); return root; }
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe('project setup', () => {
  it('creates a named local Git project with a ready first workspace and no remote', async () => {
    const base = await parent();
    const root = await createProject({ name: 'Магазин', parentPath: base });
    expect(root).toBe(join(base, 'Магазин'));
    const git = node.simpleGit()(root);
    expect(await git.checkIsRepo()).toBe(true);
    expect(await git.getRemotes()).toEqual([]);
    const opened = await openRepo(root);
    expect(opened.needsInit).toBe(false);
    expect(opened.workspaces).toHaveLength(1);
    expect(opened.workspaces[0]).toMatchObject({ name: 'Магазин', path: '', prefix: 'QA' });
    expect((await loadRepo(root, opened.workspaces)).cases).toEqual([]);
  });
  it('never reuses an existing folder or changes its files', async () => {
    const base = await parent(); const root = join(base, 'Existing');
    await mkdir(root); await writeFile(join(root, 'notes.md'), 'Keep this.');
    await expect(createProject({ name: 'Existing', parentPath: base })).rejects.toThrow();
    expect(await readFile(join(root, 'notes.md'), 'utf8')).toBe('Keep this.');
    expect(await readdir(root)).toEqual(['notes.md']);
  });
  it('rejects folder traversal and invalid Windows names before writing anything', async () => {
    const base = await parent();
    for (const name of ['', '..', '../escape', 'a\\b', 'CON', 'bad.', 'bad:name']) {
      await expect(createProject({ name, parentPath: base })).rejects.toThrow();
    }
    expect(await readdir(base)).toEqual([]);
  });
  it('offers setup for an ordinary folder, then adds Choko without changing its documents', async () => {
    const root = await parent(); await writeFile(join(root, 'notes.md'), 'Keep this.');
    expect((await openRepo(root)).needsInit).toBe(true);
    await initializeProject(root);
    expect(await readFile(join(root, 'notes.md'), 'utf8')).toBe('Keep this.');
    expect((await openRepo(root)).workspaces).toHaveLength(1);
  });
  it('leaves an already configured project unchanged', async () => {
    const root = await createProject({ name: 'Existing', parentPath: await parent() });
    const file = join(root, '.ch', 'config.yaml');
    const before = await readFile(file, 'utf8');
    await initializeProject(root);
    expect(await readFile(file, 'utf8')).toBe(before);
  });
  it('repairs an empty workspace list through setup rather than asking users to edit YAML', async () => {
    const root = await parent(); await node.simpleGit()(root).init();
    await mkdir(join(root, '.ch')); await writeFile(join(root, '.ch', 'config.yaml'), 'version: 1\nname: Payments\nworkspaces: []\n');
    await initializeProject(root);
    expect((await openRepo(root)).workspaces[0].name).toBe('Payments');
  });
  it('refuses to initialize a subfolder of another Git repository', async () => {
    const root = await parent(); await node.simpleGit()(root).init();
    const child = join(root, 'child'); await mkdir(child);
    await expect(initializeProject(child)).rejects.toThrow();
    expect(await readdir(child)).toEqual([]);
  });
  it('refuses to create inside another Git project before making a folder', async () => {
    const root = await parent(); await node.simpleGit()(root).init();
    await expect(createProject({ name: 'Nested', parentPath: root })).rejects.toThrow();
    expect(await readdir(root)).toEqual(['.git']);
  });
});
