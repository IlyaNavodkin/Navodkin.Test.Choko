import { describe, expect, it } from 'vitest';
import {
  ArgValueSchema,
  argValueIssue,
  isSafeHttpUrl,
  validateReferenceEntry,
  type ArgValue,
  type ReferenceEntry,
} from './reference-book';

const entry = (patch: Partial<ReferenceEntry> = {}): ReferenceEntry => ({
  id: '11111111-2222-4333-8444-555555555555',
  kind: 'link',
  title: 'Payments runbook',
  aliases: [],
  archived: false,
  description: 'How to debug a stuck payment.',
  ...patch,
});

describe('isSafeHttpUrl', () => {
  it('accepts http(s) URLs with a host', () => {
    expect(isSafeHttpUrl('https://example.com/a?b=c#d')).toBe(true);
    expect(isSafeHttpUrl('  http://localhost:8080/  ')).toBe(true);
  });

  it('rejects other schemes, missing hosts and embedded credentials', () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('ftp://example.com')).toBe(false);
    expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeHttpUrl('https://user:pw@example.com')).toBe(false);
    expect(isSafeHttpUrl('https://')).toBe(false);
    expect(isSafeHttpUrl('example.com')).toBe(false);
    expect(isSafeHttpUrl('')).toBe(false);
  });
});

describe('argValueIssue', () => {
  const value = (patch: Partial<ArgValue>): ArgValue => ({ key: 'host', type: 'string', value: 'dev', ...patch });

  it('accepts every declared type in its own shape', () => {
    expect(argValueIssue(value({ type: 'string', value: 'dev' }))).toBeNull();
    expect(argValueIssue(value({ type: 'number', value: 3 }))).toBeNull();
    expect(argValueIssue(value({ type: 'boolean', value: false }))).toBeNull();
    expect(argValueIssue(value({ type: 'url', value: 'https://dev.example.com' }))).toBeNull();
    expect(argValueIssue(value({ type: 'enum', value: 'dev', options: ['dev', 'stage'] }))).toBeNull();
  });

  it('reports a type mismatch', () => {
    expect(argValueIssue(value({ type: 'number', value: 'three' }))).toMatch(/number/);
    expect(argValueIssue(value({ type: 'boolean', value: 'true' }))).toMatch(/boolean/);
    expect(argValueIssue(value({ type: 'url', value: 'ftp://x' }))).toMatch(/http/);
    expect(argValueIssue(value({ type: 'string', value: 3 }))).toMatch(/string/);
  });

  it('reports enum problems', () => {
    expect(argValueIssue(value({ type: 'enum', value: 'dev', options: [] }))).toMatch(/options/);
    expect(argValueIssue(value({ type: 'enum', value: 'dev' }))).toMatch(/options/);
    expect(argValueIssue(value({ type: 'enum', value: 'prod', options: ['dev'] }))).toMatch(/must be one of/);
    expect(argValueIssue(value({ type: 'enum', value: 'dev', options: ['dev', 'dev'] }))).toMatch(/unique/);
    expect(argValueIssue(value({ type: 'enum', value: 'dev', options: ['dev', '  '] }))).toMatch(/blank/);
  });

  it('rejects keys that cannot become TESTORITTO_ARG_* variables', () => {
    expect(argValueIssue(value({ key: '' }))).toMatch(/key/);
    expect(argValueIssue(value({ key: 'has space' }))).toMatch(/key/);
    expect(argValueIssue(value({ key: 'dot.key' }))).toMatch(/key/);
    expect(argValueIssue(value({ key: 'base-url_2' }))).toBeNull();
  });

  it('is the same rule the zod schema applies', () => {
    expect(ArgValueSchema.safeParse({ key: 'retries', type: 'number', value: 'three' }).success).toBe(false);
    expect(ArgValueSchema.safeParse({ key: 'retries', type: 'number', value: 3 }).success).toBe(true);
    expect(ArgValueSchema.safeParse({ key: 'env', type: 'enum', value: 'dev', options: [] }).success).toBe(false);
  });
});

describe('validateReferenceEntry', () => {
  it('accepts a link with only a URL or only a description', () => {
    expect(validateReferenceEntry(entry())).toEqual([]);
    expect(validateReferenceEntry(entry({ description: '', url: 'https://example.com' }))).toEqual([]);
    expect(validateReferenceEntry(entry({ url: '' }))).toEqual([]);
  });

  it('requires a title', () => {
    expect(validateReferenceEntry(entry({ title: '   ' })).map((i) => i.field)).toEqual(['title']);
  });

  it('requires a description or a URL for links', () => {
    const issues = validateReferenceEntry(entry({ description: '', url: '' }));
    expect(issues).toEqual([{ field: 'description', message: 'Add a description or a URL' }]);
  });

  it('rejects an unsafe URL', () => {
    expect(validateReferenceEntry(entry({ url: 'javascript:alert(1)' }))[0]).toMatchObject({ field: 'url' });
    expect(validateReferenceEntry(entry({ url: 'https://a:b@example.com' }))[0]).toMatchObject({ field: 'url' });
  });

  it('requires a description for an arguments set', () => {
    const issues = validateReferenceEntry(entry({ kind: 'arguments', values: [], description: ' ' }));
    expect(issues).toEqual([{ field: 'description', message: 'Add a description of what the set is for' }]);
  });

  it('rejects duplicate keys, unknown types and empty enum options', () => {
    const issues = validateReferenceEntry(
      entry({
        kind: 'arguments',
        values: [
          { key: 'host', type: 'string', value: 'dev' },
          { key: 'host', type: 'string', value: 'stage' },
          { key: 'env', type: 'enum', value: '', options: [] },
        ],
      }),
    );
    expect(issues).toEqual([
      { field: 'values', index: 1, message: 'duplicate key "host"' },
      { field: 'values', index: 2, message: 'an enum value needs a non-empty list of options' },
    ]);
    // An unknown type is rejected at the schema boundary, before it can reach the model.
    expect(ArgValueSchema.safeParse({ key: 'host', type: 'date', value: '2026-10-18' }).success).toBe(false);
  });
});
