# `.casewright/` Config Model & Self-Declaring Workspaces - Implementation Tasks

## Overview

Replace the hand-maintained workspace registry (root `casewright.json` globs + per-workspace
`workspace.yaml` + per-workspace `runs/`) with:

1. A **`.casewright/` folder at the repo root** holding `config.yaml`, a centralized flat `runs/`
   directory, an auto-managed `.gitignore`, and reserved room for `cache/`.
2. A **`casewright.yaml` inside each workspace folder** whose mere presence declares that folder a
   workspace, discovered by a **one-time walk** on repo open (no central registry).

Runs become **repo-level** (a single run may span workspaces); the JSON root config is replaced by
YAML; legacy formats are dropped outright (hard cutover, no migration). See
`.docs/casewright-config-model/prd.md` for the full requirements (FR 1–23).

## Tasks

### [x] 0100 - Schemas & domain types for the `.casewright/` model

**Overview:** Lay the type/schema foundation the rest of the work compiles against: a new
`.casewright/config.yaml` schema (replacing the JSON `RootConfigSchema`), a tightened
`casewright.yaml` schema (required `name`/`displayIdPrefix`, no `runsDir`), and domain-type updates
(drop `Workspace.runsDir`, make `Run.file`/`Run.id` repo-level, broaden `RunScope`). Parsing stays
tolerant (coerce + `LintWarning`, never throw). (PRD FR 3, 12, 13, 16–20.)

**Relevant Files:**
- `apps/desktop/src/schemas/config.ts` - Replace `RootConfigSchema` (`{ workspaces }`) with the `.casewright/config.yaml` schema (`{ version: int, name?: string }`, unknown keys preserved).
- `apps/desktop/src/schemas/workspace.ts` - `name` + `displayIdPrefix` coerced-not-rejected (blank → defaulted + warned at the service), `description` optional, remove `runsDir`.
- `apps/desktop/src/schemas/index.ts` - Re-export surface for the renamed/added config schema.
- `apps/desktop/src/types/index.ts` - Drop `Workspace.runsDir`; document `Run.file`/`Run.id` as `.casewright/runs/<stem>`; broaden `RunScope` to `'all' | 'workspace' | 'suite' | 'tag'` and update `CreateRunArgs`.

**Sub-Tasks:**
- [x] 0101 In `schemas/config.ts`, replace `RootConfigSchema` with a `ConfigYamlSchema` for `.casewright/config.yaml`: `version` (int, `.default(1)`), optional `name` (string); use `z.looseObject` so unknown keys are preserved (FR 3). Export the schema and its inferred type; remove `RootConfig`.
- [x] 0102 In `schemas/workspace.ts`, rename/retarget to `casewright.yaml`: keep `name` and `displayIdPrefix` as `.default('')` (so a malformed/blank file coerces rather than throws — the service adds the lint warning, FR 13), keep `description` optional, and **remove `runsDir`** (FR 12).
- [x] 0103 Update `schemas/index.ts`: drop the `RootConfigSchema`/`RootConfig` exports, add the new config schema + type, keep `WorkspaceYamlSchema`/`LintWarning` exports.
- [x] 0104 In `types/index.ts`, remove `runsDir` from `Workspace`; update the `Run.file`/`Run.id` doc comments to `.casewright/runs/<stem>`; broaden `RunScope` to `'all' | 'workspace' | 'suite' | 'tag'` and ensure `CreateRunArgs` still type-checks against the new union.

**Notes:**
- This is the breaking change at the root of the dependency graph: removing `Workspace.runsDir` and
  changing `RunScope` ripples into the repo service, store, components, fixture, and tests (tasks
  0200–0600). Expect typecheck to stay red until those consumers are updated.
- "Required" `name`/`displayIdPrefix` is enforced at the **UI save** layer (0401), not by Zod —
  Zod stays tolerant so a bad file still opens (FR 13).

---

### [x] 0200 - Repo service: `.casewright/` validation, discovery walk, scaffold & central runs

