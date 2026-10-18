# Tailwind v4 + shadcn/ui Re-platform — Implementation Tasks

## Overview

Re-platform the Casewright **desktop** app's UI from bespoke token-based CSS (`src/styles/base.css`
+ `components.css`, ~600 lines) and the hand-rolled `src/components/ui/*` to **Tailwind CSS v4 +
shadcn/ui** (Radix-based components), per PRD §9. The existing visual design — warm-neutral
surfaces, a single slate accent, the status palette, IBM Plex / Newsreader type, and the merge-view
showpiece — must be **preserved exactly**. The shared `@casewright/brand` tokens remain the source
of truth (bridged into Tailwind's `@theme`), and the `@/components/ui` barrel keeps the same export
surface so the ~15 consumers don't churn.

This workstream is **independent of and recommended before Workstream B** (real data + git): it's a
purely visual/structural pass with no data-logic change, and it can be verified against the existing
in-memory sample data in a plain browser (the merge resolver still renders because `sample.conflict`
is present until Workstream B removes it).

> Source of truth: `.docs/prd.md` (§8 design direction, §9 architecture) and the approved plan at
> `~/.claude/plans/the-current-desktop-app-calm-jellyfish.md` (Workstream A).

## Tasks

### [x] 0100 - Tailwind v4 setup + brand-token bridge

**Overview:** Install Tailwind v4 (CSS-first, no `tailwind.config.js`/PostCSS) via the Vite plugin,
and bridge the existing `@casewright/brand` oklch design tokens into Tailwind's `@theme` so utility
classes (e.g. `bg-panel`, `text-ink`, `border-border`) are backed by the brand variables rather than
duplicating them.

**Relevant Files:**
- `apps/desktop/package.json` - Add `tailwindcss` + `@tailwindcss/vite`.
- `apps/desktop/vite.config.ts` - Register the `tailwindcss()` plugin.
- `apps/desktop/src/styles/app.css` - New entry stylesheet: fonts → `@import "tailwindcss"` → `@theme inline` token bridge.
- `apps/desktop/src/main.tsx` - Import `app.css`.
- `packages/brand/tokens.css` - Canonical oklch `:root` vars (read-only reference; stays the source of truth, shared with the web app).

**Sub-Tasks:**
- [x] 0101 Install `tailwindcss` and `@tailwindcss/vite` (latest v4) in `apps/desktop`.
- [x] 0102 Add the `tailwindcss()` plugin to `vite.config.ts` (alongside `@vitejs/plugin-react`).
- [x] 0103 Create `src/styles/app.css` with strict order: Google Fonts `@import url(...)` **first**, then `@import "tailwindcss";`, then the brand tokens import.
- [x] 0104 Add a `@theme inline { ... }` block mapping brand vars → Tailwind tokens: surfaces (`--color-bg`, `--color-panel`, `--color-panel-2`, `--color-raise`, `--color-sunken`, `--color-border`, `--color-border-2`), ink scale, accent set, status palette (`pass/fail/blocked/skipped/notrun` + `-soft`), diff (`add/del`), fonts (`--font-ui/-mono/-read`), radii (`--radius-sm/-/-lg`).
- [x] 0105 Import `app.css` in `main.tsx`; keep `base.css`/`components.css` imported for now (removed incrementally as components convert in 0300–0600).
- [x] 0106 Run `pnpm dev:desktop` / build; confirm a sample Tailwind utility (e.g. `bg-panel`) resolves to the brand color.

**Notes:**
- Tailwind v4 needs no `tailwind.config.js` or PostCSS. The Google Fonts `@import` MUST precede `@import "tailwindcss"` or it's ignored.
- `@theme inline` keeps `@casewright/brand` as the single token source (also consumed by the marketing site, which is untouched).

---

### [x] 0200 - Initialize shadcn/ui + rebuild `components/ui`

**Overview:** Initialize shadcn/ui (Tailwind v4 / React 19 path), add the base Radix components, and
re-implement the `@/components/ui` barrel over shadcn while **keeping the exact same export surface**
so existing consumers compile unchanged.

**Relevant Files:**
- `apps/desktop/components.json` - shadcn config (created by init).
- `apps/desktop/src/lib/utils.ts` - `cn()` (clsx + tailwind-merge).
- `apps/desktop/src/components/ui/*` - Regenerated over shadcn (button, input, textarea, select, dialog, dropdown-menu, badge, tooltip, etc.) + `index.ts` barrel.
- `apps/desktop/tsconfig.json` - Confirm the `@/*` path alias resolves for shadcn.

**Sub-Tasks:**
- [x] 0201 Create shadcn config manually (`components.json` + `src/lib/utils.ts` `cn()`) — the interactive `shadcn init` CLI can't run non-interactively/offline here. `@/` alias resolves via `tsconfig.json` paths (no `baseUrl`).
- [x] 0202 Install the shadcn foundation (`class-variance-authority`, `clsx`, `tailwind-merge`) + Radix primitives actually used (`@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu` for 0300, `@radix-ui/react-slot`). Scoped out unused `tooltip`/`scroll-area`; kept native `<select>` for parity.
- [x] 0203 Re-implement the `@/components/ui` barrel over shadcn/CVA, preserving export names + prop API: `Button` (CVA variants `default/primary/ghost/danger` + `sm`/`icon`), `Input`/`Textarea`/`Select` (shared `controlBase`), `Field`, `Kbd`.
- [x] 0204 Re-implement `Tag`, `StatusPill`, `ResultSwatch` as Tailwind utility wrappers with status/result variants — kept the glyph+color pairing (colorblind safety, PRD §8).
- [x] 0205 Re-implement `Modal`/`ModalHeader`/`ModalBody`/`ModalFooter` over Radix `Dialog` (Portal-less so it stays under the z-50 titlebar), preserving the `CommitModal`/`CreateRunModal` API. Added `@keyframes fade/pop` to `app.css`.
- [x] 0206 `typecheck` + `build` green; Playwright-verified launcher, workbench, and the Commit modal (Radix Dialog) render with full parity + titlebar-above-scrim behavior.

**Notes:**
- Keeping barrel export names identical avoids touching the ~15 consumers. CVA used for Button.
- Implemented shadcn-equivalent component source by hand (overwriting `src/components/ui/*`) rather than via the CLI, which needs interactivity + network.

---

### [x] 0300 - Convert chrome + launcher to Tailwind

**Overview:** Convert the window chrome (custom titlebar, top bar, toasts) and the launcher screen to
Tailwind utilities + shadcn, and replace the hand-rolled positioned context menu with Radix
`dropdown-menu`.

**Relevant Files:**
- `apps/desktop/src/components/chrome/TitleBar.tsx` - Frameless titlebar (menu bar + window controls).
- `apps/desktop/src/components/chrome/TopBar.tsx` - Workspace switcher, branch chip, git buttons.
- `apps/desktop/src/components/chrome/Toasts.tsx` - Toast stack.
- `apps/desktop/src/components/launcher/Launcher.tsx` - Recents + open actions.
- `apps/desktop/src/components/sidebar/ContextMenu.tsx` - Hand-rolled menu, to be replaced by Radix.

**Sub-Tasks:**
- [x] 0301 Convert `TitleBar` to Tailwind; rebuilt the File/View/Go/Help menu bar with Radix `dropdown-menu` (via new `ui/dropdown-menu.tsx` + `Menu` helper); kept window controls + brand glyph + drag regions.
- [x] 0302 Convert `TopBar` (workspace switcher now a Radix `DropdownMenu`, branch chip with ahead/behind, Pull/Commit/Push buttons) to Tailwind/shadcn.
- [x] 0303 Convert `Toasts`.
- [x] 0304 Convert `Launcher` (hero, feature list, recents list, action buttons).
- [x] 0305 New `ui/dropdown-menu.tsx` (Radix wrapper + shared `MenuItem` type) wired into the TitleBar menus. **Sidebar's** `ContextMenu` (right-click + hover `+` menus) is deferred to 0500 where the Sidebar is fully converted; old `ContextMenu.tsx` now re-exports `MenuItem` from the new module.
- [x] 0306 Deleted the chrome/launcher/topbar/toast rules from `base.css` + `components.css`. The `.ctx-*` context-menu rules remain until 0500 (still used by the Sidebar's old `ContextMenu`).

**Notes:**
- NW.js drag regions preserved via Tailwind arbitrary properties (`[-webkit-app-region:drag]` / `[-webkit-app-region:no-drag]`).
- Verified via Playwright: launcher, titlebar File menu, and the workspace switcher all render with parity.

---

### [x] 0400 - Convert editor + runs + guide to Tailwind

**Overview:** Convert the case editor (and its structured-section controls), the runs views, and the
guided runner to Tailwind, preserving all interaction behavior (drag-reorder, indent/outdent,
result picker, checklists).

**Relevant Files:**
- `apps/desktop/src/components/editor/*` - `CaseEditor`, `ObjectiveEditor`, `ListControl`, `StepsControl`, `TagEditor`, `FmtBar`.
- `apps/desktop/src/components/runs/*` - `RunsList`, `RunGrid`, `CreateRunModal`, `NotesCell`.
- `apps/desktop/src/components/guide/*` - `RunGuide`, `GuideChecklist`, `GuideCheck`.

**Sub-Tasks:**
- [x] 0401 Convert `CaseEditor` (head/title, meta row incl. ID-conflict bar, footer, section layout).
- [x] 0402 Convert `ObjectiveEditor`, `FmtBar`, `ListControl`, `StepsControl`, `TagEditor` — classNames only; drag/reorder/indent JS intact (group-hover for grip/actions reveal; before-pseudo drop line).
- [x] 0403 Convert `RunsList` (run cards + segmented result bars).
- [x] 0404 Convert `RunGrid` (table via `[&>th]/[&>td]` group utilities, result-picker popover, inline cells) + `NotesCell` (idle render vs textarea).
- [x] 0405 Convert `CreateRunModal` (scope options; radio dot now a conditional child span).
- [x] 0406 Convert `RunGuide` + `GuideChecklist` + `GuideCheck` (checklists, progress bars, the gated recorder).
- [x] 0407 Deleted the editor / runs / guide rules from `components.css` (kept shared `.center`/`.empty-center` for EmptyCenter and `.drop-line` for the Sidebar tree, both pending their own conversion).

**Notes:**
- Result/status colors come from the `@theme` token mapping (0104). Verified via Playwright: editor, runs list, run grid, guide, and create-run modal all render with full parity.

---

### [x] 0500 - Convert the sidebar (tree, DnD, filters)

**Overview:** Convert the sidebar — nav tabs, search, filter chips, and the suite/case tree with its
absolutely-positioned drop-line overlay and hover row-actions — to Tailwind, keeping the drag-and-drop
behavior byte-identical.

**Relevant Files:**
- `apps/desktop/src/components/sidebar/Sidebar.tsx` - The whole tree + filters + DnD.

**Sub-Tasks:**
- [x] 0501 Convert nav tabs (Cases/Runs), search box (Input + absolute icon), and status/tag filter chips.
- [x] 0502 Convert tree rows (case + suite), modified dot, monospace displayId, hover row actions (`group-hover`), selection accent bar (`before:`).
- [x] 0503 Convert the `relative` tree wrapper + the absolute drop-line overlay; `offsetTop` logic preserved (rows still offset from the `relative` tree-inner; wrapper kept static).
- [x] 0504 Replaced the hand-rolled `ContextMenu.tsx` with Radix `ContextMenu` (new `ui/context-menu.tsx` `RowContextMenu`, trigger `asChild` so the row DOM/offsets are unchanged); kept `.tree-section-h` as a JS hook class for the tail-drop guard. Context menu Playwright-verified; DnD logic byte-identical.
- [x] 0505 Deleted the sidebar + `.ctx-*` + `.drop-line` rules from `components.css`; deleted `sidebar/ContextMenu.tsx`.

**Notes:**
- Only classNames changed — the flatten/`maxDepthAt`/`resolveDrop` DnD logic and overlay-positioning are exactly as-is.

---

### [x] 0600 - Convert the merge resolver (showpiece) + delete legacy CSS

**Overview:** Convert the structured 3-way merge resolver — the product's showpiece — to Tailwind,
then remove the now-empty legacy stylesheets. Done last so the resolver renders fully against
`sample.conflict` for visual parity before Workstream B touches the data.

**Relevant Files:**
- `apps/desktop/src/components/merge/*` - `MergeResolver`, `FileDetail`, `ConflictElement`, `AutoElement`, `CsvRowConflict`, `diffs` (`ProseDiff`/`ListDiff`/`StepsDiff`/`MergedPreview`).
- `apps/desktop/src/styles/base.css`, `apps/desktop/src/styles/components.css` - To be deleted at the end.

**Sub-Tasks:**
- [x] 0601 Convert `MergeResolver` shell (now built on the Radix `Modal`; head, progress bar, conflicted-files list, footer; `dismissable={false}` to match the non-closable backdrop).
- [x] 0602 Convert `FileDetail` + `AutoElement` (auto-merged green chips + reasons); shared element class strings in `merge/styles.ts`.
- [x] 0603 Convert `ConflictElement` (ours/theirs sides, take buttons, base reference, edit textarea, merged preview).
- [x] 0604 Convert `CsvRowConflict` + `diffs` — add/del highlight colors from the diff tokens.
- [x] 0605 Also converted the remaining stragglers so the stylesheets could go: `EmptyCenter`, `CommitModal`, `App.tsx` shell (`.app/.shell/.workspace`), `utils/markdown.tsx` (`.md-code/.md-link`), and added explicit heading weights (Tailwind preflight zeroes them). Deleted `styles/base.css` + `styles/components.css`; `main.tsx` imports only `app.css`. Grep-verified no bespoke class references remain.

**Notes:**
- Verified via Playwright: merge resolver + Commit modal render with parity; whole app intact after CSS deletion (body/scrollbars now from `app.css @layer base`).

---

### [x] 0700 - Verify visual parity

**Overview:** Confirm the re-platformed UI matches the prior design and the build is clean.

**Relevant Files:**
- (verification only) `apps/desktop/dist/` via `vite preview`.

**Sub-Tasks:**
- [x] 0701 Drove the built app with Playwright across every screen: launcher → workbench → File/Go menus + workspace switcher → editor → runs list → run grid → guide → create-run modal → sidebar tree + right-click context menu → Pull → merge resolver → commit modal.
- [x] 0702 Screenshotted each screen and confirmed parity against the design while converting; fixed the preflight heading-weight regressions found along the way.
- [x] 0703 `typecheck` + full turbo `build` (web + desktop) + `lint` all green.

**Notes:**
- The browser smoke test is still valid for Workstream A (no Node required). It will NOT work for Workstream B's data/git flows.

## Notes

- Do tasks in order; 0100–0200 are prerequisites, 0300–0600 convert area-by-area (delete CSS as you go), 0600 last (merge view), 0700 verifies.
- No unit tests in this workstream (pure visual); verification is screenshot parity.
- Run the app for verification with `pnpm dev:desktop` (NW.js) or `vite preview` + Playwright (browser).
- Workstream B (`.docs/real-data-git-backend/tasks.md`) should follow this one.
