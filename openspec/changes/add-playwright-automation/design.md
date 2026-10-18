# Design

## Context

Мотивация и согласованный scope — proposal.md. Изучены `apps/desktop/src-tauri/src/services/repository.rs` (RepoSession, opaque resources), `repository_commands.rs` (caller/session validation, FIFO admission), `services/repository/create_run.rs` (stable ID, immutable `.source`, revision checks), `edit_run.rs` (RunCaseEdit и preservation tests), `services/repository/git_network.rs` (Windows Job Object / Unix process_group), `src/repository/api/{contracts,repositoryApi}.ts` (strict Zod, pending mutation barriers). Текущий RunResult — not_run/in_progress/pass/fail/blocked/skipped; он не кодирует flaky/runner_error/attempt history.

Изолированный `src/ux-preview/useCases/explore-design/{types,usePreviewRuns,fixtures}.ts` использует DemoRun и local state, не product IPC; его успешный demo-flow не подтверждает native исполнение. Existing MVP test-runs spec требует совместимости Markdown и сохранения unknown metadata. Конфликт с прежним «automated execution вне MVP» разрешён новым пользовательским решением: этот change добавляет отдельный согласованный объём, не объявляя оставшийся MVP завершённым. Уточнение прежнего правила «Node только tooling»: разрешён внешний Node для явно доверенных пользовательских автотестов; Node внутри WebView/distribution/sidecar по-прежнему отсутствует.

## Goals / Non-Goals

**Goals:** единый проверяемый result contract для reporter/import/frontend/native; точный отбор, bounded lifecycle и non-destructive смешанные прогоны.

**Non-Goals:** sandbox локального пользовательского кода, автоматическая установка зависимостей, CI scheduler, управление test source и произвольный shell API. Execution service — отдельная от Git операция, не повод расширять Git trust policy.

## Decisions

### Runtime and package boundary

Новый pnpm workspace `tools/playwright-automation` содержит browser-safe contracts/parser, Node-only reporter и bridge CLI (`.mjs` + declarations). Node imports не попадают во frontend bundle. Tauri включает reporter/bridge как readonly ресурсы, запускает выбранный внешний Node и установленный проектом Playwright >=1.64.1; первая проверенная fixture-версия — 1.64.1. Package resolution от canonical profile cwd проверяет установленный package/cli, не запускает package manager и не использует npx. Bundled Node/sidecar отклонён из-за второго runtime в distribution; shell command field отклонён из-за непроверяемого исполнения.

Bridge принимает только фиксированную операцию discover/run и путь к созданному приложением manifest; subprocess вызывается args array с фиксированным cwd. Резолв CLI проекта выполняется в Node, canonical пути повторно проверяет Rust до разрешённого запуска. Execution config, imports, globalSetup/teardown и webServer могут выполнять код с правами пользователя. Это объясняется в profile trust setup, без постоянных warning banners в остальных flow.

### Identity and exact selection

Уточнение пользователя 2026-10-17: вместо прямой связи v1 вводится отдельная сущность `Autotest`: immutable UUID, title, description, archived, revision, profileId, selector `{automationId, project, variantId}`, argumentDefinitions и defaults. Добавление — вручную или явным выбором из discovery; открытие каталога ничего не запускает. `CaseAutotestBinding` имеет собственный UUID, caseId, autotestId, enabled и argumentOverrides. У кейса несколько привязок; один автотест переиспользуется в разных кейсах. Разные наборы аргументов различаются binding ID, одинаковые дубликаты диагностируются.

Физический selector не зависит от caseId: `testoritto.automationId`, project и variantId определяют тест. Legacy caseId annotation служит подсказкой сопоставления, не автоматической командой записи связи. Title/path/line/generated test.id — только diagnostics. Каждый выбранный binding получает `invocationId`, связывающий case snapshot, Autotest snapshot, аргументы и attempts внутри execution. Один тест с двумя наборами аргументов выполняется дважды; retries остаются в своём invocation. Первая версия исполняет invocations последовательно отдельными процессами, без изменения общего process.env между параллельными тестами. Новый manifest/report — schemaVersion 2; v1 reports остаются доступны импорту без миграции на open. Проверенные задачи этапа 1 подтверждают только v1; расширение проверяется отдельно.

### Arguments and environment references

Автотест объявляет аргументы: key, label, description, type (`string | number | boolean | enum`), required, default, enum options, optional string format (`url | ip`) и numeric range. Только JSON primitives; максимум 100 аргументов, key до 64 символов, значение до 4096 UTF-16 units, общий payload до 64 KiB. Unknown/unsupported arguments блокируются до spawn. Автотест без объявленной поддержки не получает фиктивные поля аргументов.

