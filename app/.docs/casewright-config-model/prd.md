# `.casewright/` Repository Config & Self-Declaring Workspaces — PRD

## 1. Introduction / Overview

Today the desktop app finds workspaces through a **hand-maintained registry**: a root
`casewright.json` lists glob patterns (`qa/*`, explicit paths), and each workspace keeps its
settings in a `workspace.yaml` plus its runs in a local `<workspace>/runs/` folder. This model has
two problems we have already hit in practice:

- **It looks "half-loaded."** If a folder isn't in the registry it simply doesn't appear, so a
  freshly-added workspace is invisible until someone edits `casewright.json`.
- **Workspaces aren't self-contained, and the registry is a merge hotspot.** Moving a folder loses
  its config, and two people adding two workspaces on two branches conflict on the same file.

This feature replaces that model with:

1. A **`.casewright/` folder at the repo root** that holds all of casewright's repo-level
   bookkeeping — `config.yaml` (repo-wide config), `runs/` (all runs), an auto-managed `.gitignore`,
   and reserved room for future transient data (`cache/`).
2. A **`casewright.yaml` inside each workspace folder** whose *mere presence* declares that folder a
   workspace. Workspaces are found by a **one-time discovery walk** on repo open — there is no
   central registry to maintain.

**Goal:** zero-maintenance workspace discovery, portable self-contained workspace folders,
repo-level runs (which also unlocks cross-workspace test-execution reports), and one consistent YAML
config format — all under a single obvious `.casewright/` folder.

## 2. Goals

- Discover every workspace automatically by walking for `casewright.yaml` markers; eliminate the
  registry entirely.
- Make a workspace folder **self-contained** — its `casewright.yaml` carries its identity, so the
  folder can be moved or copied between repos and keep its name and ID prefix.
- **Centralize runs** at the repo level under `.casewright/runs/` so a single run can span multiple
  workspaces (the foundation for a repo-wide execution report).
- Replace the JSON root config with `.casewright/config.yaml`; standardize on YAML everywhere.
- Auto-scaffold `.casewright/` on repo init, including a `.gitignore` that keeps `cache/` out of Git
  while committing `config.yaml` and `runs/`.
- **Hard cutover**: regenerate the fixture in the new layout and remove all legacy
  `casewright.json` / `workspace.yaml` handling.

## 3. User Stories

- **As a test author**, I want to drop a new folder containing a `casewright.yaml` into my repo and
  have it appear as a workspace the next time I open the repo — without editing any registry.
- **As a test author**, I want to move or copy a workspace folder between repos and keep its name
  and display-ID prefix, because its config travels with it.
- **As a QA lead**, I want one run to cover cases from several workspaces so I can produce a single
  repo-wide test-execution report.
- **As a maintainer**, I want all of casewright's bookkeeping in one obvious `.casewright/` folder,
  with caches automatically kept out of Git.
- **As a contributor**, I want adding a new workspace on my branch to never conflict with a teammate
  adding theirs, because there is no shared registry file to edit.

## 4. Functional Requirements

### Repo structure & detection

1. A casewright repository is identified by a **`.casewright/` directory at the worktree root**.
   `openRepo` must validate **both** that the path is a Git worktree **and** that `.casewright/`
   exists.
2. If `.casewright/` is missing, the app must **offer to initialize** it — scaffolding
   `.casewright/config.yaml`, `.casewright/runs/`, and `.casewright/.gitignore`.
3. **`.casewright/config.yaml`** is the repo-wide config file (replaces `casewright.json`). Minimum
   schema: `version: <int>` and optional `name: <repo display name>`. Parsing is **tolerant**:
   unknown keys are accepted and preserved, and a malformed file is coerced to defaults with a lint
   warning rather than failing the open. It contains **no** workspace list or globs — discovery is
   automatic (see 6–11).
4. The app must create and maintain **`.casewright/.gitignore`** so that transient subdirectories
   (at minimum `cache/`) are ignored. `config.yaml` and `runs/` are committed; `cache/` is not.
5. **`.casewright/cache/`** is reserved for future transient data. It is git-ignored and is not
   created until a feature needs it.

### Workspace declaration & discovery

6. A folder **is a workspace if and only if** it contains a `casewright.yaml` file. The file's
   presence is the sole declaration.
7. On open, the app performs a **one-time walk** from the repo root to discover workspaces. The walk
   skips `.git`, `.casewright`, and any dot-folders.
