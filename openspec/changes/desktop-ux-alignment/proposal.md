# Proposal

## Why

Продуктовый десктоп отстаёт по UX от согласованных образцов: `apps/ui-playground` задаёт визуальный язык Kit, а `src/ux-preview` — продуктовый флоу пяти разделов. Пользователь согласовал выравнивание десктопа под эти образцы при сохранении Rust-бэкенда. Без этого change новые фичи (справочник, каталог автотестов, отчёты) остаются только в прототипе.

## What Changes

- App shell десктопа приводится к образцу: `PageTopbar` + `PageBrand`, icon-навигация пяти разделов (cases/runs/automation/git/glossary), стартовый экран с карточками recent, `ToastHost` + `BlockingOverlayHost`, токены/типографика/брейкпоинты из preview.
- Раздел «Справочник» портируется из ux-preview на настоящий Rust storage + typed IPC (versioned Markdown, session/canonical/revision/FIFO/watcher, scoped Git).
- Раздел «Автотесты» портируется из ux-preview на существующий v2 facade (каталог, карточка, привязки, аргументы/окружения, preview снимка, запуск/стоп, результаты, импорт).
- Отчёты прогонов подключаются к native export IPC + Rust destination/save service (native dialog/cancel/overwrite).
- Все guards сохраняются: draft-close, external changes, suite recovery, needsInitialization. Atomic writes, revision checks, preserve unknown content, без auto commit/push/stage.

Не входят: изменение согласованного Rust-бэкенда по сути, macOS-приёмка, CI orchestration, sandbox, редактор кода. `ux-preview` остаётся референсом до конца портирования.

## Capabilities

### New Capabilities

- `desktop-shell`: продуктовый app shell — топбар, icon-навигация пяти разделов, стартовый экран, toast/blocking hosts, адаптивные брейкпоинты, сохранение всех guards.
- `desktop-glossary`: нативный раздел «Справочник» — каталог записей, поиск/фильтры, validation, archive/restore, guards, окружения для аргументов автотестов.
- `desktop-automation-workspace`: продуктовый раздел «Автотесты» как в preview — каталог, карточка, привязки, аргументы/окружения, invocation preview, запуск/стоп/повтор, результаты, импорт, сохранение отчётов в папку прогона.
- `desktop-report-export`: нативный предпросмотр и экспорт отчётов прогона/недели в PDF/JSON через Rust destination service.

### Modified Capabilities

Нет living specs (`openspec list --specs` пуст). Смежные in-flight changes (`add-playwright-automation`, `add-repository-glossary`, `add-run-reports`) не изменяются этим proposal; интеграция с их контрактами описана в design.

## Impact

- Frontend: `apps/desktop/src/app`, `src/repository`, новый `src/glossary`, переписанный `src/automation/useCases`, `src/shared/i18n/resources.ts`, CSS Modules. `ux-preview` не удаляется до конца портирования.
- Rust: новый glossary service + IPC/commands/permissions/capabilities, export destination service; существующие automation/repository команды не меняются по контракту.
- Зависимости: только существующие (`@codaa/ui`, TanStack Query, Zod, Tauri). Новых runtime-зависимостей нет.
- Проверки: cargo fmt/clippy/test, Vitest, tools checks, `spec:validate`, `check:ui`, browser QA, свежая Windows x64 NSIS-сборка + native-приёмка.