Значение — literal либо ссылка `{entryId, key}` на тип «Окружение» справочника текущего repo. Например, «prod»: `{baseUrl: "https://prod.example", host: "192.0.2.10"}`, «stage» со своими значениями. Название — подпись, ID — идентичность; description/URL обычного термина не используются как executable config. Picker показывает ключ, тип и итоговое значение. Архивная/отсутствующая запись блокирует новый запуск, но старый snapshot остаётся читаемым.

Приоритет: schema default → Autotest defaults → binding overrides → run/execution overrides. Окружение используется только через явные references, без merge всех его полей. false/0/пустая строка проходят проверку как реальные значения, без truthy fallback. После разрешения references значения повторно валидируются TypeScript/Rust. Перед стартом видны итоговые значения, источник и изменённые invocations. Сохраняется immutable snapshot схемы, Autotest/binding, несекретных значений, glossary IDs/revisions. Изменение источника после preview требует обновления; начатый запуск использует сохранённый снимок.

Node-тест читает аргументы через документированный helper `getInvocationArguments()` из app-created context. Значения не превращаются в shell fragments, произвольные CLI flags или eval/Markdown templates. Пароли и токены не кладутся в справочник или переносимый manifest; secret management — будущий scope.


Trusted discovery (`--list`) создаёт нормализованный catalog + digest и показывает project dependencies. Runner/reporter `preprocess` с testRun (API >=1.62) отбирает полные stable keys до исполнения; fixture проверяет отсутствие побочного исполнения соседних вариантов. `--test-list` можно использовать как предварительное сужение по [project]/file/title, но игнорируемый line number и нестабильный title не служат гарантией. Несовпадение catalog/config revision с manifest блокирует execution; отсутствие preprocess в установленной версии — typed unsupported-version. Dependency projects либо явно включены в preview вместе с выбранными тестами, либо профиль отклоняется как неподдерживаемый; скрытого расширения набора нет.

### Version 1 compatibility baseline

Этот раздел описывает уже реализованный baseline v1. Для новых Autotest/binding/invocation/arguments используется v2 из предыдущих решений; v1 не получает дополнительные поля молча. Оба формата имеют отдельные fixtures и import compatibility tests.

Manifest: `schemaVersion: 1`, `operation`, `runId` (существующий repo-relative run path), новый UUID `executionId`, `profileId`, `profileRevision`, `catalogRevision`, `createdAt`, `selection` полных keys, `source` с commit SHA/null для unborn, branch/null и dirty. `outputRoot` — app-created execution directory, не произвольный путь из WebView. Report повторяет correlation/source metadata и содержит `state`, `reason`, `startedAt`, `finishedAt`, `tests`, `runnerErrors`, `logs`, `attachments`, completeness marker. Strict runtime schemas отвергают unknown version, лишние поля и неверные correlation IDs; Rust serde DTO независимо проверяет native границу, JSON parser не считается достаточной защитой Rust.

Test record: caseId, automationId/project/variantId, title/file hints, expectedStatus и attempts. Attempt: retry, repeatEachIndex, raw Playwright status (passed/failed/timedOut/skipped/interrupted), start/duration, errors, bounded stdout/stderr, safe artifact references. Outcome: expected/unexpected/flaky/skipped/interrupted, отдельно execution terminal state completed/runner_error/interrupted/timed_out. Expected failure определяется expectedStatus, а не raw failed; flaky сохраняет неудачную и успешную попытки. `onError` записывает runner errors. Exception reporter может быть проглочен Playwright, поэтому bridge требует валидный final report/completeness marker и сопоставляет его с process exit; exit 0 без report не означает success.

«Повтор упавших» создаёт новый executionId с parentExecutionId и точным selection unexpected failed/timedOut из предыдущего execution. Это не Playwright `--last-failed`, не обращение к чужому `.last-run.json` и не удаление истории. Dependencies остаются видимы. Interrupted/runner_error доступны отдельному явному повтору, не маскируются под assertion failures.

### Trust and IPC

Профиль описывает profileId/label, canonical repo-relative cwd/config, абсолютный выбранный Node executable, project selection, timeout и ограниченные runner options. Portable settings и bindings лежат `.testoritto/automation/profiles.json` и `bindings.json`; machine-specific Node path/secret environment values — app-data. Общий profileRevision включает portable и local settings. Trust grant в app-data связан с canonical repo root, Node/CLI identity, profileRevision и digest config/lockfile. Изменения этих данных отзывают grant перед следующим discover/run; это защита от незаметной смены профиля, не аудит всего исполняемого test code/dependency tree. Отзыв и повторное доверие доступны явно.

