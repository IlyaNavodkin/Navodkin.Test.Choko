import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReferenceEntry } from '@/schemas/reference-book';
import { RUN_SNAPSHOT_LIMITS } from '@/schemas/run-snapshot';
import type { Case } from '@/types';
import { glossaryRel, serializeReferenceEntry } from './format/reference-book';
import { planRunSnapshot } from './run-snapshot';

// The run snapshot is read back from disk, not from a loaded catalog, so these tests drive the
// planner against a real repository: they check the frozen revision, the fail-closed handling of
// references it cannot freeze, and the hard stop on an argument set that cannot be captured.

const LINK_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const ARGS_ID = '1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d';
const OTHER_ID = '2b3c4d5e-6f70-4a8b-9c0d-1e2f3a4b5c6d';

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

/** A temp repository seeded with the given repo-relative files. */
async function mkRepo(files: Record<string, string> = {}): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), 'testoritto-run-snapshot-'));
  cleanup.push(repo);
  for (const [rel, text] of Object.entries(files)) {
    const abs = join(repo, rel);
    await mkdir(join(abs, '..'), { recursive: true });
    await writeFile(abs, text);
  }
  return repo;
}

const linkEntry = (patch: Partial<ReferenceEntry> = {}): ReferenceEntry => ({
  id: LINK_ID,
  kind: 'link',
  title: 'Payments runbook',
  aliases: ['payments'],
  archived: false,
  description: 'How to debug a stuck payment.',
  url: 'https://example.com/payments',
  ...patch,
});

const argsEntry = (patch: Partial<ReferenceEntry> = {}): ReferenceEntry => ({
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
  ...patch,
});

const linkMd = (id: string, label = 'Payments runbook') => `[${label}](../../.casewright/glossary/${id}.md)`;

const kase = (objective: string, patch: Partial<Case> = {}): Case => ({
  id: 'case0000001',
  displayId: 'PAY-0042',
  title: 'Roll a die',
  status: 'active',
  tags: [],
  suite: 'suite',
  objective,
  systems: [],
  setup: [],
  steps: [],
  expected: [],
  modified: false,
  ...patch,
});

describe('planRunSnapshot — references', () => {
  it('freezes a referenced record with the revision of the bytes on disk', async () => {
    const text = serializeReferenceEntry(linkEntry());
    const repo = await mkRepo({ [glossaryRel(LINK_ID)]: text });

    const plan = await planRunSnapshot(repo, [kase(`See ${linkMd(LINK_ID)}.`)], null);

    expect(plan.argsError).toBeNull();
    expect(plan.snapshot.unresolved).toEqual([]);
    expect(plan.snapshot.glossary).toEqual([
      {
        id: LINK_ID,
        revision: sha(text),
        kind: 'link',
        title: 'Payments runbook',
        description: 'How to debug a stuck payment.',
        url: 'https://example.com/payments',
        archived: false,
      },
    ]);
  });

  it('freezes a record once, however many links point at it', async () => {
    const repo = await mkRepo({ [glossaryRel(LINK_ID)]: serializeReferenceEntry(linkEntry()) });
    const plan = await planRunSnapshot(
      repo,
      [kase(`${linkMd(LINK_ID)} and ${linkMd(LINK_ID)}`), kase(linkMd(LINK_ID), { id: 'case2', displayId: 'PAY-0043' })],
      null,
    );
    expect(plan.snapshot.glossary).toHaveLength(1);
    expect(plan.snapshot.unresolved).toEqual([]);
  });

  it('reports a link with no record file as unresolved, naming where it was found', async () => {
    const repo = await mkRepo();
    const plan = await planRunSnapshot(repo, [kase(`See ${linkMd(LINK_ID)} in the runbook.`)], null);
    expect(plan.snapshot.glossary).toEqual([]);
    expect(plan.snapshot.unresolved).toEqual([
      { id: LINK_ID, where: 'PAY-0042 — Objective', reason: 'there is no record file for this link' },
    ]);
  });

  it('refuses to copy a record this version cannot represent, instead of freezing half of it', async () => {
    const repo = await mkRepo({
      [glossaryRel(LINK_ID)]: `---\nschema_version: 1\nid: ${LINK_ID}\nkind: memex\ntitle: Future record\n---\nBody.\n`,
    });
    const plan = await planRunSnapshot(repo, [kase(linkMd(LINK_ID))], null);
    expect(plan.snapshot.glossary).toEqual([]);
    expect(plan.snapshot.unresolved[0]).toMatchObject({ id: LINK_ID, where: 'PAY-0042 — Objective' });
    expect(plan.snapshot.unresolved[0].reason).toMatch(/cannot read it/);
  });

  it('refuses a semantically invalid record (a record that would explain nothing)', async () => {
    const repo = await mkRepo({
      [glossaryRel(LINK_ID)]: `---\nschema_version: 1\nid: ${LINK_ID}\nkind: link\ntitle: ""\narchived: false\n---\n`,
    });
    const plan = await planRunSnapshot(repo, [kase(linkMd(LINK_ID))], null);
    expect(plan.snapshot.glossary).toEqual([]);
    expect(plan.snapshot.unresolved[0].reason).toMatch(/does not read as a valid record/);
  });

  it('refuses a description past the snapshot limit — the snapshot is never truncated', async () => {
    const repo = await mkRepo({
      [glossaryRel(LINK_ID)]: serializeReferenceEntry(linkEntry({ description: 'x'.repeat(RUN_SNAPSHOT_LIMITS.maxDescription + 1) })),
    });
    const plan = await planRunSnapshot(repo, [kase(linkMd(LINK_ID))], null);
    expect(plan.snapshot.glossary).toEqual([]);
    expect(plan.snapshot.unresolved[0].reason).toMatch(/snapshot limit/);
  });

  it('freezes an archived record — an existing link stays readable', async () => {
    const repo = await mkRepo({ [glossaryRel(LINK_ID)]: serializeReferenceEntry(linkEntry({ archived: true })) });
    const plan = await planRunSnapshot(repo, [kase(linkMd(LINK_ID))], null);
    expect(plan.snapshot.glossary).toHaveLength(1);
    expect(plan.snapshot.glossary[0].archived).toBe(true);
  });

  it('ignores a link inside a code block — it is content, not a usage', async () => {
    const repo = await mkRepo();
    const plan = await planRunSnapshot(repo, [kase(['```', linkMd(LINK_ID), '```'].join('\n'))], null);
    expect(plan.snapshot.glossary).toEqual([]);
    expect(plan.snapshot.unresolved).toEqual([]);
  });

  it('never writes to the repository', async () => {
    const repo = await mkRepo({ [glossaryRel(LINK_ID)]: serializeReferenceEntry(linkEntry()) });
    const before = await readFile(join(repo, glossaryRel(LINK_ID)), 'utf8');
    await planRunSnapshot(repo, [kase(linkMd(LINK_ID))], null);
    expect(await readFile(join(repo, glossaryRel(LINK_ID)), 'utf8')).toBe(before);
  });
});

