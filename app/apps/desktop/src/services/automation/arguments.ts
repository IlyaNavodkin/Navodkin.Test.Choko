import { readGlossaryEntry } from '@/services/reference-book';
import { argValueIssue, type ArgValue } from '@/schemas/reference-book';
import type {
  AutomationArgDefinition,
  AutomationArgLayer,
  AutomationArgSource,
  AutomationArgType,
  AutomationArgValue,
  ResolvedAutomationArg,
  ResolvedArgumentSet,
} from '@/schemas/automation';

// ---------------------------------------------------------------------------
// Argument resolution (design §Остальные решения 4, spec "Typed arguments with reference-book
// values").
//
// Precedence, lowest → highest: schema default → autotest → binding → run override. A value is a
// literal or a pointer into a reference-book `arguments` record (`entryId` + `key`). Everything is
// checked *before* the process starts; a stale/archived/missing record or a type mismatch blocks
// the run instead of silently substituting a default. `false`, `0` and `''` are real values — they
// are never treated as "unset".
//
// Values are passed to the test as `TESTORITTO_ARG_<KEY>`, which keeps a manual VS Code run working
// (the test falls back to its own default) and writes nothing to the repository.
// ---------------------------------------------------------------------------

/** The env-var prefix the test reads (`process.env.TESTORITTO_ARG_<KEY>`). */
export const ARG_ENV_PREFIX = 'TESTORITTO_ARG_';

/** `baseUrl` → `TESTORITTO_ARG_BASEURL` (upper-cased, non-env characters become `_`). */
export const argEnvName = (key: string): string => `${ARG_ENV_PREFIX}${key.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`;

const LAYERS: AutomationArgSource[] = ['run-override', 'binding', 'autotest', 'schema-default'];

/** The single value to use for `key` across the layers (highest precedence wins). */
export function pickLayerValue(
  key: string,
  layers: { autotest?: AutomationArgLayer; binding?: AutomationArgLayer; runOverride?: AutomationArgLayer },
): AutomationArgValue | undefined {
  const ordered: [AutomationArgSource, AutomationArgLayer | undefined][] = [
    ['run-override', layers.runOverride],
    ['binding', layers.binding],
    ['autotest', layers.autotest],
  ];
  for (const [, layer] of ordered) {
    const v = layer?.[key];
    if (v !== undefined) return v;
  }
  return undefined;
}

/** Check one literal against its declared type. */
export function literalProblem(def: AutomationArgDefinition, value: string | number | boolean): string | null {
  const issue = argValueIssue({ key: def.key, type: def.type as ArgValue['type'], value, options: def.options });
  if (issue) return issue;
  if (def.type === 'number' && typeof value === 'number') {
    if (def.min !== undefined && value < def.min) return `must be at least ${def.min}`;
    if (def.max !== undefined && value > def.max) return `must be at most ${def.max}`;
  }
  return null;
}

/** Convert a reference-book `ArgValue` into the declared type (a mismatch is a problem). */
export function coerceReferenceValue(
  def: AutomationArgDefinition,
  ref: ArgValue,
): { value: string | number | boolean } | { problem: string } {
  if (ref.type !== def.type) {
    return { problem: `the reference value is ${ref.type} but the argument is ${def.type}` };
  }
  const problem = literalProblem(def, ref.value);
  return problem ? { problem } : { value: ref.value };
}

export interface ResolveArgsDeps {
  /** Reads a reference-book record by id (`null` when absent). Injectable for tests. */
  readEntry?: typeof readGlossaryEntry;
}

export interface ResolveArgsInput {
  repoPath: string;
  definitions: readonly AutomationArgDefinition[];
  autotest?: AutomationArgLayer;
  binding?: AutomationArgLayer;
  runOverride?: AutomationArgLayer;
}

/**
 * Resolve every declared argument. Unresolvable values become `problems` and make the set `ok:
 * false`; no value is silently replaced by a default once a higher layer supplied something.
 */
