<p align="center">
  <img src="app/packages/brand/choko-mascot.png" width="140" alt="Choko logo: a Chihuahua in a burgundy hoodie" />
</p>

<h1 align="center">Choko</h1>

<p align="center">
  Test cases, manual runs, and automated tests in one desktop app.<br />
  Markdown on disk. Git for history. A focused interface for everyday QA work.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-900c30" alt="MIT license" /></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-573c42" alt="Windows and macOS desktop app" />
  <img src="https://img.shields.io/badge/data-Markdown%20%2B%20Git-573c42" alt="Markdown and Git data" />
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#getting-started">Getting started</a> ·
  <a href="#data-layout">Data layout</a> ·
  <a href="#development">Development</a> ·
  <a href="#building-and-releasing">Building and releasing</a>
</p>

**Choko** keeps test documentation, test runs, and their results in one local
project. Cases remain ordinary files: you can read them, edit them in an IDE, or
work with them through an agent. Git stores the history, and a remote can be added
later when the team needs it.

Choko is a fork of [Casewright](https://github.com/jimbuck/casewright) by
[Jim Buck](https://github.com/jimbuck), with its own interface and additional
workflows for cases, reference data, and automated tests.

![Choko desktop editor with navigation, statuses, description, and verification steps](docs/images/choko-desktop.png)

*Screenshot uses demo data.*

## Features

| Area | What you can do |
| --- | --- |
| **Cases** | Create cases with descriptions, preconditions, steps, and expected results; group them by folder and workspace; assign statuses and tags. |
| **Runs** | Build test runs, record check results, filter cases by status, and review activity by day and year. |
| **Reference** | Store links, descriptions, and argument sets for different environments; insert entries into cases and read them as cards. |
| **Autotests** | Browse tests in the source-file structure, bind multiple automated tests to one case, and choose arguments from the reference book. |

- **Run and inspect automated tests:** a single test, all selected tests, or only failed
  tests; inspect results and output for every test, including retries.
- **Defect reports:** draft a report from a case and run results, edit the actual result,
  and attach evidence.
- **Reports:** preview and export to PDF with Choko branding.
- **Git:** local history, diffs, commits, pull, and push.
- **Navigation:** back and forward history, quick module access, and opening the
  repository folder.

The interface uses light surfaces, burgundy accents, and the Onest, Rubik, and
Nunito Sans typefaces. Fonts are bundled with the app and the PDF export.

## Getting started

### Download a build

Download the latest Windows or macOS build from
[GitHub Releases](https://github.com/IlyaNavodkin/Navodkin.Test.Choko/releases).

**All platforms:** Choko uses the Git installed on your system. Install Git and
confirm that `git --version` works in a terminal. If Git is missing, Choko shows an
actionable installation error instead of silently failing.

**Windows**

1. Extract the entire ZIP archive and run **Choko.exe**.
2. Choose **Create project**, enter a name and folder, and Choko will prepare a local
   Git repository, `.ch` settings, and the first workspace.

**macOS**

1. Extract the ZIP archive and open **Choko.app**.
2. The build is for Apple Silicon (arm64) and is ad-hoc signed, not notarized.
   If Gatekeeper blocks the first launch, use right-click → **Open**, or run:

   ```bash
   xattr -dr com.apple.quarantine Choko.app
   ```

To continue with an existing folder, choose **Open project**. If the folder does not
have Choko settings yet, the app offers to add them without changing existing
documents. Recent projects are available on the start screen and through
**File → Projects…**.

GitHub and a command-line setup are not required for manual cases. Running automated
tests requires Node.js 22+, Playwright dependencies in the test project, and an
installed Playwright browser.

## Data layout

A **project** is the repository root. A **workspace** is a testing area inside the
project, such as Storefront, Account, or API. One workspace is enough to start and
is created automatically.

Choko stores its data inside `.ch/`:

```text
my-project/
├── .git/                  # Git history for the whole project
└── .ch/
    ├── config.yaml        # project settings and workspace list
    ├── areas/
    │   └── web-tools/     # workspace: folders and Markdown cases
    ├── runs/              # runs and results
    ├── glossary/          # reference book and argument sets
    ├── autotests/         # Playwright project
    ├── automation/        # case bindings and automated-test results
    └── defects/           # saved defect reports and evidence
```

Workspace paths are configured in `.ch/config.yaml`; they may live at the project
root or in other folders. `.git` always stays at the repository root.

To migrate data from an earlier version into `.ch`:

```powershell
cd app/apps/desktop
pnpm migrate:choko D:\path\to\test-repository
```

For the detailed storage format and desktop workflows, see the
[desktop application documentation](app/apps/desktop/README.md).

## Development

Requirements: **Node.js 22+**, **pnpm 11+**, and **Git**.

```powershell
cd app
pnpm install
pnpm dev:desktop
```

This opens the real desktop window with hot reload. Keep the terminal running.

For an HTTP preview with disposable demo data:

```powershell
cd app/apps/desktop
pnpm dev:mockup
```

Checks and builds from the `app` directory:

```powershell
pnpm --filter @choko/desktop typecheck
pnpm --filter @choko/desktop test
pnpm --filter @choko/desktop build
pnpm --filter @choko/desktop package:win
```

Browser component checks:

```powershell
cd apps/desktop
pnpm exec playwright install chromium
pnpm test:ui
```

The app is built with **React + TypeScript + NW.js** and **Vite**. The monorepo uses
**pnpm workspaces**. Shared colors, fonts, and graphics live in
[`app/packages/brand`](app/packages/brand).

## Building and releasing

Official desktop builds are produced by GitHub Actions:

- Workflow: [`.github/workflows/build-desktop.yml`](.github/workflows/build-desktop.yml)
- Manual build: **Actions → Build desktop binaries → Run workflow**. No tag is
  required; the workflow uploads Windows and macOS artifacts.
- Release build: from `app/`, run `pnpm release` and choose `patch`, `minor`, or
  `major`. The script bumps both package versions, commits, tags, and optionally
  pushes. The workflow verifies that the tag matches both package versions and
  attaches the binaries to a GitHub Release.

Windows builds include a portable ZIP and an Inno Setup installer. macOS builds are
arm64-only and ad-hoc signed. Full instructions, version rules, free-tier limits,
and signing notes are in [`app/RELEASING.md`](app/RELEASING.md).

## Project layout

```text
app/
├── apps/
│   ├── desktop/        # Choko desktop app — NW.js + React + TypeScript
│   └── web/            # marketing site — Astro, GitHub Pages
├── packages/
│   └── brand/          # @choko/brand — shared design tokens and artwork
├── turbo.json
└── pnpm-workspace.yaml
```

## Credits

Special thanks to **[Jim Buck](https://github.com/jimbuck)**, creator of
**[Casewright](https://github.com/jimbuck/casewright)**.

**Choko is a fork of his application.** Thank you for the original project, the
source code, and the foundation for further development. We preserve the original
Casewright attribution and copyright notice.

## License

Choko is distributed under the [MIT License](LICENSE). The license keeps Jim Buck's
original copyright notice and adds a notice for Choko changes.

Fonts are distributed with their own
[SIL Open Font License](app/packages/brand/fonts) files. Third-party components
retain their own licenses.
