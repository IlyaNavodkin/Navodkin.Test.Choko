import { node } from '@/lib/node';
import type { LintWarning } from '@/schemas';
import type { DiscoveredTest } from '@/schemas/automation';
import {
  AUTOMATION_STORE_SCHEMA_VERSION,
  AutomationBindingSchema,
  AutomationBindingsFileSchema,
  AutomationCatalogFileSchema,
  AutomationProfileSchema,
  AutomationProfilesFileSchema,
  CatalogEntrySchema,
  normalizeArgDefinition,
  type AutomationBinding,
  type AutomationCatalogFile,
  type AutomationBindingsFile,
  type AutomationProfile,
  type AutomationProfilesFile,
  type CatalogEntry,
} from '@/schemas/automation-store';
import { sha256Hex } from '@/services/hash';
import { RepoPathError, resolveRepoWritePath, writeFileAtomic } from '@/services/repo-fs';
import { AUTOMATION_DIR, stableStringify } from './storage';

// ---------------------------------------------------------------------------
// Automation store fs layer (`.testoritto/automation/`): catalog, bindings, profiles.
//
// Rules mirror the reference book:
//   · opening a repository writes nothing — missing files are an empty store;
//   · writes are atomic, containment-checked and deterministically serialized (small diffs);
//   · a record this version cannot read is reported and never rewritten;
//   · an entry changed outside the app between read and save is refused.
// ---------------------------------------------------------------------------

export const CATALOG_REL = `${AUTOMATION_DIR}/catalog.json`;
export const BINDINGS_REL = `${AUTOMATION_DIR}/bindings.json`;
export const PROFILES_REL = `${AUTOMATION_DIR}/profiles.json`;

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

async function readJson(repoPath: string, rel: string): Promise<unknown | null> {
  try {
    return JSON.parse(await node.fsp().readFile(node.path().join(repoPath, rel), 'utf8'));
  } catch {
    return null;
  }
}

/** Read bytes and their revision, or `null` when absent (for the stale guard). */
async function readRevision(repoPath: string, rel: string): Promise<string | null> {
  try {
    const bytes = await node.fsp().readFile(node.path().join(repoPath, rel));
    return sha256Hex(bytes);
  } catch {
    return null;
  }
}

/** The revision (sha256) of a store file — `null` when absent. Used by the stale guard. */
export const storeRevision = readRevision;

/* ---------------------------------------------------------------------------
 * Catalog
 * ------------------------------------------------------------------------- */

export interface CatalogLoad {
  file: AutomationCatalogFile;
  revision: string | null;
  issues: LintWarning[];
}

const emptyCatalog = (): AutomationCatalogFile => ({
  schemaVersion: AUTOMATION_STORE_SCHEMA_VERSION,
  discoveredAt: '',
  playwrightVersion: '',
  entries: [],
});

/**
 * Read the catalog. A missing file is an empty catalog (nothing is created); entries this version
 * cannot read are skipped with a warning instead of failing the whole section.
 */
export async function loadCatalog(repoPath: string): Promise<CatalogLoad> {
  const issues: LintWarning[] = [];
  const raw = await readJson(repoPath, CATALOG_REL);
  if (raw === null) {
    // Distinguish "absent" from "unreadable/broken" — only the latter is a warning.
    const exists = await readRevision(repoPath, CATALOG_REL);
    if (exists !== null) issues.push({ code: 'automation-catalog-read', message: `${CATALOG_REL} is not valid JSON; the catalog is empty.`, file: CATALOG_REL });
    return { file: emptyCatalog(), revision: exists, issues };
  }
  const parsed = AutomationCatalogFileSchema.safeParse(raw);
  if (!parsed.success) {
    issues.push({ code: 'automation-catalog-read', message: `${CATALOG_REL} has an unexpected shape; the catalog is empty.`, file: CATALOG_REL });
    return { file: emptyCatalog(), revision: await readRevision(repoPath, CATALOG_REL), issues };
  }
  const entries: CatalogEntry[] = [];
  for (const item of parsed.data.entries) {
    const e = CatalogEntrySchema.safeParse(item);
    if (!e.success) {
      issues.push({ code: 'automation-entry-skipped', message: `An entry in ${CATALOG_REL} could not be read and was skipped.`, file: CATALOG_REL });
      continue;
    }
    entries.push({
      ...e.data,
      expectedStatus: (e.data.expectedStatus as CatalogEntry['expectedStatus']) ?? null,
      arguments: e.data.arguments.map(normalizeArgDefinition),
    });
  }
  entries.sort((a, b) => (a.automationId < b.automationId ? -1 : a.automationId > b.automationId ? 1 : 0));
  return {
    file: {
      schemaVersion: parsed.data.schemaVersion,
      discoveredAt: parsed.data.discoveredAt,
      playwrightVersion: parsed.data.playwrightVersion,
      entries,
    },
    revision: await readRevision(repoPath, CATALOG_REL),
    issues,
  };
}

