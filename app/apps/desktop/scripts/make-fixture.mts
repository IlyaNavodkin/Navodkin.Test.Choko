/**
 * Materialize the in-memory sample data (src/data/sample.ts) into a *real* Git
 * repository under apps/desktop/.fixture, using the same serializers the app uses.
 * This is the canonical dev/test target for the on-disk + Git backend.
 *
 * Layout: `.ch/config.yaml` (with the `workspaces:` list) + `.ch/.gitignore`
 * + a flat central `.ch/runs/`. Each workspace/suite folder gets an OPTIONAL sibling
 * "folder note" (`<folder>.md`) — written only when it has a custom name / prefix / description
 * (single-word, metadata-free suites are just plain folders).
 *
 * Run via `pnpm --filter @chioko/desktop fixture` (uses vite-node so the `@`
 * alias + TS resolve). Pass `--with-origin` to also create a bare `.fixture-origin.git`
 * remote and push to it (for the Git-loop tests).
 */
import { createRequire } from 'node:module';
// The format layer pulls gray-matter / papaparse through the node bridge.
(globalThis as { require?: NodeRequire }).require ??= createRequire(import.meta.url);

import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simpleGit } from 'simple-git';

import { cases, runs, trees, workspaces } from '@/data/sample';
import { serializeCase } from '@/services/format/case';
import { CHIOKO_GITIGNORE, serializeConfigYaml } from '@/services/format/config';
import { serializeFolderNote } from '@/services/format/folder-note';
import { serializeRunCase, serializeRunDetails, type RunCaseItem } from '@/services/format/run';
import { caseFileName } from '@/services/format/filename';
import { folderSlug } from '@/utils/ids';
import { deriveItems } from '@/utils/run-items';
import type { Case, RunRow, TreeNode } from '@/types';

/** Mirror of repo.ts `noteNeeded`: only write a folder note when it carries real metadata. */
const noteNeeded = (base: string, name: string, prefix?: string, description?: string) =>
  (!!name.trim() && name.trim() !== base) || !!(prefix ?? '').trim() || !!(description ?? '').trim();
let folderNotes = 0;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '.fixture');
const withOrigin = process.argv.includes('--with-origin');

// --- clean slate ---
rmSync(repoRoot, { recursive: true, force: true });
mkdirSync(repoRoot, { recursive: true });

// --- .ch/ scaffold (repo-wide config + workspace list + central runs + gitignore) ---
const cwDir = join(repoRoot, '.ch');
mkdirSync(join(cwDir, 'runs'), { recursive: true });
writeFileSync(
  join(cwDir, 'config.yaml'),
  serializeConfigYaml({ version: 1, name: 'Chioko Fixture', workspaces: workspaces.map((w) => w.path) }),
);
writeFileSync(join(cwDir, '.gitignore'), CHIOKO_GITIGNORE);

// --- workspace list (config.yaml) + lazy sibling folder notes + suite/case subtrees ---
const byId = new Map(cases.map((c) => [c.id, c]));

function walk(nodes: TreeNode[], parentDir: string) {
  for (const n of nodes) {
    if (n.type === 'suite') {
      const folder = folderSlug(n.name); // wiki-safe folder (e.g. "Team Invites" → "Team-Invites")
      const dir = join(parentDir, folder);
      mkdirSync(dir, { recursive: true });
      if (noteNeeded(folder, n.name, n.prefix, n.description)) {
        // Sibling note lives next to the folder, in the parent dir.
        writeFileSync(join(parentDir, `${folder}.md`), serializeFolderNote({ name: n.name, prefix: n.prefix, description: n.description }));
        folderNotes++;
      }
      walk(n.children, dir);
    } else {
      const c = byId.get(n.id);
      if (!c) continue;
      const { suite: _s, modified: _m, ...parsed } = c as Case;
      writeFileSync(join(parentDir, caseFileName(c)), serializeCase(parsed));
    }
  }
}

