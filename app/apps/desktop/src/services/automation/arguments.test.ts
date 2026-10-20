import { describe, expect, it } from 'vitest';
import type { AutomationArgDefinition } from '@/schemas/automation';
import type { ArgValue } from '@/schemas/reference-book';
import type { ReferenceDoc } from '@/services/reference-book';
import {
  argEnvName,
  argumentFingerprint,
  literalProblem,
  pickLayerValue,
  resolveArguments,
  type ResolveArgsDeps,
} from './arguments';

const defs = (...items: AutomationArgDefinition[]): AutomationArgDefinition[] => items;
const def = (over: Partial<AutomationArgDefinition> = {}): AutomationArgDefinition => ({ key: 'baseUrl', type: 'string', ...over });

/** A fake reference-book reader; `docs` is keyed by record id. */
const fakeReader =
  (docs: Record<string, ReferenceDoc>): ResolveArgsDeps['readEntry'] =>
  async (_repo, id) =>
    docs[id] ?? null;

const doc = (id: string, values: ArgValue[], over: Partial<ReferenceDoc['entry']> = {}): ReferenceDoc => ({
  id,
  rel: `.casewright/glossary/${id}.md`,
  entry: { id, kind: 'arguments', title: 'dev', aliases: [], archived: false, description: 'dev', values, ...over },
  extra: {},
  eol: '\n',
  revision: 'rev-' + id,
  readonly: false,
  issues: [],
});

const base = { repoPath: 'C:\\repo' };

describe('argEnvName / pickLayerValue / literalProblem', () => {
  it('maps keys to TESTORITTO_ARG_* env names', () => {
    expect(argEnvName('baseUrl')).toBe('TESTORITTO_ARG_BASEURL');
    expect(argEnvName('retry-count')).toBe('TESTORITTO_ARG_RETRY_COUNT');
  });

  it('prefers run override > binding > autotest', () => {
    const layers = {
      autotest: { a: { kind: 'literal', value: 'auto' } as const },
      binding: { a: { kind: 'literal', value: 'bind' } as const },
      runOverride: { a: { kind: 'literal', value: 'run' } as const },
    };
    expect(pickLayerValue('a', layers)).toMatchObject({ value: 'run' });
    expect(pickLayerValue('a', { ...layers, runOverride: {} })).toMatchObject({ value: 'bind' });
    expect(pickLayerValue('a', { autotest: layers.autotest })).toMatchObject({ value: 'auto' });
    expect(pickLayerValue('missing', layers)).toBeUndefined();
  });

  it('validates literals by declared type, including enum and number bounds', () => {
    expect(literalProblem(def({ type: 'number', min: 1, max: 3 }), 0)).toMatch(/at least 1/);
    expect(literalProblem(def({ type: 'number', min: 1, max: 3 }), 4)).toMatch(/at most 3/);
    expect(literalProblem(def({ type: 'number' }), '3')).toMatch(/expected a number/);
    expect(literalProblem(def({ type: 'enum', options: ['dev', 'stage'] }), 'prod')).toMatch(/one of/);
    expect(literalProblem(def({ type: 'boolean' }), false)).toBeNull();
  });
});

