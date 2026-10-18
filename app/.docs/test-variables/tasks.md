# Test Variables — Implementation Tasks

## Overview

Add template variables to test cases, starting with `{{today}}` and its date math
(`{{today+7}}`, `{{today-30}}`, `{{today+2w}}`, `{{today-1y}}`, escape via `{{{…}}}`). Tokens are
stored verbatim on disk and **resolve to an ISO date at run time** against a tester-chosen *test
date* (run-level default + per-case override). Resolution happens only in the guided runner, the
generated run summary, the defect report, and an opt-in editor preview; everywhere else shows raw
tokens. See [prd.md](prd.md) for the full spec.

The work flows foundation-first: a pure, unit-tested resolver (0100) and the test-date data model
(0200) underpin the store wiring (0300), which the runner (0400), summary/run-view (0500), and
editor (0600) consume; a docs/fixture/verification pass (0700) closes it out.

## Tasks

### [x] 0100 - Variable resolver core (pure utils + tests)

**Overview:** The keystone, depended on by every other task. A pure module that turns
`{{today…}}` tokens into ISO dates against a given date, handles triple-brace escapes, exposes a
lint scanner for malformed tokens, and ships with an exhaustive Vitest suite. No UI or store
coupling — just deterministic string→string + a small date-math helper with end-of-month clamping.

**Relevant Files:**

- `apps/desktop/src/utils/variables.ts` - New. `resolveVariables(text, testDate)`, `findVariableLint(text)`, and internal date-math/format helpers; the strict token grammar + `{{{…}}}` escape live here.
- `apps/desktop/src/utils/variables.test.ts` - New. Round-trips for ±days/weeks/months/years, bare-number-as-days, leap-year + end-of-month clamping, whitespace/case variants, multiple tokens, escapes, and every malformed example left literal (PRD §4.1, §9).

**Sub-Tasks:**

- [x] 0101 Define the strict token grammar as a single case-insensitive regex (`/\{\{\s*today\s*(?:([+-])\s*(\d+)\s*([dwmy])?)?\s*\}\}/gi`) plus a `parseToken` that returns `{sign, amount, unit}` or `null`.
- [x] 0102 Implement the date-math helper: parse `YYYY-MM-DD` (or a `Date`) into local y/m/d ints, apply a signed day/week/month/year offset with **end-of-month clamping**, and format back to ISO. Build dates from local ints only — no UTC parse round-trip.
- [x] 0103 Implement `resolveVariables(text, testDate)`: handle `{{{…}}}` escapes **first** (emit literal `{{…}}`, never resolve the inner token), then substitute every valid token; leave malformed tokens verbatim.
- [x] 0104 Implement `findVariableLint(text): LintWarning[]`: scan loose `{{…}}` sequences, skip escaped triples, and emit a warning for each that fails the strict grammar.
- [x] 0105 Write `variables.test.ts` covering: plain `{{today}}`; ±days/weeks/months/years; bare-number-as-days; leap-year + end-of-month clamping; whitespace/case variants; multiple tokens in one string; escapes; every malformed example left literal; and the lint warnings.

**Notes:**

- Build resolved dates from local year/month/day integers (no UTC round-trip) to avoid DST/timezone drift (PRD §7.1).
- Escapes are processed **before** token resolution so the inner `{{…}}` can never substitute; the lint must ignore escaped sequences.
- No dependency on any other task — start here.

---

### [x] 0200 - Test-date data model, schema & serialization

**Overview:** Thread a `testDate` through the on-disk + domain shapes so a run can carry a
default test date and any row can override it, persisted as `test_date` front matter and re-read on
load. Pure/serialization layer only — no store or UI behavior yet.

**Relevant Files:**

- `apps/desktop/src/types/index.ts` - Add `Run.testDate: string` (ISO) and `RunRow.testDate?: string | null` (override; absent = inherit).
- `apps/desktop/src/schemas/run.ts` - Add `test_date` to `RunDetailsFrontSchema` (optional ISO, default empty/created) and `RunCaseFrontSchema` (optional, nullable).
- `apps/desktop/src/services/format/run.ts` - Add `testDate` to `RunDetails` + `RunCaseFile`; `serializeRunDetails` always writes `test_date`; `serializeRunCase` writes it **only when** the override is set; both parsers read it back.
- `apps/desktop/src/services/format/run.test.ts` - Extend round-trip tests: run-details with `test_date`, a case sidecar with and without an override, and absent → inherit.
- `apps/desktop/src/services/repo.ts` - Map `test_date` from parsed sidecars into the loaded `Run`/`RunRow` on `loadWorkspace`.

