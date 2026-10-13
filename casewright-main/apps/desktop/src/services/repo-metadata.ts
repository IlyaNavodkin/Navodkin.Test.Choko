import { node } from '@/lib/node';
import { ConfigYamlSchema, type ConfigYaml } from '@/schemas';
import { folderSlug } from '@/utils/ids';
import { CASEWRIGHT_GITIGNORE, serializeConfigYaml } from './format/config';
import { serializeFolderNote, type FolderNoteMeta } from './format/folder-note';
import {
  CASEWRIGHT_DIR,
  CONFIG_REL,
  baseOf,
  folderNoteRel,
  needsWikiFix,
  noteNeeded,
  parentOf,
  parseYamlDoc,
  relJoin,
} from './repo-paths';
import { deletePath, isDir, readMaybe, renamePath, writeFileAt } from './repo-fs';

// ---------------------------------------------------------------------------
// Folder-note + config writers — the lazy persistence layer the store composes.
// A folder note (`<folder>.md`) is written only when it carries metadata beyond
// the folder name; the root workspace's metadata lives in `config.yaml` instead.
// ---------------------------------------------------------------------------

/**
 * Scaffold `.casewright/` for a Git repo that doesn't have it yet (PRD §4 req 2, 4):
 * writes `config.yaml`, creates `runs/` (tracked via `.gitkeep`), and writes the
 * `.gitignore` that keeps `cache/` out of Git.
 */
export async function initRepo(repoPath: string): Promise<void> {
  const path = node.path();
  const fsp = node.fsp();
  const dir = path.join(repoPath, CASEWRIGHT_DIR);
  await fsp.mkdir(path.join(dir, 'runs'), { recursive: true });
  await fsp.writeFile(path.join(dir, 'config.yaml'), serializeConfigYaml({ version: 1, name: path.basename(repoPath) }));
  await fsp.writeFile(path.join(dir, '.gitignore'), CASEWRIGHT_GITIGNORE);
  await fsp.writeFile(path.join(dir, 'runs', '.gitkeep'), '');
}

/** Read + parse `.casewright/config.yaml` tolerantly (defaults when missing/invalid). */
export async function readConfig(repoPath: string): Promise<ConfigYaml> {
  const raw = await readMaybe(node.path().join(repoPath, CONFIG_REL));
  const parsed = ConfigYamlSchema.safeParse(raw ? parseYamlDoc(raw) : {});
  return parsed.success ? parsed.data : ConfigYamlSchema.parse({});
}

/** Write the root workspace's metadata into `config.yaml` (it has no sibling note). */
export async function writeRootMeta(repoPath: string, meta: FolderNoteMeta): Promise<void> {
  const cfg = await readConfig(repoPath);
  await writeFileAt(
    repoPath,
    CONFIG_REL,
    serializeConfigYaml({
      version: cfg.version,
      name: meta.name || cfg.name,
      displayIdPrefix: meta.prefix,
      description: meta.description,
      workspaces: cfg.workspaces,
    }),
  );
}

/**
 * Lazily persist a folder's note: write `<folder>.md` only when it carries metadata
 * beyond the folder name ({@link noteNeeded}); otherwise delete any existing note. Skips
 * the write when the on-disk content already matches (so it's safe to call on every edit
 * and during idempotent migration). Returns `true` when it changed the disk.
 */
export async function syncFolderNote(repoPath: string, folderRel: string, meta: FolderNoteMeta): Promise<boolean> {
  if (folderRel === '' || folderRel === '.') {
    await writeRootMeta(repoPath, meta);
    return true;
  }
  const noteRel = folderNoteRel(folderRel);
  const abs = node.path().join(repoPath, noteRel);
  const existing = await readMaybe(abs);
  if (noteNeeded(baseOf(folderRel), meta)) {
    const desired = serializeFolderNote(meta);
    if (existing === desired) return false;
    await writeFileAt(repoPath, noteRel, desired);
    return true;
  }
  if (existing == null) return false;
  await deletePath(repoPath, noteRel);
  return true;
}

/** Move a folder's sibling note to follow the folder, if (and only if) a note exists. */
export async function moveFolderNote(repoPath: string, fromFolderRel: string, toFolderRel: string): Promise<void> {
  const from = folderNoteRel(fromFolderRel);
  const to = folderNoteRel(toFolderRel);
  if (from === to) return;
  if ((await readMaybe(node.path().join(repoPath, from))) == null) return;
  await renamePath(repoPath, from, to);
}

/** Rewrite `config.yaml`'s `workspaces:` list, preserving version/name/root metadata. */
export async function writeWorkspacesList(repoPath: string, paths: string[]): Promise<void> {
  const cfg = await readConfig(repoPath);
  await writeFileAt(
    repoPath,
    CONFIG_REL,
    serializeConfigYaml({
      version: cfg.version,
      name: cfg.name,
      displayIdPrefix: cfg.displayIdPrefix,
      description: cfg.description,
      workspaces: paths.map((p) => (p === '' ? '.' : p)),
    }),
  );
}

/**
 * If a folder's basename isn't wiki-safe (spaces/illegal chars), rename it (and move any
 * sibling note alongside) to the slugged form, disambiguating on collision. Returns the
 * (possibly new) repo-relative path. The original name is preserved by callers as the
 * note's display `name`.
 */
export async function ensureWikiSafeFolder(repoPath: string, folderRel: string): Promise<string> {
  if (folderRel === '' || folderRel === '.') return folderRel;
  const base = baseOf(folderRel);
  if (!needsWikiFix(base)) return folderRel;
  const safe = folderSlug(base);
  if (!safe || safe === base) return folderRel;
  const parent = parentOf(folderRel);
  let target = relJoin(parent, safe);
  let n = 2;
  while (target !== folderRel && (await isDir(node.path().join(repoPath, target)))) {
    target = relJoin(parent, `${safe}-${n++}`);
  }
  await moveFolderNote(repoPath, folderRel, target);
  await renamePath(repoPath, folderRel, target);
  return target;
}
