import { node } from '@/lib/node';
import { ConfigYamlSchema, WorkspaceYamlSchema, type LintWarning } from '@/schemas';
import type { Case, Run, TreeNode, Workspace } from '@/types';
import { slug } from '@/utils/ids';
import { parseCase } from './format/case';
import { parseFolderNote } from './format/folder-note';
import { parseOrder } from './format/order';
import { parseRunCase, parseRunDetails, type RunCaseItem } from './format/run';
import { parseSuite } from './format/suite';
import {
  CASEWRIGHT_DIR,
  CONFIG_REL,
  LEGACY_SUITE_FILE,
  ORDER_FILE,
  RUNS_REL,
  WORKSPACE_MARKER,
  derivePrefix,
  folderNoteRel,
  parseYamlDoc,
  relJoin,
} from './repo-paths';
import { isDir, readMaybe } from './repo-fs';
import { migrateRepo } from './repo-migration';

// ---------------------------------------------------------------------------
// Read side of the repo service: open + validate `.casewright/`, discover
// workspaces, and load each workspace's tree/cases plus the repo-level runs.
// ---------------------------------------------------------------------------

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/** Loaded folder metadata (from a folder note, with legacy fallbacks). */
interface FolderMeta {
  name?: string;
  prefix?: string;
  description: string;
}

/**
 * Read a folder's metadata: the sibling folder note first, then legacy fallbacks
 * (`casewright.yaml` for a workspace, `_suite.md` for a suite). Returns `null` when the
 * folder has no note/marker — a perfectly normal, supported state (the caller defaults
 * the display name to the folder basename).
 */
