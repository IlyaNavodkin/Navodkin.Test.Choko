import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { simpleGit } from 'simple-git';
import { serializeCase } from '@/services/format/case';
import { serializeConfigYaml } from '@/services/format/config';
import { caseFileName } from '@/services/format/filename';
import { flushPersist } from '@/services/persist';
import { glossaryRel, serializeReferenceEntry } from '@/services/format/reference-book';
import type { Case } from '@/types';
import { useAppStore } from '../app-store';

// A moved case's reference-book links must follow it: the links are relative to the file that
// holds them, so moving a case (or renaming the folder above it) re-anchors them. This drives
// the very store action the sidebar's drag-and-drop handler calls, against a real repository.

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const repoCleanup: string[] = [];

async function mkRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'testoritto-move-'));
  repoCleanup.push(dir);
  return dir;
}

const kase = (patch: Partial<Case> = {}): Case => ({
  id: 'case0000001',
  displayId: 'AR-0001',
  title: 'Roll a die',
  status: 'active',
  tags: [],
  suite: 'suite',
  objective: `See [Payments runbook](../../${glossaryRel(ID)}).`,
  systems: [],
  setup: [],
  steps: [],
  expected: [],
  modified: false,
  ...patch,
});

async function seedRepo(): Promise<string> {
  const repo = await mkRepo();
  const c = kase();
  const files: [string, string][] = [
    ['.ch/config.yaml', serializeConfigYaml({ version: 1, name: 'Move fixture', workspaces: ['Areas'] })],
    ['Areas/Alpha/' + caseFileName(c), serializeCase(c)],
    ['Areas/Beta/Deep/.keep', ''],
    [glossaryRel(ID), serializeReferenceEntry({
      id: ID,
      kind: 'link',
      title: 'Payments runbook',
      aliases: [],
      archived: false,
      description: 'How to debug a stuck payment.',
      url: '',
    })],
  ];
  for (const [rel, content] of files) {
    const abs = join(repo, rel);
    await mkdir(join(abs, '..'), { recursive: true });
    await writeFile(abs, content);
  }
  const git = simpleGit(repo);
  await git.init();
  await git.addConfig('user.email', 'move@testoritto.dev', false, 'local');
  await git.addConfig('user.name', 'Move Fixture', false, 'local');
  await git.add('.');
  await git.commit('seed');
  return repo;
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
  useAppStore.setState({ repoPath: '', cases: [], tree: [], refs: [] });
});

const suiteIdNamed = (name: string): string => {
  const find = (nodes: ReturnType<typeof useAppStore.getState>['tree']): string | null => {
    for (const n of nodes) {
      if (n.type !== 'suite') continue;
      if (n.name === name) return n.id;
      const inner = find(n.children);
      if (inner) return inner;
    }
    return null;
  };
  const id = find(useAppStore.getState().tree);
  if (!id) throw new Error(`no suite named ${name}`);
  return id;
};

/** Wait for a file to appear (the move's rename runs asynchronously) and return its text. */
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

describe('moving a case re-anchors its reference links', () => {
  it('rewrites the link depth on disk when the case lands deeper in the tree', async () => {
    const repo = await seedRepo();
    await useAppStore.getState().openRepo(repo);
    const before = useAppStore.getState().cases[0];
    expect(before).toBeTruthy();
    const sourceRel = useAppStore.getState().casePath(before);

    const targetId = suiteIdNamed('Deep');
    useAppStore.getState().moveNodeToParent(before.id, targetId, 0);

    const moved = useAppStore.getState().cases[0];
    const movedRel = useAppStore.getState().casePath(moved);
    expect(movedRel).not.toBe(sourceRel);
    expect(movedRel.startsWith('Areas/Beta/Deep/')).toBe(true);

    await waitForFile(join(repo, movedRel)); // the file moved (rename is async)
    await flushPersist(); // …and its rewritten text landed
    const text = await readFile(join(repo, movedRel), 'utf8');
    // One level deeper than before (Areas/Alpha → Areas/Beta/Deep).
    expect(text).toContain(`[Payments runbook](../../../${glossaryRel(ID)})`);
    expect(text).not.toContain(`](../../${glossaryRel(ID)})`);
    // The other fields and the label are untouched.
    expect(text).toContain('See [Payments runbook]');
  });

  it('leaves a case that does not move alone', async () => {
    const repo = await seedRepo();
    await useAppStore.getState().openRepo(repo);
    const before = useAppStore.getState().cases[0];
    const rel = useAppStore.getState().casePath(before);
    const original = await readFile(join(repo, rel), 'utf8');

    useAppStore.getState().moveNodeToParent(before.id, suiteIdNamed('Alpha'), 0); // same folder
    await flushPersist();

    expect(await readFile(join(repo, rel), 'utf8')).toBe(original);
    expect(useAppStore.getState().cases[0].modified).toBe(false);
  });
});
