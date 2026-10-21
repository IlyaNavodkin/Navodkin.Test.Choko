import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { simpleGit } from 'simple-git';
import { serializeCase } from '@/services/format/case';
import { serializeConfigYaml } from '@/services/format/config';
import { caseFileName } from '@/services/format/filename';
import { glossaryRel, serializeReferenceEntry } from '@/services/format/reference-book';
import { flushPersist } from '@/services/persist';
import type { Case } from '@/types';
import { referenceLinkInfo } from '@/utils/glossary-link';
import { useAppStore } from '../app-store';

// Runs freeze the reference book: `glossary.json` / `arguments.json` record the records a run's
// cases used, with the revision on disk at creation. These tests drive the real store against a
// real repository — creation, the explicit decision on unresolved references, and the promise
// that a later edit (or archive) of a record never rewrites a run that already recorded it.

const LINK_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const ARGS_ID = '1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d';
const MISSING_ID = 'deadbeef-0000-4000-8000-000000000000';

const glossaryLink = (id: string) => `[Payments runbook](../../${glossaryRel(id)})`;
const sha = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex');

const repoCleanup: string[] = [];

async function mkRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'testoritto-run-snapshot-'));
  repoCleanup.push(dir);
  return dir;
}

/** Windows keeps git/handle locks briefly after the store's async writes — retry the cleanup. */
async function rmWithRetry(dir: string, attempts = 20): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

afterEach(async () => {
  await Promise.all(repoCleanup.splice(0).map(rmWithRetry));
  useAppStore.setState({ repoPath: '', cases: [], tree: [], runs: [], refs: [], warnings: [], view: 'editor' });
});

const kase = (patch: Partial<Case> = {}): Case => ({
  id: 'case0000001',
  displayId: 'AR-0001',
  title: 'Roll a die',
  status: 'active',
  tags: [],
  suite: 'suite',
  objective: `See ${glossaryLink(LINK_ID)}.`,
  systems: [],
  setup: [{ name: 'Sign in as dev', body: 'Then continue.' }],
  steps: [{ text: `Open the app and check ${glossaryLink(LINK_ID)}`, depth: 0 }],
  expected: [],
  modified: false,
  ...patch,
});

const linkEntry = (patch: Record<string, unknown> = {}) =>
  serializeReferenceEntry({
    id: LINK_ID,
    kind: 'link',
    title: 'Payments runbook',
    aliases: ['payments'],
    archived: false,
    description: 'How to debug a stuck payment.',
    url: 'https://example.com/payments',
    ...patch,
  });

const argsEntry = serializeReferenceEntry({
  id: ARGS_ID,
  kind: 'arguments',
  title: 'dev',
  aliases: [],
  archived: false,
  description: 'Dev environment values.',
  values: [
    { key: 'retries', type: 'number', value: 3 },
    { key: 'env', type: 'enum', value: 'dev', options: ['dev', 'stage'] },
  ],
});

/** Seed a git repository with one case, a link record and an `arguments` set. */
async function seedRepo(files: Record<string, string> = {}): Promise<string> {
  const repo = await mkRepo();
  const c = kase();
  const seed: Record<string, string> = {
    '.ch/config.yaml': serializeConfigYaml({ version: 1, name: 'Snapshot fixture', workspaces: ['Areas'] }),
    [`Areas/Alpha/${caseFileName(c)}`]: serializeCase(c),
    [glossaryRel(LINK_ID)]: linkEntry(),
    [glossaryRel(ARGS_ID)]: argsEntry,
    ...files,
  };
  for (const [rel, content] of Object.entries(seed)) {
    const abs = join(repo, rel);
    await mkdir(join(abs, '..'), { recursive: true });
    await writeFile(abs, content);
  }
  const git = simpleGit(repo);
  await git.init();
  await git.addConfig('user.email', 'snapshot@testoritto.dev', false, 'local');
  await git.addConfig('user.name', 'Snapshot Fixture', false, 'local');
  await git.add('.');
  await git.commit('seed');
  return repo;
}

/** Wait for a file to appear (run writes are asynchronous) and return its text. */
async function waitForFile(abs: string, ms = 8000): Promise<string> {
  const started = Date.now();
  for (;;) {
    try {
      return await readFile(abs, 'utf8');
    } catch (e) {
      if (Date.now() - started > ms) throw e;
      await new Promise((r) => setTimeout(r, 25));
    }
  }
}

const store = () => useAppStore.getState();
const currentCaseId = (): string => store().cases[0].id;