async function readFolderMeta(repoPath: string, folderRel: string, warnings: LintWarning[]): Promise<FolderMeta | null> {
  const path = node.path();

  // 1. New format: the sibling folder note.
  if (folderRel !== '' && folderRel !== '.') {
    const noteRel = folderNoteRel(folderRel);
    const noteRaw = await readMaybe(path.join(repoPath, noteRel));
    if (noteRaw != null) {
      const { meta, description, warnings: w } = parseFolderNote(noteRaw);
      for (const x of w) warnings.push({ ...x, file: noteRel });
      return { name: meta.name, prefix: meta.displayIdPrefix, description };
    }
  }

  // 2. Legacy: a `casewright.yaml` workspace marker inside the folder.
  const legacyWsRel = relJoin(folderRel, WORKSPACE_MARKER);
  const legacyWsRaw = await readMaybe(path.join(repoPath, legacyWsRel));
  if (legacyWsRaw != null) {
    const parsed = WorkspaceYamlSchema.safeParse(parseYamlDoc(legacyWsRaw));
    const y = parsed.success ? parsed.data : WorkspaceYamlSchema.parse({});
    warnings.push({ code: 'legacy-format', message: `Legacy casewright.yaml at "${folderRel || '.'}" — reopen to migrate it to a folder note.`, file: legacyWsRel });
    return { name: y.name, prefix: y.displayIdPrefix, description: y.description ?? '' };
  }

  // 3. Legacy: a `_suite.md` inside the folder.
  const legacySuiteRaw = await readMaybe(path.join(repoPath, relJoin(folderRel, LEGACY_SUITE_FILE)));
  if (legacySuiteRaw != null) {
    const { suite } = parseSuite(legacySuiteRaw);
    return { name: suite.title, prefix: undefined, description: suite.description ?? '' };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Open repo → validate `.casewright/` + discover workspaces
// ---------------------------------------------------------------------------

export interface OpenedRepo {
  repoPath: string;
  workspaces: Workspace[];
  branch: string;
  warnings: LintWarning[];
  /** True when the worktree is a Git repo but has no `.casewright/` yet (offer to init). */
  needsInit: boolean;
}

/**
 * The workspace folders, read from `.casewright/config.yaml`'s `workspaces:` list — the
 * single source of truth (no more tree-walking for markers). Normalizes `.`→`''` (root),
 * strips `./` and trailing slashes, and de-dupes while preserving declaration order.
 */
function discoverWorkspaces(configData: Record<string, unknown>): string[] {
  const parsed = ConfigYamlSchema.safeParse(configData);
  const list = parsed.success ? parsed.data.workspaces : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const norm = raw === '.' ? '' : raw.replace(/^\.\//, '').replace(/\/+$/, '');
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

async function loadWorkspaceMeta(repoPath: string, wsPath: string, warnings: LintWarning[]): Promise<Workspace> {
  const path = node.path();
  const baseName = wsPath === '' ? path.basename(repoPath) : path.basename(wsPath);

  let meta: FolderMeta | null;
  if (wsPath === '') {
    // Root workspace: metadata lives in config.yaml (no parent dir for a sibling note).
    const cfgRaw = await readMaybe(path.join(repoPath, CONFIG_REL));
    const parsed = ConfigYamlSchema.safeParse(cfgRaw ? parseYamlDoc(cfgRaw) : {});
    const cfg = parsed.success ? parsed.data : ConfigYamlSchema.parse({});
    meta = { name: cfg.name, prefix: cfg.displayIdPrefix, description: cfg.description ?? '' };
  } else {
    meta = await readFolderMeta(repoPath, wsPath, warnings);
  }

  // A note-less folder is fine: fall back to the folder name and a derived prefix, silently.
  const name = (meta?.name ?? '').trim() || baseName;
  const prefix = (meta?.prefix ?? '').trim() || derivePrefix(name);

  return {
    id: slug(wsPath) || slug(baseName) || 'workspace',
    name,
    path: wsPath,
    description: meta?.description ?? '',
    prefix,
  };
}

/**
 * Open a repository: validate the Git worktree **and** the `.casewright/` folder,
 * read `.casewright/config.yaml` tolerantly, and discover self-declaring workspaces
 * (PRD §4 req 1–14). A missing `.casewright/` is reported via `needsInit` (not thrown).
 */
export async function openRepo(repoPath: string): Promise<OpenedRepo> {
  const path = node.path();
  const warnings: LintWarning[] = [];

  const git = node.simpleGit()(repoPath);
  if (!(await git.checkIsRepo())) {
    throw new Error(`Not a Git repository: ${repoPath}`);
  }
  const branch = (await git.branchLocal()).current || 'main';

  if (!(await isDir(path.join(repoPath, CASEWRIGHT_DIR)))) {
    warnings.push({ code: 'needs-init', message: 'This repository has no .casewright/ folder yet.' });
    return { repoPath, workspaces: [], branch, warnings, needsInit: true };
  }

  // Auto-migrate a legacy repo (casewright.yaml/_suite.md → config + folder notes) and
  // normalize folder names to be wiki-safe BEFORE discovery reads the config. Idempotent.
  await migrateRepo(repoPath, warnings);

  const configRaw = await readMaybe(path.join(repoPath, CONFIG_REL));
  const configData = configRaw ? parseYamlDoc(configRaw) : {};
  if (configRaw && !ConfigYamlSchema.safeParse(configData).success) {
    warnings.push({ code: 'config', message: '.casewright/config.yaml was invalid; using defaults.', file: CONFIG_REL });
  }

  const relPaths = discoverWorkspaces(configData);
  const workspaces: Workspace[] = [];
  for (const rel of relPaths) {
    if (rel !== '' && !(await isDir(path.join(repoPath, rel)))) {
      warnings.push({ code: 'ws-missing', message: `Workspace folder "${rel}" is listed in config but does not exist.`, file: CONFIG_REL });
      continue;
    }
    workspaces.push(await loadWorkspaceMeta(repoPath, rel, warnings));
  }
  workspaces.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));

  if (!workspaces.length) {
    warnings.push({ code: 'empty-repo', message: 'No workspaces found — add one to .casewright/config.yaml.' });
  }

  return { repoPath, workspaces, branch, warnings, needsInit: false };
}

// ---------------------------------------------------------------------------
// Load workspaces → tree + cases; load runs → repo-level
// ---------------------------------------------------------------------------

export interface LoadedWorkspace {
  tree: TreeNode[];
  cases: Case[];
  /** Repo-relative path each case was actually read from, keyed by case id. Drives
   *  rename-on-write cleanup: the on-disk name can differ from the canonical
   *  `caseFileName(c)` (e.g. after a title change or a filename-scheme change), and only
   *  the real source path lets the next write delete the old file instead of orphaning it. */
  paths: Record<string, string>;
  warnings: LintWarning[];
}

export interface LoadedRepo {
  tree: TreeNode[];
  cases: Case[];
  /** See {@link LoadedWorkspace.paths}. */
  paths: Record<string, string>;
  runs: Run[];
  warnings: LintWarning[];
}

/**
 * Read a suite folder's metadata from its sibling note (`<parentDir>/<name>.md`), using
 * the already-listed parent `entries` to avoid a read when no note exists; falls back to a
 * legacy `_suite.md` inside the folder. Returns `null` for the (normal) note-less folder.
 */
async function readSuiteMeta(
  parentAbs: string,
  parentEntries: { name: string; isFile: () => boolean }[],
  name: string,
): Promise<FolderMeta | null> {
  const path = node.path();
  const noteName = `${name}.md`;
  if (parentEntries.some((e) => e.isFile() && e.name === noteName)) {
    const raw = await readMaybe(path.join(parentAbs, noteName));
    if (raw != null) {
      const { meta, description } = parseFolderNote(raw);
      return { name: meta.name, prefix: meta.displayIdPrefix, description };
    }
  }
  const legacy = await readMaybe(path.join(parentAbs, name, LEGACY_SUITE_FILE));
  if (legacy != null) {
    const { suite } = parseSuite(legacy);
    return { name: suite.title, prefix: undefined, description: suite.description ?? '' };
  }
  return null;
}

/** Fold a per-case sidecar's checklist items into the `checks`/`failNotes`/`itemText` maps. */
function foldItems(
  items: RunCaseItem[],
  checks: Record<string, 'none' | 'pass' | 'fail'>,
  failNotes: Record<string, string>,
  itemText: Record<string, string>,
): void {
  for (const it of items) {
    checks[it.key] = it.state;
    if (it.failNote) failNotes[it.key] = it.failNote;
    itemText[it.key] = it.text;
  }
}

/**
 * Load all runs from `.casewright/runs/` once for the whole repo (PRD §4 req 16, 20).
 * A run is a folder: `_run.md` (details) plus one `NNN-<id>.md` sidecar per seeded case.
 * Runs are repo-level; rows may reference cases from any workspace.
 */
async function loadRuns(repoPath: string, warnings: LintWarning[]): Promise<Run[]> {
  const path = node.path();
  const runsAbs = path.join(repoPath, RUNS_REL);
  const entries = await node
    .fsp()
    .readdir(runsAbs, { withFileTypes: true })
    .catch(() => []);
  const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).sort(byName).reverse();
  const runs: Run[] = [];

  for (const d of dirs) {
    const stem = d.name;
    const dirAbs = path.join(runsAbs, stem);
    const dirRel = relJoin(RUNS_REL, stem);

    const detailsRaw = await readMaybe(path.join(dirAbs, '_run.md'));
    const det = detailsRaw ? parseRunDetails(detailsRaw) : null;
    if (det) for (const x of det.warnings) warnings.push({ ...x, file: relJoin(dirRel, '_run.md') });

    const caseEntries = await node
      .fsp()
      .readdir(dirAbs, { withFileTypes: true })
      .catch(() => []);
    const caseFiles = caseEntries
      .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== '_run.md')
      .sort(byName);

    // The seed-order filename prefix (`NNN-`) is the default; an optional `.order` (same Azure
    // DevOps wiki format the sidebar uses) overrides it. Keys are the sidecar filename stem
    // (minus `.md`); files missing from `.order` are appended in the default `byName` order.
    const stemOf = (name: string) => name.slice(0, -3);
    let orderedFiles = caseFiles;
    const orderRaw = await readMaybe(path.join(dirAbs, ORDER_FILE));
    if (orderRaw != null) {
      const byKey = new Map(caseFiles.map((f) => [stemOf(f.name), f] as const));
      const used = new Set<string>();
      const head: typeof caseFiles = [];
      for (const k of parseOrder(orderRaw)) {
        const f = byKey.get(k);
        if (f && !used.has(k)) {
          head.push(f);
          used.add(k);
        }
      }
      orderedFiles = [...head, ...caseFiles.filter((f) => !used.has(stemOf(f.name)))];
    }

    const rows: Run['rows'] = [];
    for (const cf of orderedFiles) {
      const text = (await readMaybe(path.join(dirAbs, cf.name))) ?? '';
      const { runCase, warnings: w } = parseRunCase(text);
      const file = relJoin(dirRel, cf.name);
      for (const x of w) warnings.push({ ...x, file });

      const checks: Record<string, 'none' | 'pass' | 'fail'> = {};
      const failNotes: Record<string, string> = {};
      const itemText: Record<string, string> = {};
      foldItems(runCase.setup, checks, failNotes, itemText);
      foldItems(runCase.steps, checks, failNotes, itemText);
      foldItems(runCase.accept, checks, failNotes, itemText);

      rows.push({
        case_id: runCase.caseId,
        display_id: runCase.displayId,
        title: runCase.title,
        result: runCase.result,
        tester: runCase.tester,
        executed_at: runCase.executedAt,
        notes: runCase.notes,
        checks,
        failNotes,
        itemText,
        file,
        ...(runCase.testDate ? { testDate: runCase.testDate } : {}),
      });
    }

    runs.push({
      id: dirRel,
      name: det?.details.name || stem,
      file: dirRel,
      created: det?.details.created || stem.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '',
      // Default the test date to the run's creation date for legacy runs without one.
      testDate: det?.details.testDate || det?.details.created || stem.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '',
      status: det?.details.status ?? 'open',
      scope: det?.details.scope ?? '',
      rows,
      summary: det?.details.summary ?? '',
      notes: det?.details.notes ?? '',
      testerApproval: det?.details.testerApproval ?? null,
      reviewerApproval: det?.details.reviewerApproval ?? null,
    });
  }
  // Newest-first by created date (id as a stable tie-breaker) — an explicit order every consumer
  // can rely on, rather than the incidental folder-name ordering above.
  runs.sort((a, b) => b.created.localeCompare(a.created) || b.id.localeCompare(a.id));
  return runs;
}