/** Deterministic catalog bytes (entries already sorted). */
export const serializeCatalog = (file: AutomationCatalogFile): string => stableStringify(file);

/**
 * Replace the catalog with a fresh discovery result. Returns the written file and its new revision.
 * `extraArguments` lets callers preserve declared argument definitions keyed by automationId.
 */
export async function saveCatalog(
  repoPath: string,
  tests: readonly DiscoveredTest[],
  meta: { playwrightVersion: string; discoveredAt?: string; extraArguments?: Record<string, CatalogEntry['arguments']>; archived?: ReadonlySet<string> },
): Promise<CatalogLoad> {
  const entries: CatalogEntry[] = tests
    .filter((t): t is DiscoveredTest & { automationId: string } => !!t.automationId)
    .map((t) => ({
      automationId: t.automationId,
      caseId: t.caseId,
      variantId: t.variantId,
      project: t.project,
      title: t.title,
      titlePath: [...t.titlePath],
      file: t.file,
      line: t.line,
      tags: [...t.tags],
      expectedStatus: t.expectedStatus,
      arguments: (meta.extraArguments?.[t.automationId] ?? []).map(normalizeArgDefinition),
      archived: meta.archived?.has(t.automationId) ?? false,
      revision: sha256Hex(JSON.stringify({ ...t, titlePath: t.titlePath })),
    }))
    .sort((a, b) => (a.automationId < b.automationId ? -1 : a.automationId > b.automationId ? 1 : 0));

  const file: AutomationCatalogFile = {
    schemaVersion: AUTOMATION_STORE_SCHEMA_VERSION,
    discoveredAt: meta.discoveredAt ?? new Date().toISOString(),
    playwrightVersion: meta.playwrightVersion,
    entries,
  };
  await writeFileAtomic(repoPath, CATALOG_REL, serializeCatalog(file));
  return { file, revision: await readRevision(repoPath, CATALOG_REL), issues: [] };
}

/* ---------------------------------------------------------------------------
 * Bindings
 * ------------------------------------------------------------------------- */

export interface BindingsLoad {
  file: AutomationBindingsFile;
  revision: string | null;
  issues: LintWarning[];
}

export async function loadBindings(repoPath: string): Promise<BindingsLoad> {
  const issues: LintWarning[] = [];
  const raw = await readJson(repoPath, BINDINGS_REL);
  const empty: AutomationBindingsFile = { schemaVersion: AUTOMATION_STORE_SCHEMA_VERSION, bindings: [] };
  if (raw === null) return { file: empty, revision: await readRevision(repoPath, BINDINGS_REL), issues };
  const parsed = AutomationBindingsFileSchema.safeParse(raw);
  if (!parsed.success) {
    issues.push({ code: 'automation-bindings-read', message: `${BINDINGS_REL} has an unexpected shape; bindings are empty.`, file: BINDINGS_REL });
    return { file: empty, revision: await readRevision(repoPath, BINDINGS_REL), issues };
  }
  const bindings: AutomationBinding[] = [];
  for (const item of parsed.data.bindings) {
    const b = AutomationBindingSchema.safeParse(item);
    if (!b.success) {
      issues.push({ code: 'automation-binding-skipped', message: `A binding in ${BINDINGS_REL} could not be read and was skipped.`, file: BINDINGS_REL });
      continue;
    }
    bindings.push(b.data as AutomationBinding);
  }
  bindings.sort((a, b) => (a.caseId + a.automationId + a.variantId < b.caseId + b.automationId + b.variantId ? -1 : 1));
  return { file: { schemaVersion: parsed.data.schemaVersion, bindings }, revision: await readRevision(repoPath, BINDINGS_REL), issues };
}

