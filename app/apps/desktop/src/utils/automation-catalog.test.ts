import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from '@/schemas/automation-store';
import {
  blankArgDefinition,
  catalogProjects,
  definitionIssues,
  isRunnable,
  matchesCatalogEntry,
  patchArgDefinition,
  removeArgDefinition,
  runnableEntries,
} from './automation-catalog';

const entry = (over: Partial<CatalogEntry> = {}): CatalogEntry => ({
  automationId: 'login',
  caseId: 'RND-0001',
  variantId: null,
  project: 'chromium',
  title: 'login works',
  titlePath: ['login.spec.ts', 'login works'],
  file: 'tests/login.spec.ts',
  line: 3,
  tags: ['@tt:login'],
  expectedStatus: 'passed',
  arguments: [],
  archived: false,
  revision: 'r1',
  ...over,
});

describe('matchesCatalogEntry', () => {
  const search = (over: Partial<Parameters<typeof matchesCatalogEntry>[1]> = {}) => ({
    query: '',
    filter: 'all' as const,
    project: '',
    ...over,
  });

  it('matches title, automationId, caseId, file and tags case-insensitively', () => {
    for (const q of ['login', 'RND-0001', 'tests/login', '@tt:login', 'WORKS']) {
      expect(matchesCatalogEntry(entry(), search({ query: q }))).toBe(true);
    }
    expect(matchesCatalogEntry(entry(), search({ query: 'nope' }))).toBe(false);
  });

  it('hides archived entries unless the archived filter is on', () => {
    const archived = entry({ archived: true });
    expect(matchesCatalogEntry(archived, search())).toBe(false);
    expect(matchesCatalogEntry(archived, search({ filter: 'archived' }))).toBe(true);
    expect(matchesCatalogEntry(entry(), search({ filter: 'archived' }))).toBe(false);
  });

  it('filters by project', () => {
    expect(matchesCatalogEntry(entry(), search({ project: 'firefox' }))).toBe(false);
    expect(matchesCatalogEntry(entry(), search({ project: 'chromium' }))).toBe(true);
  });

  it('the runnable filter excludes unkeyed entries', () => {
    expect(matchesCatalogEntry(entry({ automationId: '' }), search({ filter: 'runnable' }))).toBe(false);
  });
});

describe('catalogProjects / runnableEntries / isRunnable', () => {
  it('lists distinct projects sorted', () => {
    expect(catalogProjects([entry({ project: 'webkit' }), entry({ project: 'chromium' }), entry()])).toEqual(['chromium', 'webkit']);
  });

  it('excludes archived and unkeyed entries from the runnable set', () => {
    const entries = [entry(), entry({ automationId: 'x', archived: true }), entry({ automationId: '', project: 'p' })];
    expect(runnableEntries(entries).map((e) => e.automationId)).toEqual(['login']);
    expect(isRunnable(entries[1])).toBe(false);
  });
});

describe('argument definition editing', () => {
  it('adds/patches/removes definitions immutably', () => {
    const defs = [blankArgDefinition()];
    expect(defs).toEqual([{ key: '', type: 'string' }]);
    const patched = patchArgDefinition(defs, 0, { key: 'baseUrl', type: 'url', required: true });
    expect(patched).toEqual([{ key: 'baseUrl', type: 'url', required: true }]);
    expect(defs[0].key).toBe('');
    expect(removeArgDefinition(patched, 0)).toEqual([]);
  });

  it('reports semantic problems with definitions', () => {
    const issues = definitionIssues([
      { key: 'baseUrl', type: 'url' },
      { key: 'baseUrl', type: 'string' },
      { key: 'bad key', type: 'string' },
      { key: 'mode', type: 'enum', options: [] },
      { key: 'n', type: 'number', min: 5, max: 1 },
    ]).map((i) => i.message);
    expect(issues.some((m) => /declared twice/.test(m))).toBe(true);
    expect(issues.some((m) => /not a usable key/.test(m))).toBe(true);
    expect(issues.some((m) => /at least one option/.test(m))).toBe(true);
    expect(issues.some((m) => /minimum is greater/.test(m))).toBe(true);
  });

  it('accepts a well-formed set', () => {
    expect(
      definitionIssues([
        { key: 'baseUrl', type: 'url', required: true },
        { key: 'mode', type: 'enum', options: ['dev', 'stage'], default: 'dev' },
        { key: 'retries', type: 'number', default: 3, min: 0, max: 10 },
      ]),
    ).toEqual([]);
  });
});