Page → UseXxx hook → automation facade → invoke wrapper → Rust command → automation service. Предлагаемые narrow commands: `read_automation`, `save_automation_profile`, `save_automation_bindings`, `set_automation_trust`, `discover_automation`, `start_automation`, `poll_automation`, `cancel_automation`, `preview_automation_import`, `apply_automation_import`, `apply_automation_results`. Каждый request содержит protocolVersion/sessionId, resource/execution IDs и необходимые expectedRevision. Не предоставляются spawn(command), shell или arbitrary filesystem API. Команды зарегистрированы в AppManifest/permissions/main capability; handlers проверяют caller/webview, payload, current session, canonical descendants и ownership execution. Browser не передаёт authority-bearing absolute artifact paths.

Native errors сериализуются typed codes, например AUTOMATION_UNTRUSTED/UNAVAILABLE/INVALID_REPORT/STALE_PROFILE/BUSY/CANCELLED/IO; сырой env и неограниченный stderr не попадают в сообщение. Secrets не возвращаются в UI и не сериализуются в report/config. Передачи секретов достаточно через local environment setup; secret storage UI не является обязательным объёмом.

### Process lifecycle and polling

Один активный execution/discovery на repo session; второй start возвращает BUSY. Start делает короткую admission/validation/persist операцию и возвращает executionId; worker не удерживает mutation FIFO на протяжении тестов. Poll по executionId/cursor отдаёт bounded snapshot/deltas, не читает произвольный файл; UI poll прекращается после terminal state/unmount. Cancel использует отдельный control path и не ждёт занятый worker или очередь сохранения результатов.

Containment переиспользует/выносит существующий Git JobObject/process-group подход. Windows: JobObject kill-on-close с назначением до исполнения пользовательского кода и проверкой spawn/assignment race. macOS: отдельная process group, graceful signal → bounded grace → kill group и reap. Child.kill только для родителя недостаточен. Timeout/discovery timeout, Stop, close/session drop и штатный exit завершают дерево, закрывают pipe readers и сохраняют terminal state; cleanup failure блокирует успешное закрытие session с typed diagnostic. После crash retained running record получает interrupted на reopen, без автоматического возобновления. Kill-on-crash всего дерева на каждой ОС проверяется отдельно; это не sandbox и не защита от намеренно daemonizing кода пользователя.

### Storage, limits and compatibility

Оригинальные `.casewright/config.yaml`, cases, `.order`, folder notes и run `.source` bytes не меняются при open/discovery/import. Automation-owned данные: `.testoritto/automation/runs/<run-key>/<executionId>/{manifest,report}.json`, где run-key — hash нормализованного runId; artifacts имеют generated IDs и registry, не имена из отчёта. Portable profile/binding/history JSON могут явно включаться в scoped Git selection после расширения product ownership. Большие screenshots/video/trace/log blobs по умолчанию app-data, вне автоматического Git staging; readonly ссылки могут стать unavailable на другом клоне. Пользовательские source artifacts не удаляются. Нет автоматического изменения .gitignore или коммита.

Предлагаемые стартовые лимиты: report/import 16 MiB, 10 000 test variants, 100 attempts/test, 1 MiB aggregate log/execution с truncation marker, 100 attachments/execution, 25 MiB/attachment и 100 MiB aggregate, runtime <=30 min, discovery <=60 sec, poll page <=256 KiB. Лимиты проверяются до allocation/copy и на native границе; превышение report/import — отказ, log — усечение с диагностикой, artifact — пропуск с причиной. Точные значения — контракт этапа 1 и одинаковые fixtures TS/Rust.

Canonical path checks запрещают absolute/UNC/traversal/ADS/symlink escapes вне профиля/разрешённого source artifact root и app-owned destination. Attachment body копируется только после лимитов и проверки content type; HTML/trace/video не исполняются и не открываются автоматически. Markdown/errors/logs выводятся как passive text. Для XML запрещены DTD/external entities, сеть и произвольные URI.

Persistence через существующую per-session FIFO и atomic replacement, source/destination expectedRevision проверяются внутри admitted операции. Sidecar report публикуется атомарно, index ссылается только на опубликованные execution records; orphan staging обнаруживается без изменения original bytes. Commit/close используют native barriers; отмена не блокируется этой очередью. Manual RunResult, checks и notes не перезаписываются по завершении runner. Reviewed apply отдельно показывает deterministic outcome mapping и expectedRevision; stale/mixed uncertain outcome требует нового preview. Применение меняет только выбранное summary, сохраняет неизвестные секции и snapshots; flaky/runner_error не теряются в automation history.

### Import and UI

Новый UI включает самостоятельный раздел «Автотесты» (каталог/карточка/create/edit/archive), блок нескольких привязок в кейсе, настройку аргументов в прогоне и результаты по invocation. Профиль остаётся способом исполнения, не заменяет сущность автотеста. Discovery предлагает связать найденные селекторы с каталогом, а не создаёт сущности без явного сохранения. Архивирование скрывает автотест из нового выбора, сохраняя старые связи и историю.

### Generated reports and run folder export

