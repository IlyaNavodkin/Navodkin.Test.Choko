# Workflow decisions

The project owns code. Refresh project explicitly discovers its current tests;
Import report reads results from terminal/VS Code runs. Neither action implies an
editor extension or an always-running external report watcher.

The catalog is a folder → file → test browser. Search retains parent context.
Each test has one Case selector (ID plus title), independent of the editor's
current selection. Existing multi-Case associations are shown as a legacy state
until the user explicitly selects a replacement.

Arguments come from a Reference book set after a Case is selected. Store pointers
to its typed values, not copies of environment values. Existing declared input
types are respected; undeclared inputs can be derived from the chosen set.
Rebinding a Case preserves its argument configuration. Saved executions keep
their argument snapshots and cannot change when a live set changes.

Runs → run → Autotests opens a separate page. Only tests associated with that
run's cases are included. Latest results are matched by test identity and project;
untested leaves show Not run. Failed actions consider the latest result, not any
historical failure. Manual results remain separate. Exact individual launches use
binding IDs so sibling projects are not inadvertently launched.

HTTP mockup controls use explicit demo data and label simulated executions. Native
execution and report import remain desktop operations.

Validation: `pnpm exec tsc --noEmit`, focused `pnpm exec vitest run <files>`,
`pnpm test`, `pnpm build` in `app/apps/desktop`, followed by browser interaction.
