---
title: Casewright — Product Requirements
status: draft
version: 0.7
date: 2026-06-01
---

# Casewright — PRD (v1)

> **Casewright** — a local editor for crafting and version-controlling manual test cases as
> markdown, with Git as the entire data store.

## 1. Summary

**Casewright** is a locally run desktop application for authoring and managing manual test cases as
**markdown files with YAML front matter and a structured body**, organized into suites via
folders, with **test runs recorded as CSV files**. You open a **Git repository**; a
**root config** (turborepo-style) declares where the **workspaces** live inside it. Everything
is on disk and version-controlled: the Git repository *is* the data store. The app provides a
friendly UI for people who don't want to touch markdown or Git directly (business analysts)
while remaining transparent and diff-friendly for developers.

The initial deployment target is an **Azure DevOps wiki repository** using a flat,
single-branch workflow: edit, commit, pull, push, and resolve conflicts when they occur via a
**structured 3-way merge**.

## 2. Goals

- Open a **repository**; read a root config that declares **workspace** locations
  (turborepo-style globs/paths); switch the active workspace within the window.
- Remember recent repositories for quick reopening; allow several repos open at once in
  separate windows.
- Author/edit/duplicate/move/delete test cases through a UI, persisted as plain markdown.
- Treat the case body as **structured sections** (Objective, Systems in Scope, Steps,
  Acceptance Criteria) edited via purpose-built controls, with **inline text formatting only**.
- Organize cases into a suite hierarchy derived directly from the folder structure.
- Create test runs that snapshot a selected set of cases and capture per-case results.
- Drive the full Git loop (status, commit, pull, push) from inside the app.
- Detect conflicts and resolve them with a **structured 3-way merge** that auto-merges
  non-conflicting changes and prompts only on true conflicts.
- Keep the on-disk format clean enough that the raw files are usable without the app.

## 3. Non-goals (explicitly out of scope for v1)

- Executing tests or any automation runner; no CI integration.
- Branch management, multiple branches, PRs, or branch-based review flows.
- Azure DevOps **API** integration (work-item linking, traceability, boards).
- Storing or managing credentials — the app relies on the system Git credential helper.
- Reporting/dashboards beyond a basic per-run pass/fail summary.
- Real-time multi-user collaboration; concurrency is mediated entirely through Git.
- Opening the **same repository** in more than one window at a time.

## 4. Users

- **Business Analyst** — authors and maintains test cases, records run results. Wants a
  form-and-grid UI and a one-click "save my work and share it" (commit + push) that hides
  Git mechanics. Should rarely need to read raw markdown, and conflicts should be presented
  as plain "this changed / that changed" choices, not merge markers.
- **Developer / QA engineer** — comfortable with markdown and Git, wants the files to be
  clean, the schema predictable, and the option to bypass the UI and edit by hand.

Both operate on the same repo; the app must produce output that's pleasant for both.

## 5. Core concepts & data model

### 5.1 Repository, root config, and workspaces

The unit you open is a **Git repository**. A **root config file** at (or near) the repo root
declares where the workspaces live — modeled on how Turborepo declares packages in a
monorepo.

```jsonc
// casewright.json — at the repo root
{
  "workspaces": [
    "qa/*",                 // glob: every folder under qa/ is a workspace
    "areas/payments",       // explicit path
    "areas/onboarding"
  ]
}
```

- A matched directory is a **workspace**: a folder containing a suite/case tree and its own
  runs folder. A workspace is the scope you author within.
- **Open at the repo level.** A window opens one repository and reads its root config. The UI
  lists the declared workspaces; you pick an **active workspace** and can switch it within the
  window. Because a window owns exactly one repo, all Git state (branch, index, history) is
  unambiguous — there is no cross-window contention.
- **Recents.** The app remembers recently opened repositories (path + last-opened, optionally
  the last active workspace). Stored in the app's OS data directory, **not** in the repo.
- **Multiple windows = multiple repositories.** The same repository may not be opened in two
  windows at once.
- **Fallback when no root config exists:** offer to initialize one, or treat the opened folder
  as a single implicit workspace.

Per-workspace settings live in an optional `workspace.yaml` at the workspace root:

```yaml
name: Payments QA
description: Manual test cases for the billing and payments area.
displayIdPrefix: PAY   # used when suggesting displayIds, e.g. PAY-0042
runsDir: runs          # relative to the workspace root
```