for (const ws of workspaces) {
  const segs = ws.path.split('/');
  const dir = join(repoRoot, ...segs);
  mkdirSync(dir, { recursive: true });
  // The workspace's sibling note (workspaces always carry a prefix → always written).
  const parentDir = join(repoRoot, ...segs.slice(0, -1));
  const folder = segs[segs.length - 1];
  if (noteNeeded(folder, ws.name, ws.prefix, ws.description)) {
    writeFileSync(join(parentDir, `${folder}.md`), serializeFolderNote({ name: ws.name, prefix: ws.prefix, description: ws.description }));
    folderNotes++;
  }
  walk(trees[ws.id] ?? [], dir);
}

// --- demo Playwright project (the Autotests section) ----------------------
// The autotest project lives inside the repository's data folder: `.ch/autotests/`.
// Its presence is the detection marker; the app runs Playwright with that folder as cwd and
// resolves dependencies from its own package.json/node_modules. Browsers/deps are the user's
// `npm install` step (see .ch/autotests/README.md); nothing here downloads them.
const fixtureTemplate = join(here, 'fixture');
cpSync(fixtureTemplate, join(cwDir, 'autotests'), { recursive: true });

// --- runs: one folder per run (_run.md + a sidecar per case) under .ch/runs/ ---
const runsDir = join(cwDir, 'runs');
const overlay = (row: RunRow, key: string, text: string): RunCaseItem => ({
  key,
  text,
  state: row.checks[key] ?? 'none',
  failNote: row.failNotes[key] ?? '',
});
for (const run of runs) {
  const runFolder = run.file.split('/').pop() ?? 'run';
  const runDir = join(runsDir, runFolder);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(
    join(runDir, '_run.md'),
    serializeRunDetails({
      name: run.name,
      status: run.status,
      created: run.created,
      testDate: run.created,
      scope: run.scope,
      testerApproval: run.testerApproval,
      reviewerApproval: run.reviewerApproval,
      summary: run.summary,
      notes: run.notes,
    }),
  );
  for (const row of run.rows) {
    const kase = byId.get(row.case_id);
    const d = deriveItems(kase);
    writeFileSync(
      join(runDir, row.file.split('/').pop() ?? 'case.md'),
      serializeRunCase({
        caseId: row.case_id,
        displayId: row.display_id,
        title: row.title,
        result: row.result,
        tester: row.tester,
        executedAt: row.executed_at,
        notes: row.notes,
        setup: d.setup.map((it) => overlay(row, it.key, it.text)),
        steps: d.steps.map((it) => overlay(row, it.key, it.text)),
        accept: d.accept.map((it) => overlay(row, it.key, it.text)),
      }),
    );
  }
}

// --- git init + seed commit on `main` ---
const git = simpleGit(repoRoot);
await git.init();
await git.addConfig('user.email', 'fixture@chioko.dev', false, 'local');
await git.addConfig('user.name', 'Chioko Fixture', false, 'local');
await git.add('.');
await git.commit('Seed Chioko fixture repository');
await git.branch(['-M', 'main']);

if (withOrigin) {
  const originDir = join(here, '..', '.fixture-origin.git');
  rmSync(originDir, { recursive: true, force: true });
  mkdirSync(originDir, { recursive: true });
  await simpleGit(originDir).init(true); // bare
  await git.addRemote('origin', originDir);
  await git.push(['-u', 'origin', 'main']);
  console.log('Bare origin:', originDir);
}

const fileCount = cases.length + runs.length * 2 + folderNotes + 2;
console.log(
  `Fixture written to ${repoRoot} (~${fileCount} files, ${cases.length} cases, ${runs.length} runs, ${workspaces.length} workspaces, ${folderNotes} folder notes).`,
);
console.log('Autotests demo: run "npm install" in .fixture/.ch/autotests, then discover/bind tests in the Autotests section.');
