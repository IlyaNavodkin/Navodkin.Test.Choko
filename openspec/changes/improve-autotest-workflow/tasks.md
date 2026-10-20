- [x] 1. Add and test project tree, single-Case and argument-set planning helpers.
- [x] 2. Replace catalog/card UI with project navigation and direct selectors.
- [x] 3. Add run automation summary and dedicated execution page.
- [x] 4. Populate the HTTP demo with project folders, environments, and results.
- [x] 5. Verify typecheck, tests, build, and browser workflows.

Validation: TypeScript and production build pass. All 46 focused tests pass.
The full suite passed 596/597 tests before the last three focused status tests
were added. The existing Windows process-cancellation test still times out and
its temporary-directory cleanup reports EBUSY (also observed before this change).
Browser checks cover Case selection, linked Development/Staging values,
project hierarchy, the run summary → dedicated page transition, single-test
simulation without running its sibling, and latest-failed simulation.
Real project execution through the new UI was not exercised in this browser-only
mockup; native execution and report import still require the desktop runtime.
