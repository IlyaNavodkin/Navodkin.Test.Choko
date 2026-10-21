# Choko — Concept Mockup

Standalone React mockup of the Choko frontend in a neutral
Cursor / Claude / Zed-inspired style. Warm-gray surfaces, terracotta accent,
Inter + JetBrains Mono, light + dark themes.

**Not part of the pnpm workspace** — plain `npm` + Vite, zero connection to
`app/`. Real data from `apps/desktop/src/data/sample.ts` is inlined as static
mock data in `src/data.ts`.

## Run it

```bash
cd mockup
npm install --include=dev   # (--include=dev only needed if your npm has omit=dev)
npm run dev                 # http://localhost:5199/
```

> Global `omit=dev` in npm config will silently skip devDependencies
> (vite, typescript, @types/*) — that bit us once already.

## Screens (all interactive, in-app navigation + `?view=` deep links)

| URL | Screen |
| --- | ------ |
| `/` | Welcome — recent repositories, init card |
| `/?view=case` | Case editor — explorer tree, objective/systems/setup/steps/criteria, git footer |
| `/?view=suite` | Suite overview — hero stats, case table, settings |
| `/?view=runs` | Runs dashboard — stat tiles, activity heatmap, run cards |
| `/?view=run` | Run detail — result grid, needs-attention, sign-offs |
| `/?view=guide` | Guided execution — checklist, record-result, defect report |
| `/?view=source` | Source control — changes, sync, pull/commit/push |

Overlays via query flags: `&palette=1` (⌘K palette), `&commit=1`,
`&merge=1` (3-way resolver), `&newrun=1`. Theme: `&theme=dark`.
Pre-rendered PNGs of every screen live in `shots/`.

## Files

- `src/App.tsx` — the whole mockup (one file, ~870 lines, no router)
- `src/styles.css` — design tokens + all component styles, `[data-theme="dark"]` variant
- `src/data.ts` — mock cases / suites / runs / git state
- `src/icons.tsx` — inline SVG icon set