/**
 * Walk one workspace's folders → its suite/case subtree + cases (PRD §4). Suite
 * `id`/`path` are **full repo-relative** so multiple workspaces coexist in one
 * combined tree (see `loadRepo`). Runs are loaded separately at the repo level.
 */
export async function loadWorkspace(repoPath: string, ws: Workspace): Promise<LoadedWorkspace> {
  const path = node.path();
  const fsp = node.fsp();
  const wsAbs = path.join(repoPath, ws.path);
  const warnings: LintWarning[] = [];
  const cases: Case[] = [];
  const paths: Record<string, string> = {};

  // fullRel = the dir's full repo-relative path; cases at the workspace root belong
  // to the workspace node (id = ws.id). Dot-folders (incl. `.casewright`) are skipped.
  const walk = async (absDir: string, fullRel: string): Promise<TreeNode[]> => {
    const entries = await fsp.readdir(absDir, { withFileTypes: true });
    const dirNames = new Set(entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name));
    // A `.md` is a FOLDER NOTE (a sibling page for its folder) iff a directory of the same
    // basename sits beside it; otherwise it's a test case. Legacy `_suite.md` is excluded too.
    const isFolderNote = (fileName: string) => dirNames.has(fileName.slice(0, -3));
    const files = entries
      .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== LEGACY_SUITE_FILE && !isFolderNote(e.name))
      .sort(byName);
    const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).sort(byName);
    const nodes: TreeNode[] = [];
    // The workspace-root level reuses the (already-normalized, never-empty) workspace
    // id so a root workspace (`ws.path === ''`) doesn't get an empty suite id.
    const suiteId = fullRel === ws.path ? ws.id : slug(fullRel);

    // Merge cases + subfolders into one display sequence. Default order is the historical
    // "cases (byName) then dirs (byName)". An optional `.order` (Azure DevOps wiki format)
    // overrides it: keys it lists come first in that order; on-disk children missing from
    // `.order` are appended in the default order. A `.order` key is the child's filename
    // stem (case, minus `.md`) or the subfolder basename.
    type Item = { dir: false; entry: (typeof files)[number] } | { dir: true; entry: (typeof dirs)[number] };
    const items: Item[] = [
      ...files.map((entry) => ({ dir: false as const, entry })),
      ...dirs.map((entry) => ({ dir: true as const, entry })),
    ];
    const keyOf = (it: Item) => (it.dir ? it.entry.name : it.entry.name.slice(0, -3));
    const orderRaw = await readMaybe(path.join(absDir, ORDER_FILE));
    let ordered = items;
    if (orderRaw != null) {
      const byKey = new Map(items.map((it) => [keyOf(it), it]));
      const used = new Set<string>();
      const head: Item[] = [];
      for (const k of parseOrder(orderRaw)) {
        const it = byKey.get(k);
        if (it && !used.has(k)) {
          head.push(it);
          used.add(k);
        }
      }
      ordered = [...head, ...items.filter((it) => !used.has(keyOf(it)))];
    }

    for (const it of ordered) {
      if (!it.dir) {
        const f = it.entry;
        const text = (await readMaybe(path.join(absDir, f.name))) ?? '';
        const parsed = parseCase(text);
        cases.push({ ...parsed.case, suite: suiteId, modified: false });
        paths[parsed.case.id] = relJoin(fullRel, f.name);
        nodes.push({ type: 'case', id: parsed.case.id });
        for (const w of parsed.warnings) warnings.push({ ...w, file: relJoin(fullRel, f.name) });
      } else {
        const d = it.entry;
        const childFull = relJoin(fullRel, d.name);
        const meta = await readSuiteMeta(absDir, entries, d.name);
        const children = await walk(path.join(absDir, d.name), childFull);
        nodes.push({
          type: 'suite',
          id: slug(childFull),
          name: meta?.name?.trim() || d.name,
          path: childFull,
          ...(meta?.prefix?.trim() ? { prefix: meta.prefix.trim() } : {}),
          ...(meta?.description?.trim() ? { description: meta.description } : {}),
          children,
        });
      }
    }
    return nodes;
  };

  const tree = await walk(wsAbs, ws.path);
  return { tree, cases, paths, warnings };
}