**Overview:** Rewrite the read path in `repo.ts`. `openRepo` validates both a Git worktree **and** a
`.casewright/` directory, then discovers workspaces by a one-time walk for `casewright.yaml` markers
(skipping `.git`/`.casewright`/dot-folders, no nesting, root-as-single-workspace short-circuit,
alphabetical-by-name order, empty-repo state when no markers). Runs load once from
`.casewright/runs/` at the repo level. Add an `initRepo` scaffold helper plus the config/gitignore
serializers. (PRD FR 1, 2, 4, 5, 6–11, 14, 16, 20.)

**Relevant Files:**
- `apps/desktop/src/services/repo.ts` - Rewrite `openRepo` + discovery; `loadWorkspaceMeta` reads `casewright.yaml`; repo-level `loadRuns`; add `initRepo` scaffold helper.
- `apps/desktop/src/services/format/workspace.ts` - `serializeWorkspaceYaml` drops `runsDir`.
- `apps/desktop/src/services/format/config.ts` - New: `serializeConfigYaml` + canonical `.casewright/.gitignore` contents.
- `apps/desktop/src/lib/node.ts` - Verify the YAML/`gray-matter` bridge handles the config doc (no change expected).

**Sub-Tasks:**
- [x] 0201 Add `services/format/config.ts`: `serializeConfigYaml({ version, name? })` (reuses the `yamlScalar` quoting helper now exported from `format/workspace.ts`) and a `CASEWRIGHT_GITIGNORE` constant whose body ignores `cache/` (FR 4, 5).
- [x] 0202 In `format/workspace.ts`, change `serializeWorkspaceYaml` to `Pick<Workspace,'name'|'description'|'prefix'>` and drop the `runsDir` line (FR 12); export `yamlScalar`.
- [x] 0203 In `repo.ts`, rewrite `openRepo` validation: require a Git worktree **and** a `.casewright/` directory; when `.casewright/` is absent emit a `needs-init` warning + `needsInit: true` (don't throw, FR 1–2); read+validate `.casewright/config.yaml` tolerantly via `ConfigYamlSchema` (malformed → defaults + warning, FR 3).
- [x] 0204 Replace `resolveWorkspacePaths` with a `discoverWorkspaces(repoPath)` walk: recurse from root, **skip** `.git`/`.casewright`/any dot-folder; a folder containing `casewright.yaml` is a workspace and the walk **does not descend** into it (FR 7, 8); the walk naturally yields root-as-workspace when `<root>/casewright.yaml` exists (single workspace at `'.'`→`''`, FR 9); sort alphabetically by display name, tie-break by path (FR 10); emit an empty-repo warning when no markers are found (FR 11).
- [x] 0205 Update `loadWorkspaceMeta` to read `casewright.yaml` (not `workspace.yaml`): coerce blank `name` → folder name and blank `displayIdPrefix` → a derived placeholder (`derivePrefix`), each with a `LintWarning` (FR 13); drop `runsDir`. After discovery, emit a warning for any duplicated `displayIdPrefix` across workspaces (load anyway, FR 14).
- [x] 0206 Centralize runs: made `loadRuns` workspace-agnostic — reads `.casewright/runs/` once at the repo level with `file`/`id` = `.casewright/runs/<stem>` (FR 16, 20); removed runs from `loadWorkspace` (split `LoadedWorkspace`/`LoadedRepo` return types); `loadRepo` calls repo-level `loadRuns`.
- [x] 0207 Add `initRepo(repoPath)` scaffold helper: writes `.casewright/config.yaml` (via `serializeConfigYaml`), creates `.casewright/runs/` (seeds a `.gitkeep` so the empty dir is tracked), and writes `.casewright/.gitignore` (FR 2, 4).

**Notes:**
- Depends on 0100. The discovery walk fully replaces glob resolution — no `casewright.json` is read
  anywhere after this task. `OpenedRepo.warnings` carries the `needs-init` / empty-repo signals the
  UI (0400) consumes. Re-derive a workspace's `id` from its path the same normalized way as today
  (`relJoin`/`slug`, repo-root → `''`).

---

### [x] 0300 - Store rewiring: repo-level runs, scope-based create, `casewright.yaml` writes, init action

**Overview:** Update `app-store.ts` so run paths target `.casewright/runs/`, `createRun` seeds rows
by Repo / Workspace / Suite scope across **all** workspaces, `updateWorkspace` writes
`<workspace>/casewright.yaml` (dropping all `runsDir` logic), a `case → workspace` lookup buckets
run rows by workspace for summaries, and a new scaffold/init action writes `.casewright/` for an
un-initialized repo. (PRD FR 15, 17–21, 2.)

**Relevant Files:**
- `apps/desktop/src/store/app-store.ts` - Run paths, scope-based seeding, `casewright.yaml` writes, `caseWorkspace` lookup, `initRepo` action + needs-init/empty wiring.
- `apps/desktop/src/services/recents.ts` - Verify recents still records `workspaces`/`lastWorkspaceId` (no schema change expected).

**Sub-Tasks:**
- [x] 0301 Repoint run paths to `.casewright/runs/`: in `createRun`, build `file = relJoin(RUNS_REL, stem + '.csv')` (+ matching `.md` sidecar) and `id` from the stem; `runRel` returns `run.file` unchanged; deleted all `relJoin(workspace.path, workspace.runsDir, …)` usage (FR 16, 20).
- [x] 0302 Made `createRun` scope-based across the whole repo: `'all'` → every case in the repo; `'workspace'` → cases in the active workspace; `'suite'` → the suite subtree (`idx.inSuite`); `'tag'` → cases carrying the tag (repo-wide). Records a human-readable `scope` label (e.g. `"workspace: Payments QA"`, `"repo"`). Dropped the old `workspace`-gated filter (FR 17, 19).
- [x] 0303 In `updateWorkspace`, `writeWsYaml` now writes `<workspace>/casewright.yaml` (via `relJoin`, root-safe) and the entire `runsDir` rename branch is removed (FR 15).
- [x] 0304 Added a `caseWorkspace(caseId)` helper (resolve a case → its suite path → owning `Workspace` via `workspaceOfPath`), exposed on the store for summaries — the read-time owning-workspace derivation (FR 18) that replaces file-path-prefix bucketing.
- [x] 0305 Added an `initRepo` store action that calls the service scaffold (0207) then re-opens the repo, plus `needsInit`/`emptyRepo` state flags set from the open result so the UI can branch (FR 2).
- [x] 0306 Updated the `openRepo` action to consume `needsInit` / empty-repo without crashing: sets the flags, keeps `screen: 'launcher'` + `workspace: null` in those states instead of opening a broken workbench (FR 1, 11).

**Notes:**
- Depends on 0100 + 0200. The `caseWorkspace` lookup is reused by the summary pages (0402, FR 18,
  21). Keep the optimistic-write-then-reconcile pattern intact when repointing run writes.

---

### [x] 0400 - UI: workspace settings, create-run scope, empty-repo & init flows

**Overview:** Surface the new model in the UI: the workspace settings panel drops *Runs directory*,
enforces non-blank *Name*/*Display ID prefix*, and shows the `<workspace>/casewright.yaml` path;
summary run stats filter by **case membership** (not file-path prefix); the create-run modal offers
Repo / Workspace / Suite scope; and new launcher/center states cover an empty repo (no markers) and
the `.casewright/` init/scaffold flow. (PRD FR 2, 11, 15, 19, 21.)

**Relevant Files:**
- `apps/desktop/src/components/summary/SuiteSummary.tsx` - `WorkspaceSettings` + run-membership filtering.
- `apps/desktop/src/components/runs/CreateRunModal.tsx` - Repo / Workspace / Suite scope.
- `apps/desktop/src/components/launcher/Launcher.tsx` - Empty-repo + init entry points.
- `apps/desktop/src/components/App.tsx` - Center/empty gating for empty/un-initialized repos.
- `apps/desktop/src/components/runs/RunsList.tsx` - Runs-dir chip now reflects the central `.casewright/runs/`.

**Sub-Tasks:**
- [x] 0401 In `WorkspaceSettings` (`SuiteSummary.tsx`): removed the *Runs directory* `Field`, its `runsDir` state + `useEffect` dep; path label now `{ws.path}/casewright.yaml` (root-safe); *Name* and *Display ID prefix* revert to the saved value when blurred blank (FR 15); helper text now points at central `.casewright/runs/`.
- [x] 0402 In `SuiteSummary`, replaced the `relevantRuns` filter + `runTally` arg with case-membership: a run is relevant if any row's `case_id` is in the node's collected case ids (works for both workspace and suite nodes); dropped `r.file.startsWith(ws.path + '/')` (FR 18, 21).
- [x] 0403 In `CreateRunModal`: scope options are now **Whole repo** (`'all'`), **This workspace** (`'workspace'`, default), **By suite** (`'suite'`, flattened suite picker), **By tag** (`'tag'`); per-scope seeded-row `count` preview (workspace count via `caseWorkspace`); writes to `.casewright/runs/` (FR 19).
- [x] 0404 In `Launcher.tsx`: added an **init** panel (Git repo without `.casewright/` → `initRepo` scaffold + "choose another folder") and an **empty-repo** panel (`.casewright/` with no workspaces → reload), styled with the accent-soft / panel-2 treatments (FR 2, 11).
- [x] 0405 `App.tsx`: no code change required — the store routes both `needsInit` and `emptyRepo` to `screen: 'launcher'`, and `App` already renders `<Launcher />` when `screen === 'launcher' || !workspace`, so those states reach the launcher panels rather than a broken `Center` (FR 2, 11).
- [x] 0406 In `RunsList.tsx`, replaced the `ctx.workspace?.runsDir ?? 'runs'` chip with the central `.casewright/runs/` label (runs are repo-level).

**Notes:**
- Depends on 0300 (init action, `caseWorkspace`, scope-based create). Keep the existing
  colorblind-safe palette and summary layout — this changes *where data lives*, not the visuals.

---

### [x] 0500 - Fixture & sample data regeneration to the new layout

**Overview:** Regenerate the dev/test fixture and the in-memory seed to the new layout:
`.casewright/config.yaml`, `.casewright/runs/` (flat, central), `.casewright/.gitignore`, and a
per-workspace `casewright.yaml`; remove the root `casewright.json` glob list and all `runsDir`
usage; rewrite run file paths to `.casewright/runs/<stem>`; spread cases across ≥2 workspaces so a
cross-workspace run is demonstrable. (PRD FR 22, 23; §8.)

**Relevant Files:**
- `apps/desktop/src/data/sample.ts` - Drop `rootConfig` + `runsDir`; repo-level run paths; multi-workspace case/suite layout.
- `apps/desktop/scripts/make-fixture.mts` - Write the `.casewright/` layout + per-workspace `casewright.yaml`.

**Sub-Tasks:**
- [x] 0501 In `sample.ts`: deleted the `rootConfig` export and the `runsDir` field on every `Workspace`; rewrote each run's `file`/`id` to `.casewright/runs/<stem>`; updated the `conflict` run `path` to `.casewright/runs/…` (FR 22, 23).
- [x] 0502 In `sample.ts`, added an **Onboarding** workspace with its own Activation/Invites suites + ONB cases, replaced the single `tree` with a per-workspace `trees` map, and added a "Release readiness — cross-team" run whose rows reference both PAY and ONB cases — exercising the cross-workspace metric (PRD §8).
- [x] 0503 In `make-fixture.mts`: stopped writing `casewright.json`/`workspace.yaml`/per-workspace `runs/`; now writes `.casewright/config.yaml` (`serializeConfigYaml`), `.casewright/.gitignore` (`CASEWRIGHT_GITIGNORE`), and flat `.casewright/runs/` CSV+sidecars; writes a `casewright.yaml` per workspace and materializes each workspace's subtree from `trees[ws.id]` (FR 23).
- [x] 0504 Regenerated via `pnpm fixture` and verified: `.casewright/config.yaml`, `.casewright/.gitignore`, and `.casewright/runs/*` are git-tracked; per-workspace `casewright.yaml` + multi-workspace trees on disk; a `.casewright/cache/probe` left `git status` clean (ignored). Format round-trip tests stay green (17/17) (PRD §8).

**Notes:**
- Depends on 0100 (types) + 0200 (serializers). The current script only materializes
  `workspaces[0]`'s tree — sub-task 0503 generalizes it to walk per-workspace trees so 0502's
  multi-workspace data actually lands on disk.

---

### [x] 0600 - Tests: discovery, no-nesting, root-as-workspace, central runs & scaffold

**Overview:** Update and extend the test suite for the new model: fix existing `openRepo`/
`loadWorkspace`/`loadRepo` tests to the `.casewright/` layout, and add coverage for the discovery
walk, no-nesting rule, root-as-single-workspace, central run loading, `.casewright/` requirement,
the `initRepo` scaffold output, and the tightened workspace/config schemas. (PRD §8; FR 1, 3, 6–14,
16, 20.)

**Relevant Files:**
- `apps/desktop/src/services/repo.test.ts` - Rebuilt fixtures + new discovery/nesting/root/central-runs/init tests.
- `apps/desktop/src/services/format/workspace.test.ts` - `serializeWorkspaceYaml` round-trip without `runsDir` (created).
- `apps/desktop/src/services/format/config.test.ts` - `serializeConfigYaml` + `CASEWRIGHT_GITIGNORE` (created).
- `apps/desktop/src/schemas/config.test.ts` - Config/workspace schema coercion + unknown-key preservation (created).

**Sub-Tasks:**
- [x] 0601 Rebuilt the `repo.test.ts` fixtures to the `.casewright/` layout (`.casewright/config.yaml`, `.casewright/runs/<…>.csv`, per-workspace `casewright.yaml`) and fixed the `openRepo`/`loadWorkspace`/`loadRepo` assertions (run `file`/`id` now `.casewright/runs/…`, `loadWorkspace` no longer returns `runs`, workspaces discovered not globbed, no `runsDir`).
- [x] 0602 Added a discovery-walk test: two `casewright.yaml` workspaces are discovered, a `.hidden/` marker is skipped, and results sort alphabetically by display name (names chosen so name-order ≠ path-order) (FR 7, 10).
- [x] 0603 Added a no-nesting test: a `casewright.yaml` in a workspace subfolder yields a single workspace, and that subfolder loads as a suite (FR 8).
- [x] 0604 Added a root-as-workspace test (replacing the old implicit-fallback block): `<root>/casewright.yaml` → one workspace at path `''`, non-empty ids, `"Auth"` (not `"./Auth"`) suite paths, `.casewright/runs/…` run file (FR 9).
- [x] 0605 Added missing-`.casewright/` (→ `needsInit`, no throw, `needs-init` warning) and empty-repo (`.casewright/` present, no markers → `empty-repo` warning, zero workspaces) tests (FR 1, 11).
- [x] 0606 Added an `initRepo` scaffold test: writes `.casewright/config.yaml` (`version: 1`), creates `.casewright/runs/`, writes a `.gitignore` matching `cache/`, then opens cleanly with the empty-repo warning (FR 2, 4).
- [x] 0607 Added `schemas/config.test.ts` (ConfigYaml default/coerce/looseObject-preserve; WorkspaceYaml blank-default/coerce/no-runsDir), `format/config.test.ts` (`serializeConfigYaml` + `CASEWRIGHT_GITIGNORE`), and `format/workspace.test.ts` (`serializeWorkspaceYaml` emits no `runsDir`); central `loadRuns` paths covered in `repo.test.ts` (FR 3, 12–14, 16).

**Notes:**
- Depends on all prior tasks. Run with `pnpm --filter @casewright/desktop test`; typecheck with
  `pnpm --filter @casewright/desktop typecheck`. Both must be green to close out the feature.

## Notes

- Unit tests live alongside the code they cover (e.g. `repo.ts` ↔ `repo.test.ts`).
- Run the suite with `pnpm --filter @casewright/desktop test` (vitest); typecheck with
  `pnpm --filter @casewright/desktop typecheck` (tsc --noEmit).
- **Dependency order is strict:** 0100 → 0200 → 0300 → 0400, with 0500 (fixture/sample) depending on
  0100+0200 and 0600 (tests) depending on everything. Because 0100 removes `Workspace.runsDir` and
  broadens `RunScope`, the project typecheck only returns to green once the consumer tasks
  (0300/0400/0500) land.
- Out of scope (per PRD §5): migration tooling, nested workspaces, glob/allowlist config, the
  structured 3-way merge engine, `cache/` behavior, and the test-execution report itself.