**Sub-Tasks:**

- [x] 0201 Add `Run.testDate: string` and `RunRow.testDate?: string | null` to `types/index.ts`.
- [x] 0202 Add a tolerant `test_date` to `RunDetailsFrontSchema` (optional ISO string) and `RunCaseFrontSchema` (optional, nullable) in `schemas/run.ts`.
- [x] 0203 Add `testDate` to the `RunDetails` + `RunCaseFile` interfaces; make `serializeRunDetails` always emit `test_date:` and `serializeRunCase` emit it **only when** the override is set; have both parsers read it (absent on a case sidecar ⇒ `null` = inherit).
- [x] 0204 In `repo.ts` `loadWorkspace`, map the parsed `test_date` into `Run.testDate` (run-details) and `RunRow.testDate` (case sidecar, `null` when absent).
- [x] 0205 Extend `run.test.ts`: round-trip run-details with `test_date`, a case sidecar with an override and without one (no `test_date:` line emitted), and confirm absent → inherit.

**Notes:**

- Keep diffs minimal: an unset per-case override must not emit a `test_date:` line (PRD §4.4).
- Independent of 0100; can proceed in parallel, but 0300 depends on this.

---

### [x] 0300 - Store wiring for the test date

**Overview:** Make the store own the test date end-to-end: seed it on run creation/rerun, carry it
into the sidecar writers, and add actions to change the run-level date and per-case overrides
(debounced persistence, like the existing run actions). Adds the `effectiveTestDate(run, row)`
helper the consumers use.

**Relevant Files:**

- `apps/desktop/src/store/app-store.ts` - Seed `testDate` (= `created` date) in `createRun` + `rerunRun`; include it in `runDetailsOf` and `buildRunCaseFile`; declare + implement `setRunTestDate(runId, date)` and `setRowTestDate(runId, i, date | null)` on the store interface, with `patchRow`/`persistRunDetails`/`persistRunCase` plumbing.
- `apps/desktop/src/utils/run-items.ts` - Add the pure `effectiveTestDate(run, row)` helper (`row.testDate ?? run.testDate`).

**Sub-Tasks:**

- [x] 0301 Add the pure `effectiveTestDate(run, row)` helper to `run-items.ts` (`row.testDate ?? run.testDate`).
- [x] 0302 Seed `testDate` (= the `created` date) on the `Run` objects built in `createRun` and `rerunRun`.
- [x] 0303 Include `testDate` in `runDetailsOf`, and pass the per-case override through `buildRunCaseFile` → `serializeRunCase` (only emitted when set).
- [x] 0304 Implement `setRunTestDate(runId, date)`: update `run.testDate`, then `persistRunDetails` (regenerates the summary; non-overridden cases re-resolve live on render).
- [x] 0305 Implement `setRowTestDate(runId, i, date | null)`: `patchRow` the override, then `persistRunCase` (writes the sidecar) + `persistRunDetails` (summary depends on it).
- [x] 0306 Declare both new actions on the store interface in `app-store.ts` and wire them into the returned store object.

**Notes:**

- Reuse the existing debounce (`schedulePersist`) + `upsertChange` patterns; changing the run-level date re-resolves all non-overridden cases on next render (no stored expansion).
- The store interface (action signatures) lives in `app-store.ts`, not `types/index.ts`.
- Depends on 0200.

---

### [x] 0400 - Resolve in the guided runner + per-case date picker

**Overview:** The headline UX: in the runner, resolve the brief, systems, and every checklist item
against the case's effective test date, add a per-case date picker (default = run date, with a reset
affordance), and resolve the copy-out defect report — while leaving tester notes/fail-notes verbatim.

**Relevant Files:**