8. **Workspaces do not nest.** Once a `casewright.yaml` is found in a folder, that folder is a
   workspace and the walk **does not descend into it** to look for more workspaces; its subfolders
   are treated as suites within that workspace.
9. **Repo root as a single workspace:** if `<root>/casewright.yaml` exists, the **entire repo is one
   workspace rooted at `.`**, and no further discovery is performed.
10. Discovered workspaces are ordered **alphabetically by display name** (tie-break by path). There
    is no curation, ordering, or exclude list.
11. If `.casewright/` exists but **no `casewright.yaml` markers** are found anywhere, the app shows
    an **empty-repo state** inviting the user to create the first workspace. There is no implicit
    fallback workspace.

### Workspace config (`casewright.yaml`)

12. Schema: `name` (string, **required**), `displayIdPrefix` (string, **required**), `description`
    (string, optional). There is **no `runsDir`** — runs are centralized (16–21).
13. Because parsing stays tolerant, a missing/blank `name` or `displayIdPrefix` is coerced (`name` →
    folder name; `displayIdPrefix` → a derived placeholder) **and** emits a lint warning, rather
    than failing the load. The UI, however, must prevent the user from *saving* a blank value (15).
14. `displayIdPrefix` **should be unique across workspaces**. On a duplicate the app loads anyway but
    emits a warning, because duplicate prefixes produce ambiguous display IDs across workspaces.
15. The workspace settings panel (on the workspace summary page) edits `name`, `displayIdPrefix`,
    and `description`, writing back to `<workspace>/casewright.yaml`. `name` and `displayIdPrefix`
    **cannot be saved blank**. The previous **Runs directory** field is removed.

### Runs (repo-level, centralized)

16. All runs are stored **flat in `.casewright/runs/`** as `<YYYY-MM-DD>-<slug>.csv` plus a matching
    `<...>.md` sidecar, using the same 7-column CSV and sidecar formats as today.
17. A run is a **repo-level entity**: its rows may reference cases from **any** workspace. Each row
    references a case by its repo-globally-unique identifier (`case_id`, with `display_id`/`title`
    for readability).
18. A row's **owning workspace is derived at read time** by resolving `case_id`/`display_id` to its
    case and that case's workspace. No per-row workspace column is added.
19. **Creating a run** seeds its rows from a chosen **scope** — the current selection: the whole
    repo, a single workspace, or a single suite — and writes the run to `.casewright/runs/`. The
    run's `scope` field records a human-readable label of what it was seeded from.
20. **Loading runs** reads `.casewright/runs/` **once for the whole repo** (not per-workspace). A
    run's `id`/`file` are `.casewright/runs/<stem>`.
21. Workspace and suite **summary pages** compute their run stats by filtering repo-level runs to
    rows whose cases belong to that workspace/suite — **not** by matching a file-path prefix.

### Migration / cutover

22. **No migration code.** The app no longer reads `casewright.json` or `workspace.yaml`; those
    formats are dropped.
23. The fixture generator (`apps/desktop/scripts/make-fixture.mts`) and the `.fixture/` repo are
    **regenerated** to the new layout: `.casewright/config.yaml`, `.casewright/runs/`,
    `.casewright/.gitignore`, and a per-workspace `casewright.yaml`. The in-memory sample data
    (`src/data/sample.ts`) is updated to match (incl. removing `runsDir` and the root-config glob
    list).

## 5. Non-Goals (Out of Scope)

- **No migration/upgrade tooling** for legacy repos; legacy `casewright.json` / `workspace.yaml` are
  not read at all.
- **No nested workspaces.**
- **No glob patterns, explicit allowlists, ordering, or exclude config** — discovery is pure.
- The **structured 3-way merge engine** remains deferred (unchanged by this work).
- **`cache/` is reserved only** — no caching behavior is implemented here.
- The **test-execution report feature** is separate; this work only unblocks it by making runs
  repo-level.
- **No change** to the case markdown format or the suite `_suite.md` format.

## 6. Design Considerations

- **Workspace summary settings panel** (`SuiteSummary.tsx` → `WorkspaceSettings`): remove the *Runs
  directory* input; keep *Name* / *Display ID prefix* / *Description*; show the file path as
  `<workspace>/casewright.yaml`; enforce non-blank *Name* and *Display ID prefix* on blur.
