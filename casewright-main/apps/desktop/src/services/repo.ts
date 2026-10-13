// ---------------------------------------------------------------------------
// Repo service — the FS + Git data layer. The implementation is split across
// focused modules; this file is the stable public surface the store and tests
// import as `@/services/repo`:
//
//   repo-paths.ts       layout constants + pure path/string helpers
//   repo-self-write.ts  watcher dedup (markWrite / wasSelfWrite)
//   repo-fs.ts          low-level repo-relative read/write fs ops
//   repo-metadata.ts    config.yaml + folder-note persistence (init/sync/…)
//   repo-migration.ts   legacy → config+notes migration, wiki-safe renames
//   repo-load.ts        open/discover + load tree/cases/runs from disk
// ---------------------------------------------------------------------------

export { relJoin, toRepoRelative, derivePrefix, folderNoteRel, orderFileRel, noteNeeded } from './repo-paths';
export { markWrite, wasSelfWrite } from './repo-self-write';
export { writeFileAt, deletePath, renamePath, makeDir, readMaybe } from './repo-fs';
export { initRepo, syncFolderNote, moveFolderNote, writeWorkspacesList, ensureWikiSafeFolder } from './repo-metadata';
export { migrateRepo } from './repo-migration';
export { openRepo, loadWorkspace, loadRepo } from './repo-load';
export type { OpenedRepo, LoadedWorkspace, LoadedRepo } from './repo-load';
