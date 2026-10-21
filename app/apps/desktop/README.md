# @chioko/desktop

The Chioko desktop application — _a bespoke editor for manual test cases; markdown on
disk, Git as the data store._ Built with **NW.js + React + TypeScript** (Vite).

## Running

### First launch of a Windows release

Extract the entire release ZIP and run `Chioko.exe`. The included `git/` directory
provides Git without a separate installation. Do not move the executable alone.

On the start screen, choose **Создать проект**, provide its name and a parent
folder, then create the first case. Chioko initializes local Git and `.ch/` with
a root workspace automatically. GitHub is optional. **Открыть проект** accepts
an existing repository root or ordinary folder and offers to add Chioko settings
without replacing existing documents. Recent projects are shown on this screen;
return through **File → Projects…**. Startup never opens the last project silently.

### Development

Install Git when running from source. The bundled Git is added by `pnpm package:win`.

From the **repo root**:

```bash
pnpm install          # the first install downloads the NW.js runtime (~200 MB)
pnpm dev:desktop      # Vite dev server (HMR) + NW.js window pointed at it
```

…or from this directory: `pnpm dev`.

`scripts/dev.mjs` starts Vite, writes a throwaway `.nwdev/` manifest whose `main` is the dev-server
URL, and launches NW.js against it — so you get hot reload inside the real desktop window. NW.js is
the **SDK flavor** (`nw@0.112.0-sdk`), so DevTools are available (`F12`).

### Production build

```bash
pnpm --filter @chioko/desktop build   # Vite → dist/
pnpm --filter @chioko/desktop start    # nw . → loads dist/index.html
```

The NW.js manifest (`package.json`) sets `main: dist/index.html`; Vite emits **relative** asset
paths (`base: './'`) so it loads from `file://`.

## Architecture

```
src/
├── main.tsx                  # React root + app.css import
├── types/                    # domain model (Case, TreeNode, Run, Conflict, …)
├── schemas/                  # Zod schemas for the on-disk shapes + LintWarning
├── services/                 # the real backend:
│   ├── format/               #   serialize/parse case markdown, run CSV, suite, filename
│   ├── repo.ts               #   .ch/ discovery + load (read) + initRepo scaffold + fs writes
│   ├── git.ts                #   simple-git wrapper (status/commit/push/pull/abort)
│   ├── recents.ts            #   recents.json in nw.App.dataPath
│   ├── persist.ts            #   debounce + flush for disk writes
│   └── watch.ts              #   fs.watch the repo → live-reload on external changes
├── data/sample.ts            # seed data for the fixture + tests (NOT app data)
├── utils/                    # markdown render, word diff, step numbering, ids, cx
├── store/app-store.ts        # the app store — a typed Zustand store + useApp() hook
├── lib/
│   ├── node.ts               # runtime require() bridge for Node-only modules
│   └── nwjs.ts               # NW.js window helpers + dataPath + pickDirectory
├── styles/app.css            # Tailwind v4 + brand-token @theme bridge
└── components/
    ├── App.tsx               # view routing + modals + merge-conflict banner
    ├── icons.tsx             # the line-icon set
    ├── ui/                   # shadcn/Radix primitives over Tailwind: Button, Input, Select,
    │                         #   Textarea, Tag, StatusPill, ResultSwatch, Field, Modal, Kbd,
    │                         #   dropdown-menu, context-menu
    ├── chrome/               # TitleBar (custom frameless), TopBar, Toasts
    ├── launcher/             # Launcher (recents + picker + .ch/ init & empty states)
    ├── sidebar/              # Sidebar (tree DnD + filters + Radix context menu)
    ├── editor/               # CaseEditor + Objective / List / Steps / Tag controls
    ├── runs/                 # RunsList, RunGrid, CreateRunModal, NotesCell
    ├── guide/                # RunGuide + checklist
    ├── merge/                # the structured 3-way merge resolver (decoupled; deferred engine)
    └── common/               # CommitModal, EmptyCenter
```

The UI is **Tailwind v4 + shadcn/ui (Radix)**; the `ui/` primitives keep a stable export
surface (`<Button variant="primary" size="sm">`). The Chioko brand tokens in
[`@chioko/brand`](../../packages/brand) are bridged into Tailwind via `@theme inline` in
`styles/app.css` and remain the single source of truth (shared with the marketing site).

**Data layer.** The Git repository _is_ the data store. A repo is marked by a **`.ch/`**
folder at its root (`config.yaml` + a central `runs/` + an auto-managed `.gitignore`), and each
workspace declares itself with a **`chioko.yaml`** — discovered by a one-time walk on open, so
there is no central registry to maintain. `services/repo.ts` validates `.ch/`, discovers
workspaces, loads the suite/case tree + repo-level run CSVs, and writes cases/suites/runs and
workspace config back as plain files (`initRepo` scaffolds `.ch/` for an un-initialized
repo); `services/git.ts` drives status/commit/push/pull. Node-only modules (`fs`, `simple-git`,
`gray-matter`, `papaparse`) load at runtime through the `lib/node.ts` bridge (NW.js shares Node with
the renderer), so they're never bundled.