### 5.2 Test case

A single markdown file. Front matter holds metadata; the body is a **fixed set of structured
sections** serialized as reserved `##` headings in a fixed order.

```markdown
---
id: 9f3a7c1e8b        # stable, immutable, random alphanumeric hash (the real key)
displayId: PAY-0042   # human-readable, used for reference/tagging; editable
title: User can reset password from the login screen
status: active        # draft | active | deprecated
tags: [auth, smoke, regression]
---

## Objective

Verify a registered user can reset their password and regain access via the
**self-service** flow; no admin involvement required.

## Systems in Scope

- Login web app
- Auth service
- Transactional email gateway

## Steps

1. Navigate to the login screen.
2. Click "Forgot password".
   1. Confirm the recovery form is shown.
3. Enter the account email and submit.

## Acceptance Criteria

- A reset email is delivered within one minute.
- The reset link allows setting a new password.
- The user can log in with the new password.
```

#### Front matter

- **`id`** — generated once at creation, never changes. Random alphanumeric (~10–12 chars,
  `[a-z0-9]`). Runs and references point at this, so renaming/retitling/moving never breaks
  history. (A divergent `id` during a merge means the files aren't the same case — see §6.7.)
- **`displayId`** — human-friendly label for humans and tagging (e.g. `PAY-0042`).
  Auto-suggested as `max(existing for prefix) + 1` using the workspace `displayIdPrefix`, but
  **editable**. The stable `id` is the real key, so a duplicate `displayId` (e.g. from concurrent
  creation on separate clones) is only cosmetic; the app lints and flags duplicates for cleanup.
- **`title`** — short summary; also the suggested basis for the filename.
- **`status`** — `draft | active | deprecated`.
- **`tags`** — flat, many-to-many taxonomy applied per case. Categories live here, **not** as a
  second hierarchy. Suites (folders) and tags are independent axes.

#### Structured body sections

The body is exactly these four sections, in this order, each under a reserved `##` heading:

| Section             | Heading                  | Content model                                                                            |
|---------------------|--------------------------|------------------------------------------------------------------------------------------|
| Objective           | `## Objective`           | Multiline text, inline formatting only (see below).                                      |
| Systems in Scope    | `## Systems in Scope`    | Flat **bulleted** list; each item single-line, inline formatting only.                   |
| Steps               | `## Steps`               | **Ordered, multi-depth (nestable)** list; each item single-line, inline formatting only. |
| Acceptance Criteria | `## Acceptance Criteria` | Flat **bulleted** list; each item single-line, inline formatting only.                   |

Serialization rules (for clean, mergeable diffs):

- Sections always emitted in the fixed order above, even when empty.
- Steps use ordered markers (`1.`, `2.`, …) with **2 spaces per nesting depth**; nesting =
  sub-steps. Nesting is created via the Steps control (indent/outdent), never by typing list
  syntax into an item.
- Systems in Scope and Acceptance Criteria use `-` markers, one item per line, no nesting.
- File ends with a single trailing newline; front-matter key order is stable.

Parser tolerance: the editor reads the four reserved sections. Any content outside them is
**preserved verbatim on save** and surfaced as a non-blocking lint warning.

#### Allowed formatting (everywhere text is entered)

The same whitelist applies to the Objective and to every list item.

- **Allowed (inline only):** bold, italic, strikethrough, inline `code`, and links. (Underline is
  intentionally excluded — markdown has no native underline and the files stay HTML-free.)
- **Blocked (prevented in the editor; lint-flagged if found on import):** headings, bulleted or
  numbered lists *within a field*, block quotes, fenced/indented code blocks, horizontal rules,
  tables, images, and raw HTML blocks.

(The document-level Steps/Systems/Expected lists are part of the schema's structure, produced by
their controls — not user-typed lists inside a field.)

Filename convention: `displayId` + slugified `title`
(e.g. `PAY-0042-user-can-reset-password.md`); freely renamable since `id` is the source of truth.

### 5.3 Suite (hierarchy)

A **suite is a folder.** Nested folders are nested suites. The tree is read directly off the
directory structure, so the files alone express the hierarchy with no separate index. The
suite's name is its folder name.

A folder may contain a `_suite.md` with front matter (`title`, `description`) for a friendlier
display name and notes; the folder name is used if absent. *(In v1.)*

### 5.4 Test run

A run is a **point-in-time CSV** of execution results for a selected set of cases. One CSV per
run, under the workspace's runs folder (`runs/` by default).

- Filename encodes date + name: `runs/2026-06-01-regression-sprint12.csv`.
- Creating a run: pick a scope (suite / tag filter / manual selection); seed one row per case
  with `result = not_run`.
- Rows key on the case's **stable `id`**, so a run resolves cases after renames/moves; a `title`
  snapshot keeps deleted cases readable.

CSV columns:

| column        | meaning                                                        |
|---------------|----------------------------------------------------------------|
| `case_id`     | stable hash — the key linking back to the case file            |
| `display_id`  | human-readable id, snapshot at run creation                    |
| `title`       | case title, snapshot at run creation                           |
| `result`      | `not_run \| pass \| fail \| blocked \| skipped`                 |
| `tester`      | who executed it (free text)                                    |
| `executed_at` | ISO date/time the result was recorded                          |
| `notes`       | free text (defect refs, observations)                          |

A sidecar `runs/<same-name>.md` holds run metadata (`name`, `description`, `status: open|closed`).
The CSV remains the primary store of results. *(In v1.)*

### 5.5 On-disk layout

```
<repo-root>/
├─ casewright.json                 # root config: declares workspace locations
├─ areas/
│  ├─ payments/                 # a workspace
│  │  ├─ workspace.yaml         # optional workspace config
│  │  ├─ Authentication/        # suite
│  │  │  ├─ _suite.md           # optional suite metadata
│  │  │  ├─ PAY-0042-reset-password.md
│  │  │  └─ Sessions/           # nested suite
│  │  │     └─ PAY-0051-...md
│  │  ├─ Billing/
│  │  │  └─ PAY-0088-...md
│  │  └─ runs/
│  │     ├─ 2026-06-01-regression-sprint12.csv
│  │     └─ 2026-06-01-regression-sprint12.md   # optional sidecar
│  └─ onboarding/               # another workspace
│     └─ ...
└─ qa/                          # matched by the "qa/*" glob
   └─ ...
```

## 6. Functional requirements

### 6.1 Repository & workspaces

- On launch, show recent repositories and an "open repository" option; opening validates a Git
  working tree, locates and reads the root config, and lists declared workspaces.
- Maintain a recents list (repo path + last-opened, optional last active workspace) in OS app
  data.
- Pick/switch the active workspace within a window; reading its `workspace.yaml` if present.
- Open additional windows for other repositories; prevent opening the same repo path twice.
- Show the active repository, workspace, and current branch.

### 6.2 Test case management

- **Create** — new case in the selected suite/folder; auto-generate `id`, suggest next
  `displayId` (workspace prefix), prefill `status: draft`, open with empty sections.
- **Edit** — front-matter form (title, status, tags, displayId; `id` read-only). Body via the
  structured-section controls (§6.3).
- **Duplicate** — copy into same/another suite; new `id`, new `displayId`; title prefixed
  `Copy of`.
- **Move** — drag to another folder (changes suite); `id` unchanged.
- **Rename / retitle** — change title and/or filename; `id` unchanged.
- **Delete** — remove the file; warn if referenced by a run. The run's snapshot rows are kept
  intact (they simply no longer resolve to a live case).
- **Bulk tag** — apply/remove a tag across a multi-selection (nice-to-have).

### 6.3 Structured body editor

- **Objective:** multiline text accepting the inline-formatting whitelist only; block-level
  constructs are prevented as you type and live-previewed.
- **Systems in Scope / Acceptance Criteria:** add/remove/reorder (drag) single-line items.
- **Steps:** add/remove/reorder single-line items with **indent/outdent** for sub-steps;
  rendered as a numbered, nested list.
- All controls enforce the §5.2 formatting whitelist and round-trip to the reserved sections.

### 6.4 Hierarchy & navigation

- Tree view of suites and cases from the folder structure.
- Create/rename/delete suites = create/rename/delete folders.
- Filter by tag, status, and free-text search over title/displayId/section text.

### 6.5 Test runs

- Create from a scope selection (suite / tag filter / manual pick).
- Run view = grid of seeded cases with inline `result`, `tester`, `notes`; quick set-result
  actions; keyboard-friendly entry.
- Per-run summary bar: counts and pass rate. Reopen/continue any run. Runs never mutate cases.

### 6.6 Git workflow

- Persistent status: branch, clean/dirty, ahead/behind counts.
- **Commit** — review changed files (deselectable), enter a message, commit. Default stages all
  changed test content in the repo.
- **Pull** — fetch + merge the configured single branch.
- **Push** — push to the configured remote/branch.
- **Single branch only** in v1; no branch creation/switching in the UI.
- Auth via the **system Git credential helper**; the app stores no secrets and surfaces a clear,
  actionable error if credentials are missing.

### 6.7 Structured 3-way merge & conflict resolution

Because the data model is structured, conflicts are resolved against the **model**, not raw
text. On a conflicted pull, for each conflicted file the app obtains all three versions —
**base** (merge base / index stage 1), **ours** (stage 2), **theirs** (stage 3) — and parses
each into the structured model. The **conflict unit is the whole section (or field)** — there is
no per-item or per-step matching, which keeps the merge simple and predictable.

**Auto-merge** is per element: if an element is unchanged on one side, the other side's version is
taken automatically. Only elements changed on **both** sides (divergently) become conflicts.

| Element                                              | Merge behavior                                                              |
|------------------------------------------------------|------------------------------------------------------------------------------|
| `id`                                                 | Immutable. Divergence ⇒ not the same case → flag, fall back to file-level.   |
| `title`, `status`, `displayId`                       | One-sided change auto-applies; two-sided divergent change ⇒ conflict on field. |
| `tags`                                               | 3-way **set** merge: union adds, honor removals; auto unless contradictory.  |
| Each body section (Objective, Systems, Steps, Expected) | Treated atomically. One-sided change auto-applies; **changed on both sides ⇒ conflict on the entire section.** |
| Run CSV                                              | Row-level merge keyed on `case_id`; rows changed on one side auto-apply; a row changed on both sides ⇒ conflict on that row. |

**Resolve remaining conflicts** in a structured resolver: for each conflicting section (or field,
or CSV row), show a **side-by-side diff** of ours vs theirs (with base for reference) and offer
**take-ours / take-theirs / edit**, plus a live preview of the merged case or run. The diff view
highlights what changed within the section, but the resolution choice applies to the section as a
whole.

**Escape hatches:** a raw view to hand-edit merged markdown/CSV for pathological cases; if any
version fails to parse into the model, fall back to file-level side-by-side for that file.

When all hunks are resolved, write the merged files and complete the merge commit.

## 7. UX outline

- **Left pane:** repository + workspace switcher, suite/case tree, search and tag/status filters.
- **Center:** case editor (front-matter form + four structured-section controls), or the run grid.
- **Top bar:** active repo / workspace / branch, Git actions (pull / commit / push), and the
  structured conflict resolver (modal when needed).
- **Runs:** list of runs from the workspace's runs folder, with open/create actions.

Design intent: a BA lives in the switcher + tree + form + section controls + run grid + three Git
buttons, and resolves conflicts as plain "keep mine / keep theirs / edit" choices per change.

## 8. Design direction & inspiration

High-level only; the detailed token system is deferred to design. The name sets the tone:
*wright* means a maker, so Casewright should feel like a **maker's tool — calm, precise, and
durable, never flashy**. The substrate (markdown, Git, plain files) reinforces that.

**Direction: an engineering workbench, warmed by editorial calm.** A clean, efficient,
developer-credible base — neutral surfaces, hairline borders, monospace for the things that are
literally code (IDs, tags, diffs) — with the *authoring* surfaces (the Objective especially)
borrowing the reading comfort of a writing tool so a business analyst feels like they're writing,
not filling a form. The craft identity shows up as restraint and precision, not literal ornament.

Principles:

- **Clarity over decoration.** Flat surfaces, thin borders, minimal/functional motion; no
  gradients, heavy shadows, or visual noise.
- **Warm-neutral base, one restrained accent.** A single accent for primary actions and selection;
  the UI is otherwise quiet.
- **Status is the loudest signal.** The execution-result palette (`pass` / `fail` / `blocked` /
  `skipped` / `not_run`) is the brightest color in the product and stays consistent everywhere;
  it should be colorblind-safe.
- **Typography with a job per role.** A humanist sans for UI; a comfortable reading measure (and
  optionally a humanist serif) for the structured body; **monospace for IDs, tags, code, and
  diffs**, honoring the file-first substrate.
- **Density adapts to context.** Efficient and compact in the tree, run grid, and diff; more
  generous and readable in case authoring.
- **The diff/merge view is the showpiece.** Structured, side-by-side, and calm rather than
  alarming — this is where the tool earns trust.

Inspiration touchstones: Linear and GitHub Primer (workbench precision and dense-data legibility),
Vercel Geist (restraint and monospace accents), iA Writer and Bear (authoring calm and reading
measure), and Obsidian (the markdown-native, local, file-first feel). Built on Tailwind +
shadcn/ui, the system stays close to those tokens with warm-neutral and accent overrides.

## 9. Technical architecture

- **Shell:** NW.js (Chromium + Node); multiple windows for multiple repos.
- **UI:** React with **TailwindCSS** and **shadcn/ui** (Radix-based components copied into the
  repo) for the tree, forms, section controls, run grid, and conflict resolver.
- **Client state:** **Zustand** (one store per window) for selection, dirty tracking, active
  workspace, and Git status.
- **Type safety / validation:** **Zod** schemas are the single source of truth for the shapes the
  app reads and writes — root config (`casewright.json`), `workspace.yaml`, case front matter, and CSV
  rows. Parsing validates against these schemas; failures become non-blocking lint warnings rather
  than crashes, and the inferred types flow through the codebase.
- **Git:** **simple-git** (system `git` binary) — inherits the system credential helper and
  robust merge behavior. Three-way inputs come from the conflict stages
  (`git show :1:path` / `:2:` / `:3:`). *Dependency: Git must be installed and on PATH.*
- **Front matter:** `gray-matter` for parse/serialize, with the result validated via Zod.
- **Structured body:** custom serializer/parser over the reserved `##` sections, built on a
  markdown AST lib (`remark`/`mdast`) for inline content, list items, and the Steps tree.
- **3-way merge:** a custom per-element merge over the parsed model — front-matter fields, `tags`
  as a set, each body section as an atomic unit, and CSV rows keyed on `case_id`. A text-diff lib
  (e.g. `diff`) is used to **highlight** within-section changes in the resolver, not to merge them.
- **CSV:** `papaparse` (or `csv-parse`/`csv-stringify`) for run files; rows validated via Zod.
- **IDs:** random base36/alphanumeric (`nanoid`, lowercase, length ~10–12).

Writes are deterministic and minimal-diff: stable key/section order, consistent markers and
indentation, trailing newline.

## 10. Acceptance criteria (v1 "done")

- Open a repository; the root config is read and declared workspaces are listed and switchable;
  recents are remembered; a second repository can be opened in another window; the same repo
  can't be opened twice.
- The suite/case tree renders from folders.
- Create, edit, duplicate, move, rename, and delete cases; files carry a stable `id` plus editable
  `displayId`; the body round-trips through the four structured sections with inline-only
  formatting (blocked constructs are prevented/lint-flagged).
- Create a run from a scope, record results in a CSV, reopen and continue it; runs key on stable
  `id` and survive case renames/moves.
- Commit, pull, and push the single configured branch using system credentials.
- A conflicted pull auto-merges anything changed on only one side and presents remaining conflicts
  per section / field / CSV row as side-by-side ours-vs-theirs choices (take-ours / take-theirs /
  edit), with a raw fallback; the merge completes and produces clean files.
- All artifacts are plain files that read sensibly without the app.

## 11. Key decisions (resolved)

No open issues block v1. The notable decisions settled during planning:

1. **`displayId` uniqueness** — auto-suggest `max(existing for prefix) + 1`, keep editable, and
   lint duplicates. The stable `id` is the key, so collisions are cosmetic only.
2. **`_suite.md` and run sidecar `.md`** — both included in v1. CSV stays the primary results store.
3. **Deleting a referenced case** — keep the run's snapshot rows intact (title/displayId/result
   preserved); the row simply no longer resolves to a live case.
4. **Conflict granularity** — per section / field / CSV row; no per-item or per-step IDs.
5. **Formatting** — inline only (bold, italic, strikethrough, code, links); no underline; no
   block-level constructs inside fields.
6. **Open model** — open at the repository level; a turborepo-style root config declares workspace
   locations; one repository per window.
