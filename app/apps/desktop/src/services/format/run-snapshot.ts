import type { LintWarning } from '@/schemas';
import {
  RUN_SNAPSHOT_SCHEMA_VERSION,
  RunArgumentsFileSchema,
  RunArgumentsSnapshotSchema,
  RunGlossaryEntrySchema,
  RunGlossaryFileSchema,
  RunSnapshotMissSchema,
  SnapshotArgValueSchema,
  type RunArgumentsSnapshot,
  type RunGlossaryEntry,
  type RunSnapshotMiss,
} from '@/schemas/run-snapshot';
import type { ArgValue } from '@/schemas/reference-book';

// ---------------------------------------------------------------------------
// `<run>/glossary.json` and `<run>/arguments.json` — the run's frozen reference snapshot.
//
// These files are history, not settings: the app writes them once when a run is created and
// never rewrites them, so the reader is deliberately tolerant (a malformed file means "no
// snapshot", never a broken run) and reports what it skipped instead of guessing. Readers that
// predate the feature simply never look at non-`.md` files, which is why the run loader's rows
// are defined by `_run.md` + `NNN-*.md` exactly as before.
// ---------------------------------------------------------------------------

/** Serialize the run's glossary snapshot: entries in collection order, problems verbatim. */
export function serializeRunGlossarySnapshot(glossary: RunGlossaryEntry[], unresolved: RunSnapshotMiss[]): string {
  const doc = {
    schema_version: RUN_SNAPSHOT_SCHEMA_VERSION,
    entries: glossary.map((e) => ({
      id: e.id,
      revision: e.revision,
      kind: e.kind,
      title: e.title,
      description: e.description,
      url: e.url,
      archived: e.archived,
    })),
    unresolved: unresolved.map((u) => ({ id: u.id, where: u.where, reason: u.reason })),
  };
  return JSON.stringify(doc, null, 2) + '\n';
}

/** Serialize the chosen `arguments` set with its resolved values. */
export function serializeRunArgumentsSnapshot(snapshot: RunArgumentsSnapshot): string {
  const doc = {
    schema_version: RUN_SNAPSHOT_SCHEMA_VERSION,
    id: snapshot.id,
    revision: snapshot.revision,
    title: snapshot.title,
    description: snapshot.description,
    values: snapshot.values.map((v) => ({
      key: v.key,
      type: v.type,
      value: v.value,
      ...(v.options ? { options: v.options } : {}),
    })),
  };
  return JSON.stringify(doc, null, 2) + '\n';
}

const parseJson = (raw: string): { data: unknown } | { error: string } => {
  try {
    return { data: JSON.parse(raw) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
};

/** Read `glossary.json`. Unusable rows are skipped with a diagnostic; the rest still count. */
export function parseRunGlossarySnapshot(raw: string): {
  glossary: RunGlossaryEntry[];
  unresolved: RunSnapshotMiss[];
  issues: LintWarning[];
} {
  const issues: LintWarning[] = [];
  const parsed = parseJson(raw);
  if ('error' in parsed) {
    issues.push({ code: 'run-snapshot-json', message: `glossary.json is not valid JSON: ${parsed.error}` });
    return { glossary: [], unresolved: [], issues };
  }
  const file = RunGlossaryFileSchema.safeParse(parsed.data);
  if (!file.success) {
    issues.push({ code: 'run-snapshot-shape', message: 'glossary.json does not have the expected shape.' });
    return { glossary: [], unresolved: [], issues };
  }
  if (file.data.schema_version != null && file.data.schema_version > RUN_SNAPSHOT_SCHEMA_VERSION) {
    issues.push({
      code: 'run-snapshot-version',
      message: `glossary.json was written by a newer version (schema_version ${file.data.schema_version}); reading what this version understands.`,
    });
  }

  const glossary: RunGlossaryEntry[] = [];
  file.data.entries.forEach((row, i) => {
    const entry = RunGlossaryEntrySchema.safeParse(row);
    if (entry.success) glossary.push(entry.data);
    else issues.push({ code: 'run-snapshot-entry', message: `glossary.json entries[${i}] was skipped.` });
  });

  const unresolved: RunSnapshotMiss[] = [];
  file.data.unresolved.forEach((row, i) => {
    const miss = RunSnapshotMissSchema.safeParse(row);
    if (miss.success) unresolved.push(miss.data);
    else issues.push({ code: 'run-snapshot-miss', message: `glossary.json unresolved[${i}] was skipped.` });
  });

  return { glossary, unresolved, issues };
}

/** Read `arguments.json`. `null` when the file is unusable — a run just has no argument set then. */
export function parseRunArgumentsSnapshot(raw: string): { snapshot: RunArgumentsSnapshot | null; issues: LintWarning[] } {
  const issues: LintWarning[] = [];
  const parsed = parseJson(raw);
  if ('error' in parsed) {
    issues.push({ code: 'run-snapshot-json', message: `arguments.json is not valid JSON: ${parsed.error}` });
    return { snapshot: null, issues };
  }
  const file = RunArgumentsFileSchema.safeParse(parsed.data);
  if (!file.success) {
    issues.push({ code: 'run-snapshot-shape', message: 'arguments.json does not have the expected shape.' });
    return { snapshot: null, issues };
  }
  if (file.data.schema_version != null && file.data.schema_version > RUN_SNAPSHOT_SCHEMA_VERSION) {
    issues.push({
      code: 'run-snapshot-version',
      message: `arguments.json was written by a newer version (schema_version ${file.data.schema_version}); reading what this version understands.`,
    });
  }

  const values: ArgValue[] = [];
  file.data.values.forEach((row, i) => {
    const value = SnapshotArgValueSchema.safeParse(row);
    if (value.success) values.push(value.data);
    else issues.push({ code: 'run-snapshot-value', message: `arguments.json values[${i}] was skipped.` });
  });

  const snapshot = RunArgumentsSnapshotSchema.safeParse({ ...file.data, values: [] });
  if (!snapshot.success) {
    issues.push({ code: 'run-snapshot-shape', message: 'arguments.json does not have the expected shape.' });
    return { snapshot: null, issues };
  }
  return { snapshot: { ...snapshot.data, values }, issues };
}
