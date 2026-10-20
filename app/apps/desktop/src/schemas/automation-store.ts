import { z } from 'zod';
import { ArgValueTypeSchema } from './reference-book';
import type {
  AutomationArgDefinition,
  AutomationArgType,
  AutomationArgValue,
  DiscoveredTest,
} from './automation';

// ---------------------------------------------------------------------------
// Automation storage model (`.casewright/automation/{catalog,bindings,profiles}.json`).
//
// These are *machine* files with deterministic serialization (see services/automation/catalog.ts):
// stable key order, one record per line-ish shape, small diffs. Everything is read tolerantly —
// a hand-edited or partially broken file degrades to a diagnostic, never a crash.
// ---------------------------------------------------------------------------

export const AUTOMATION_STORE_SCHEMA_VERSION = 1;

/** A test as the catalog recorded it (a snapshot of discovery; discovery refreshes it). */
export interface CatalogEntry {
  automationId: string;
  caseId: string | null;
  variantId: string | null;
  project: string;
  title: string;
  /** Suite titles + test title, as discovery reported them. */
  titlePath: string[];
  file: string | null;
  line: number | null;
  tags: string[];
  expectedStatus: DiscoveredTest['expectedStatus'];
  /** Arguments the test declares (from its annotations/config when known). */
  arguments: AutomationArgDefinition[];
  /** Archived entries stay in history but never run. */
  archived: boolean;
  /** sha256 of the discovery payload that produced this entry (to detect drift). */
  revision: string;
}

/** A case ↔ autotest link (many-to-many), with per-binding overrides. */
export interface AutomationBinding {
  id: string;
  caseId: string;
  automationId: string;
  project: string;
  variantId: string;
  enabled: boolean;
  /** Binding-level argument values (beat autotest, lose to a run override). */
  arguments: Record<string, AutomationArgValue>;
  archived: boolean;
}

/** A trusted execution profile (cwd/config/projects/timeout) for one repository. */
export interface AutomationProfile {
  id: string;
  /** The repository this profile is trusted for. */
  repoPath: string;
  /** Playwright config file, relative to the repo ('' = project default). */
  configFile: string;
  projects: string[];
  timeoutMs: number;
  /** Extra CLI args applied to every run (never shell-expanded). */
  args: string[];
  /** Set when the config/tests changed after trust was granted. */
  trustedAt: string;
}

export interface AutomationCatalogFile {
  schemaVersion: number;
  /** ISO timestamp of the discovery that produced this catalog. */
  discoveredAt: string;
  /** The Playwright version used for discovery. */
  playwrightVersion: string;
  entries: CatalogEntry[];
}

export interface AutomationBindingsFile {
  schemaVersion: number;
  bindings: AutomationBinding[];
}

export interface AutomationProfilesFile {
  schemaVersion: number;
  profiles: AutomationProfile[];
}

/* ---- tolerant zod shapes (unknown fields are kept by the reader, not validated away) ---- */

const ArgDefinitionSchema = z.object({
  key: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'url', 'enum'] satisfies AutomationArgType[]),
  required: z.boolean().optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  options: z.array(z.string()).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});

export const CatalogEntrySchema = z.object({
  automationId: z.string().min(1),
  caseId: z.string().nullable().default(null),
  variantId: z.string().nullable().default(null),
  project: z.string().default(''),
  title: z.string().default(''),
  titlePath: z.array(z.string()).default([]),
  file: z.string().nullable().default(null),
  line: z.number().int().nullable().default(null),
  tags: z.array(z.string()).default([]),
  expectedStatus: z.string().nullable().default(null),
  arguments: z.array(ArgDefinitionSchema).default([]),
  archived: z.boolean().default(false),
  revision: z.string().default(''),
});

const ArgValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('literal'), value: z.union([z.string(), z.number(), z.boolean()]) }),
  z.object({
    kind: z.literal('reference'),
    entryId: z.string(),
    key: z.string(),
    revision: z.string().optional(),
  }),
]);