describe('resolveArguments', () => {
  it('uses a schema default when nothing else is supplied', async () => {
    const res = await resolveArguments({ ...base, definitions: defs(def({ default: 'http://localhost' })) });
    expect(res.ok).toBe(true);
    expect(res.values).toEqual([{ key: 'baseUrl', type: 'string', value: 'http://localhost', source: 'schema-default' }]);
    expect(res.env.TESTORITTO_ARG_BASEURL).toBe('http://localhost');
  });

  it('treats false, 0 and empty string as real values (never "unset")', async () => {
    const res = await resolveArguments({
      ...base,
      definitions: defs(
        def({ key: 'flag', type: 'boolean', default: true }),
        def({ key: 'retries', type: 'number', default: 5 }),
        def({ key: 'label', type: 'string', default: 'x' }),
      ),
      runOverride: {
        flag: { kind: 'literal', value: false },
        retries: { kind: 'literal', value: 0 },
        label: { kind: 'literal', value: '' },
      },
    });
    expect(res.ok).toBe(true);
    expect(res.values.map((v) => [v.key, v.value, v.source])).toEqual([
      ['flag', false, 'run-override'],
      ['retries', 0, 'run-override'],
      ['label', '', 'run-override'],
    ]);
  });

  it('reports a required argument with no value', async () => {
    const res = await resolveArguments({ ...base, definitions: defs(def({ required: true })) });
    expect(res.ok).toBe(false);
    expect(res.problems[0]).toMatch(/required/);
  });

  it('resolves a reference-book value and records entry + key + revision', async () => {
    const readEntry = fakeReader({ dev: doc('dev', [{ key: 'baseUrl', type: 'string', value: 'https://dev.example.com' }]) });
    const res = await resolveArguments(
      {
        ...base,
        definitions: defs(def()),
        binding: { baseUrl: { kind: 'reference', entryId: 'dev', key: 'baseUrl' } },
      },
      { readEntry },
    );
    expect(res.ok).toBe(true);
    expect(res.values[0]).toMatchObject({
      key: 'baseUrl',
      value: 'https://dev.example.com',
      source: 'binding',
      reference: { entryId: 'dev', key: 'baseUrl', revision: 'rev-dev', title: 'dev' },
    });
    expect(res.env.TESTORITTO_ARG_BASEURL).toBe('https://dev.example.com');
  });

  it('blocks a missing, archived, non-arguments or unreadable record', async () => {
    const readEntry = fakeReader({
      gone: doc('gone', []),
      archived: doc('archived', [{ key: 'baseUrl', type: 'string', value: 'x' }], { archived: true }),
      link: doc('link', [], { kind: 'link' }),
    });
    const missing = await resolveArguments({ ...base, definitions: defs(def()), binding: { baseUrl: { kind: 'reference', entryId: 'nope', key: 'baseUrl' } } }, { readEntry });
    expect(missing.problems[0]).toMatch(/no longer exists/);

    const archived = await resolveArguments({ ...base, definitions: defs(def()), binding: { baseUrl: { kind: 'reference', entryId: 'archived', key: 'baseUrl' } } }, { readEntry });
    expect(archived.problems[0]).toMatch(/archived/);

    const link = await resolveArguments({ ...base, definitions: defs(def()), binding: { baseUrl: { kind: 'reference', entryId: 'link', key: 'baseUrl' } } }, { readEntry });
    expect(link.problems[0]).toMatch(/not an argument set/);

    const readonly: ReferenceDoc = { ...doc('ro', []), readonly: true };
    const ro = await resolveArguments(
      { ...base, definitions: defs(def()), binding: { baseUrl: { kind: 'reference', entryId: 'ro', key: 'baseUrl' } } },
      { readEntry: fakeReader({ ro: readonly }) },
    );
    expect(ro.problems[0]).toMatch(/cannot read/);
  });

  it('blocks a stale revision, a missing key and a type mismatch', async () => {
    const readEntry = fakeReader({
      dev: doc('dev', [{ key: 'baseUrl', type: 'string', value: 'https://dev.example.com' }]),
    });
    const stale = await resolveArguments(
      { ...base, definitions: defs(def()), binding: { baseUrl: { kind: 'reference', entryId: 'dev', key: 'baseUrl', revision: 'older' } } },
      { readEntry },
    );
    expect(stale.problems[0]).toMatch(/changed since/);

    const noKey = await resolveArguments(
      { ...base, definitions: defs(def()), binding: { baseUrl: { kind: 'reference', entryId: 'dev', key: 'host' } } },
      { readEntry },
    );
    expect(noKey.problems[0]).toMatch(/no value named/);

    const mismatch = await resolveArguments(
      { ...base, definitions: defs(def({ type: 'number' })), binding: { baseUrl: { kind: 'reference', entryId: 'dev', key: 'baseUrl' } } },
      { readEntry },
    );
    expect(mismatch.problems[0]).toMatch(/is string but the argument is number/);
  });

  it('blocks an invalid literal supplied at a higher layer', async () => {
    const res = await resolveArguments({
      ...base,
      definitions: defs(def({ type: 'enum', options: ['dev', 'stage'], default: 'dev' })),
      binding: { baseUrl: { kind: 'literal', value: 'prod' } },
    });
    expect(res.ok).toBe(false);
    expect(res.problems[0]).toMatch(/one of/);
  });

  it('rejects duplicate definitions', async () => {
    const res = await resolveArguments({ ...base, definitions: defs(def(), def()) });
    expect(res.ok).toBe(false);
    expect(res.problems[0]).toMatch(/declared twice/);
  });

  it('fingerprints resolved values independent of order', () => {
    const a = argumentFingerprint([
      { key: 'b', type: 'number', value: 2, source: 'autotest' },
      { key: 'a', type: 'string', value: 'x', source: 'autotest' },
    ]);
    const b = argumentFingerprint([
      { key: 'a', type: 'string', value: 'x', source: 'autotest' },
      { key: 'b', type: 'number', value: 2, source: 'autotest' },
    ]);
    expect(a).toBe(b);
    expect(a).toBe('a="x"&b=2');
  });
});