/**
 * Load every workspace and combine them into one tree where each workspace is a
 * top-level collapsible folder (a suite node with `isWorkspace: true`), with its
 * suite/case subtree nested underneath. Runs are loaded once at the repo level.
 */
export async function loadRepo(repoPath: string, workspaces: Workspace[]): Promise<LoadedRepo> {
  const tree: TreeNode[] = [];
  const cases: Case[] = [];
  const paths: Record<string, string> = {};
  const warnings: LintWarning[] = [];
  for (const ws of workspaces) {
    const loaded = await loadWorkspace(repoPath, ws);
    Object.assign(paths, loaded.paths);
    // The workspace root carries its own prefix/description so display-ID prefixes
    // inherit uniformly down the combined tree (workspace → suite → case).
    tree.push({
      type: 'suite',
      isWorkspace: true,
      id: ws.id,
      name: ws.name,
      path: ws.path,
      prefix: ws.prefix,
      ...(ws.description.trim() ? { description: ws.description } : {}),
      children: loaded.tree,
    });
    cases.push(...loaded.cases);
    warnings.push(...loaded.warnings);
  }

  // Duplicate displayIdPrefix anywhere in the tree (workspace or suite override) → warn, load anyway.
  const seenPrefix = new Map<string, string>();
  const checkDup = (nodes: TreeNode[]) =>
    nodes.forEach((n) => {
      if (n.type !== 'suite') return;
      if (n.prefix) {
        const prev = seenPrefix.get(n.prefix);
        if (prev) warnings.push({ code: 'dup-prefix', message: `Display ID prefix "${n.prefix}" is shared by "${prev}" and "${n.name}".` });
        else seenPrefix.set(n.prefix, n.name);
      }
      checkDup(n.children);
    });
  checkDup(tree);

  const runs = await loadRuns(repoPath, warnings);
  return { tree, cases, paths, runs, warnings };
}