export const AutomationBindingSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  automationId: z.string().min(1),
  project: z.string().default(''),
  variantId: z.string().default('default'),
  enabled: z.boolean().default(true),
  arguments: z.record(z.string(), ArgValueSchema).default({}),
  archived: z.boolean().default(false),
});

export const AutomationProfileSchema = z.object({
  id: z.string().min(1),
  repoPath: z.string().default(''),
  configFile: z.string().default(''),
  projects: z.array(z.string()).default([]),
  timeoutMs: z.number().int().positive().default(15 * 60_000),
  args: z.array(z.string()).default([]),
  trustedAt: z.string().default(''),
});

export const AutomationCatalogFileSchema = z.object({
  schemaVersion: z.number().int().default(AUTOMATION_STORE_SCHEMA_VERSION),
  discoveredAt: z.string().default(''),
  playwrightVersion: z.string().default(''),
  entries: z.array(z.unknown()).default([]),
});

export const AutomationBindingsFileSchema = z.object({
  schemaVersion: z.number().int().default(AUTOMATION_STORE_SCHEMA_VERSION),
  bindings: z.array(z.unknown()).default([]),
});

export const AutomationProfilesFileSchema = z.object({
  schemaVersion: z.number().int().default(AUTOMATION_STORE_SCHEMA_VERSION),
  profiles: z.array(z.unknown()).default([]),
});

/** The identity tuple a binding points at. */
export const bindingKey = (b: Pick<AutomationBinding, 'caseId' | 'automationId' | 'project' | 'variantId'>): string =>
  [b.caseId, b.automationId, b.project, b.variantId || 'default'].join('::');

/** Definitions of an argument, normalized for deterministic storage. */
export const normalizeArgDefinition = (d: AutomationArgDefinition): AutomationArgDefinition => ({
  key: d.key,
  type: d.type,
  ...(d.required ? { required: true } : {}),
  ...(d.default !== undefined ? { default: d.default } : {}),
  ...(d.options?.length ? { options: [...d.options] } : {}),
  ...(d.min !== undefined ? { min: d.min } : {}),
  ...(d.max !== undefined ? { max: d.max } : {}),
});

/**
 * Semantic validation of declared arguments (used by the editor before saving): a non-empty,
 * unique, env-safe key; enum options; numeric bounds; a default that matches the declared type.
 */
export function validateArgDefinitions(defs: readonly AutomationArgDefinition[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const d of defs) {
    if (!d.key.trim()) {
      problems.push('Every argument needs a key.');
      continue;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(d.key)) {
      problems.push(`"${d.key}" is not a usable key (letters, digits, "-" and "_" only).`);
    }
    if (seen.has(d.key)) problems.push(`The argument "${d.key}" is declared twice.`);
    seen.add(d.key);

    if (d.type === 'enum') {
      const options = (d.options ?? []).map((o) => o.trim());
      if (!options.length) problems.push(`"${d.key}": an enum needs at least one option.`);
      else if (options.some((o) => !o)) problems.push(`"${d.key}": enum options must not be blank.`);
      else if (new Set(options).size !== options.length) problems.push(`"${d.key}": enum options must be unique.`);
      else if (d.default !== undefined && !options.includes(String(d.default))) {
        problems.push(`"${d.key}": the default must be one of its options.`);
      }
    }
    if (d.type === 'number') {
      if (d.min !== undefined && d.max !== undefined && d.min > d.max) {
        problems.push(`"${d.key}": the minimum is greater than the maximum.`);
      }
      if (typeof d.default === 'string' && d.default.trim() !== '' && Number.isNaN(Number(d.default))) {
        problems.push(`"${d.key}": the default must be a number.`);
      }
    }
    if (d.type === 'boolean' && d.default !== undefined && typeof d.default !== 'boolean') {
      problems.push(`"${d.key}": the default must be true or false.`);
    }
  }
  return problems;
}

/** Re-export so callers do not import from the schema file twice. */
export { ArgValueTypeSchema };
