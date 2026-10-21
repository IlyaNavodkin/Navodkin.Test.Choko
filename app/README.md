# Choko

A git-backed desktop application for writing and running test cases —
_a bespoke editor for manual test cases; markdown on disk, Git as the data store._

This is a [Turborepo](https://turbo.build/repo) monorepo (pnpm workspaces).

## Workspace

```
choko/
├── apps/
│   ├── desktop/        # the Choko app — NW.js + React + TypeScript (Vite)
│   └── web/            # the marketing site — Astro static site, deployed to GitHub Pages
├── packages/
│   └── brand/          # @choko/brand — shared design tokens (palette, type, status colors)
├── turbo.json          # task pipeline
└── pnpm-workspace.yaml
```

| Package                | What it is                                                  |
| ---------------------- | ----------------------------------------------------------- |
| `@choko/desktop`  | NW.js desktop app. See [`apps/desktop/README.md`](apps/desktop/README.md). |
| `@choko/web`      | Astro marketing site → GitHub Pages.                        |
| `@choko/brand`    | Design tokens shared by both apps.                          |

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
> graph: `pnpm install --filter @choko/web...`.

## Common scripts (root)

| Command            | Does                                              |
| ------------------ | ------------------------------------------------- |
| `pnpm dev`         | `turbo run dev` across all apps                   |
| `pnpm build`       | `turbo run build` (currently builds the web site) |
| `pnpm build:web`   | build just the marketing site to `apps/web/dist`  |
| `pnpm lint`        | `turbo run lint` (Astro type-check on the site)   |
| `pnpm clean`       | `turbo run clean`                                 |

## Deploying the marketing site

The site builds to `apps/web/dist` with `pnpm build:web`. To publish it on GitHub
Pages, configure **Settings → Pages → Build and deployment → Source: _GitHub
Actions_** and add a Pages workflow that builds this directory. The Astro config
already reads `SITE_URL` and `BASE_PATH` from the environment, so the same build
works for project and user/org Pages sites. Commit `pnpm-lock.yaml` so the frozen
install resolves in CI.

## Building and releasing the desktop app

Official builds run through
[`.github/workflows/build-desktop.yml`](../.github/workflows/build-desktop.yml).

- **Manual build:** Actions → **Build desktop binaries** → **Run workflow**. No tag
  is required; the run uploads Windows and macOS artifacts.
- **Release build:** bump both `package.json` and `apps/desktop/package.json`,
  commit and push `main`, then create and push a `v*` tag. The workflow verifies
  that the tag matches both versions and attaches the binaries to a GitHub Release.

Windows builds include a portable ZIP and an Inno Setup installer. macOS builds are
arm64-only and ad-hoc signed. Full version rules, free-tier limits, and signing
notes are in [`RELEASING.md`](RELEASING.md).

## Status

The desktop app is a **React + TypeScript** application (Vite-built, NW.js-hosted), architected
into typed `components/` (with shadcn-style `ui/` primitives), `store/`, `data/`, `utils/`, and
`types/`. Productionization follow-ups (native `nw.Shell` wiring, a filesystem + Git data layer,
cross-platform release builds) are tracked in [`apps/desktop/README.md`](apps/desktop/README.md).
The marketing site is a complete static landing page built on the shared brand tokens.
