# Tasks

Scope реализации согласован; этапы выполняются последовательно без повторного approval. Все checkbox ниже относятся к реализации и остаются открытыми до соответствующей проверки. Планирование не подтверждает native acceptance.

## 1. Contracts and real Playwright bridge

Проверенный baseline schemaVersion 1. Отметки этого этапа не подтверждают уточнение 2026-10-17: отдельные сущности/аргументы/справочник/экспорт artifacts реализуются в этапе 5 и контракте v2. Native-срез был прерван лимитом модели; его исходники существуют, проверки и задачи 2.x остаются незавершёнными.

- [x] 1.1 Создать `tools/playwright-automation` с browser-safe version 1 manifest/report/profile/binding contracts и declarations; проверить strict IDs/correlation/limits/status/expectedStatus/retry/flaky на fixtures, typecheck и отсутствие Node imports в frontend entry; документировать public schema.
- [x] 1.2 Реализовать общий pure parser Testoritto JSON, Playwright JSON и JUnit, explicit identity mapping и import preview model; проверить malformed/oversized/DTD/entities, duplicates/unmatched/foreign-run/idempotency fixtures; описать поддержанный JUnit properties dialect и отсутствие metadata у generic sources.
- [x] 1.3 Реализовать настоящий Playwright reporter и controlled bridge discover/run для установленного project's Playwright >=1.64.1; real Node fixture проверяет stable annotation IDs, exact project/variant selection до исполнения, missing/duplicate/stale IDs и отсутствие исполнения соседнего теста. Не использовать npx install или shell string; описать setup и supported version.
- [x] 1.4 Пройти реальные browser-free Playwright fixture runs pass/fail/expected-fail/skip/retry-flaky, error/config failure, logs и attachment; проверить final completeness, missing/corrupt report и ненулевой exit без assertions. Зафиксировать команды, runtime/version и результаты в automation evidence, не выдавая fixture за desktop runtime.

## 2. Native execution and persistence

- [ ] 2.1 Добавить Rust serde DTO/validation и profile/trust app-data store, связанный с canonical root/config/profile/runtime identities; temp-repo tests проверяют untrusted discovery, invalid session/window/payload, path/symlink escape, stale grant и no-write open; описать trust setup и границу исполнения кода без sandbox.
- [ ] 2.2 Реализовать внешний Node runner с фиксированными args/cwd, проверкой installed Playwright, bounded pipes/timeouts и process-tree containment на основе Git runner; integration tests на доступной ОС доказывают kill descendants, spawn/assignment failure и отсутствие shell injection. Вторую ОС не объявлять проверенной; зафиксировать ограничения containment/crash.
- [ ] 2.3 Реализовать start/poll/cancel и session ownership с одним active execution, cursor/page limits и cancel вне write queue; проверить busy/stale execution, timeout/manual cancellation, закрытие session, штатный exit/reopen и аварийный retained running state; cancel не должен зависеть от зависшего worker/poll.
- [ ] 2.4 Добавить explicit custom-command permissions/capabilities и строгий frontend invoke facade; command tests проверяют caller/session/protocol, typed errors, bounded responses и отсутствие secrets/absolute artifact authority в WebView; выполнить Rust fmt/clippy/test и TS typecheck.
- [ ] 2.5 Сохранять manifests/reports/bindings в namespaced `.testoritto/automation`, blobs в app-data; integration tests проверяют atomic publication, FIFO/flush с save/commit/close, stale revision, failed disk write, unknown Casewright byte hashes и отсутствие automatic staging. Документировать storage ownership/retention и unavailable artifacts на другом клоне.
- [ ] 2.6 Реализовать native import preview/apply с source hash и target revisions, independent Rust contract validation и explicit summary apply; temp-repo integration tests проверяют duplicate import no-op, foreign/missing metadata, changed source, summary conflict и сохранение manual checks/notes/snapshot/unknown bytes; описать supported import semantics.

## 3. Product and preview workflows

