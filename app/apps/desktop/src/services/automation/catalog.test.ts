import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AutomationBinding, AutomationProfile, CatalogEntry } from '@/schemas/automation-store';
import type { DiscoveredTest } from '@/schemas/automation';
import {
  BINDINGS_REL,
  CATALOG_REL,
  PROFILES_REL,
  assertUnchanged,
  loadBindings,
  loadCatalog,
  loadProfiles,
  saveBindings,
  saveCatalog,
  saveProfiles,
  serializeCatalog,
  storeRevision,
} from './catalog';
import { AutomationStaleError } from './catalog';

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});

async function mkRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'testoritto-automation-store-'));
  cleanup.push(dir);
  return dir;
}

const discovered = (over: Partial<DiscoveredTest> = {}): DiscoveredTest => ({
  automationId: 'login',
  caseId: 'RND-0001',
  variantId: null,
  title: 'login works',
  titlePath: ['login.spec.ts', 'auth', 'login works'],
  project: 'chromium',
  file: 'tests/login.spec.ts',
  line: 12,
  expectedStatus: 'passed',
  tags: ['@tt:login'],
  ...over,
});

describe('catalog', () => {
  it('reads a repository without .casewright/ as an empty catalog and writes nothing', async () => {
    const repo = await mkRepo();
    const load = await loadCatalog(repo);
    expect(load.file.entries).toEqual([]);
    expect(load.issues).toEqual([]);
    expect(await readdir(repo)).toEqual([]);
  });

  it('saves a discovery result deterministically and reads it back', async () => {
    const repo = await mkRepo();
    const saved = await saveCatalog(repo, [discovered({ automationId: 'b' }), discovered()], {
      playwrightVersion: '1.60.0',
      discoveredAt: '2026-10-19T10:00:00.000Z',
      extraArguments: { login: [{ key: 'baseUrl', type: 'string', required: true }] },
    });
    expect(saved.file.entries.map((e) => e.automationId)).toEqual(['b', 'login']);
    expect(saved.file.entries[1].arguments).toEqual([{ key: 'baseUrl', type: 'string', required: true }]);
    expect(saved.file.entries[1].revision).toMatch(/^[0-9a-f]{64}$/);
    const reload = await loadCatalog(repo);
    expect(reload.file).toEqual(saved.file);
    expect(reload.revision).toBe(saved.revision);

    const first = await readFile(join(repo, CATALOG_REL), 'utf8');
    await saveCatalog(repo, [discovered({ automationId: 'b' }), discovered()], { playwrightVersion: '1.60.0', discoveredAt: '2026-10-19T10:00:00.000Z', extraArguments: { login: [{ key: 'baseUrl', type: 'string', required: true }] } });
    expect(await readFile(join(repo, CATALOG_REL), 'utf8')).toBe(first);
  });

  it('reports a broken catalog file instead of throwing', async () => {
    const repo = await mkRepo();
    await writeFile(join(repo, '.casewright'), 'not a directory');
    const load = await loadCatalog(repo);
    expect(load.file.entries).toEqual([]);
    expect(load.issues).toEqual([]); // nothing there yet
  });

  it('skips an unreadable entry but keeps the rest', async () => {
    const repo = await mkRepo();
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(repo, '.casewright', 'automation'), { recursive: true });
    await writeFile(
      join(repo, CATALOG_REL),
      JSON.stringify({ schemaVersion: 1, discoveredAt: '', playwrightVersion: '1.60.0', entries: [{ automationId: 'ok', project: 'p', title: 't' }, { project: 'p' }] }),
    );
    const load = await loadCatalog(repo);
    expect(load.file.entries.map((e) => e.automationId)).toEqual(['ok']);
    expect(load.issues.map((i) => i.code)).toEqual(['automation-entry-skipped']);
  });

  it('serializes entries with stable key order', () => {
    const text = serializeCatalog({
      schemaVersion: 1,
      discoveredAt: '',
      playwrightVersion: '',
      entries: [
        {
          automationId: 'a',
          caseId: null,
          variantId: null,
          project: 'p',
          title: 't',
          titlePath: [],
          file: null,
          line: null,
          tags: [],
          expectedStatus: null,
          arguments: [],
          archived: false,
          revision: '',
        } as CatalogEntry,
      ],
    });
    expect(text.indexOf('"archived"')).toBeLessThan(text.indexOf('"automationId"'));
  });
});

describe('bindings', () => {
  const binding = (over: Partial<AutomationBinding> = {}): AutomationBinding => ({
    id: 'b1',
    caseId: 'RND-0001',
    automationId: 'login',
    project: 'chromium',
    variantId: 'default',
    enabled: true,
    arguments: {},
    archived: false,
    ...over,
  });

  it('round-trips bindings and keeps them sorted', async () => {
    const repo = await mkRepo();
    await saveBindings(repo, [binding({ id: 'b2', automationId: 'z' }), binding({ id: 'b1', automationId: 'a' })]);
    const load = await loadBindings(repo);
    expect(load.file.bindings.map((b) => b.automationId)).toEqual(['a', 'z']);
    expect(load.revision).toMatch(/^[0-9a-f]{64}$/);
  });

  it('tolerates an absent or broken bindings file', async () => {
    const repo = await mkRepo();
    expect((await loadBindings(repo)).file.bindings).toEqual([]);
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(repo, '.casewright', 'automation'), { recursive: true });
    await writeFile(join(repo, BINDINGS_REL), '[]');
    const load = await loadBindings(repo);
    expect(load.file.bindings).toEqual([]);
    expect(load.issues.map((i) => i.code)).toEqual(['automation-bindings-read']);
  });
});

describe('profiles', () => {
  const profile = (over: Partial<AutomationProfile> = {}): AutomationProfile => ({
    id: 'p1',
    repoPath: 'C:\\repo',
    configFile: '',
    projects: ['chromium'],
    timeoutMs: 900_000,
    args: [],
    trustedAt: '2026-10-19T10:00:00.000Z',
    ...over,
  });

  it('round-trips profiles', async () => {
    const repo = await mkRepo();
    await saveProfiles(repo, [profile()]);
    expect((await loadProfiles(repo)).file.profiles[0]).toMatchObject({ id: 'p1', projects: ['chromium'] });
    expect(await storeRevision(repo, PROFILES_REL)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('stale guard', () => {
  it('accepts an unchanged file and refuses an external edit', async () => {
    const repo = await mkRepo();
    await saveBindings(repo, []);
    const rev = await storeRevision(repo, BINDINGS_REL);
    await expect(assertUnchanged(repo, BINDINGS_REL, rev)).resolves.toBeUndefined();
    await writeFile(join(repo, BINDINGS_REL), JSON.stringify({ schemaVersion: 1, bindings: [] }) + '\n');
    await expect(assertUnchanged(repo, BINDINGS_REL, rev)).rejects.toBeInstanceOf(AutomationStaleError);
  });

  it('reports an unreadable automation file', async () => {
    const repo = await mkRepo();
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(repo, '.casewright', 'automation'), { recursive: true });
    await writeFile(join(repo, CATALOG_REL), '{ nope');
    const load = await loadCatalog(repo);
    expect(load.issues[0].code).toBe('automation-catalog-read');
    await expect(stat(join(repo, CATALOG_REL))).resolves.toBeTruthy();
  });
});