Report file автотеста — отдельный artifact с invocationId, generated ID, оригинальным названием как подписью, MIME, размером, hash и available/missing/truncated diagnostic. JSON/JUnit показываются структурированно, логи как текст, проверенные screenshot MIME как изображения; остальные форматы предлагаются как файлы. HTML/JS не вставляется в DOM и не запускает report server. «Отчёт Testoritto» и «Отчёт автотеста» в UI различаются.

По умолчанию крупные blobs остаются в app-data. Явное действие «Сохранить в папку прогона» копирует проверенный выбранный набор в `<run>/.testoritto/automation/<executionId>/<invocationId>/reports/` с generated filenames и manifest metadata; пользователь видит объём и состав. Rust вычисляет run root по session/resource и проверяет canonical paths, symlinks, размеры и hash. Копирование не затрагивает `_run.md`, `.source` и ручные результаты, не делает stage/commit. Публикация набора атомарная либо помечается failed/incomplete, а не сохранённая частично как успех. Повтор того же набора идемпотентен, чужие файлы не перезаписываются. Casewright catalog должен игнорировать этот namespaced output; это подтверждается fixture до включения writer. Старые отчёты остаются привязаны к сохранённым аргументам и invocation, даже если каталог/справочник изменён.

### Import normalization

Общий pure parser нормализует Testoritto report v1, Playwright JSON и JUnit XML. JUnit properties с `testoritto.caseId`, `testoritto.automationId`, `testoritto.variantId`, `testoritto.project` обеспечивают stable mapping; без них строки остаются unmatched с явной ручной привязкой в preview. У JSON нет самопроизвольного запуска reporter. Testoritto runId проверяется точно; у generic reports metadata может отсутствовать — UI явно показывает отсутствие, не выдумывает commit или executionId.

Preview фиксирует source SHA256, normalizer version, target run revision и mapping; import identity — target run + source hash, row identity — stable key + attempt index. Повтор идентичного источника — no-op; duplicate keys внутри источника блокируют соответствующие строки, different content с тем же executionId — конфликт. Foreign-run source не применяется молча: явный target choice создаёт новый local execution с сохранённым external provenance. Apply повторно проверяет hash/target revisions. Import не перетирает manual summary; для него действует отдельный reviewed apply.

Product useCases размещаются `src/automation/useCases/<scenario>/` с UseXxxArgs/UseXxxResult и типизированным RU i18n, @codaa/ui/CSS Modules/--app-*; TanStack Query обслуживает repo/profile/execution через IPC, Zustand — UI selection, local state — drafts. В UX preview используются те же contracts/presentation components с fixture adapter: профили/trust setup, binding, exact selection, mixed run, attempts/error/artifacts, import preview. Состояния loading/empty/unsupported/untrusted/running/cancelling/failed-save/stale видимы; кнопка Stop доступна во время polling.

## Risks / Trade-offs

- Config/setup/webServer исполняют arbitrary local code → explicit local trust setup; subprocess containment ограничивает lifecycle, но не filesystem/network capabilities.
- Stable ID требует явного участия автора автотестов → диагностировать missing/duplicate; не угадывать по title.
- Config/profile меняется после discovery → revision/catalog checks и pre-execution selector; несовместимая версия блокируется.
- Attempt/artifact объём и sensitive test output → bounded retention вне Git, explicit export/application, без сохранения environment dump; пользовательский output не обещается автоматически очистить от всех секретов.
- Runtime отличия JobObject/process group/WebView2/WKWebView → native target acceptance отдельно; browser fixtures этого не доказывают.

## Migration Plan

Последовательно выполнить этапы tasks.md; каждый срез имеет проверяемые artifacts и evidence, следующий не требует нового разрешения пользователя. Нет миграции на open. Rollback приложения оставляет original Casewright files читаемыми, automation sidecar может игнорироваться старой версией; неизвестная версия sidecar отклоняется, не перезаписывается. Windows x64/macOS arm64 packaging проверяет наличие JS resources, внешний Node setup и отсутствие bundled Node/test-only WebDriver plugins в release. Подпись/notarization и CI runner provisioning остаются прежними отдельными вопросами distribution.

## References

- [Playwright Reporter API](https://playwright.dev/docs/api/class-reporter): reporter hooks, preprocess и необходимость явно обрабатывать ошибки reporter.
- [Playwright TestResult](https://playwright.dev/docs/api/class-testresult): retries, status, duration, errors, stdout/stderr, attachments.
- [Playwright CLI](https://playwright.dev/docs/test-cli): --list, --test-list, project selection и execution options.
- [Playwright reporters](https://playwright.dev/docs/test-reporters): JSON и JUnit interchange.
- Local sources перечислены в Context; фактическая совместимость автоматизации подтверждается новыми fixture tests, а не наличием текущего browser runner `apps/desktop/scripts/playwright-runner.mjs`.