- [ ] 3.1 Подключить profiles/trust setup и stable case binding в product useCases с typed RU i18n/@codaa/ui и fixture adapter UX preview; Vitest и browser QA проверяют empty/untrusted/unsupported/dirty/stale/failed-save и отсутствие автоматического discovery при open.
- [ ] 3.2 Добавить mixed run selection, exact variants/dependencies preview, start/poll/Stop и rerun failed с новой execution history; browser QA проверяет только выбранные keys, running/cancelling/runner_error/interrupted, сохранённый manual guide и повторные attempts; product adapter вызывает реальный typed IPC, demo adapter явно изолирован.
- [ ] 3.3 Добавить attempts/expected-fail/flaky/log/error/attachment views и JSON/JUnit import preview с explicit mapping/apply/summary review; Vitest/browser QA проверяют truncation/passive HTML/path denial, duplicate/unmatched/foreign-run, revision conflict и idempotent UI outcome.
- [ ] 3.4 Выполнить frontend typecheck/tests/build, `pnpm check:ui`, browser regression product+UX preview и `pnpm spec:validate`; обновить automation evidence и инструкции приёмки с реальными командами, screenshots и явным отделением browser fixture от native результата.

## 4. Native acceptance

- [ ] 4.1 На Windows x64 собрать release с JS resources без bundled Node/test-only WebDriver plugins, проверить установку и native open → trust → discover → mixed selection → run → attempts → cancel descendants → close/reopen → import/apply; зафиксировать OS/Node/Playwright/build и evidence отдельно от компиляции. Задача остаётся unchecked до реального выполнения всех проверок.
- [ ] 4.2 На macOS arm64 отдельно выполнить build/install/native workflow и process-group timeout/Stop/session close/exit checks; подтвердить WKWebView UI и resource packaging, зафиксировать evidence/подпись/notarization gaps. Отсутствие macOS runner оставляет задачу unchecked.
- [ ] 4.3 Сверить реализацию с каждым scenario capability, выполнить итоговый review API/security/data-preservation и регрессии existing manual/Git workflow; зафиксировать выполненные и оставшиеся проверки, не объявлять change завершённым при открытой приёмке.

## 5. Autotest catalog, arguments and generated reports

Уточнение пользователя 2026-10-17; выполнять до завершения product UI и native acceptance, с повторной проверкой затронутых задач 2/3. Сначала восстановить зелёный checkpoint прерванного native-среза, не объявляя его готовым.

- [ ] 5.1 Добавить Autotest/CaseAutotestBinding/Invocation schemas и CRUD/archive: many bindings per case, reusable Autotest, разные значения у разных binding IDs; v2 manifest/report и v1 import compatibility. Проверить rename/archive/revision/duplicate/nonmutation и TS/Rust parity.
- [ ] 5.2 Добавить typed argumentDefinitions/defaults/overrides и context helper Node; проверить required/type/enum/range/url/ip/limits, false/0/empty, unknown argument rejection, отсутствие shell interpolation и отдельные invocations одного теста с разными inputs в реальном fixture.
- [ ] 5.3 Добавить «Окружение» в glossary по связанному change, explicit entryId/key references и precedence/resolution; проверить unavailable/archive/type mismatch/stale preview и immutable resolved snapshots без секретов.
- [ ] 5.4 Реализовать каталог «Автотесты», карточку/несколько привязок в кейсе, форму аргументов/окружения перед запуском, результаты по invocation; browser QA на 760/1440, dirty/save/cancel/error и новый контракт native facade.
- [ ] 5.5 Добавить generated report registry/view и «Сохранить в папку прогона»: canonical destination, безопасные файлы/manifest, size/hash/availability, atomic publication/idempotency; temp-repo tests доказывают неизменность Casewright bytes/Git index и игнорирование namespaced output каталогом. Проверить native/backend и browser download/view отдельно.

## Workflow follow-up

- 2026-10-17: реализован браузерный UX-срез «Автотесты» в `src/ux-preview` на настоящей доменной логике v2 (`tools/playwright-automation`): каталог/аргументы/привязки/окружения из справочника, разрешение значений с приоритетами и `STALE`, смешанный прогон с имитацией исполнения, v1 report.json/junit.xml, публикация в `.testoritto/automation/`, импорт JSON/JUnit, доверие и демо-состояния. Проверено typecheck, 210/210 Vitest и headless Chromium (22 шага, 0 ошибок консоли); evidence: `apps/desktop/evidence/automation-ux-preview.md`. Это **не** закрывает задачи 2.x/3.x/5.x: Rust v2 commands, product IPC/useCases, реальный Node runner, native import/apply и приёмка остаются открытыми.
- Native acceptance и успешный browser QA — разные свидетельства; не переносить отметки одного в другое.
- Архивация допустима только после фактической проверки согласованных задач. CI orchestration, sandbox/container и code editor остаются отдельным будущим scope.
