# Chioko

Private project: [Navodkin.Test.Chioko](https://github.com/IlyaNavodkin/Navodkin.Test.Chioko).

Chioko is a desktop application for test cases, manual runs, reference entries and
Playwright autotests. It uses React, TypeScript and NW.js in a pnpm workspace.

## Run locally

For a Windows release, extract the whole ZIP and launch `Chioko.exe`. Keep its
supporting files and `git/` folder together; Git is included in the distribution.
Choose **Создать проект**, enter a name and parent folder. Chioko creates a local
Git repository, `.ch/` settings and the first workspace, then offers to create the
first test case. No GitHub account or command line is required.

Use **Открыть проект** to select an existing repository root or ordinary folder.
For a folder without Chioko settings, confirm **Добавить Chioko в проект**.
Existing documents are preserved. Recent projects stay on the start screen;
**File → Projects…** returns there. A project is the whole repository; workspaces
organize its test cases into areas. Remote synchronization and autotests are optional.

For development from source, use Node.js 22 or newer, pnpm 11 and Git.

```powershell
cd app
pnpm install
pnpm dev:desktop
```

The desktop window reloads when sources change. Keep the terminal running.
For an HTTP mockup with disposable sample data:

```powershell
cd app/apps/desktop
pnpm dev:mockup
```

## Project data

Each test repository uses `.ch/config.yaml`, `.ch/runs/`, `.ch/glossary/` and
`.ch/autotests/`. Test cases remain readable Markdown files in their workspace
folders. Opening a repository from the previous version migrates its data and
references to `.ch/`; the migration can also be run explicitly:

```powershell
cd app/apps/desktop
pnpm migrate:chioko D:\path\to\test-repository
```

The migration resumes interrupted reference updates and refuses to merge two
existing data directories. Review and commit the migrated test repository.

## Validate

```powershell
cd app
pnpm --filter @chioko/desktop typecheck
pnpm --filter @chioko/desktop test
pnpm --filter @chioko/desktop build
```

The brand lives in `app/packages/brand`: ivory surfaces, burgundy accents,
Onest for UI text, Rubik for headings and Nunito Sans for the Chioko wordmark.
PDF previews and exports share these tokens and embed fonts for offline use.
Original font license notices are included in the brand package.

See [desktop documentation](app/apps/desktop/README.md) for storage and workflows.