A chioko repository looks like:

```
my-repo/
├── .ch/
│   ├── config.yaml          # repo-wide config (version, optional name)
│   ├── runs/                # all run CSVs + .md sidecars — repo-level, may span workspaces
│   ├── glossary/            # reference book records (one Markdown file per entry)
│   ├── automation/          # autotest catalog, bindings and execution snapshots
│   ├── autotests/           # Playwright project (marker + package.json/config/tests)
│   ├── defects/             # defect snapshots + evidence
│   └── .gitignore           # keeps cache/ out of Git (config.yaml + runs/ are committed)
├── areas/payments/
│   ├── chioko.yaml      # presence declares this folder a workspace (name, displayIdPrefix)
│   ├── Authentication/      # suites are just folders
│   │   └── PAY-0001-….md    # cases are markdown files
│   └── Billing/…
└── areas/onboarding/
    ├── chioko.yaml
    └── Activation/…
```

Workspaces don't nest (the walk stops at the first `chioko.yaml`); if the root itself has a
`chioko.yaml`, the whole repo is a single workspace.

External changes are picked up **live** — `services/watch.ts` watches the working tree (Node's
recursive `fs.watch`) and, on a debounced tick, re-runs discovery + load so cases / suites /
workspaces created or edited outside the app (an editor, Claude Code, `git pull`/`checkout`) appear
automatically. The app's own writes are filtered out (self-write tracking in `repo.ts`) so saves
don't self-trigger, and the active selection is preserved across a reload.

The window is **frameless** (`window.frame: false`) with a custom VS Code–style **titlebar**
(`chrome/TitleBar.tsx`): an app-region drag bar with a File/View/Go/Help menu bar (wired to app
actions, reusing the `ContextMenu`) and Windows-style minimize / maximize / close controls backed
by `lib/nwjs.ts`. Outside NW.js (dev preview / tests) the controls no-op gracefully.

The window **remembers where it was last open** — size, position, monitor, and maximized
state are persisted to `window-state.json` in the OS data dir (next to recents) by
`services/window-state.ts`. The manifest creates the window hidden (`window.show: false`) so
the saved geometry is restored *before* it appears (no jump from the default placement); a
window saved on a since-unplugged monitor reopens centered on the primary one.

## Navigation and workspace folders

The top bar's Back / Forward buttons (`Alt+Left` / `Alt+Right`) revisit modules,
cases, runs, reference records, and selected autotests. This session history is
separate from content Undo/Redo, skips deleted records, and resets when switching
repositories. Unsaved reference drafts still require a save/discard decision.
The top bar's **Open Git repository folder** button opens the active repository
root (`repoPath`, containing `.git`), regardless of where cases are stored. The
same action is available in a workspace row's context menu. It never derives a
folder from a case or documentation path.

## Reference reading and module layout

Reference book and Autotests keep their catalog columns beside the content;
their page headers and actions belong to the content column. In reading views,
hovering a resolved glossary link opens a **Read** card with its Markdown
description, selectable text, Copy text and Open in Reference. It uses the shared
hover delay and remains open while the pointer or keyboard focus is inside.
With the link focused and the preview open, Arrow Down moves to the card's
actions; Escape closes it and returns focus. Run links use their frozen
description when a snapshot exists.

## Activity calendar and result filters

Runs shows a full January–December activity calendar with a year selector,
previous/next-year controls, and a return to the current year. A day counts the
current recorded verdicts of run rows by their stored `executed_at` date, across
all runs. Run creation dates and the editable Test date are not used. Unrun or
unstamped rows are excluded. Color indicates the highest-priority verdict and
intensity indicates the day's count. This is not an audit log: recording a new
verdict on the same row replaces its previous timestamp/result.

Hover or focus a day for its date, counts and related runs. Click a day to filter
the run list; opening one of those runs shows only its rows recorded that day.
Arrow keys move between days; Enter/Space selects the focused day. Escape closes
an informational popover. Selecting another year clears the day filter.

Details appear after a deliberate hover (600 ms), or keyboard focus (350 ms).
Quick pointer passes do not open them. Only one popover is visible at a time;
moving into it keeps it open. Clicking a filter dismisses its popover until the
pointer leaves and returns, so filtering does not make details flash back open.

Inside a run, hovering a result-bar segment shows its count and share of all
cases. Clicking filters cards by status; clicking it again removes that status
filter. Date and status filters combine; **Reset filters** restores every card.
The overall distribution and pass rate stay scoped to the entire run. Reordering
is unavailable while cards are filtered. Calendar selection and run filters are
part of Back/Forward navigation, and filtering never writes test results.

