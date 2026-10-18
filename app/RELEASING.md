# Releasing Casewright

Releases are **fully automatic** and driven by [Conventional Commits](https://www.conventionalcommits.org).
You never choose a version number or push a tag by hand — you write good commit messages and merge
to `main`.

## How it works

Every push to `main` runs [`.github/workflows/release.yml`](.github/workflows/release.yml):

1. **[semantic-release](https://semantic-release.gitbook.io)** reads every commit since the last
   `v*` tag and decides whether a release is due and what the version is:

   | Commit type                          | Bump  | `0.3.0` →     |
   | ------------------------------------ | ----- | ------------- |
   | `fix:` (and `perf:`)                 | patch | `0.3.1`       |
   | `feat:`                              | minor | `0.4.0`       |
   | `feat!:` / any `BREAKING CHANGE:`    | major | `1.0.0`       |
   | `chore:` `docs:` `refactor:` `style:` `test:` `ci:` | none — no release | — |

   When a release is due it updates [`CHANGELOG.md`](CHANGELOG.md) and both `package.json` versions
   (root + `apps/desktop`, via [`scripts/sync-version.mjs`](scripts/sync-version.mjs)), commits that
   as `chore(release): vX.Y.Z [skip ci]`, and pushes the `vX.Y.Z` tag. It does **not** create the
   GitHub Release yet.

2. If a version was cut, [`.github/workflows/release-desktop.yml`](.github/workflows/release-desktop.yml)
   builds the Windows app + Inno Setup installer and **publishes the GitHub Release with the assets
   attached** — `Casewright-Setup-<v>.exe` and `Casewright-<v>-win-x64.zip`.

The two-step ordering is deliberate: the Release only becomes visible once the installer is present,
so the in-app auto-updater never sees a release it can't download. The version flows into the build
via `CASEWRIGHT_VERSION`, which sets both the packaged manifest and `__APP_VERSION__` (the value the
running app compares against the latest release), keeping the updater's comparison correct.

## What you do

Nothing release-specific. Write [conventional commits](https://www.conventionalcommits.org):

```text
feat(runs): add per-case test-date override
fix(editor): stop dropping the trailing newline on save
feat!: require config.yaml at the repo root

BREAKING CHANGE: the legacy casewright.json registry is no longer read.
```

Merge to `main`. If anything releasable landed, a new version ships a few minutes later; if not,
nothing happens.

## Manual / fallback release

To rebuild and republish a specific version by hand — e.g. the build failed *after* the tag was
already created, so re-running won't re-tag — run **Build desktop release** from the **Actions** tab
and supply the version (e.g. `0.4.0`). It rebuilds and updates that version's existing Release.

## One-time setup caveat — protected `main`

semantic-release pushes the release commit and tag using the built-in `GITHUB_TOKEN`. If `main` is a
**protected branch** (required pull requests / status checks), that push is rejected and the release
step fails. Fix by allowing the GitHub Actions bot to bypass the rule:

- **Rulesets:** Settings → Rules → Rulesets → your `main` ruleset → **Bypass list** → add the
  repository's GitHub Actions bot (or "Repository admin").
- Or use a **Personal Access Token / GitHub App token** with push rights as the workflow's checkout
  token instead of the default `GITHUB_TOKEN`.

If `main` is unprotected (the default for this repo), no setup is needed — it just works.

## Notes

- The pushed release commit carries `[skip ci]` and is authored by `GITHUB_TOKEN`, so it never
  re-triggers the release workflow (no loops).
- `CHANGELOG.md` is generated — don't hand-edit it.
- semantic-release and its plugins aren't project dependencies; the workflow installs them
  ephemerally, keeping the lockfile lean.
