# Building and releasing Choko

This is the **required process** for official desktop builds. GitHub Actions is the
supported release pipeline; local packaging is only for smoke tests.

- Workflow: [`.github/workflows/build-desktop.yml`](../.github/workflows/build-desktop.yml)
- Repository: `IlyaNavodkin/Navodkin.Test.Choko`
- Targets: Windows x64 and macOS arm64 (Apple Silicon)

## Workflow triggers

The workflow runs in two cases:

1. **Manual build** — Actions → **Build desktop binaries** → **Run workflow**.
   No tag is needed. The run only uploads downloadable artifacts.
2. **Release build** — push a tag matching `v*` (for example `v0.17.0`).
   The run builds both platforms and attaches the files to a GitHub Release.

## Release script (recommended)

Run the interactive helper from `app/`:

```bash
pnpm release
```

It asks for `patch`, `minor`, or `major`, then:

1. verifies the working tree is clean and the branch is not behind its upstream;
2. verifies the tag does not already exist locally or on `origin`;
3. runs the required typecheck, tests, desktop build, and web build;
4. bumps both `app/package.json` and `app/apps/desktop/package.json`;
5. commits `chore(release): <version>`;
6. creates the annotated `v<version>` tag;
7. optionally pushes the commit and tag to `origin`.

The tag push starts the GitHub Actions release workflow. The script does not create
the GitHub Release directly.

Non-interactive examples:

```bash
pnpm release minor                 # skip the bump prompt
pnpm release --dry-run major       # show the plan, change nothing
pnpm release --no-push patch       # commit + tag locally
pnpm release --yes --push minor    # no confirmation prompts
pnpm release --skip-checks minor   # not recommended
```

Useful flags:

| Flag | Effect |
| --- | --- |
| `--dry-run` | Print the plan and commands without changing anything |
| `--no-push` | Create the commit and tag locally, do not push |
| `--push` | Push without asking |
| `--yes` | Skip the release confirmation |
| `--skip-checks` | Skip typecheck/tests/builds |
| `--no-fetch` | Skip `git fetch` |

The script requires a clean working tree. Commit or stash changes first.

## Manual build (no tag)

Use this for a test build or when you need binaries without publishing a release.

1. Push the commit you want to build to `main`.
2. Open **Actions → Build desktop binaries**.
3. Click **Run workflow**.
4. Select the `main` branch.
5. Optionally enter a version. If left empty, the workflow uses the version from
   `apps/desktop/package.json`.
6. Run the workflow.

When it finishes, download the artifacts:

| Artifact | Contents |
| --- | --- |
| `choko-windows` | `Choko-<version>-win-x64.zip` and `Choko-Setup-<version>.exe` |
| `choko-macos-arm64` | `Choko-<version>-mac-arm64.zip` containing `Choko.app` |

Artifacts are kept for **7 days**. For long-term distribution use a GitHub Release.

## Release build (tag required)

A release is created only from a pushed `v*` tag.

### 1. Bump both package versions

The tag must match **both** version fields:

- `app/package.json`
- `app/apps/desktop/package.json`

Example for version `0.17.0`:

```json
{
  "version": "0.17.0"
}
```

Both files must contain the same value, without the leading `v`.

### 2. Commit and push

```bash
git add app/package.json app/apps/desktop/package.json
git commit -m "chore(release): 0.17.0"
git push origin main
```

### 3. Create and push the tag

```bash
git tag v0.17.0
git push origin v0.17.0
```

A local tag alone does nothing. GitHub only sees it after `git push origin v0.17.0`.

### 4. Let the workflow run

The tag push starts the workflow automatically. Before building, it verifies that
the tag matches both `package.json` files. If they differ, the run fails with:

```text
Tag v0.17.0 does not match package versions (root=0.16.0, desktop=0.16.0). Bump both package.json files first.
```

Fix the versions, commit them, delete the bad tag, and create a new tag on the
correct commit:

```bash
git tag -d v0.17.0
git push origin :refs/tags/v0.17.0
# bump versions, commit, push main, then create and push the tag again
```

### 5. Release assets

When the tag build succeeds, the GitHub Release contains:

- `Choko-Setup-<version>.exe` — per-user Windows installer;
- `Choko-<version>-win-x64.zip` — portable Windows build;
- `Choko-<version>-mac-arm64.zip` — macOS arm64 app bundle.

## Where the version comes from

The workflow has a **Resolve version** step with this order:

1. Manual `version` input, if provided.
2. Tag name without the leading `v` (`v0.17.0` → `0.17.0`).
3. Otherwise, the version from `app/apps/desktop/package.json`.

The resolved value is passed as `CHOKO_VERSION` to:

- `apps/desktop/scripts/package-win.mjs`;
- `apps/desktop/scripts/package-mac.mjs`;
- `apps/desktop/vite.config.ts`, which sets `__APP_VERSION__` for the running app.

The tag is the source of truth for release builds. The package version guard keeps
the repository manifest, built manifest, artifact names, and in-app updater aligned.

## Local builds

Local packaging is useful for smoke tests, but it is not a release.

```bash
cd app
pnpm install
pnpm --filter @choko/desktop typecheck
pnpm --filter @choko/desktop test
pnpm --filter @choko/desktop package:win
```

`package:mac` must run on macOS because it uses `sips`, `iconutil`, `codesign`, and
`ditto`:

```bash
cd app
pnpm --filter @choko/desktop package:mac
```

Outputs are written under `apps/desktop/build/` and are gitignored.

## GitHub Actions cost and limits

### Public repository

Standard GitHub-hosted runners are free for public repositories, including Windows
and macOS. There is no monthly minute quota for these runners.

Technical limits still apply:

- 20 concurrent jobs on GitHub Free;
- 5 concurrent macOS jobs;
- 6 hours per job;
- artifact storage limits and retention (this workflow uses 7 days).

Larger and GPU runners are always billed and are not used by this workflow.

### Private repository

GitHub Free includes **2,000 minutes per month**. Windows jobs consume the quota at
**2×** and macOS jobs at **10×**. Artifact storage is **500 MB** on GitHub Free.

A typical Windows + macOS run consumes roughly 60–120 billable minutes, so the free
quota covers about 15–30 builds per month. Making the repository public removes the
minute quota.

### Signing and notarization

The Windows executable and macOS app are **not code-signed or notarized** by
default. This costs nothing extra but can show OS warnings:

- Windows SmartScreen may warn on first launch.
- macOS Gatekeeper may block the app; open it with right-click → **Open**, or run
  `xattr -dr com.apple.quarantine Choko.app`.

For warning-free distribution:

- Apple Developer Program membership is required for notarization (about $99/year);
- a Windows code-signing certificate is required for SmartScreen reputation.

Neither is required for personal use or internal testing. The GitHub build itself
remains free either way.

## macOS architecture

The current `package:mac` script builds **arm64** only, for Apple Silicon MacBooks.
For an Intel Mac, change `arch: 'arm64'` and the output name in
`apps/desktop/scripts/package-mac.mjs`.

## Required checks before merging

- `pnpm --filter @choko/desktop typecheck`
- `pnpm --filter @choko/desktop test`
- `pnpm --filter @choko/desktop build`
- `pnpm --filter @choko/web build`

All four must pass before a release tag is pushed.