## Defect snapshots

A non-passing run row can be turned into a **defect snapshot** — a self-contained Markdown report that can be
pasted into any work-item tracker without links. The runner's Defect report panel (or the file action on a
failed/blocked run card) opens a composer prefilled from the row, the case and the run's frozen arguments; the
tester reviews/corrects the summary, environment, objective, steps, expected/actual and notes, attaches
evidence, then copies or saves it.

**Actual result** is initially assembled from failed checklist items and the
tester's failure notes (or general run-row notes when there are no failed items).
It remains editable; expected results are not used to invent observed behaviour.

Snapshots live next to the run data and are committed with it:

```
.ch/defects/<run-stem>/
├── RND-0002.md
└── RND-0002.evidence/
    └── 001-screenshot.png
```

`RND-0002.md` is the snapshot: front matter (case/run/tester/date/source/evidence) plus the ready-to-paste
body. Reopening it reads the file, never the live case; **Reset from case** is the explicit rebuild. Copy
puts both `text/html` and Markdown `text/plain` on the clipboard, and the summary has its own Copy action.

Manual and automated results stay separate: `RunRow.result` is the manual (human) result, while autotest
results live in the run's automation sidecars and are shown in the Autotests panel. **Apply to unrecorded**
only fills rows that have no manual result (`executed_at` empty); automation never overwrites a manual
pass/fail. Defect sources are recorded as Manual, Autotest or both.

## Testing & the fixture repo

For background desktop UI checks, run `pnpm dev:automation` from this directory.
It starts a separate hidden NW.js instance with its own profile and dev server
on `127.0.0.1:5174`. Playwright can attach via
`chromium.connectOverCDP('http://127.0.0.1:9223')`. This mode does not show or focus
the test window; keep `pnpm dev` for the visible working app. The debugging port
is available only in this opt-in development mode and listens on loopback.
Background startup skips geometry restoration and persistence, including saved
maximization. Do not emulate a viewport on a native NW.js window: use a separate
headless browser for viewport and screenshot checks.

```bash
pnpm --filter @chioko/desktop test            # Vitest: format round-trips, schema coercion, repo/git integration
pnpm --filter @chioko/desktop fixture         # materialize a real .fixture/ repo from the seed
pnpm --filter @chioko/desktop fixture --with-origin   # …plus a bare .fixture-origin.git remote
```

`scripts/make-fixture.mts` turns the seed in `src/data/sample.ts` into a **real Git repository**
(under `.fixture/`, gitignored) using the same serializers the app uses — the canonical dev/test
target. Run the app against it (`pnpm dev:desktop`, then Open repository… → `.fixture/`). The
Vitest suite covers the pure format layer plus integration tests for `repo.ts`/`git.ts` against
temp git repos (open/load, write/rename/delete, commit/push/pull/conflict+abort).

The fixture also contains a tiny **Playwright demo project** at
`.fixture/.ch/autotests/` (the folder is the detection marker): two green tests and one
intentionally red test. Run `npm install` once inside that folder, then use the app's **Autotests**
section (Trust this project → Discover tests → bind a test to an open case). See
`.fixture/.ch/autotests/README.md` for the exact flow and expected results.

## Packaging & releases (Windows)

