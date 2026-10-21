import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateChiokoData } from './chioko-migration';

const roots: string[] = [];
async function repo() { const root = await mkdtemp(join(tmpdir(), 'chioko-migration-')); roots.push(root); return root; }
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe('Chioko data migration', () => {
  it('moves data and rewrites glossary links, execution paths and snapshots without touching dependencies or Git', async () => {
    const root = await repo();
    await mkdir(join(root, '.casewright', 'runs'), { recursive: true });
    await mkdir(join(root, 'cases'));
    await mkdir(join(root, 'node_modules'));
    await mkdir(join(root, '.git'));
    await writeFile(join(root, '.casewright', 'runs', 'run.json'), '{"file":".casewright/runs/run","result":"fail"}');
    await writeFile(join(root, 'cases', 'case.md'), '[dev](../.casewright/glossary/record.md)');
    await writeFile(join(root, 'node_modules', 'external.md'), '.casewright');
    await writeFile(join(root, '.git', 'config'), '.casewright');
    expect(await migrateChiokoData(root)).toBe(true);
    expect(await readFile(join(root, '.ch', 'runs', 'run.json'), 'utf8')).toBe('{"file":".ch/runs/run","result":"fail"}');
    expect(await readFile(join(root, 'cases', 'case.md'), 'utf8')).toBe('[dev](../.ch/glossary/record.md)');
    expect(await readFile(join(root, 'node_modules', 'external.md'), 'utf8')).toBe('.casewright');
    expect(await readFile(join(root, '.git', 'config'), 'utf8')).toBe('.casewright');
    expect(await readdir(root)).not.toContain('.casewright');
    expect(await migrateChiokoData(root)).toBe(false);
  });
  it('refuses to combine old and new data directories', async () => {
    const root = await repo();
    await mkdir(join(root, '.casewright')); await mkdir(join(root, '.ch'));
    await writeFile(join(root, '.casewright', 'config.yaml'), 'name: old');
    await expect(migrateChiokoData(root)).rejects.toThrow('both');
    expect(await readFile(join(root, '.casewright', 'config.yaml'), 'utf8')).toBe('name: old');
  });
  it('does not create data in an unrelated repository', async () => {
    const root = await repo();
    expect(await migrateChiokoData(root)).toBe(false);
    expect(await readdir(root)).toEqual([]);
  });
  it('resumes interrupted reference rewriting after the folder was renamed', async () => {
    const root = await repo();
    await mkdir(join(root, '.ch'));
    await writeFile(join(root, '.ch', '.migration-paths.json'), JSON.stringify(['case.md']));
    await writeFile(join(root, 'case.md'), '[x](.casewright/glossary/id.md)');
    expect(await migrateChiokoData(root)).toBe(true);
    expect(await readFile(join(root, 'case.md'), 'utf8')).toBe('[x](.ch/glossary/id.md)');
    expect(await readdir(join(root, '.ch'))).not.toContain('.migration-paths.json');
  });
  it('rejects an untrusted journal targeting Git metadata or escaping the repository', async () => {
    const root = await repo();
    await mkdir(join(root, '.ch'));
    for (const rel of ['../outside.md', '.git/refs/value.md', '.git\\refs\\value.md']) {
      await writeFile(join(root, '.ch', '.migration-paths.json'), JSON.stringify([rel]));
      await expect(migrateChiokoData(root)).rejects.toThrow('Invalid');
    }
  });
});
