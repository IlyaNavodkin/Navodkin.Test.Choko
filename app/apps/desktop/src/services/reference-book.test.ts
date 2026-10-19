import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReferenceEntry } from '@/schemas/reference-book';
import { wasSelfWrite } from './repo-self-write';
import { serializeReferenceEntry } from './format/reference-book';
import {
  GLOSSARY_DIR,
  ReferenceConflictError,
  ReferenceReadonlyError,
  ReferenceStaleError,
  loadGlossary,
  readGlossaryEntry,
  saveGlossaryEntry,
  setGlossaryArchived,
} from './reference-book';
import { RepoPathError, writeFileAtomic } from './repo-fs';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const REL = `${GLOSSARY_DIR}/${ID}.md`;

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});

async function mkRepo(prefix = 'testoritto-glossary-'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  cleanup.push(dir);
  return dir;
}

const sha = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex');

const entry = (patch: Partial<ReferenceEntry> = {}): ReferenceEntry => ({
  id: ID,
  kind: 'link',
  title: 'Payments runbook',
  aliases: ['payments'],
  archived: false,
  description: 'How to debug a stuck payment.',
  url: 'https://example.com/payments',
  ...patch,
});

describe('loadGlossary', () => {
  it('reads a repository without .testoritto/ as an empty catalog and writes nothing', async () => {
    const repo = await mkRepo();
    expect(await loadGlossary(repo)).toEqual({ docs: [], issues: [] });
    expect(await readdir(repo)).toEqual([]);
    await expect(stat(join(repo, '.testoritto'))).rejects.toThrow();
  });

  it('reports an unreadable glossary folder instead of throwing', async () => {
    const repo = await mkRepo();
    await writeFile(join(repo, '.testoritto'), 'not a directory');
    const load = await loadGlossary(repo);
    expect(load.docs).toEqual([]);
    expect(load.issues.map((i) => i.code)).toEqual(['glossary-read']);
  });

  it('skips non-regular files (symlinked folders, directories named *.md)', async () => {
    const repo = await mkRepo();
    await mkdir(join(repo, GLOSSARY_DIR, 'folder.md'), { recursive: true });
    const load = await loadGlossary(repo);
    expect(load.docs).toEqual([]);
    expect(load.issues.map((i) => i.code)).toEqual(['glossary-entry-skipped']);
  });

  it('carries the file facts a record needs — path, revision, line ending', async () => {
    const repo = await mkRepo();
    await mkdir(join(repo, GLOSSARY_DIR), { recursive: true });
    const text = serializeReferenceEntry(entry(), { eol: '\r\n' });
    await writeFile(join(repo, REL), text);
    const { docs } = await loadGlossary(repo);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ id: ID, rel: REL, readonly: false, eol: '\r\n' });
    expect(docs[0].revision).toBe(sha(text));
    expect(docs[0].entry).toEqual(entry());
  });
});

describe('readGlossaryEntry', () => {
  it('returns null for an absent record and for ids that could escape the folder', async () => {
    const repo = await mkRepo();
    expect(await readGlossaryEntry(repo, ID)).toBeNull();
    expect(await readGlossaryEntry(repo, '../outside')).toBeNull();
    expect(await readGlossaryEntry(repo, '..')).toBeNull();
    expect(await readGlossaryEntry(repo, 'a/b')).toBeNull();
  });
});

