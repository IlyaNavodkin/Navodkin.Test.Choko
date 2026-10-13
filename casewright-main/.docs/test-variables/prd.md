# PRD: Test Variables — the `{{today}}` date variable

## 1. Introduction / Overview

Manual test cases frequently contain dates ("place an order dated today", "verify the
30-day grace period ends on …"). Today those dates are hard-coded, so a case goes stale the
day after it's written and a tester has to mentally translate "2026-01-15" into "is that the
right relative date for my run?".

This feature adds **template variables** to test-case text. The first (and, for this release,
only) variable is **`{{today}}`**, which resolves to a real calendar date **when a case is run**.
It supports date math — `{{today+7}}`, `{{today-30}}`, `{{today+2w}}`, `{{today-1y}}` — so a case
can say "the link expires on `{{today+7}}`" and always show the correct date relative to the run.

Crucially, the date the variable resolves against is **not** necessarily the real wall-clock date.
Each run has a **test date** (defaulting to today) that the tester can change — per run, and per
individual case — so a tester can deliberately exercise "what happens on the 1st of next month?"
without changing the system clock.

**Goal:** let authors write date-relative test cases once and have them stay correct forever, while
giving testers explicit control over the effective date used during a run.

## 2. Goals

1. Authors can embed `{{today}}` and date-math tokens in any case text field; the raw token is what
   gets stored on disk (the source of truth never changes).
2. When a case is executed in the guided runner, every token resolves to an ISO date
   (`YYYY-MM-DD`) computed from the run's **test date**.
3. Testers can override the test date for the whole run (default) and for any single case.
4. The chosen test date(s) persist with the run so reopening it reproduces the same resolved dates;
   raw tokens are never written expanded into the run's files.
5. Authors get a non-destructive **preview** in the case editor to sanity-check how their tokens
   resolve against a date of their choosing, plus a **lint warning** for malformed tokens.
6. The token grammar and resolver are pure, deterministic, and unit-tested.

## 3. User Stories

- **As a test author**, I want to write "the reset link expires on `{{today+7}}`" so the case stays
  accurate no matter when it's run, instead of editing a literal date every time.
- **As a tester**, I want the runner to show me real dates (e.g. `2026-06-17`) instead of
  `{{today+7}}` so I can follow the steps without doing date math in my head.
- **As a tester verifying time-sensitive behavior**, I want to set the test date to a future date so
  I can confirm "the grace period has expired" flows without waiting or changing my machine's clock.
- **As a tester**, I want one case in a run to use a different test date than the others (e.g. a
  back-dated record) without affecting the rest of the run.
- **As an author**, I want to preview how my variables resolve and be warned if I typo a token
  (`{{todya}}`, `{{today+}}`) before I commit the case.

## 4. Functional Requirements

### 4.1 Token grammar

1. A token is delimited by `{{` and `}}` and contains the keyword `today`, optionally followed by an
   offset. The keyword and any unit letter are **case-insensitive**; surrounding whitespace inside
   the braces is allowed and ignored. Valid forms:
   - `{{today}}` — the test date itself.
   - `{{today+N}}` / `{{today-N}}` — N **days** before/after the test date (bare number = days).
   - `{{today+Nd}}` `{{today+Nw}}` `{{today+Nm}}` `{{today+Ny}}` — N **days / weeks / months / years**
     (and the `-` equivalents). `N` is a non-negative integer.
   - Whitespace is tolerated: `{{ today + 7 }}`, `{{TODAY+1D}}` are valid.
2. A single text value may contain multiple tokens; **every** valid token is replaced.
3. **Date math semantics** (computed against the effective test date, treated as a calendar date
   with no time component):
   - Days/weeks: simple day arithmetic (1 week = 7 days).
   - Months/years: calendar arithmetic with **end-of-month clamping**. For example, test date
     `2026-01-31` plus `1m` → `2026-02-28`, and `2024-02-29` minus `1y` → `2023-02-28`.
   - Results are always formatted as ISO `YYYY-MM-DD`.
4. **Malformed tokens are left literal.** Anything that doesn't match the grammar exactly
   (`{{today*2}}`, `{{tomorrow}}`, `{{today+}}`, `{{today+1.5}}`, `{{ today 7 }}`) is **not**
   substituted and renders verbatim. (See §4.6 for the editor lint.)
5. **Escaping with triple braces.** To show a literal `{{ … }}` that must **not** be resolved (e.g. a
   case that tests a templating system), wrap it in triple braces: `{{{today+7}}}` renders as the
   literal text `{{today+7}}`. The resolver strips exactly the outer pair of braces and never resolves
   the escaped content; escaped sequences are **not** flagged by the lint (§4.6). Escapes are handled
   **before** token resolution so the inner `{{…}}` can never be substituted.

### 4.2 Where tokens resolve (and where they don't)

1. Tokens resolve to dates **only** in:
   - the **guided runner** (`RunGuide`) — the brief/objective, systems-in-scope, every checklist
     item (setup / steps / acceptance criteria), and the generated **defect report**;
   - the **generated run summary** (§4.5); and
   - the **case editor preview** (an opt-in toggle, §4.6).
2. Tokens are shown **literally (raw)** everywhere else: the case editor's normal editing fields, the
   Run Grid case rows, the Run Details case list, CSV/exports, and the on-disk case files + per-case
   run sidecars.
3. Tokens are honored in all **case-authored** text — objective, systems, setup item name + body,
   steps, acceptance criteria. Tokens are **not** resolved in tester-entered text: the runner's
   **Notes** field and per-step **failure notes** are passed through verbatim, even in the defect
   report and summary.

### 4.3 The test date

1. A **run** has a single **test date** (`Run.testDate`), an ISO `YYYY-MM-DD` string, defaulting to
   the date the run was created.
2. A **run row** (one case in the run) may carry an optional **per-case override**
   (`RunRow.testDate`). When absent/null, the case inherits the run's test date. The **effective
   test date** for a case = `row.testDate ?? run.testDate`.
3. In the guided runner, a **date picker** (native `<input type="date">`) appears in the header for
   the current case. It shows the effective test date, defaults to the run's test date, and editing
   it sets the per-case override for that case only. A clear affordance lets the tester reset a case
   back to the run's date (clearing the override).
4. The run's test date is set to today when the run is created and is editable from the run view
   (Run Details / Run Grid header). Changing the run's test date updates the default for every case
   that does **not** have its own override.

### 4.4 Persistence (re-resolve live; never expand source on disk)

1. Raw tokens in **source** content are **never** written in expanded form. The case `.md` files keep
   their `{{today}}` source unchanged; per-case run sidecars store the case's raw line text in the
   existing `itemText` snapshot (tokens intact). (The generated `## Summary` is a derived report, not
   source — §4.5 — and may contain resolved dates by design.)
2. The run's test date is persisted in the run-details sidecar `_run.md` front matter as
   `test_date: YYYY-MM-DD`.
3. A per-case override is persisted in that case's run sidecar front matter as
   `test_date: YYYY-MM-DD`, **only when** the override is set (omitted otherwise, to keep diffs
   minimal). On load, an absent `test_date` means "inherit the run's date".
4. Reopening a run resolves tokens **live** against the persisted test date(s); the same run + same
   dates always produce the same resolved output.

### 4.5 Defect report & generated run summary

1. `buildDefectText` resolves tokens in the case-derived content (title, objective, step text,
   acceptance text) against the effective test date, so a pasted defect contains real dates — but
   leaves the tester's notes and failure descriptions (§4.2) verbatim.
2. The **generated run summary** (`buildRunSummary` → the `_run.md` `## Summary` section and the Run
   Details summary view) resolves tokens in case-derived text (titles, failed-item text) against each
   row's **effective test date**, so the summary reports the **actual dates used**, not raw tokens.
   Tester notes within the summary remain verbatim. Because the summary is regenerated from results,
   its on-disk `## Summary` will contain resolved dates — this is intentional and not a violation of
   §4.4.

### 4.6 Editor preview & lint

1. The case editor gains an opt-in **"Resolve variables"** preview toggle with its own date picker
   (defaulting to the real today), placed in a **top header row** of the editor. When on, rendered
   text shows resolved dates; when off (the default), text shows raw tokens. The preview never
   mutates the stored case.
2. The editor surfaces a **lint warning** for any `{{ … }}` sequence that does not match the token
   grammar (e.g. `{{todya}}`, `{{today+}}`), consistent with the app's existing tolerant-parse +
   `LintWarning` pattern. Triple-brace escapes (§4.1) are **not** flagged. A malformed token is a
   warning, not an error — the case still saves.

## 5. Non-Goals (Out of Scope)

- **Other variables.** Only `{{today}}` (with date math) ships now. No `{{now}}` (time-of-day),
  `{{user}}`, environment, or arbitrary user-defined variables.
- **Custom output formats per token.** All tokens render as ISO `YYYY-MM-DD`. No `{{today:MMM d}}`
  format strings in this release (noted as a possible follow-up).
- **Resolving tokens outside the runner/editor-preview** — Run Grid, Run Details, the generated
  summary, and CSV/exports keep raw tokens (per the scoping decision).
- **Resolving tokens in tester notes / failure notes.**
- **An escape syntax** for literal `{{ … }}` (e.g. content that legitimately needs double braces).
  If a real case ever needs literal braces it will just trip the lint warning; an escape is a
  possible follow-up (see Open Questions).
- **Time zones / times.** The test date is a plain calendar date; no time-of-day or TZ handling.

## 6. Design Considerations

- **Test-date control (runner):** a compact native date input in the `RunGuide` header
  (`apps/desktop/src/components/guide/RunGuide.tsx`), near the case counter. Show the effective date;
  when a per-case override differs from the run date, indicate it (e.g. a subtle "overridden" hint +
  a reset button). Keep it keyboard-friendly and unobtrusive.
- **Resolved dates** render as plain text inside the existing inline-formatting flow — they look like
  any other text, not a highlighted chip, so steps read naturally.
- **Editor preview:** a toggle button (with a small date picker) that flips the editor's rendered
  text between raw and resolved. Default **off** so authors see exactly what's stored. Malformed-token
  lint appears inline with the field, matching how other lint warnings surface.
- **Colorblind/accessibility:** no new color-only signals; the override hint and lint use a
  text/icon label alongside color, never color alone.

## 7. Technical Considerations

### 7.1 New resolver module (pure, unit-tested)

- New `apps/desktop/src/utils/variables.ts` with:
  - `resolveVariables(text: string, testDate: string | Date): string` — replaces every valid token.
  - `findVariableLint(text: string): LintWarning[]` (or similar) — scans for `{{ … }}` sequences and
    returns a warning for each that fails the strict grammar.
  - Internal date helpers (parse `YYYY-MM-DD` → y/m/d, apply day/week/month/year offset with
    end-of-month clamping, format back to ISO). **Build dates from local year/month/day integers** to
    avoid timezone/DST drift — do not round-trip through UTC parsing of the ISO string.
- Strict token regex (case-insensitive, global), capturing sign / amount / unit:
  `/\{\{\s*today\s*(?:([+-])\s*(\d+)\s*([dwmy])?)?\s*\}\}/gi`. The optional offset group means
  `{{today+}}` and `{{today*2}}` fall through unmatched and stay literal (verified by the grammar).
- `apps/desktop/src/utils/variables.test.ts` (Vitest) covering: plain `{{today}}`; +/− days, weeks,
  months, years; bare-number-as-days; end-of-month + leap-year clamping; whitespace and case
  variants; multiple tokens in one string; and every malformed example in §4.1.4 left literal.

### 7.2 Data model & schema

- `apps/desktop/src/types/index.ts`:
  - `Run` gains `testDate: string` (ISO `YYYY-MM-DD`).
  - `RunRow` gains `testDate?: string | null` (per-case override; null/absent = inherit).
  - Add a small helper `effectiveTestDate(run, row)` (in `utils/run-items.ts` or `variables.ts`).
- `apps/desktop/src/schemas`:
  - `RunDetailsFrontSchema` gains `test_date` (optional ISO string; default = `created` date / today).
  - `RunCaseFrontSchema` gains `test_date` (optional, nullable; absent ⇒ inherit).
- `apps/desktop/src/services/format/run.ts`:
  - `serializeRunDetails` writes `test_date:` in the `_run.md` front matter; `parseRunDetails` reads it.
  - `serializeRunCase` writes `test_date:` **only when** the override is set; `parseRunCase` reads it.

### 7.3 Resolution points

- `apps/desktop/src/utils/markdown.tsx` stays the inline renderer; resolution happens **before**
  `renderInline` (resolved dates are plain text). Provide a thin call pattern
  `renderInline(resolveVariables(text, date))` rather than baking dates into `renderInline` itself.
- `RunGuide.tsx` computes the effective test date for the current row and applies `resolveVariables`
  to the objective, systems, and the items handed to each `GuideChecklist` (resolve `item.text`
  before passing down, keeping the positional `key` unchanged).
- `apps/desktop/src/utils/run-items.ts` → `buildDefectText` resolves case-derived strings against the
  effective date while leaving `row.notes` / `failNotes` raw (§4.5).
- **Store** (`apps/desktop/src/store/app-store.ts`): `createRun` seeds `Run.testDate` = today;
  new actions `setRunTestDate(runId, date)` and `setRowTestDate(runId, rowIdx, date | null)` update
  state, persist via the run-format writers, and trigger the usual debounced write + `refreshStatus`.

### 7.4 Setup checklist now derives from the case's setup items

- `deriveItems` previously built the **Setup** checklist from `kase.systems`
  (`"Confirm <system> is available …"`), not the `SetupItem[]` model — so authored setup items (and
  any `{{today}}` in them) never reached the runner. This was fixed: the Setup checklist now derives
  from `kase.setup`, showing each item's `### name` as the checkbox label with its markdown **body**
  rendered beneath (resolved against the test date in the runner). `ChecklistItem` gained an optional
  `body` for this; the per-case run sidecar still stores the single-line name as the checklist text.

## 8. Success Metrics

- A case authored with `{{today+7}}` shows the correct ISO date in the runner for any chosen test
  date, with **zero** manual edits to the case between runs.
- Changing the run's (or a single case's) test date updates every resolved date accordingly, and the
  choice survives closing and reopening the run (re-resolved identically from disk).
