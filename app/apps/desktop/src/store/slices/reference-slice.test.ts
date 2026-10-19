import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../app-store';

const GLOSSARY = '.testoritto/glossary';
let repo = '';

const store = () => useAppStore.getState();
const cleanup: string[] = [];

/** A hand-written record file — how the app would find it after an external edit. */
const fileText = (id: string, title: string, extra = '') =>
  `---\nschema_version: 1\nid: ${id}\nkind: link\ntitle: ${title}\narchived: false\n---\nBody.\n${extra}`;

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'testoritto-store-'));
  cleanup.push(repo);
  useAppStore.setState({
    repoPath: repo,
    refs: [],
    refIssues: [],
    refSelId: null,
    refDraft: null,
    refDraftBase: null,
    refDirty: false,
    refSaveError: null,
    refPendingLeave: null,
    refQuery: '',
    refKindFilter: 'all',
    refShowArchived: false,
    toasts: [],
  });
});

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});

/** Save a link record through the store and return its id. */
async function saveLink(title: string, url = 'https://example.com'): Promise<string> {
  store().createRefEntry('link');
  store().editRefDraft({ title, url });
  expect(await store().saveRefEntry()).toBe(true);
  return store().refSelId as string;
}

describe('reference catalog', () => {
  it('reads an empty repository without writing anything', async () => {
    await store().loadRefs();
    expect(store().refs).toEqual([]);
    expect(store().refIssues).toEqual([]);
    expect(await readdir(repo)).toEqual([]);
  });

  it('creates the record only on an explicit save', async () => {
    store().createRefEntry('link');
    expect(store().refDirty).toBe(false); // a pristine new record is not "unsaved changes" yet
    store().editRefDraft({ title: 'Payments runbook', url: 'https://example.com/payments' });
    expect(store().refDirty).toBe(true);
    expect(await readdir(repo)).toEqual([]); // still nothing on disk

    expect(await store().saveRefEntry()).toBe(true);
    const s = store();
    expect(s.refDirty).toBe(false);
    expect(s.refSaveError).toBeNull();
    expect(s.refs).toHaveLength(1);
    expect(s.refs[0].entry).toMatchObject({ kind: 'link', title: 'Payments runbook' });
    expect(s.refDraftBase).toBe(s.refs[0].revision);
    expect(await readdir(join(repo, GLOSSARY))).toHaveLength(1);
  });

  it('saves a typed arguments set and keeps every value type', async () => {
    store().createRefEntry('arguments');
    store().editRefDraft({ title: 'dev', description: 'Dev environment values.' });
    store().addRefValue();
    store().editRefValue(0, { key: 'retries', type: 'number', value: 3 });
    store().addRefValue();
    store().editRefValue(1, { key: 'env', type: 'enum', value: 'dev', options: ['dev', 'stage'] });
    expect(await store().saveRefEntry()).toBe(true);
    expect(store().refs[0].entry.values).toEqual([
      { key: 'retries', type: 'number', value: 3 },
      { key: 'env', type: 'enum', value: 'dev', options: ['dev', 'stage'] },
    ]);
  });

  it('never writes while selecting or switching records', async () => {
    const first = await saveLink('Alpha');
    const second = await saveLink('Beta');
    const dir = join(repo, GLOSSARY);
    const before = (await readdir(dir)).sort();
    const mtimes = await Promise.all(before.map(async (f) => (await stat(join(dir, f))).mtimeMs));

    store().selectRefEntry(first);
    store().selectRefEntry(second);
    store().selectRefEntry(first);

    expect((await readdir(dir)).sort()).toEqual(before);
    expect(await Promise.all(before.map(async (f) => (await stat(join(dir, f))).mtimeMs))).toEqual(mtimes);
    expect(store().refDraft?.title).toBe('Alpha');
  });

  it('derives dirty state from the saved record, so undoing an edit clears it', async () => {
    const id = await saveLink('Alpha');
    store().editRefDraft({ title: 'Changed' });
    expect(store().refDirty).toBe(true);
    store().editRefDraft({ title: 'Alpha' });
    expect(store().refDirty).toBe(false);
    expect(store().refSelId).toBe(id);
  });
});

describe('save failures', () => {
  it('keeps the draft and reports field errors without writing', async () => {
    store().createRefEntry('arguments');
    store().editRefDraft({ title: 'dev', description: 'Dev values.' });
    store().addRefValue();
    store().editRefValue(0, { key: 'host', type: 'string', value: 'dev' });
    store().addRefValue();
    store().editRefValue(1, { key: 'host', type: 'string', value: 'stage' });

    expect(await store().saveRefEntry()).toBe(false);
    const error = store().refSaveError;
    expect(error?.kind).toBe('fields');
    expect(error?.kind === 'fields' && error.issues).toEqual([{ field: 'values', index: 1, message: 'duplicate key "host"' }]);
    expect(store().refDirty).toBe(true);
    expect(store().refDraft?.values).toHaveLength(2);
    expect(await readdir(repo)).toEqual([]);
  });

  it('refuses to clobber a record changed outside the app, then overwrites on request', async () => {
    const id = await saveLink('Alpha');
    const rel = store().refs[0].rel;
    const external = fileText(id, 'Edited elsewhere');
    await writeFile(join(repo, rel), external);

    store().editRefDraft({ title: 'Mine' });
    expect(await store().saveRefEntry()).toBe(false);
    expect(store().refSaveError?.kind).toBe('conflict');
    expect(store().refDirty).toBe(true);
    expect(store().refDraft?.title).toBe('Mine'); // the draft is kept for the decision
    expect(await readFile(join(repo, rel), 'utf8')).toBe(external);

    expect(await store().saveRefEntry({ force: true })).toBe(true);
    expect(store().refSaveError).toBeNull();
    expect(await readFile(join(repo, rel), 'utf8')).toContain('title: Mine');
    expect(store().refs[0].entry.title).toBe('Mine');
  });

  it('replaces the draft with what is on disk when the user reloads', async () => {
    const id = await saveLink('Alpha');
    const rel = store().refs[0].rel;
    await writeFile(join(repo, rel), fileText(id, 'Edited elsewhere'));
    store().editRefDraft({ title: 'Mine' });
    expect(await store().saveRefEntry()).toBe(false);

    await store().reloadRefEntry();
    expect(store().refDraft?.title).toBe('Edited elsewhere');
    expect(store().refDirty).toBe(false);
    expect(store().refSaveError).toBeNull();
  });
});

