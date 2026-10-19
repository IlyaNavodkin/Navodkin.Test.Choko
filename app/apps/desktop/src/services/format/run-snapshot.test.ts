import { describe, expect, it } from 'vitest';
import type { RunArgumentsSnapshot, RunGlossaryEntry, RunSnapshotMiss } from '@/schemas/run-snapshot';
import {
  parseRunArgumentsSnapshot,
  parseRunGlossarySnapshot,
  serializeRunArgumentsSnapshot,
  serializeRunGlossarySnapshot,
} from './run-snapshot';

const GLOSSARY_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const ARGS_ID = '1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d';

const entry = (patch: Partial<RunGlossaryEntry> = {}): RunGlossaryEntry => ({
  id: GLOSSARY_ID,
  revision: 'a'.repeat(64),
  kind: 'link',
  title: 'Payments runbook',
  description: 'How to debug a stuck payment.',
  url: 'https://example.com/payments',
  archived: false,
  ...patch,
});

const miss = (patch: Partial<RunSnapshotMiss> = {}): RunSnapshotMiss => ({
  id: 'deadbeef-0000-4000-8000-000000000000',
  where: 'PAY-0042 — Step 3',
  reason: 'there is no record file for this link',
  ...patch,
});

const argsSet = (patch: Partial<RunArgumentsSnapshot> = {}): RunArgumentsSnapshot => ({
  id: ARGS_ID,
  revision: 'b'.repeat(64),
  title: 'dev',
  description: 'Dev environment values.',
  values: [
    { key: 'retries', type: 'number', value: 3 },
    { key: 'headless', type: 'boolean', value: true },
    { key: 'env', type: 'enum', value: 'dev', options: ['dev', 'stage'] },
  ],
  ...patch,
});

describe('glossary.json', () => {
  it('round-trips entries and unresolved references field for field', () => {
    const entries = [entry(), entry({ id: 'other', kind: 'arguments', url: '', archived: true, description: '' })];
    const unresolved = [miss(), miss({ id: 'second', where: 'PAY-0043 — Objective', reason: 'this version cannot read it' })];
    const parsed = parseRunGlossarySnapshot(serializeRunGlossarySnapshot(entries, unresolved));
    expect(parsed.issues).toEqual([]);
    expect(parsed.glossary).toEqual(entries);
    expect(parsed.unresolved).toEqual(unresolved);
  });

  it('writes a versioned JSON document with a trailing newline', () => {
    const text = serializeRunGlossarySnapshot([entry()], []);
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text)).toMatchObject({ schema_version: 1, unresolved: [] });
  });

  it('reports a malformed file instead of throwing — the run simply has no snapshot', () => {
    for (const raw of ['', '{', 'not json']) {
      const parsed = parseRunGlossarySnapshot(raw);
      expect(parsed.glossary).toEqual([]);
      expect(parsed.issues.map((i) => i.code)).toEqual(['run-snapshot-json']);
    }
    // Valid JSON of the wrong shape is reported as such, and is not treated as an empty snapshot.
    for (const raw of ['[]', JSON.stringify({ entries: 'nope' })]) {
      const parsed = parseRunGlossarySnapshot(raw);
      expect(parsed.glossary).toEqual([]);
      expect(parsed.issues.map((i) => i.code)).toEqual(['run-snapshot-shape']);
    }
  });

  it('keeps readable entries when a file was written by a newer version', () => {
    const raw = JSON.stringify({ schema_version: 99, entries: [entry()], unresolved: [] });
    const parsed = parseRunGlossarySnapshot(raw);
    expect(parsed.glossary).toEqual([entry()]);
    expect(parsed.issues.map((i) => i.code)).toEqual(['run-snapshot-version']);
  });

  it('skips a broken row with a diagnostic while the others survive', () => {
    const raw = JSON.stringify({
      schema_version: 1,
      entries: [entry(), { id: 'x', kind: 'not-a-kind' }, entry({ id: 'kept' })],
      unresolved: [miss(), { where: 'no id' }],
    });
    const parsed = parseRunGlossarySnapshot(raw);
    expect(parsed.glossary.map((e) => e.id)).toEqual([GLOSSARY_ID, 'kept']);
    expect(parsed.unresolved).toEqual([miss()]);
    expect(parsed.issues.map((i) => i.code)).toEqual(['run-snapshot-entry', 'run-snapshot-miss']);
  });
});

describe('arguments.json', () => {
  it('round-trips resolved values with their exact types', () => {
    const parsed = parseRunArgumentsSnapshot(serializeRunArgumentsSnapshot(argsSet()));
    expect(parsed.issues).toEqual([]);
    expect(parsed.snapshot).toEqual(argsSet());
    expect(parsed.snapshot?.values.map((v) => typeof v.value)).toEqual(['number', 'boolean', 'string']);
  });

  it('reports a malformed or wrongly shaped file as "no set", never an exception', () => {
    for (const raw of ['', 'nope', JSON.stringify({ title: 'no id' })]) {
      const parsed = parseRunArgumentsSnapshot(raw);
      expect(parsed.snapshot).toBeNull();
      expect(parsed.issues.length).toBe(1);
    }
  });

  it('drops a broken value row and keeps the rest', () => {
    const raw = JSON.stringify({
      schema_version: 1,
      id: ARGS_ID,
      revision: 'b'.repeat(64),
      title: 'dev',
      description: '',
      values: [{ key: 'retries', type: 'number', value: 3 }, { key: 'bad', type: 'nope', value: 1 }],
    });
    const parsed = parseRunArgumentsSnapshot(raw);
    expect(parsed.snapshot?.values).toEqual([{ key: 'retries', type: 'number', value: 3 }]);
    expect(parsed.issues.map((i) => i.code)).toEqual(['run-snapshot-value']);
  });
});