- **Create-run modal** (`CreateRunModal.tsx`): the scope selector reflects the current selection
  (Repo / Workspace / Suite) and indicates which cases will be seeded.
- **Empty-repo state** (req 11) and **init flow** (req 2) are new launcher/center states; style them
  consistently with the existing warning/empty/`mergeBanner` treatments.
- The **`.casewright/` folder** uses a leading dot to sort/hide like other tool folders; the
  discovery walk must explicitly skip it (alongside `.git`).
- Keep the existing colorblind-safe status/result palette and summary-page layout; this feature
  changes *where data lives*, not the visual language.

## 7. Technical Considerations

Concrete touchpoints (junior-dev orientation):

- **`src/schemas/config.ts`** — replace `RootConfigSchema` (`{ workspaces }`) with the
  `.casewright/config.yaml` schema (`{ version, name? }`); parse YAML, not JSON.
- **`src/schemas/workspace.ts`** — `name` and `displayIdPrefix` required; `description` optional;
  remove `runsDir`.
- **`src/services/repo.ts`** — rewrite `openRepo`: validate `.casewright/`; check root-as-workspace
  (req 9); run the discovery walk that **replaces** `resolveWorkspacePaths`. Update
  `loadWorkspaceMeta` to read `casewright.yaml`. `loadWorkspace` stops loading runs per-workspace; a
  single `loadRuns('.casewright/runs', …)` loads them at the repo level. Add an `initRepo`/scaffold
  helper (writes `config.yaml`, `runs/`, `.gitignore`).
- **`src/services/format/workspace.ts`** — `serializeWorkspaceYaml` drops `runsDir`; emits `name`,
  `displayIdPrefix`, optional `description`.
- **`src/types/index.ts`** — drop `Workspace.runsDir`; `Run.file`/`Run.id` become repo-level
  (`.casewright/runs/<stem>`); revisit `RunScope` (`'all' | 'workspace' | 'suite' | 'tag'`).
- **`src/store/app-store.ts`** — run-path helpers (`runRel`, `createRun`) target `.casewright/runs/`;
  `createRun` seeds by scope across workspaces; `updateWorkspace` writes `casewright.yaml`; remove
  all `runsDir` logic; add a `case → workspace` lookup so run rows can be bucketed by workspace; add
  the init/scaffold write.
- **`src/components/summary/SuiteSummary.tsx`** — settings-panel changes (req 15); run filtering by
  case membership (req 21).
- **`src/components/runs/CreateRunModal.tsx`** — scope across Repo / Workspace / Suite.
- **`scripts/make-fixture.mts`** + **`src/data/sample.ts`** — regenerate to the new layout.
- **Tests** (`src/services/repo.test.ts`, format tests) — update run paths and schemas; add
  discovery-walk, no-nesting, root-as-workspace, and central-runs tests.
- **Repo marker** is now `.casewright/config.yaml` (presence), not `.git` alone.

Note: requirement 17 (globally-unique case references in runs) depends on requirement 14
(unique `displayIdPrefix`). Case `id` is an internal stable hash; `display_id` is `PREFIX-NNNN`;
keeping prefixes unique keeps cross-workspace display IDs unambiguous.

## 8. Success Metrics

- Dropping a folder that contains `casewright.yaml` into a repo makes it appear as a workspace on
  next open, with **no other edits** (manual reproduction).
- Opening the regenerated fixture lists **all** workspaces with **no registry file** present.
- A single run can include cases from **≥2 workspaces** and renders correct per-workspace stats on
  the summary pages.
- After init, `git status` shows `.casewright/config.yaml`, `.casewright/runs/`, and
  `.casewright/.gitignore` tracked, and `.casewright/cache/` ignored.
- Vitest suite is green (updated repo/format tests) and typecheck is clean.

## 9. Open Questions

- **Sort order**: alphabetical by display name (chosen) vs. by path — confirm.
- **Duplicate `displayIdPrefix`**: warn-and-load (chosen) vs. block on save — confirm warn is
  acceptable.
- **Init surface**: silently scaffold `.casewright/` when creating a repo, vs. an explicit confirm
  step in the launcher.
- **Repo display name**: should `config.yaml` carry an optional `name`, or always derive from the
  folder name?
- **Orphan run rows**: when a run references a `case_id` whose case no longer exists (deleted or
  moved), how should the row appear on summaries — proposed: bucket it as "Unassigned".