describe('draft protection', () => {
  it('parks navigation until the user stays, saves or discards', async () => {
    await saveLink('Alpha');

    /* stay */
    store().editRefDraft({ title: 'Changed' });
    let proceeded = 0;
    expect(store().guardRefLeave('a case', () => proceeded++)).toBe(false);
    expect(store().refPendingLeave?.label).toBe('a case');
    await store().resolveRefLeave('stay');
    expect(proceeded).toBe(0);
    expect(store().refDirty).toBe(true);
    expect(store().refDraft?.title).toBe('Changed');

    /* discard */
    expect(store().guardRefLeave('a case', () => proceeded++)).toBe(false);
    await store().resolveRefLeave('discard');
    expect(proceeded).toBe(1);
    expect(store().refDirty).toBe(false);
    expect(store().refDraft?.title).toBe('Alpha');

    /* save */
    store().editRefDraft({ title: 'Changed' });
    expect(store().guardRefLeave('a run', () => proceeded++)).toBe(false);
    await store().resolveRefLeave('save');
    expect(proceeded).toBe(2);
    expect(store().refDirty).toBe(false);
    expect(store().refs[0].entry.title).toBe('Changed');
    expect(store().refPendingLeave).toBeNull();
  });

  it('does not resume navigation when the save it offered fails', async () => {
    await saveLink('Alpha');
    store().editRefDraft({ title: '' }); // invalid
    let proceeded = false;
    expect(store().guardRefLeave('a case', () => (proceeded = true))).toBe(false);
    await store().resolveRefLeave('save');
    expect(proceeded).toBe(false);
    expect(store().refSaveError?.kind).toBe('fields');
    expect(store().refDraft?.title).toBe('');
  });

  it('lets navigation through when nothing is dirty', () => {
    let proceeded = false;
    expect(store().guardRefLeave('a case', () => (proceeded = true))).toBe(true);
    expect(proceeded).toBe(false); // the caller proceeds; the guard only reports
    expect(store().refPendingLeave).toBeNull();
  });
});

describe('archive and external catalog changes', () => {
  it('archives and restores through the store', async () => {
    const id = await saveLink('Alpha');
    await store().setRefArchived(id, true);
    expect(store().refs[0].entry.archived).toBe(true);
    await store().setRefArchived(id, false);
    expect(store().refs[0].entry.archived).toBe(false);
  });

  it('keeps the open draft in step when the selected record is archived', async () => {
    const id = await saveLink('Alpha');
    store().selectRefEntry(id);
    await store().setRefArchived(id, true);
    expect(store().refDraft?.archived).toBe(true);
    expect(store().refDirty).toBe(false);
    expect(store().refDraftBase).toBe(store().refs[0].revision);
  });

  it('shows an unparseable record as read-only and refuses to change it', async () => {
    await mkdir(join(repo, GLOSSARY), { recursive: true });
    const broken = `---\nschema_version: 1\nid: broken\nkind: arguments\ntitle: dev\nvalues:\n  - key: retries\n    type: number\n    value: "three"\n---\nDev.\n`;
    await writeFile(join(repo, GLOSSARY, 'broken.md'), broken);
    await store().loadRefs();
    expect(store().refs[0].readonly).toBe(true);
    expect(store().refs[0].issues[0].code).toBe('value-type');

    await store().setRefArchived('broken', true);
    expect(store().refs[0].entry.archived).toBe(false);
    expect(await readFile(join(repo, GLOSSARY, 'broken.md'), 'utf8')).toBe(broken);
    expect(store().toasts.at(-1)?.msg).toMatch(/retries/);
  });

  it('reloads a catalog changed outside the app without touching a dirty draft', async () => {
    const id = await saveLink('Alpha');
    store().editRefDraft({ title: 'Mine' });
    await writeFile(join(repo, GLOSSARY, 'outside.md'), fileText('outside', 'Beta'));

    await store().loadRefs();
    expect(store().refs.map((d) => d.entry.title)).toEqual(['Alpha', 'Beta']);
    expect(store().refDraft?.title).toBe('Mine');
    expect(store().refDirty).toBe(true);
    expect(store().refSelId).toBe(id);

    // A clean draft follows the external change instead.
    store().discardRefDraft();
    await store().loadRefs();
    expect(store().refDraft?.title).toBe('Alpha');
    expect(store().refDirty).toBe(false);
  });
});
