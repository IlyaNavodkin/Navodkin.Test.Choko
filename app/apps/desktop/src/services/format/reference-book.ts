import { node } from '@/lib/node';
import {
  ARG_VALUE_TYPES,
  ReferenceKindSchema,
  argValueIssue,
  isSafeHttpUrl,
  type ArgValue,
  type ArgValueType,
  type ReferenceEntry,
  type ReferenceKind,
} from '@/schemas/reference-book';
import type { LintWarning } from '@/schemas';
import { CASEWRIGHT_DIR } from '../repo-paths';
import { yamlScalar } from './yaml-scalar';

// ---------------------------------------------------------------------------
// `.casewright/glossary/<uuid>.md` — one reference-book record per file: YAML front
// matter (identity + kind-specific payload) plus a Markdown description body.
//
// Hand-editable and forward-compatible by design: the parser is tolerant and reports
// diagnostics instead of throwing, unknown front-matter fields are carried through a
// save, `id` always comes from the file name, and the file's line ending is preserved.
// A file this version cannot represent (`kind` it doesn't know, a newer `schema_version`,
// broken YAML, a structurally wrong payload) is marked read-only and never rewritten.
// ---------------------------------------------------------------------------

export const REFERENCE_SCHEMA_VERSION = 1;

/** Product data root — reference book, image assets and bug reports live beside the repo config. */
export const GLOSSARY_DIR = `${CASEWRIGHT_DIR}/glossary`;

/** Repo-relative path of the record file for `id` (the file's stem is the identity). */
export const glossaryRel = (id: string): string => `${GLOSSARY_DIR}/${id}.md`;

/**
 * Whether `id` is usable as an entry id: it is copied verbatim into file names and link
 * paths, so it must stay a single plain path segment (`ENTRY_ID_RE` outlaws separators,
 * spaces and any character a Markdown link or the wiki encoding would have to escape).
 */
export function isSafeEntryId(id: string): boolean {
  return id !== '' && id !== '.' && id !== '..' && /^[A-Za-z0-9._-]+$/.test(id);
}

/**
 * How a record read back: `ok` (editable) or `readonly` (shown with diagnostics, never
 * rewritten — the reasons are the returned issues).
 */
export type ReferenceStatus = 'ok' | 'readonly';

export interface ParsedReference {
  entry: ReferenceEntry;
  /** The `kind` exactly as the file spells it (empty when absent) — for read-only diagnostics. */
  kindRaw: string;
  /** Unknown front-matter fields in file order — re-emitted on save so nothing is lost. */
  extra: Record<string, unknown>;
  /** The file's line ending, so a save keeps its style. */
  eol: '\n' | '\r\n';
  status: ReferenceStatus;
  issues: LintWarning[];
}

