import { validateReferenceEntry } from '@/schemas/reference-book';
import {
  RUN_SNAPSHOT_LIMITS,
  type RunArgumentsSnapshot,
  type RunGlossaryEntry,
  type RunSnapshot,
  type RunSnapshotMiss,
} from '@/schemas/run-snapshot';
import type { Case } from '@/types';
import { caseLinkUses } from '@/utils/run-snapshot';
import { readGlossaryEntry, type ReferenceDoc } from './reference-book';

// ---------------------------------------------------------------------------
// Freezing a run's reference book: which records its cases use, and the chosen `arguments` set.
//
// Everything is read back from disk rather than trusted from the loaded catalog — the snapshot
// must record the revision that is actually on disk at creation time (a stale catalog would pin
// the wrong revision). Fail-closed in both directions:
//   · a reference that cannot be frozen is reported (never silently dropped, never truncated);
//     the caller asks the user before creating the run without it;
//   · a chosen `arguments` set that cannot be frozen blocks the run — automation reads those
//     values by revision, so a run claiming a set it did not really capture would be worse than
//     no run at all.
// ---------------------------------------------------------------------------

export interface RunSnapshotPlan {
  snapshot: RunSnapshot;
  /** Set when the chosen `arguments` set cannot be frozen — creation must not go ahead. */
  argsError: string | null;
}

/** Why a record that exists cannot be frozen as-is, or `null` when it can. */
function notSnapshottable(doc: ReferenceDoc): string | null {
  if (doc.readonly) {
    const why = doc.issues[0]?.message ?? 'its content is not supported by this version';
    return `this version cannot read it — ${why}`;
  }
  const issue = validateReferenceEntry(doc.entry)[0];
  if (issue) return `it does not read as a valid record (${issue.message.toLowerCase()})`;
  if (doc.entry.description.length > RUN_SNAPSHOT_LIMITS.maxDescription) {
    return `its description is longer than the ${RUN_SNAPSHOT_LIMITS.maxDescription}-character snapshot limit`;
  }
  return null;
}

const setLabel = (doc: ReferenceDoc): string => doc.entry.title.trim() || doc.id;

/**
 * Read everything the run needs to freeze: the records its cases reference (in document order,
 * first use wins) and the chosen `arguments` set. Never writes.
 */
export async function planRunSnapshot(
  repoPath: string,
  cases: readonly Case[],
  argsEntryId: string | null,
): Promise<RunSnapshotPlan> {
  const firstUse = new Map<string, string>();
  for (const kase of cases) {
    for (const use of caseLinkUses(kase)) {
      if (!firstUse.has(use.id)) firstUse.set(use.id, use.where);
    }
  }

  const glossary: RunGlossaryEntry[] = [];
  const unresolved: RunSnapshotMiss[] = [];
  for (const [id, where] of firstUse) {
    if (glossary.length >= RUN_SNAPSHOT_LIMITS.maxEntries) {
      unresolved.push({ id, where, reason: `only the first ${RUN_SNAPSHOT_LIMITS.maxEntries} references are snapshotted` });
      continue;
    }
    const doc = await readGlossaryEntry(repoPath, id);
    if (!doc) {
      unresolved.push({ id, where, reason: 'there is no record file for this link' });
      continue;
    }
    const problem = notSnapshottable(doc);
    if (problem) {
      unresolved.push({ id, where, reason: problem });
      continue;
    }
    glossary.push({
      id: doc.id,
      revision: doc.revision,
      kind: doc.entry.kind,
      title: doc.entry.title,
      description: doc.entry.description,
      url: doc.entry.kind === 'link' ? (doc.entry.url ?? '') : '',
      archived: doc.entry.archived,
    });
  }

  const { snapshot: argsSnapshot, error: argsError } = await freezeArguments(repoPath, argsEntryId);
  return { snapshot: { glossary, unresolved, arguments: argsSnapshot }, argsError };
}

async function freezeArguments(
  repoPath: string,
  argsEntryId: string | null,
): Promise<{ snapshot: RunArgumentsSnapshot | null; error: string | null }> {
  if (!argsEntryId) return { snapshot: null, error: null };
  const doc = await readGlossaryEntry(repoPath, argsEntryId);
  if (!doc) return { snapshot: null, error: 'The selected argument set is no longer in the reference book. Pick another set, or none.' };
  // Readability first: a file this version cannot parse is not "some other kind of record".
  if (doc.readonly) {
    return {
      snapshot: null,
      error: `"${setLabel(doc)}" cannot be frozen into this run: ${doc.issues[0]?.message ?? 'its content is not supported by this version'}.`,
    };
  }
  if (doc.entry.kind !== 'arguments') {
    return { snapshot: null, error: `"${setLabel(doc)}" is not an argument set. Pick another set, or none.` };
  }
  if (doc.entry.archived) return { snapshot: null, error: `"${setLabel(doc)}" is archived. Restore it, or pick another set.` };

  const problems = validateReferenceEntry(doc.entry).map((i) => i.message);
  const values = doc.entry.values ?? [];
  if (!problems.length && values.length > RUN_SNAPSHOT_LIMITS.maxValues) {
    problems.push(`it has more than ${RUN_SNAPSHOT_LIMITS.maxValues} values`);
  }
  if (problems.length) {
    return { snapshot: null, error: `"${setLabel(doc)}" cannot be frozen into this run: ${problems.join('; ')}.` };
  }
  return {
    snapshot: { id: doc.id, revision: doc.revision, title: doc.entry.title, description: doc.entry.description, values },
    error: null,
  };
}
