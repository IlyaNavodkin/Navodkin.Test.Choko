# Tasks

## 1. App shell

- [x] 1.1 Заменить header `RepositoryBrowserPage` на `PageTopbar` + `PageBrand`, табы — на icon-навигацию пяти разделов с `aria-current` и Git count-бейджем; проверить typecheck и browser render топбара.
- [x] 1.2 Перестроить пустое состояние в `StartScreen`-стиль (крупный CTA, recent-карточки с путём/веткой/chevron); проверить empty/open-recent сценарии browser QA.
- [x] 1.3 Подключить `ToastHost` + `BlockingOverlayHost` в `App.tsx`; проверить toast/dismiss и blocking overlay с focus return тестами.
- [x] 1.4 Перенести токены/типографику/брейкпоинты 1350/1050/800 из `Preview.module.css` в продуктовые CSS Modules; проверить 760/1440 px без горизонтального overflow в browser.
- [x] 1.5 Сохранить guards (draft-close, external changes, suite recovery, needsInitialization) при новом chrome; проверить блокировку навигации и failed-save удержание draft Vitest + browser.

## 2. Glossary native

- [x] 2.1 Реализовать Rust versioned Markdown parser/patch writer `.testoritto/glossary/<uuid>.md` (LF/CRLF/unknown round-trip, stable file ID, path policy); проверить cargo test parity/temp-repo fixtures.
- [x] 2.2 Реализовать Rust glossary service + команды `read_glossary/save_entry/archive_entry` (session/canonical/revision/FIFO/watcher, permissions/capabilities, scoped Git); проверить fmt/clippy/test, stale/symlink/traversal/failure fixtures.
- [ ] 2.3 Адаптировать `GlossaryWorkspace` из ux-preview на typed facade + TanStack Query (поиск/фильтры/validation/archive/guards); проверить Vitest и browser QA 760/1440.
- [ ] 2.4 Переключить окружения automation с metadata на справочник (entryId/key picker, revisions/snapshots, `ENVIRONMENT_UNAVAILABLE`); проверить TS/Rust parity и неизменность исторических snapshots.

## 3. Automation workspace

- [ ] 3.1 Портировать каталог/карточку автотестов и привязки кейса на v2 facade (create/edit/archive/delete, overrides, duplicate-диагностика); проверить Vitest + browser CRUD сценарии.
- [ ] 3.2 Добавить форму аргументов/окружений и invocation preview (приоритет слоёв, STALE-блокировка, передача `Start.preview`); проверить dirty/stale/failed-save browser QA.
- [ ] 3.3 Портировать запуск/стоп/повтор, attempts/flaky/logs/attachments views и JSON/JUnit импорт с preview/apply; проверить truncation/passive HTML/path denial, duplicate/unmatched/foreign-run, idempotent apply.
- [ ] 3.4 Удалить v1 `AutomationPanel` и `selectionFrom`/`mergeBindings`-легаси после портирования; проверить typecheck/tests/build без мёртвого кода.

## 4. Report export native

- [ ] 4.1 Реализовать Rust export destination IPC + save service (caller/session/payload/size checks, native dialog/cancel/overwrite, безопасная запись); проверить temp path/symlink/error tests, fmt/clippy/test.
- [ ] 4.2 Подключить `ReportPreview` к saved snapshots/metadata/approvals (run + неделя, includeNotes, distributions); проверить preview empty/loading/error и schema parity без подстановки live-кейсов.
- [ ] 4.3 Сохранить PDF/JSON через native service (filename sanitization, пагинация, кириллица, цветовые распределения); проверить browser downloads и PDF render 760/1440.

## 5. Приёмка

- [ ] 5.1 Выполнить frontend typecheck/tests/build, `pnpm check:ui`, browser regression product-сценариев и `pnpm spec:validate`; обновить evidence с командами и скриншотами.
- [ ] 5.2 Собрать Windows x64 NSIS без test-плагинов и пройти native open → trust → discover → run → cancel → import → glossary → export на приёмных клонах; зафиксировать OS/Node/Playwright/build и evidence отдельно от компиляции.
- [ ] 5.3 Сверить реализацию с каждым scenario capability, выполнить review API/security/data-preservation и регрессии manual/Git workflow; зафиксировать выполненные и оставшиеся проверки, не архивировать change при открытой приёмке.

## Workflow follow-up

- Задачи выполняются последовательно, один субагент за раз; перед каждой задачей сверить `git status` с параллельными правками.
- Чекбоксы отмечаются только после фактической проверки; browser QA не заменяет native acceptance.
- `ux-preview` остаётся референсом до завершения фазы 3; удаляется только после приёмки 5.2.
