# Casewright

A git-backed desktop application for writing and running test cases —
_a bespoke editor for manual test cases; markdown on disk, Git as the data store._

This is a [Turborepo](https://turbo.build/repo) monorepo (pnpm workspaces).

## Workspace

```
casewright/
├── apps/
│   ├── desktop/        # the Casewright app — NW.js + React + TypeScript (Vite)
│   └── web/            # the marketing site — Astro static site, deployed to GitHub Pages
├── packages/
│   └── brand/          # @casewright/brand — shared design tokens (palette, type, status colors)
├── turbo.json          # task pipeline
└── pnpm-workspace.yaml
```

| Package                | What it is                                                  |
| ---------------------- | ----------------------------------------------------------- |
| `@casewright/desktop`  | NW.js desktop app. See [`apps/desktop/README.md`](apps/desktop/README.md). |
| `@casewright/web`      | Astro marketing site → GitHub Pages.                        |
| `@casewright/brand`    | Design tokens shared by both apps.                          |

## Prerequisites

- **Node** ≥ 22 (`.nvmrc` pins 22; `fnm use` / `nvm use` will pick it up)
- **pnpm** ≥ 11 — `corepack enable` provides the pinned version from `packageManager`

Build-script approvals and pnpm 11's supply-chain `minimumReleaseAge` gate are configured in
[`pnpm-workspace.yaml`](pnpm-workspace.yaml) (the age gate is set to `0` so tracking the latest
of everything isn't blocked by same-day releases — raise it to re-enable the safety window).

## Getting started

```bash
pnpm install        # first run also downloads the NW.js runtime for the desktop app (~200 MB)
pnpm dev            # run everything via turbo
```

Or target one app:

```bash
pnpm dev:web        # Astro dev server (http://localhost:4321)
pnpm dev:desktop    # launches the NW.js desktop app
```

> Tip: to skip the large NW.js download while working only on the site, install just the web
> graph: `pnpm install --filter @casewright/web...`.

## Common scripts (root)

| Command            | Does                                              |
| ------------------ | ------------------------------------------------- |
| `pnpm dev`         | `turbo run dev` across all apps                   |
| `pnpm build`       | `turbo run build` (currently builds the web site) |
| `pnpm build:web`   | build just the marketing site to `apps/web/dist`  |
| `pnpm lint`        | `turbo run lint` (Astro type-check on the site)   |
| `pnpm clean`       | `turbo run clean`                                 |

## Deploying the marketing site

[`.github/workflows/deploy-web.yml`](.github/workflows/deploy-web.yml) builds `apps/web` and
publishes it to **GitHub Pages** on every push to `main` that touches the site.

To turn it on: **Settings → Pages → Build and deployment → Source: _GitHub Actions_.** The
workflow derives the correct `site` and `base` automatically (project site → `/casewright`,
user/org site → `/`), so no config edit is needed. Commit `pnpm-lock.yaml` so the frozen
install resolves in CI.

## Releasing the desktop app

Releases are **automatic** — there's nothing to tag by hand. [`.github/workflows/release.yml`](.github/workflows/release.yml)
runs [semantic-release](https://semantic-release.gitbook.io) on every push to `main`: it reads the
[Conventional Commits](https://www.conventionalcommits.org) since the last release, picks the next
version (`fix:` → patch, `feat:` → minor, `feat!:`/`BREAKING CHANGE` → major), bumps the changelog
and versions, tags it, then builds and publishes the Windows release the in-app updater consumes.
Just write conventional-commit messages and merge to `main`. Full flow and caveats: [`RELEASING.md`](RELEASING.md).

## Status

The desktop app is a **React + TypeScript** application (Vite-built, NW.js-hosted), architected
into typed `components/` (with shadcn-style `ui/` primitives), `store/`, `data/`, `utils/`, and
`types/`. Productionization follow-ups (native `nw.Shell` wiring, a filesystem + Git data layer,
a Windows release build) are tracked in [`apps/desktop/README.md`](apps/desktop/README.md).
The marketing site is a complete static landing page built on the shared brand tokens.
