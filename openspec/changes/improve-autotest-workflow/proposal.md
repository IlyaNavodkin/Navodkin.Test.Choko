# Improve the autotest workflow

## Why
Testers author and run Playwright tests in their project, terminal, or VS Code.
The app should reflect that project structure and make association with manual
cases and reusable environment arguments straightforward.

## What changes
- Browse autotests by real folder and file paths.
- Select one Case directly for an autotest; several autotests can share a Case.
- Select typed argument values from an existing Reference book set.
- Keep a compact automation summary in a run and open a dedicated execution page
  with per-test results, exact individual selection, Run all, and Run failed.
- Preserve report import for external runs, execution history, and manual results.

## Impact
Desktop React UI, automation binding actions, selection helpers, and HTTP demo.
Existing stored bindings remain readable; selecting a Case explicitly replaces
that autotest's previous Case associations. No silent bulk migration.