- The resolver's unit-test suite passes, including all malformed-token and clamping cases.
- No raw `{{today}}` tokens ever appear expanded in on-disk case `.md` files or run sidecars.

## 9. Resolved Decisions & Open Questions

**Resolved during review:**

1. **Escape syntax** — supported via triple braces: `{{{today+7}}}` → literal `{{today+7}}` (§4.1.5).
2. **Generated run summary** — resolves to the **actual dates used**, not raw tokens (§4.5.2).
3. **Per-token format strings** (`{{today:MMM d, yyyy}}`) — **deferred / out of scope** for this
   release (§5); all output is ISO `YYYY-MM-DD`. Revisit if testers want human-readable dates.
4. **Editor preview placement** — the preview toggle + date picker live in a **top header row** of
   the case editor (§4.6.1).

**Resolved during implementation:**

1. **End-of-month clamping** — implemented and unit-tested: `2026-01-31` + `1m` → `2026-02-28`, and
   leap-year `2024-02-29` − `1y` → `2023-02-28`. Matches tester intuition.
2. **Nested / adjacent braces** — pinned by test: `{{{{today}}}}` → `{{{today}}}` (the inner triple
   escapes; the outer brace pair stays literal), and `{{ {{today}} }}` → `{{ 2026-06-10 }}` (the inner
   token resolves; the outer braces stay literal).

No open questions remain.