describe('saveGlossaryEntry', () => {
  it('creates the folder on the first explicit save, atomically and without temp leftovers', async () => {
    const repo = await mkRepo();
    const doc = await saveGlossaryEntry(repo, entry(), { kind: 'create' });
    expect(doc).toMatchObject({ id: ID, rel: REL, readonly: false });
    expect(doc.entry).toEqual(entry());
    expect(await readdir(join(repo, GLOSSARY_DIR))).toEqual([`${ID}.md`]);
    const text = await readFile(join(repo, REL), 'utf8');
    expect(doc.revision).toBe(sha(text));
    expect(text).toContain('title: Payments runbook');
  });

  it('marks the write as a self-write so the watcher ignores it', async () => {
    const repo = await mkRepo();
    const doc = await saveGlossaryEntry(repo, entry(), { kind: 'create' });
    expect(wasSelfWrite(doc.rel)).toBe(true);
  });

  it('refuses create when a record already exists, leaving it untouched', async () => {
    const repo = await mkRepo();
    await saveGlossaryEntry(repo, entry(), { kind: 'create' });
    await expect(saveGlossaryEntry(repo, entry({ title: 'Other' }), { kind: 'create' })).rejects.toBeInstanceOf(
      ReferenceConflictError,
    );
    expect((await readGlossaryEntry(repo, ID))?.entry.title).toBe('Payments runbook');
  });

  it('refuses replace when the file changed outside the app, and keeps the external content', async () => {
    const repo = await mkRepo();
    const doc = await saveGlossaryEntry(repo, entry(), { kind: 'create' });
    const external = serializeReferenceEntry(entry({ title: 'Edited elsewhere' }));
    await writeFile(join(repo, REL), external);
    await expect(
      saveGlossaryEntry(repo, entry({ title: 'Mine' }), { kind: 'replace', revision: doc.revision }),
    ).rejects.toBeInstanceOf(ReferenceStaleError);
    expect(await readFile(join(repo, REL), 'utf8')).toBe(external);
  });

  it('refuses replace when the file was deleted outside the app', async () => {
    const repo = await mkRepo();
    const doc = await saveGlossaryEntry(repo, entry(), { kind: 'create' });
    await rm(join(repo, REL));
    await expect(
      saveGlossaryEntry(repo, entry(), { kind: 'replace', revision: doc.revision }),
    ).rejects.toBeInstanceOf(ReferenceStaleError);
  });

  it('overwrites on an explicit force, and gives identical bytes the identical revision', async () => {
    const repo = await mkRepo();
    const first = await saveGlossaryEntry(repo, entry(), { kind: 'create' });
    const forced = await saveGlossaryEntry(repo, entry({ title: 'Mine' }), { kind: 'force' });
    expect(forced.entry.title).toBe('Mine');
    const again = await saveGlossaryEntry(repo, { ...forced.entry }, { kind: 'replace', revision: forced.revision });
    expect(again.revision).toBe(forced.revision);
    expect(again.revision).not.toBe(first.revision);
  });

  it('refuses ids that could escape the glossary folder or the repository', async () => {
    const repo = await mkRepo();
    for (const id of ['../evil', '..', '.', '', 'a/b', 'a\\b', 'with space']) {
      await expect(saveGlossaryEntry(repo, entry({ id }), { kind: 'create' })).rejects.toBeInstanceOf(RepoPathError);
    }
    expect(await readdir(repo)).toEqual([]);
  });

  it('refuses to write through a symlinked .testoritto/ (junction on Windows)', async () => {
    const repo = await mkRepo();
    const outside = await mkRepo('testoritto-outside-');
    await symlink(outside, join(repo, '.testoritto'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(saveGlossaryEntry(repo, entry(), { kind: 'create' })).rejects.toBeInstanceOf(RepoPathError);
    expect(await readdir(outside)).toEqual([]);
  });

  it('preserves unknown fields and the line ending across saves', async () => {
    const repo = await mkRepo();
    const extra = { priority: 2, meta: { team: 'payments', owners: ['a@b.c'] } };
    const doc = await saveGlossaryEntry(repo, entry(), { kind: 'create' }, { extra, eol: '\r\n' });
    expect(doc.extra).toEqual(extra);
    expect(doc.eol).toBe('\r\n');
    const renamed = await saveGlossaryEntry(
      repo,
      { ...doc.entry, title: 'Renamed' },
      { kind: 'replace', revision: doc.revision },
      { extra: doc.extra, eol: doc.eol },
    );
    expect(renamed.entry.title).toBe('Renamed');
    expect(renamed.extra).toEqual(extra);
    const text = await readFile(join(repo, REL), 'utf8');
    expect(text.split('\n').every((line) => line === '' || line.endsWith('\r'))).toBe(true);
  });
});

describe('setGlossaryArchived', () => {
  it('archives and restores without touching anything else', async () => {
    const repo = await mkRepo();
    const extra = { priority: 1 };
    const doc = await saveGlossaryEntry(repo, entry(), { kind: 'create' }, { extra });
    const archived = await setGlossaryArchived(repo, ID, true);
    expect(archived.entry.archived).toBe(true);
    expect(archived.entry.title).toBe(doc.entry.title);
    expect(archived.extra).toEqual(extra);
    expect((await loadGlossary(repo)).docs[0].entry.archived).toBe(true);

    const restored = await setGlossaryArchived(repo, ID, false);
    expect(restored.entry.archived).toBe(false);
  });

  it('never rewrites a record it could not parse', async () => {
    const repo = await mkRepo();
    await mkdir(join(repo, GLOSSARY_DIR), { recursive: true });
    const broken = `---\nschema_version: 1\nid: ${ID}\nkind: arguments\ntitle: dev\nvalues:\n  - key: retries\n    type: number\n    value: "three"\n---\nDev.\n`;
    await writeFile(join(repo, REL), broken);
    const { docs } = await loadGlossary(repo);
    expect(docs[0].readonly).toBe(true);
    await expect(setGlossaryArchived(repo, ID, true)).rejects.toBeInstanceOf(ReferenceReadonlyError);
    expect(await readFile(join(repo, REL), 'utf8')).toBe(broken);
  });

  it('reports a missing record', async () => {
    const repo = await mkRepo();
    await expect(setGlossaryArchived(repo, ID, true)).rejects.toThrow(/No reference record/);
  });
});

describe('writeFileAtomic containment', () => {
  it('rejects absolute and parent-traversing paths', async () => {
    const repo = await mkRepo();
    await expect(writeFileAtomic(repo, '../evil.md', 'x')).rejects.toBeInstanceOf(RepoPathError);
    await expect(writeFileAtomic(repo, 'a/../../evil.md', 'x')).rejects.toBeInstanceOf(RepoPathError);
    await expect(writeFileAtomic(repo, join(repo, 'abs.md'), 'x')).rejects.toBeInstanceOf(RepoPathError);
    expect(await readdir(repo)).toEqual([]);
  });
});