export async function saveBindings(repoPath: string, bindings: readonly AutomationBinding[]): Promise<BindingsLoad> {
  const file: AutomationBindingsFile = {
    schemaVersion: AUTOMATION_STORE_SCHEMA_VERSION,
    bindings: [...bindings].sort((a, b) => (a.caseId + a.automationId + a.variantId < b.caseId + b.automationId + b.variantId ? -1 : 1)),
  };
  await writeFileAtomic(repoPath, BINDINGS_REL, stableStringify(file));
  return { file, revision: await readRevision(repoPath, BINDINGS_REL), issues: [] };
}

/* ---------------------------------------------------------------------------
 * Profiles
 * ------------------------------------------------------------------------- */

export interface ProfilesLoad {
  file: AutomationProfilesFile;
  revision: string | null;
  issues: LintWarning[];
}

export async function loadProfiles(repoPath: string): Promise<ProfilesLoad> {
  const issues: LintWarning[] = [];
  const raw = await readJson(repoPath, PROFILES_REL);
  const empty: AutomationProfilesFile = { schemaVersion: AUTOMATION_STORE_SCHEMA_VERSION, profiles: [] };
  if (raw === null) return { file: empty, revision: await readRevision(repoPath, PROFILES_REL), issues };
  const parsed = AutomationProfilesFileSchema.safeParse(raw);
  if (!parsed.success) {
    issues.push({ code: 'automation-profiles-read', message: `${PROFILES_REL} has an unexpected shape; profiles are empty.`, file: PROFILES_REL });
    return { file: empty, revision: await readRevision(repoPath, PROFILES_REL), issues };
  }
  const profiles: AutomationProfile[] = [];
  for (const item of parsed.data.profiles) {
    const p = AutomationProfileSchema.safeParse(item);
    if (!p.success) {
      issues.push({ code: 'automation-profile-skipped', message: `A profile in ${PROFILES_REL} could not be read and was skipped.`, file: PROFILES_REL });
      continue;
    }
    profiles.push(p.data as AutomationProfile);
  }
  return { file: { schemaVersion: parsed.data.schemaVersion, profiles }, revision: await readRevision(repoPath, PROFILES_REL), issues };
}

export async function saveProfiles(repoPath: string, profiles: readonly AutomationProfile[]): Promise<ProfilesLoad> {
  const file: AutomationProfilesFile = { schemaVersion: AUTOMATION_STORE_SCHEMA_VERSION, profiles: [...profiles] };
  await writeFileAtomic(repoPath, PROFILES_REL, stableStringify(file));
  return { file, revision: await readRevision(repoPath, PROFILES_REL), issues: [] };
}

/**
 * Guarded write used by the UI: refuses to overwrite a file that changed since it was read.
 * Throws {@link AutomationStaleError} instead of clobbering an external edit.
 */
export class AutomationStaleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AutomationStaleError';
  }
}

export async function assertUnchanged(repoPath: string, rel: string, expected: string | null): Promise<void> {
  const current = await readRevision(repoPath, rel);
  if (current !== expected) {
    throw new AutomationStaleError(`${rel} changed outside the app since it was read.`);
  }
}

/** Absolute write target after the repository-containment check (shared by all three files). */
export async function automationWriteTarget(repoPath: string, rel: string): Promise<string> {
  return resolveRepoWritePath(repoPath, rel);
}

export { RepoPathError };
export { errText };
