# Автотесты: браузерный UX-срез

Дата: 2026-10-17. Это **изолированный UX-прототип** раздела «Автотесты» в `src/ux-preview`: он показывает согласованный продуктовый сценарий и использует настоящую доменную логику v2 из `tools/playwright-automation`, но исполнение Playwright и native IPC в нём имитируются. Задачи 2.x/3.x/5.x change `add-playwright-automation` этим срезом не закрываются: Rust v2 commands, product IPC, реальный Node runner и native приёмка не реализованы.

## Что реализовано

- **Каталог автотестов**: список с поиском и фильтром архива, создание/редактирование/архивация/удаление. Сущность — `Autotest` v2 (immutable UUID, revision, profileId, selector `{automationId, project, variantId}`, `argumentDefinitions`, defaults) из `tools/playwright-automation/src/catalog.ts`.
- **Аргументы**: редактор строк (`string` с форматом url/ip, `number` с min/max, `boolean`, `enum` со списком) с построением настоящих `ArgumentDefinition` и проверкой через `ArgumentDefinitionSchema`; значения по умолчанию проверяются той же схемой, что и при запуске.
- **Discovery**: «Обнаружить тесты» показывает нормализованный catalog профиля с проектами, `catalogRevision`, проектами-зависимостями и добавляет выбранный тест в каталог вручную. Открытие раздела ничего не запускает.
- **Привязки кейсов**: у кейса несколько привязок, один автотест переиспользуется в разных кейсах; `CaseAutotestBinding` с `enabled` и `argumentOverrides`; дубликат «тот же кейс + тот же автотест + те же значения» блокируется диагностикой; отключённая/архивная привязка показывается как `UNAVAILABLE`.
- **Окружения из справочника**: в «Справочнике» появился тип «Окружение» с типизированными `key=value` (числа и true/false сохраняются примитивами), ревизией записи и таблицей итоговых значений. Аргументы ссылаются на запись явно (`{entryId, key}`), архивная или отсутствующая запись даёт `ENVIRONMENT_UNAVAILABLE`, а не подстановку.
- **Разрешение значений**: приоритет `schema default → autotest defaults → binding overrides → run overrides` считается настоящим `createInvocationSnapshot`, в UI видны итоговое значение и слой-источник; «Проверить снимок» фиксирует снимок, а изменение источника переводит его в `STALE` и блокирует запуск (настоящий `validateInvocationPreview`).
- **Смешанный прогон**: выбор привязок, invocation-снимки, запуск/остановка, повтор упавших как новый execution с `parentExecutionId`, история execution. Попытки, статусы Playwright, `expected`/`unexpected`/`flaky`/`skipped`/`interrupted` считаются настоящими `outcomeOf`/`TestRecordSchema`; логи, ошибки и вложения показываются ограниченно, HTML-вложение помечено как заблокированное.
- **Отчёт**: для `completed` execution собирается настоящий v1 `report.json` (валидируется `ReportSchema`: correlation, completeness, selection, лимиты) и `junit.xml`; SHA-256 считается через WebCrypto. Execution без валидного отчёта (runner_error/interrupted) публикует только логи — это соответствует правилу «exit без валидного report не означает success».
- **Публикация**: «Сохранить результаты в прогон» (ручные результаты не перезаписываются) и «Сохранить в папку прогона» — файлы появляются в Git-разделе как untracked в `.testoritto/automation/<executionId>/`, без автоматического staging.
- **Импорт**: разбор Testoritto report.json, Playwright JSON и JUnit (testcase properties) настоящим `parseImport`, preview через `previewImport` со статусами matched/duplicate/unmatched, `foreignRun`, `metadataMissing`, `duplicateImport`, `executionConflict` и явным применением совпавших строк.
- **Доверие и профиль**: карточка профиля (cwd/config/projects/timeout/retries/workers), локальное доверие с отзывом при изменении профиля, переключатель демо-состояний (нет доверия, неподдерживаемая версия, discovery недоступен, ошибка runner, ошибка сохранения). Изменения конфигурации не пишутся на диск.

## Проверка

- `node node_modules/typescript/bin/tsc --noEmit` — PASS.
- `node node_modules/vitest/vitest.mjs run` — **210/210** в 20 файлах (включая обновлённые счётчики справочника и новые проверки схемы окружения).
- `node node_modules/vite/bin/vite.js build` — PASS; продуктовый bundle не изменился по составу (`dist/index.html`), ux-preview остаётся отдельным dev-entry.
- `node scripts/playwright-runner.mjs test --config=playwright.config.ts` — **42/42** продуктовых browser-сценария PASS.
- `openspec validate --all --strict --no-interactive` — 5/5 changes PASS.
- Headless Chromium 156 (Playwright 1.64.1, `.cache/playwright`), production-подобный Vite dev preview `127.0.0.1:1420/ux-preview.html`: сценарий из 22 шагов пройден целиком, `console/page errors: 0`. Шаги: открыть демо-репозиторий → «Автотесты» → discovery → создать автотест с аргументом → привязка с окружением → выбор привязок → preview снимка → запуск (flaky/expected/unexpected) → результаты и отчёты → сохранение результатов и файлов → файлы в Git → импорт JUnit → применение → состояние «нет доверия» → «ошибка runner» → справочник с окружением.
- Проверка 1280 и 760 px: горизонтального overflow нет (0 px), ошибок консоли нет. Снимки: [bindings](browser/automation-bindings.png), [привязка с окружением](browser/automation-binding-environment.png), [выбор запуска](browser/automation-run-selection.png), [завершённый запуск](browser/automation-run-completed.png), [результаты и отчёты](browser/automation-results-artifacts.png), [импорт](browser/automation-import-preview.png), [нет доверия](browser/automation-untrusted.png), [760 px](browser/automation-run-760.png), [окружение в справочнике](browser/glossary-environment.png).

## Ограничения

- Исполнение **имитируется**: реальный Node/Playwright через Rust не запускается, попытки и статусы берутся из детерминированного сценария; вызовы Tauri IPC не выполняются.
- Rust v2 commands, product `useCases`/IPC, native import/apply, retention и app-data storage не реализованы; прототип живёт в памяти и в отдельном preview, а не в продуктовом приложении.
- Два invocation одного теста с разными аргументами в одном прогоне допустимы доменной моделью, но v1 `report.json` требует уникальный набор ключей: такой execution не публикует отчёт и показывает это диагностикой до появления v2 report.
- Просмотр больших логов/вложений, export отчёта за пределы демо-папки, `variables`/`approvals` и macOS/native приёмка остаются вне этого среза.