Releases are **fully automatic** and driven by [Conventional Commits](https://www.conventionalcommits.org).
On every push to `main`, the **Release** workflow ([`.github/workflows/release.yml`](../../.github/workflows/release.yml))
runs [semantic-release](https://semantic-release.gitbook.io): it reads the commits since the last
tag, decides the next version (`fix:` → patch, `feat:` → minor, `feat!:` / `BREAKING CHANGE` →
major), bumps `CHANGELOG.md` + both `package.json` versions, and pushes the `v<version>` tag. It
then triggers the reusable **Build desktop release** workflow
([`.github/workflows/release-desktop.yml`](../../.github/workflows/release-desktop.yml)), which
builds on `windows-latest` and publishes the GitHub Release **with the installer attached** (so the
Release never appears without its download — important for the in-app auto-updater). See
[`RELEASING.md`](../../RELEASING.md) for the full flow and the protected-branch caveat.

A push with no releasable commits (only `chore`/`docs`/`refactor`/`style`/`test`/`ci`) ships
nothing. To rebuild/republish a specific version by hand (e.g. a build that failed after the tag was
cut), run **Build desktop release** from the **Actions** tab and supply the version. Each run
produces two assets:

- **`Chioko-Setup-<version>.exe`** — a per-user installer (no admin/UAC), with a Start-Menu
  shortcut and uninstaller. Built with **Inno Setup** ([`build-resources/chioko.iss`](build-resources/chioko.iss)).
- **`Chioko-<version>-win-x64.zip`** — a portable build (unzip and run `Chioko.exe`).

### Building locally

```bash
pnpm --filter @chioko/desktop package:win   # vite build → stage → nw-builder → portable zip
```

This runs [`scripts/package-win.mjs`](scripts/package-win.mjs), which:

1. **Stages** a minimal NW.js manifest + the built `dist/` under `build/staging/`.
2. **`npm install`s only the runtime node-deps** there (`simple-git`, `gray-matter`, `papaparse`) —
   the libs Vite leaves un-bundled (`lib/node.ts`). pnpm's symlinked store can't be copied into a
   distributable, so the app ships its own flat `node_modules`.
3. Runs **`nw-builder`** (pinned to the same NW.js version as the dev `nw` devDep, _normal_ flavor)
   to merge the staged app into `build/out/Chioko.exe` (+ the Chromium runtime), with the icon
   and version metadata embedded.
4. **Zips** `build/out/` into `build/Chioko-<version>-win-x64.zip`.

The installer step (Inno Setup) runs in CI; build it locally with
`ISCC.exe /DMyAppVersion=0.1.0 build-resources/chioko.iss` if you have Inno Setup 6 installed.

The app **icon** (`build-resources/icon.ico`) is generated from the supplied Chioko mascot
(`@chioko/brand/chioko-mascot.png`) by [`scripts/make-icon.mjs`](scripts/make-icon.mjs); it's
committed, so packaging needs no rasterizer. Re-run `pnpm --filter @chioko/desktop make-icon`
whenever the mark changes. Everything under `build/` and `.nwcache/` is gitignored.

## Status & next steps

The desktop app is a typed, modular **React 19 + Tailwind v4 + shadcn** app backed by a real
on-disk + Git data layer (verified: `tsc` clean, `vite` build, 47 Vitest tests, and a Node-level
end-to-end open → load → edit → `git status` against the fixture). Intentional follow-ups:

- **Structured 3-way merge engine.** The resolver UI (`components/merge/*`) is in place but
  decoupled from real git stages; conflicted pulls currently show a banner + `git merge --abort`.
  The follow-up wires `services/merge.ts` (`buildConflict` from `git show :1/:2/:3`, per-element
  3-way per PRD §6.7) to populate the store `conflict` and re-enable the resolver.
- **Wire NW.js native shell APIs.** The right-click actions (Reveal in File Explorer, Open in
  default editor, …) are still mocked toasts; back them with `nw.Shell`.
- **Preserve out-of-schema content** through the store (the format layer captures it; the store
  round-trip currently drops it), a lint-warnings panel, `_suite.md` display names, run sidecar
  metadata, and a multi-window same-repo guard.
- **macOS / Linux packaging.** The Windows pipeline is in place (see _Packaging & releases_ above);
  `nw-builder` can target `osx`/`linux` too — add matrix jobs + per-OS bundling (`.dmg` / `.AppImage`)
  when those platforms are in scope.

## HTTP mockup of the current app

From this directory, run `pnpm dev:mockup` and open http://127.0.0.1:5199/.
This uses the current app components and styles with the sample cases and runs.
Edits live in memory and reset on reload; filesystem, Git and native desktop
operations require the desktop app. Vite updates the page as layout files change.

Direct views: `/?view=suite`, `/?view=runs`, `/?view=run`, `/?view=guide`,
`/?view=glossary`, and `/?view=automation`.

`/?view=run-autotests` opens the dedicated automation workspace for the sample run.
The demo contains nested source folders, single-Case selectors, Development and
Staging reference sets, and passed/failed/not-run results. Browser launches are
explicitly simulated and never start Playwright. Refreshing resets the demo.

The Autotests catalog reflects folder/file paths discovered from the project.
Select a Case directly, then choose an arguments set from the Reference book;
argument values are stored as references. In Runs, **Open autotests** opens the
run's test browser with individual, all, and latest-failed launches. External
terminal/VS Code results use **Import report** (Playwright JSON or JUnit); refreshing
the catalog and importing reports remain explicit actions. Execution history and
manual results remain separate. See the workflow decisions in
`../../../openspec/changes/improve-autotest-workflow/design.md`.

In a run's Autotests page, select a leaf and use **Run this test** to run only its
binding, including when other tests share the same source file. **Test output**
shows that test's reporter-attributed stdout/stderr and errors, with an attempt
selector for retries. Native results and imported Playwright JSON reports retain
these streams when saved; legacy/JUnit reports can have no per-test output.
Each displayed stream is bounded to 40,000 characters (or a bounded byte prefix
for encoded buffers), with a truncation notice. The shared process log is labelled
separately because it may contain output from several tests. These per-test
streams arrive with the completed report; they are not a live per-test terminal.