export async function resolveArguments(input: ResolveArgsInput, deps: ResolveArgsDeps = {}): Promise<ResolvedArgumentSet> {
  const readEntry = deps.readEntry ?? readGlossaryEntry;
  const values: ResolvedAutomationArg[] = [];
  const problems: string[] = [];
  const env: Record<string, string> = {};
  const seen = new Set<string>();

  for (const def of input.definitions) {
    if (seen.has(def.key)) {
      problems.push(`The argument "${def.key}" is declared twice.`);
      continue;
    }
    seen.add(def.key);

    const supplied = pickLayerValue(def.key, input);
    if (supplied === undefined) {
      if (def.default !== undefined) {
        const problem = literalProblem(def, def.default);
        if (problem) problems.push(`Default for "${def.key}": ${problem}.`);
        else {
          values.push({ key: def.key, type: def.type, value: def.default, source: 'schema-default' });
          env[argEnvName(def.key)] = String(def.default);
        }
      } else if (def.required) {
        problems.push(`"${def.key}" is required but no value was provided.`);
      }
      continue;
    }

    const source = sourceOf(def.key, input);
    if (supplied.kind === 'literal') {
      const problem = literalProblem(def, supplied.value);
      if (problem) {
        problems.push(`"${def.key}" (${source}): ${problem}.`);
        continue;
      }
      values.push({ key: def.key, type: def.type, value: supplied.value, source });
      env[argEnvName(def.key)] = String(supplied.value);
      continue;
    }

    // Reference-book value.
    const doc = await readEntry(input.repoPath, supplied.entryId);
    if (!doc) {
      problems.push(`"${def.key}" points at a reference-book record that no longer exists (${supplied.entryId}).`);
      continue;
    }
    if (doc.readonly) {
      problems.push(`"${def.key}" points at a record this version cannot read (${doc.id}).`);
      continue;
    }
    if (doc.entry.kind !== 'arguments') {
      problems.push(`"${def.key}" points at a "${doc.entry.kind}" record, not an argument set (${doc.id}).`);
      continue;
    }
    if (doc.entry.archived) {
      problems.push(`"${def.key}" points at the archived set "${doc.entry.title || doc.id}". Restore it or pick another value.`);
      continue;
    }
    if (supplied.revision && supplied.revision !== doc.revision) {
      problems.push(
        `"${def.key}" was resolved against revision ${supplied.revision.slice(0, 8)}, but "${doc.entry.title || doc.id}" has changed since (now ${doc.revision.slice(0, 8)}). Re-open the preview.`,
      );
      continue;
    }
    const ref = (doc.entry.values ?? []).find((v) => v.key === supplied.key);
    if (!ref) {
      problems.push(`The set "${doc.entry.title || doc.id}" has no value named "${supplied.key}".`);
      continue;
    }
    const coerced = coerceReferenceValue(def, ref);
    if ('problem' in coerced) {
      problems.push(`"${def.key}" from "${doc.entry.title || doc.id}.${supplied.key}": ${coerced.problem}.`);
      continue;
    }
    values.push({
      key: def.key,
      type: def.type,
      value: coerced.value,
      source,
      reference: { entryId: doc.id, key: supplied.key, revision: doc.revision, title: doc.entry.title },
    });
    env[argEnvName(def.key)] = String(coerced.value);
  }

  return { ok: problems.length === 0, values, problems, env };
}

function sourceOf(
  key: string,
  input: ResolveArgsInput,
): Exclude<AutomationArgSource, 'schema-default'> {
  if (input.runOverride?.[key] !== undefined) return 'run-override';
  if (input.binding?.[key] !== undefined) return 'binding';
  return 'autotest';
}

/** Group key for an invocation: the resolved values + project (spec "Deterministic grouping"). */
export function argumentFingerprint(values: readonly ResolvedAutomationArg[]): string {
  return [...values]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((v) => `${v.key}=${JSON.stringify(v.value)}`)
    .join('&');
}

/** Type of a raw JSON literal from a config/manifest (for tolerant reads). */
export const argTypeOf = (v: string | number | boolean): AutomationArgType =>
  typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string';

export { LAYERS };
