import { z } from 'zod';
import { ArgValueTypeSchema, ReferenceKindSchema, type ArgValue } from './reference-book';

/**
 * Run snapshots (`<run>/glossary.json`, `<run>/arguments.json`): the reference-book records a run
 * used, frozen at creation — id, revision of the record file, title, url, description, and for a
 * chosen `arguments` set the resolved values. Editing or archiving a record later never changes a
 * run that already recorded it; a new run simply snapshots the new revision.
 *
 * The model lives here; the on-disk round-trip is `services/format/run-snapshot.ts`, and a run is
 * never rewritten by a later version of the app — a snapshot is read-only history, so the reader
 * is tolerant (an unreadable file means "no snapshot", never a broken run).
 */

export const RUN_SNAPSHOT_SCHEMA_VERSION = 1;

/**
 * Snapshot size guards (design §Risks): a run folder must stay small enough to commit. A record
 * that exceeds a limit is reported as unresolved (the user decides whether to go on), never
 * silently truncated — a truncated description would misrepresent the definition.
 */
export const RUN_SNAPSHOT_LIMITS = {
  /** References snapshotted into one run; the rest are reported as unresolved. */
  maxEntries: 200,
  /** Characters of one record's description; a longer one is reported instead of copied. */
  maxDescription: 20_000,
  /** Values of the chosen `arguments` set. */
  maxValues: 200,
} as const;

/** One reference-book record as the run recorded it. */
export interface RunGlossaryEntry {
  id: string;
  /** sha256 of the record file's bytes at snapshot time (the "revision" automation pins). */
  revision: string;
  kind: 'link' | 'arguments';
  title: string;
  description: string;
  /** HTTP(S) URL of a `link` record; `''` when it has none or the record is `arguments`. */
  url: string;
  archived: boolean;
}

/** A link in the run's cases that could not be snapshotted, and where it was found. */
export interface RunSnapshotMiss {
  id: string;
  /** Human-readable origin, e.g. `PAY-0042 — Step 3`. */
  where: string;
  reason: string;
}

/** The chosen `arguments` set with its values resolved at snapshot time. */
export interface RunArgumentsSnapshot {
  id: string;
  revision: string;
  title: string;
  description: string;
  values: ArgValue[];
}

/** Everything a run froze about the reference book. */
export interface RunSnapshot {
  glossary: RunGlossaryEntry[];
  /** Missing/unreadable references at creation — recorded, never hidden. */
  unresolved: RunSnapshotMiss[];
  /** `null` when the run was created without choosing a set (the default). */
  arguments: RunArgumentsSnapshot | null;
}

/** True when the snapshot has nothing to say — the sidecar files are then not written at all. */
export const isEmptyRunSnapshot = (s: RunSnapshot): boolean =>
  s.glossary.length === 0 && s.unresolved.length === 0 && s.arguments === null;

/* ---- file shapes ---- */

export const RunGlossaryEntrySchema = z.object({
  id: z.string().min(1),
  revision: z.string().default(''),
  kind: ReferenceKindSchema,
  title: z.string().default(''),
  description: z.string().default(''),
  url: z.string().default(''),
  archived: z.boolean().default(false),
});

export const RunSnapshotMissSchema = z.object({
  id: z.string().min(1),
  where: z.string().default(''),
  reason: z.string().default(''),
});

export const SnapshotArgValueSchema = z.object({
  key: z.string(),
  type: ArgValueTypeSchema,
  value: z.union([z.string(), z.number(), z.boolean()]),
  options: z.array(z.string()).optional(),
});

export const RunArgumentsSnapshotSchema = z.object({
  id: z.string().min(1),
  revision: z.string().default(''),
  title: z.string().default(''),
  description: z.string().default(''),
  values: z.array(z.unknown()).default([]),
});

export const RunGlossaryFileSchema = z.object({
  schema_version: z.number().int().optional(),
  entries: z.array(z.unknown()).default([]),
  unresolved: z.array(z.unknown()).default([]),
});

export const RunArgumentsFileSchema = RunArgumentsSnapshotSchema.extend({
  schema_version: z.number().int().optional(),
});
