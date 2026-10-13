import { node } from '@/lib/node';
import { WorkspaceYamlSchema, type LintWarning } from '@/schemas';
import { folderSlug } from '@/utils/ids';
import { parseFolderNote, type FolderNoteMeta } from './format/folder-note';
import { parseSuite } from './format/suite';
import {
  LEGACY_SUITE_FILE,
  WORKSPACE_MARKER,
  baseOf,
  folderNoteRel,
  needsWikiFix,
  parentOf,
  parseYamlDoc,
  relJoin,
} from './repo-paths';
import { deletePath, isDir, readMaybe, renamePath } from './repo-fs';
import { readConfig, syncFolderNote, writeRootMeta, writeWorkspacesList } from './repo-metadata';

// ---------------------------------------------------------------------------
// Migration — legacy (casewright.yaml/_suite.md) → config + folder notes, and
// folder-name normalization to wiki-safe slugs. Runs on open; fully idempotent.
// ---------------------------------------------------------------------------

/** Walk the tree for legacy `casewright.yaml` markers (the old discovery walk). */
async function findLegacyWorkspaceMarkers(repoPath: string): Promise<string[]> {
  const path = node.path();
  const fsp = node.fsp();
  const found: string[] = [];
  const walk = async (relDir: string): Promise<void> => {
    const absDir = relDir === '' ? repoPath : path.join(repoPath, relDir);
    const entries = await fsp.readdir(absDir, { withFileTypes: true }).catch(() => []);
    if (entries.some((e) => e.isFile() && e.name === WORKSPACE_MARKER)) {
      found.push(relDir);
      return; // legacy: workspaces don't nest
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      await walk(relDir === '' ? e.name : `${relDir}/${e.name}`);
    }
  };
  await walk('');
  return found;
}

/** Convert every legacy `_suite.md` under `wsRel` into a sibling folder note (lazy), then
 *  delete the legacy file. */
async function migrateSuiteFilesIn(repoPath: string, wsRel: string): Promise<boolean> {
  const path = node.path();
  const fsp = node.fsp();
  let changed = false;
  const walk = async (dirRel: string): Promise<void> => {
    const absDir = dirRel === '' ? repoPath : path.join(repoPath, dirRel);
    const entries = await fsp.readdir(absDir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const childRel = relJoin(dirRel, e.name);
      const suiteFileRel = relJoin(childRel, LEGACY_SUITE_FILE);
      const suiteRaw = await readMaybe(path.join(repoPath, suiteFileRel));
      if (suiteRaw != null) {
        const { suite } = parseSuite(suiteRaw);
        await syncFolderNote(repoPath, childRel, { name: suite.title ?? '', description: suite.description ?? '' });
        await deletePath(repoPath, suiteFileRel); // remove the legacy file once converted
        changed = true;
      }
      await walk(childRel);
    }
  };
  await walk(wsRel);
  return changed;
}

/**
 * Recursively rename folders with non-wiki-safe basenames to the slugged form (bottom-up,
 * so a parent rename never invalidates a child operation), moving any sibling note along
 * and recording the original name as the note's display `name`. Returns the (possibly new)
 * path of `folderRel`.
 */
async function normalizeFoldersWikiSafe(repoPath: string, folderRel: string, warnings: LintWarning[]): Promise<string> {
  const path = node.path();
  const fsp = node.fsp();
  const absDir = path.join(repoPath, folderRel);
  const entries = await fsp.readdir(absDir, { withFileTypes: true }).catch(() => []);
  for (const name of entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name)) {
    await normalizeFoldersWikiSafe(repoPath, relJoin(folderRel, name), warnings);
  }

  const base = baseOf(folderRel);
  if (!needsWikiFix(base)) return folderRel;
  const safe = folderSlug(base);
  if (!safe || safe === base) return folderRel;

  const parent = parentOf(folderRel);
  let target = relJoin(parent, safe);
  let n = 2;
  while (await isDir(path.join(repoPath, target))) target = relJoin(parent, `${safe}-${n++}`);

  // Preserve any existing note's contents; default the display name to the original basename.
  const oldNote = folderNoteRel(folderRel);
  const noteRaw = await readMaybe(path.join(repoPath, oldNote));
  let meta: FolderNoteMeta = { name: base };
  if (noteRaw != null) {
    const parsed = parseFolderNote(noteRaw);
    meta = { name: parsed.meta.name || base, prefix: parsed.meta.displayIdPrefix, description: parsed.description };
    await deletePath(repoPath, oldNote);
  }
  await renamePath(repoPath, folderRel, target);
  await syncFolderNote(repoPath, target, meta);
  warnings.push({ code: 'renamed', message: `Renamed "${folderRel}" → "${target}" for wiki compatibility (kept "${meta.name}" as its display name).` });
  return target;
}

/**
 * Auto-migrate a repo on open: legacy `casewright.yaml`/`_suite.md` → `config.yaml`
 * `workspaces:` + sibling folder notes, then normalize folder names to wiki-safe slugs.
 * The legacy files are **deleted** once converted; a fallback reader still understands any
 * that linger (e.g. from a partial run). Idempotent — a migrated repo is a no-op on re-open.
 */
export async function migrateRepo(repoPath: string, warnings: LintWarning[]): Promise<void> {
  const cfg = await readConfig(repoPath);
  let wsList = cfg.workspaces.map((p) => (p === '.' ? '' : p));
  const before = [...wsList];
  let changed = false;

  // 1. Legacy markers → workspace list + folder notes (then delete the legacy files).
  for (const rel of await findLegacyWorkspaceMarkers(repoPath)) {
    if (!wsList.includes(rel)) {
      wsList.push(rel);
      changed = true;
    }
    const markerRel = relJoin(rel, WORKSPACE_MARKER);
    const wsRaw = await readMaybe(node.path().join(repoPath, markerRel));
    if (wsRaw != null) {
      const parsed = WorkspaceYamlSchema.safeParse(parseYamlDoc(wsRaw));
      const y = parsed.success ? parsed.data : WorkspaceYamlSchema.parse({});
      if (rel === '') await writeRootMeta(repoPath, { name: y.name, prefix: y.displayIdPrefix, description: y.description ?? '' });
      else await syncFolderNote(repoPath, rel, { name: y.name, prefix: y.displayIdPrefix, description: y.description ?? '' });
      await deletePath(repoPath, markerRel); // remove the legacy marker once converted
      changed = true;
    }
    if (await migrateSuiteFilesIn(repoPath, rel)) changed = true;
  }

  // 2. Normalize folder names (rename folders with spaces/illegal chars) within each workspace.
  const remap: Record<string, string> = {};
  for (const rel of wsList) {
    if (rel === '') continue;
    const next = await normalizeFoldersWikiSafe(repoPath, rel, warnings);
    if (next !== rel) {
      remap[rel] = next;
      changed = true;
    }
  }
  if (Object.keys(remap).length) wsList = wsList.map((p) => remap[p] ?? p);

  // 3. Persist the workspace list if anything changed.
  if (changed || JSON.stringify(before) !== JSON.stringify(wsList)) {
    await writeWorkspacesList(repoPath, wsList);
    warnings.push({ code: 'migrated', message: `Migrated to the config + folder-note format (${wsList.length} workspace${wsList.length === 1 ? '' : 's'}). Review and commit.` });
  }
}