const KNOWN_COMMON_KEYS = ['schema_version', 'id', 'kind', 'title', 'aliases', 'archived'] as const;
const KNOWN_BY_KIND: Record<ReferenceKind, readonly string[]> = {
  link: [...KNOWN_COMMON_KEYS, 'url'],
  arguments: [...KNOWN_COMMON_KEYS, 'values'],
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isScalar = (v: unknown): v is string | number | boolean =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

/** Lossless coercion of any YAML scalar to a string (a numeric-looking plain scalar reads back as a number). */
const asString = (v: unknown): string => (isScalar(v) ? String(v) : '');

/** Drop leading/trailing blank lines — never a line's own indentation (significant in Markdown). */
function trimBlankLines(text: string): string {
  const lines = text.split('\n');
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start++;
  while (end > start && lines[end - 1].trim() === '') end--;
  return lines.slice(start, end).join('\n');
}

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

/** A typed value's YAML form: plain for numbers/booleans, quoted-when-ambiguous for strings. */
const yamlValue = (v: ArgValue): string =>
  typeof v.value === 'string' ? yamlScalar(v.value.trim()) : JSON.stringify(v.value);

function serializeValues(values: ArgValue[]): string[] {
  const rows = values.filter((v) => v.key.trim());
  if (!rows.length) return ['values: []'];
  const lines = ['values:'];
  for (const v of rows) {
    lines.push(`  - key: ${yamlScalar(v.key.trim())}`, `    type: ${v.type}`, `    value: ${yamlValue(v)}`);
    if (v.type === 'enum') {
      lines.push(`    options: [${(v.options ?? []).map((o) => yamlScalar(o.trim())).join(', ')}]`);
    }
  }
  return lines;
}

/**
 * Write a record's canonical Markdown form: front matter in a stable key order, the
 * description body, one trailing newline — all using `eol` (the style the file already had).
 * Unknown `extra` fields are appended in JSON flow style, which is valid YAML and round-trips
 * any shape exactly.
 */
export function serializeReferenceEntry(
  entry: ReferenceEntry,
  opts: { extra?: Record<string, unknown>; eol?: '\n' | '\r\n' } = {},
): string {
  const eol = opts.eol ?? '\n';
  const lines = [
    '---',
    `schema_version: ${REFERENCE_SCHEMA_VERSION}`,
    `id: ${yamlScalar(entry.id)}`,
    `kind: ${entry.kind}`,
    `title: ${yamlScalar(entry.title.trim())}`,
    `aliases: [${entry.aliases.map((a) => a.trim()).filter(Boolean).map(yamlScalar).join(', ')}]`,
    `archived: ${entry.archived ? 'true' : 'false'}`,
  ];
  if (entry.kind === 'link') {
    const url = (entry.url ?? '').trim();
    if (url) lines.push(`url: ${yamlScalar(url)}`);
  } else {
    lines.push(...serializeValues(entry.values ?? []));
  }
  for (const [key, value] of Object.entries(opts.extra ?? {})) {
    lines.push(`${yamlScalar(key)}: ${JSON.stringify(value)}`);
  }
  lines.push('---');

  const head = lines.join(eol);
  const body = trimBlankLines(entry.description).split('\n').join(eol);
  return body ? `${head}${eol}${eol}${body}${eol}` : `${head}${eol}`;
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/** Read one typed value row, reporting structural problems instead of guessing. */
function parseValueRow(
  raw: unknown,
  index: number,
  issues: LintWarning[],
): { value: ArgValue | null; structural: boolean } {
  const where = `values[${index}]`;
  if (!isRecord(raw)) {
    issues.push({ code: 'value-shape', message: `${where} must be a mapping with key/type/value.` });
    return { value: null, structural: true };
  }
  const key = asString(raw.key).trim();
  const typeRaw = typeof raw.type === 'string' ? raw.type.trim() : '';
  const type = (ARG_VALUE_TYPES as readonly string[]).includes(typeRaw) ? (typeRaw as ArgValueType) : null;
  if (!type) {
    issues.push({
      code: 'unknown-type',
      message: `${where}${key ? ` ("${key}")` : ''} has an unknown type ${JSON.stringify(raw.type)}; expected one of: ${ARG_VALUE_TYPES.join(', ')}.`,
    });
    return { value: null, structural: true };
  }
  if (type === 'enum' && raw.options != null && (!Array.isArray(raw.options) || raw.options.some((o) => !isScalar(o)))) {
    issues.push({ code: 'value-shape', message: `${where} ("${key}") "options" must be a list of strings.` });
    return { value: null, structural: true };
  }
  if (raw.value != null && !isScalar(raw.value)) {
    issues.push({ code: 'value-shape', message: `${where} ("${key}") "value" must be a scalar.` });
    return { value: null, structural: true };
  }
  // Any scalar is a lossless string; the other types must already have the declared shape.
  const value = type === 'string' ? asString(raw.value) : (raw.value ?? '');
  const row: ArgValue = {
    key,
    type,
    value: value as ArgValue['value'],
    ...(type === 'enum' ? { options: (raw.options as unknown[] | undefined)?.map(asString) ?? [] } : {}),
  };
  const issue = argValueIssue(row);
  if (issue) {
    issues.push({ code: 'value-type', message: `${where}${key ? ` ("${key}")` : ''}: ${issue}.` });
    return { value: null, structural: true };
  }
  return { value: row, structural: false };
}

/**
 * Parse a record file. `fileId` is the file's stem — the record's identity, since the path
 * (not the front matter) is what links point at; a differing `id` field is reported and healed
 * on the next save.
 */
export function parseReferenceEntry(raw: string, fileId = ''): ParsedReference {
  const eol: '\n' | '\r\n' = raw.includes('\r\n') ? '\r\n' : '\n';
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const issues: LintWarning[] = [];

  let data: Record<string, unknown> = {};
  let content = '';
  try {
    const parsed = node.matter()(text);
    data = isRecord(parsed.data) ? parsed.data : {};
    content = typeof parsed.content === 'string' ? parsed.content : '';
  } catch {
    issues.push({ code: 'frontmatter', message: 'Front matter is not valid YAML.' });
    return {
      entry: { id: fileId, kind: 'link', title: '', aliases: [], archived: false, description: '' },
      kindRaw: '',
      extra: {},
      eol,
      status: 'readonly',
      issues,
    };
  }

  const description = trimBlankLines(content);

  /* ---- schema version: a newer file belongs to a version that may store more than we know ---- */
  const version = data.schema_version ?? REFERENCE_SCHEMA_VERSION;
  const versionOk = typeof version === 'number' && Number.isInteger(version) && version >= 1;
  if (!versionOk) {
    issues.push({
      code: 'schema-version',
      message: `"schema_version" must be a whole number (found ${JSON.stringify(data.schema_version)}).`,
    });
  } else if (version > REFERENCE_SCHEMA_VERSION) {
    issues.push({
      code: 'schema-version',
      message: `This record was written by a newer version (schema_version ${version}) and is shown read-only.`,
    });
  }

  /* ---- kind: unknown means we cannot know how to write the file back ---- */
  const kindRaw = asString(data.kind).trim();
  const kind = ReferenceKindSchema.safeParse(kindRaw);
  if (!kind.success) {
    issues.push({
      code: 'unknown-kind',
      message: kindRaw
        ? `Unknown kind ${JSON.stringify(kindRaw)} — expected "link" or "arguments".`
        : 'This file has no "kind" and is shown read-only.',
    });
  }
  const entryKind: ReferenceKind = kind.success ? kind.data : 'link';

  /* ---- title / aliases / archived ---- */
  const title = asString(data.title);
  let structural = false;
  let aliases: string[] = [];
  if (data.aliases != null) {
    if (Array.isArray(data.aliases)) {
      aliases = data.aliases.map((a) => asString(a).trim()).filter(Boolean);
    } else if (isScalar(data.aliases)) {
      const single = asString(data.aliases).trim();
      if (single) aliases = [single];
    } else {
      issues.push({ code: 'aliases-shape', message: '"aliases" must be a list of names.' });
      structural = true;
    }
  }
  if (data.archived != null && typeof data.archived !== 'boolean') {
    issues.push({ code: 'archived-shape', message: `"archived" must be true or false (found ${JSON.stringify(data.archived)}).` });
    structural = true;
  }
  const archived = data.archived === true;

  /* ---- kind-specific payload ---- */
  let url: string | undefined;
  let values: ArgValue[] | undefined;
  if (entryKind === 'link' && kind.success) {
    url = asString(data.url).trim();
  }
  if (entryKind === 'arguments' && kind.success) {
    if (data.values == null) {
      values = [];
    } else if (!Array.isArray(data.values)) {
      issues.push({ code: 'values-shape', message: '"values" must be a list of key/type/value entries.' });
      values = [];
      structural = true;
    } else {
      const rows: ArgValue[] = [];
      data.values.forEach((row, index) => {
        const parsed = parseValueRow(row, index, issues);
        if (parsed.value) rows.push(parsed.value);
        structural = structural || parsed.structural;
      });
      values = rows;
    }
  }

  /* ---- identity comes from the file name; a divergent `id` field is healed on save ---- */
  const frontId = asString(data.id).trim();
  const badFileName = !!fileId && !isSafeEntryId(fileId);
  if (badFileName) {
    issues.push({
      code: 'file-name',
      message: `"${fileId}.md" is not a usable record id — rename the file to letters, digits, "-", "_" or ".".`,
    });
  } else if (kind.success && fileId && frontId && frontId !== fileId) {
    issues.push({ code: 'id-mismatch', message: `The file name ("${fileId}") differs from "id: ${frontId}"; the file name is used.` });
  } else if (kind.success && fileId && !frontId) {
    issues.push({ code: 'missing-id', message: 'The record had no `id`; the file name is used.' });
  }

  /* ---- unknown fields (including the other kind's payload key) ride along untouched ---- */
  const extra: Record<string, unknown> = {};
  const known = new Set<string>(KNOWN_BY_KIND[entryKind]);
  for (const [key, value] of Object.entries(data)) {
    if (!known.has(key)) extra[key] = value;
  }

  const readonly =
    badFileName ||
    !kind.success ||
    !versionOk ||
    (typeof version === 'number' && version > REFERENCE_SCHEMA_VERSION) ||
    structural;

  return {
    entry: {
      id: fileId || frontId,
      kind: entryKind,
      title,
      aliases,
      archived,
      description,
      ...(entryKind === 'link' ? { url } : { values }),
    },
    kindRaw,
    extra,
    eol,
    status: readonly ? 'readonly' : 'ok',
    issues,
  };
}

/** Whether a record's URL can be opened (the only URL the app ever hands to the OS). */
export const isOpenableReferenceUrl = (url: string | undefined): boolean => !!url && isSafeHttpUrl(url);