/** The run folders that exist under `.ch/runs/` (empty when the folder is absent). */
const runFolders = async (repo: string): Promise<string[]> =>
  (await readdir(join(repo, '.ch', 'runs'), { withFileTypes: true }).catch(() => []))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

describe('creating a run freezes the reference book', () => {
  it('writes glossary.json and arguments.json with the revisions on disk', async () => {
    const repo = await seedRepo();
    await store().openRepo(repo);
    await store().loadRefs();

    const res = await store().createRun({ name: 'Regression', caseIds: [currentCaseId()], argsEntryId: ARGS_ID });
    expect(res).toEqual({ ok: true });

    const run = store().runs[0];
    const glossary = JSON.parse(await waitForFile(join(repo, run.file, 'glossary.json')));
    expect(glossary.schema_version).toBe(1);
    expect(glossary.entries).toEqual([
      {
        id: LINK_ID,
        revision: sha(await readFile(join(repo, glossaryRel(LINK_ID)))),
        kind: 'link',
        title: 'Payments runbook',
        description: 'How to debug a stuck payment.',
        url: 'https://example.com/payments',
        archived: false,
      },
    ]);
    expect(glossary.unresolved).toEqual([]);

    const args = JSON.parse(await waitForFile(join(repo, run.file, 'arguments.json')));
    expect(args).toEqual({
      schema_version: 1,
      id: ARGS_ID,
      revision: sha(argsEntry),
      title: 'dev',
      description: 'Dev environment values.',
      values: [
        { key: 'retries', type: 'number', value: 3 },
        { key: 'env', type: 'enum', value: 'dev', options: ['dev', 'stage'] },
      ],
    });

    // The in-memory run carries the same snapshot, so the open run needs no extra read.
    expect(run.snapshot?.glossary[0]).toMatchObject({ id: LINK_ID, title: 'Payments runbook' });
    expect(run.snapshot?.arguments?.id).toBe(ARGS_ID);
    // The run's own text holds the link (the snapshot is what the chip will resolve).
    expect(run.rows[0].itemText?.['step:0']).toContain(glossaryRel(LINK_ID));
  });

  it('keeps showing the recorded definition after the record changes, and never rewrites the run', async () => {
    const repo = await seedRepo();
    await store().openRepo(repo);
    await store().loadRefs();
    await store().createRun({ name: 'Regression', caseIds: [currentCaseId()], argsEntryId: ARGS_ID });

    const run = store().runs[0];
    const glossaryAbs = join(repo, run.file, 'glossary.json');
    const argsAbs = join(repo, run.file, 'arguments.json');
    const glossaryBefore = await waitForFile(glossaryAbs);
    const argsBefore = await waitForFile(argsAbs);

    // The record is edited and archived outside the app.
    await writeFile(
      join(repo, glossaryRel(LINK_ID)),
      linkEntry({ title: 'Payments runbook v2', description: 'Rewritten for the new PSP.', archived: true }),
    );
    await store().loadRefs();

    expect(store().view).toBe('run'); // still in the run
    const info = referenceLinkInfo(LINK_ID);
    expect(info?.runSnapshot).toBe(true);
    expect(info?.entry).toMatchObject({
      title: 'Payments runbook',
      description: 'How to debug a stuck payment.',
      archived: false,
    });

    expect(await readFile(glossaryAbs, 'utf8')).toBe(glossaryBefore);
    expect(await readFile(argsAbs, 'utf8')).toBe(argsBefore);

    // Leaving the run resolves against the live reference book again.
    store().openRunsList();
    expect(referenceLinkInfo(LINK_ID)?.runSnapshot).toBeUndefined();
    expect(referenceLinkInfo(LINK_ID)?.entry).toMatchObject({ title: 'Payments runbook v2', archived: true });
  });

  it('creates a run with no argument set and writes no arguments.json', async () => {
    const repo = await seedRepo();
    await store().openRepo(repo);
    await store().loadRefs();

    expect(await store().createRun({ name: 'No values', caseIds: [currentCaseId()] })).toEqual({ ok: true });

    const run = store().runs[0];
    await waitForFile(join(repo, run.file, 'glossary.json'));
    expect(await readdir(join(repo, run.file))).not.toContain('arguments.json');
    expect(run.snapshot?.arguments).toBeNull();
  });

  it('refuses a chosen set it cannot freeze and writes nothing at all', async () => {
    const repo = await seedRepo();
    await store().openRepo(repo);
    await store().loadRefs();

    // The link id is a real record, but not an argument set.
    const res = await store().createRun({ name: 'Bad set', caseIds: [currentCaseId()], argsEntryId: LINK_ID });
    expect(res).toMatchObject({ ok: false, reason: 'args' });
    expect(store().runs).toEqual([]);
    expect(await runFolders(repo)).toEqual([]);

    // An archived set is refused the same way.
    await writeFile(join(repo, glossaryRel(ARGS_ID)), serializeReferenceEntry({
      id: ARGS_ID,
      kind: 'arguments',
      title: 'dev',
      aliases: [],
      archived: true,
      description: 'Dev environment values.',
      values: [{ key: 'env', type: 'string', value: 'dev' }],
    }));
    await store().loadRefs();
    expect(await store().createRun({ name: 'Archived set', caseIds: [currentCaseId()], argsEntryId: ARGS_ID })).toMatchObject({
      ok: false,
      reason: 'args',
    });
    expect(await runFolders(repo)).toEqual([]);
  });

  it('asks before creating a run whose references cannot be frozen, then records them', async () => {
    // The seeded case is replaced by one whose only link points at a record that does not exist.
    const missing = kase({ objective: `See ${glossaryLink(MISSING_ID)}.`, setup: [], steps: [] });
    const repo = await seedRepo({ [`Areas/Alpha/${caseFileName(kase())}`]: serializeCase(missing) });
    await store().openRepo(repo);
    await store().loadRefs();

    const first = await store().createRun({ name: 'Incomplete', caseIds: [currentCaseId()] });
    expect(first).toMatchObject({ ok: false, reason: 'snapshot' });
    if (first.ok || first.reason !== 'snapshot') throw new Error('expected an unresolved-reference failure');
    expect(first.issues).toEqual([
      { id: MISSING_ID, where: 'AR-0001 — Objective', reason: 'there is no record file for this link' },
    ]);
    expect(store().runs).toEqual([]);
    expect(await runFolders(repo)).toEqual([]);

    // The user's explicit decision: the run is created and the gap is recorded, not hidden.
    expect(await store().createRun({ name: 'Incomplete', caseIds: [currentCaseId()], allowIncomplete: true })).toEqual({ ok: true });
    const run = store().runs[0];
    const glossary = JSON.parse(await waitForFile(join(repo, run.file, 'glossary.json')));
    expect(glossary.entries).toEqual([]);
    expect(glossary.unresolved).toEqual([
      { id: MISSING_ID, where: 'AR-0001 — Objective', reason: 'there is no record file for this link' },
    ]);
  });
});