- `apps/desktop/src/components/guide/RunGuide.tsx` - Compute effective test date; resolve objective + systems; add the `<input type="date">` control in the header (calls `setRowTestDate`, with an "override" hint + reset to run date).
- `apps/desktop/src/components/guide/GuideChecklist.tsx` - Render resolved item text (resolve `item.text` before `renderInline`; keys unchanged).
- `apps/desktop/src/utils/run-items.ts` - `buildDefectText` resolves case-derived text (title/objective/steps/accept) against the effective date; `row.notes`/`failNotes` stay raw.
- `apps/desktop/src/utils/run-items.test.ts` - Cover defect text with tokens resolved and notes left literal.

**Sub-Tasks:**

- [x] 0401 In `RunGuide`, compute the row's `effectiveTestDate` and resolve the objective + systems-in-scope strings before rendering.
- [x] 0402 Resolve checklist item text against the effective date (map derived items through `resolveVariables` before passing to `GuideChecklist`, keeping positional keys unchanged).
- [x] 0403 Add the per-case date picker to the `RunGuide` header: defaults to the effective date, calls `setRowTestDate` on change, shows an "overridden" hint + a reset control that clears the override (`setRowTestDate(…, null)`).
- [x] 0404 Update `buildDefectText` to resolve case-derived text against the effective date while leaving `row.notes`/`failNotes` verbatim; add `run-items.test.ts` coverage (dates resolved, notes literal).

**Notes:**

- Resolution is "resolve-then-`renderInline`" — resolved dates are plain text (PRD §7.3).
- Depends on 0100 + 0300.

---

### [x] 0500 - Resolve the generated run summary + run-level date control

**Overview:** Make the generated summary report the **actual dates used** (so `_run.md ## Summary`
and the Run Details summary view show real dates, not tokens), and expose the run-level test-date
control on the run view that drives the default for non-overridden cases.

**Relevant Files:**

- `apps/desktop/src/utils/run-items.ts` - `buildRunSummary`/`rowFailures` resolve each row's case-derived text against its effective test date; tester notes stay verbatim.
- `apps/desktop/src/utils/run-items.test.ts` - Summary entries show resolved dates per row's effective date.
- `apps/desktop/src/components/runs/RunGrid.tsx` - Run-level date picker in the run/details header (calls `setRunTestDate`); ensure the summary panel renders resolved text.
- `apps/desktop/src/components/runs/RunsList.tsx` - Surface a run's test date if useful in the list context.

**Sub-Tasks:**

- [x] 0501 Update `rowFailures`/`buildRunSummary` to resolve each row's case-derived text (title, failed-item text) against that row's `effectiveTestDate`; leave tester notes verbatim.
- [x] 0502 Confirm `serializeRunSummary` (via `runDetailsOf` → `_run.md`) now emits resolved dates, and the Run Details summary panel renders them; add `run-items.test.ts` coverage.
- [x] 0503 Add a run-level date picker to the `RunGrid` run/details panel that calls `setRunTestDate` and shows the current run test date.
- [x] 0504 (Optional) Surface the run's test date in `RunsList` — **skipped**: the run's test date defaults to the creation date already shown in the list, so surfacing it would duplicate/clutter the row.

**Notes:**

- The summary is regenerated into `_run.md` on every write, so resolved dates appearing there is intentional, not a violation of the "never expand source" rule (PRD §4.4–§4.5).
- Depends on 0100 + 0300.

---

### [x] 0600 - Case editor: variable lint + resolved preview

**Overview:** Author-side support: a lint warning banner for malformed `{{…}}` tokens across all
case text fields, and an opt-in "Resolve variables" preview (toggle + date picker) in a top header
row that shows resolved dates without mutating the stored case.

**Relevant Files:**

- `apps/desktop/src/components/editor/CaseEditor.tsx` - Add the top header row (preview toggle + date picker, default off / today); aggregate `findVariableLint` across objective/systems/setup/steps/acceptance into a warning banner (styled like the existing ID-conflict banner).
- `apps/desktop/src/components/editor/ObjectiveEditor.tsx` / `ListControl.tsx` / `SetupControl.tsx` / `StepsControl.tsx` - Thread an optional "resolve preview against date X" mode so rendered text shows resolved values when preview is on.
- `apps/desktop/src/utils/markdown.tsx` - If helpful, a small `renderInlineResolved(text, date)` convenience wrapping `resolveVariables` + `renderInline`.

