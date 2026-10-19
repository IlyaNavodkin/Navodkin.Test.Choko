import { z } from 'zod';

/**
 * Reference book (`.testoritto/glossary/<uuid>.md`): one record per file, two kinds —
 * `link` (a named reference with an optional URL and a Markdown description) and
 * `arguments` (a named set of typed `key → value` pairs for automation/reports).
 *
 * The in-memory model lives here; the on-disk round-trip (`services/format/reference-book.ts`)
 * reads tolerantly and reports diagnostics instead of throwing, so a hand-edited file never
 * breaks the catalog.
 */

export const ARG_VALUE_TYPES = ['string', 'number', 'boolean', 'url', 'enum'] as const;
export const ArgValueTypeSchema = z.enum(ARG_VALUE_TYPES);
export type ArgValueType = z.infer<typeof ArgValueTypeSchema>;

export const ReferenceKindSchema = z.enum(['link', 'arguments']);
export type ReferenceKind = z.infer<typeof ReferenceKindSchema>;

/**
 * Argument keys become `TESTORITTO_ARG_<KEY>` environment variables for Playwright runs,
 * so they are restricted to env-safe characters.
 */
export const ARG_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** A non-empty HTTP(S) URL without embedded credentials — the only URL we ever act on. */
export function isSafeHttpUrl(raw: string): boolean {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return false;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  return !!url.hostname;
}

/** One typed value of an `arguments` set. `options` is required for (and only for) `enum`. */
export interface ArgValue {
  key: string;
  type: ArgValueType;
  value: string | number | boolean;
  options?: string[];
}

/** Why a typed value is unusable, or `null` when it is fine. Shared by the draft validator
 *  and the file reader (which coerces first, then asks this same question). */
export function argValueIssue(v: ArgValue): string | null {
  if (!ARG_KEY_RE.test(v.key)) {
    return 'a key must start with a letter or digit and use only letters, digits, "-" and "_"';
  }
  switch (v.type) {
    case 'string':
      return typeof v.value === 'string' ? null : 'expected a string value';
    case 'number':
      return typeof v.value === 'number' && Number.isFinite(v.value) ? null : 'expected a number value';
    case 'boolean':
      return typeof v.value === 'boolean' ? null : 'expected a boolean value';
    case 'url':
      return typeof v.value === 'string' && isSafeHttpUrl(v.value)
        ? null
        : 'expected an http(s) URL without credentials';
    case 'enum': {
      const options = (v.options ?? []).map((o) => o.trim());
      if (!options.length) return 'an enum value needs a non-empty list of options';
      if (options.some((o) => !o)) return 'enum options must not be blank';
      if (new Set(options).size !== options.length) return 'enum options must be unique';
      if (typeof v.value !== 'string' || !options.includes(v.value.trim())) {
        return `value must be one of: ${options.join(', ')}`;
      }
      return null;
    }
  }
}

export const ArgValueSchema = z
  .object({
    key: z.string(),
    type: ArgValueTypeSchema,
    value: z.union([z.string(), z.number(), z.boolean()]),
    options: z.array(z.string()).optional(),
  })
  .superRefine((v, ctx) => {
    const issue = argValueIssue(v);
    if (issue) ctx.addIssue({ code: 'custom', message: issue });
  });

/** A reference-book record: stable `id`, kind-specific payload, archive flag. */
export const ReferenceEntrySchema = z.object({
  id: z.string().min(1),
  kind: ReferenceKindSchema,
  title: z.string(),
  aliases: z.array(z.string()),
  archived: z.boolean(),
  description: z.string(),
  /** `link` only. */
  url: z.string().optional(),
  /** `arguments` only. */
  values: z.array(ArgValueSchema).optional(),
});
export type ReferenceEntry = z.infer<typeof ReferenceEntrySchema>;

/** A field-level save problem, keyed to the form field that must change. */
export interface ReferenceIssue {
  field: 'title' | 'description' | 'url' | 'values';
  /** Index into `values`, when the problem is one row. */
  index?: number;
  message: string;
}

/**
 * Semantic rules a record must satisfy to be saved (design §3): a non-empty title, a
 * description or (for `link`) a URL, a safe HTTP(S) URL, unique argument keys and typed
 * values. Passwords/tokens are disallowed but undetectable — the UI warns instead.
 */
export function validateReferenceEntry(entry: ReferenceEntry): ReferenceIssue[] {
  const issues: ReferenceIssue[] = [];
  if (!entry.title.trim()) issues.push({ field: 'title', message: 'A title is required' });

  const url = (entry.url ?? '').trim();
  if (url && !isSafeHttpUrl(url)) {
    issues.push({ field: 'url', message: 'Enter a full http(s) URL (no user:password@)' });
  }
  if (entry.kind === 'link') {
    if (!entry.description.trim() && !url) {
      issues.push({ field: 'description', message: 'Add a description or a URL' });
    }
  } else if (!entry.description.trim()) {
    issues.push({ field: 'description', message: 'Add a description of what the set is for' });
  }

  const seen = new Set<string>();
  (entry.values ?? []).forEach((v, index) => {
    const issue = argValueIssue(v);
    if (issue) issues.push({ field: 'values', index, message: issue });
    const key = v.key.trim();
    if (seen.has(key)) {
      issues.push({ field: 'values', index, message: `duplicate key "${key}"` });
    } else {
      seen.add(key);
    }
  });
  return issues;
}