describe('the run loader is untouched by the snapshot sidecars', () => {
  it('reads rows from the markdown only, and the snapshot back, without diagnostics', async () => {
    const repo = await seedRepo();
    await store().openRepo(repo);
    await store().loadRefs();
    await store().createRun({ name: 'Regression', caseIds: [currentCaseId()], argsEntryId: ARGS_ID });

    const created = store().runs[0];
    await Promise.all([
      waitForFile(join(repo, created.file, 'glossary.json')),
      waitForFile(join(repo, created.file, 'arguments.json')),
      waitForFile(join(repo, created.rows[0].file)),
    ]);
    await flushPersist();

    // Reopen the repository: everything below comes from disk.
    useAppStore.setState({ repoPath: '', runs: [], cases: [], tree: [], refs: [], warnings: [] });
    await store().openRepo(repo);
    await store().loadRefs();

    const run = store().runs[0];
    expect(run.rows).toHaveLength(1);
    expect(run.rows[0].file.endsWith('.md')).toBe(true);
    expect(run.rows[0].title).toBe('Roll a die');
    expect(Object.keys(run.rows[0].itemText ?? {}).sort()).toEqual(['setup:0', 'step:0']);
    // The JSON files are not rows, not cases, and not warnings.
    expect(store().cases).toHaveLength(1);
    expect(store().warnings.filter((w) => (w.file ?? '').endsWith('.json'))).toEqual([]);
    // …and the frozen definitions survive the round trip.
    expect(run.snapshot?.glossary[0]).toMatchObject({ id: LINK_ID, title: 'Payments runbook' });
    expect(run.snapshot?.arguments?.values).toHaveLength(2);

    // The dirty list stays run-per-folder: the JSON sidecars never surface as a change of their
    // own (or as a "case") — they are part of the run folder the user commits as one thing.
    await store().refreshStatus();
    expect(store().changes).toHaveLength(1);
    expect(store().changes[0]).toMatchObject({ kind: 'run', path: created.file, status: 'A' });
    expect(store().changes.some((c) => c.path.endsWith('.json'))).toBe(false);
  });
});