**Sub-Tasks:**

- [x] 0601 Add a `renderInlineResolved(text, date)` convenience in `markdown.tsx` wrapping `resolveVariables` + `renderInline`.
- [x] 0602 Add a top header row to `CaseEditor`: a "Resolve variables" toggle + date picker (default **off**, date = today) held in editor-local state.
- [x] 0603 Show resolved values when preview is on — implemented as a dedicated read-only **Resolved preview** panel (objective/systems/setup/steps/acceptance) rather than threading a mode through each edit-in-place control, which is cleaner and non-mutating by construction. Raw tokens stay the stored source.
- [x] 0604 Aggregate `findVariableLint` across all case text fields (objective, systems, setup name+body, steps, acceptance) and render a warning banner listing malformed tokens, styled like the existing ID-conflict banner.
- [x] 0605 Verify escaped `{{{…}}}` are not flagged and the preview leaves the stored case untouched (panel is read-only; `findVariableLint` skips escapes — covered by `variables.test.ts`).

**Notes:**

- Preview is read-only and never writes resolved text back; raw tokens remain the stored source (PRD §4.2, §4.6).
- Lint is a warning, not an error — the case still saves. Escapes (`{{{…}}}`) are not flagged.
- Depends on 0100.

---

### [~] 0700 - Fixture, docs & end-to-end verification (code/docs done; live GUI walkthrough pending user)

**Overview:** Prove it works against a real repo and document it: add a fixture case that uses
`{{today}}` math, update user-facing copy, and run the full typecheck + test suite plus a manual
runner walkthrough.

**Relevant Files:**

- `apps/desktop/scripts/make-fixture.mts` - Seed at least one case containing date tokens (and an escaped example) so the runner/summary can be exercised on real data.
- `apps/desktop/src/components/editor/CaseEditor.tsx` - Update the footer hint ("inline formatting only") to mention `{{today}}` variables.
- `apps/web/src/pages/docs.astro` - Document the `{{today}}` syntax, date math, escaping, and the run test-date in the public docs.
- `.docs/test-variables/prd.md` - Resolve the two remaining open questions (clamping intuition, pathological braces) once verified.

**Sub-Tasks:**

- [x] 0701 Add fixture case `PAY-0120` (in `sample.ts`, materialized by `make-fixture.mts`) using `{{today}}`/`{{today+14}}` date math and an escaped `{{{today}}}` example; fixture regenerated and verified on disk (tokens stored verbatim).
- [x] 0702 Update the `CaseEditor` footer hint to mention `{{today}}` variable support.
- [x] 0703 Document the syntax, date-math units, escaping, and run test-date in `docs.astro`.
- [x] 0704 Run the repo typecheck and the full Vitest suite — both green (98 tests); resolved the two open PRD questions (clamping unit-tested, pathological braces pinned by test).
- [~] 0705 **Manual GUI walkthrough — pending user.** The automated/verifiable parts are done (typecheck, full suite, fixture regen, open questions resolved). The live `pnpm dev:desktop` walkthrough (set a future test date run-level + per-case, confirm resolved dates in runner/summary/defect, reopen for persistence) runs the NW.js GUI, which can't be driven headlessly in-session — left for the user to confirm.

**Notes:**

- Final gate: `npm run typecheck` (or the repo's typecheck) green, then the full Vitest suite, then a `pnpm dev:desktop` walkthrough against the fixture (set a future test date, confirm resolved dates in runner + summary + defect, reopen to confirm persistence).
- Depends on 0100–0600.

## Notes

- Unit tests live alongside the code (`variables.ts` ↔ `variables.test.ts`; resolution changes covered in `run.test.ts` / `run-items.test.ts`).
- Run tests with `npx vitest [optional/path]` from `apps/desktop` (no path = whole suite). Note Vitest runs under Node directly (node-only libs like `gray-matter` import normally in tests).
- Dependency order: **0100** and **0200** first (parallelizable) → **0300** → then **0400/0500/0600** (parallelizable) → **0700** last.
- Cross-cutting rule from the PRD: tokens are **never** written expanded into source files or per-case sidecars; the generated summary is the one derived artifact allowed to contain resolved dates.