describe('planRunSnapshot — argument set', () => {
  it('freezes the chosen set with its resolved values and revision', async () => {
    const text = serializeReferenceEntry(argsEntry());
    const repo = await mkRepo({ [glossaryRel(ARGS_ID)]: text });

    const plan = await planRunSnapshot(repo, [kase('No links here.')], ARGS_ID);

    expect(plan.argsError).toBeNull();
    expect(plan.snapshot.arguments).toEqual({
      id: ARGS_ID,
      revision: sha(text),
      title: 'dev',
      description: 'Dev environment values.',
      values: [
        { key: 'retries', type: 'number', value: 3 },
        { key: 'env', type: 'enum', value: 'dev', options: ['dev', 'stage'] },
      ],
    });
  });

  it('creates no argument snapshot when nothing was chosen — a run needs no values', async () => {
    const repo = await mkRepo({ [glossaryRel(ARGS_ID)]: serializeReferenceEntry(argsEntry()) });
    const plan = await planRunSnapshot(repo, [kase('None.')], null);
    expect(plan.snapshot.arguments).toBeNull();
    expect(plan.argsError).toBeNull();
  });

  it('blocks on a missing, foreign-kind, archived, unreadable or invalid set', async () => {
    const repo = await mkRepo({
      [glossaryRel(LINK_ID)]: serializeReferenceEntry(linkEntry()),
      [glossaryRel(OTHER_ID)]: serializeReferenceEntry(argsEntry({ id: OTHER_ID, archived: true })),
    });
    const broken = await mkRepo({
      [glossaryRel(ARGS_ID)]: `---\nschema_version: 1\nid: ${ARGS_ID}\nkind: arguments\ntitle: dev\narchived: false\nvalues: "not a list"\n---\n`,
    });
    const duplicate = await mkRepo({
      [glossaryRel(ARGS_ID)]: serializeReferenceEntry(
        argsEntry({
          values: [
            { key: 'env', type: 'string', value: 'dev' },
            { key: 'env', type: 'string', value: 'stage' },
          ],
        }),
      ),
    });

    const cases = [kase('Nothing.')];
    expect((await planRunSnapshot(repo, cases, 'ffffffff-0000-4000-8000-000000000000')).argsError).toMatch(/no longer in the reference book/);
    expect((await planRunSnapshot(repo, cases, LINK_ID)).argsError).toMatch(/is not an argument set/);
    expect((await planRunSnapshot(repo, cases, OTHER_ID)).argsError).toMatch(/is archived/);
    expect((await planRunSnapshot(broken, cases, ARGS_ID)).argsError).toMatch(/cannot be frozen/);
    expect((await planRunSnapshot(duplicate, cases, ARGS_ID)).argsError).toMatch(/duplicate key/);
  });

  it('reports both problems at once: an unfreezable set and unresolved references', async () => {
    const repo = await mkRepo({ [glossaryRel(LINK_ID)]: serializeReferenceEntry(linkEntry({ archived: true })) });
    const plan = await planRunSnapshot(repo, [kase(`See ${linkMd(LINK_ID)}`)], ARGS_ID);
    expect(plan.snapshot.glossary).toHaveLength(1); // archived links still freeze
    expect(plan.snapshot.unresolved).toEqual([]);
    expect(plan.argsError).toMatch(/no longer in the reference book/);
  });
});
