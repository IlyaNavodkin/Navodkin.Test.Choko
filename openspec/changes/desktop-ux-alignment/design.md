# Design

## Context

Мотивация — proposal.md. Текущее состояние по коду:
- Продуктовый shell — `apps/desktop/src/app/App.tsx` (только `QueryClientProvider`, без `ToastHost`/`BlockingOverlayHost`) и `src/repository/useCases/browse-repository/RepositoryBrowserPage.tsx` (288 строк: кастомный header, `Tabs` workspace/runs/git/automation, recent списком, инлайн-алерты).
- Образец shell — `apps/ui-playground/src/catalog/useCases/browse-components/ComponentCatalogPage.tsx`: `PageTopbar` + `PageBrand` + `SearchInput` + `Badge` + `CatalogSidebar` (`GroupLabel`/`SectionButton`).
- Образец флоу — `src/ux-preview/useCases/explore-design/ExploreDesignPage.tsx` + `PreviewChrome.tsx` + `Preview.module.css` (347 строк): топбар с icon-навигацией `cases/runs/automation/git/glossary`, стартовый экран с карточками, workspace-композиции, брейкпоинты 1350/1050/800.
- Automation v2 backend готов: 16 команд в `src-tauri/src/automation_commands.rs`, `Start` с `invocations` + `preview` (STALE-check) в `services/automation/runner.rs`, facade `src/automation/api/automationApi.ts` уже v2. Окружения — костыль в automation metadata (`save_automation_environments`, `settings.environments`), отдельного glossary service в Rust нет.
- Отчёты: builders в `src/ux-preview/useCases/export-report/` (`buildReport.ts`, `pdfDefinition.ts`, `exportReport.ts`, `distributionModel.ts`) — только browser Blob/download, native destination service отсутствует.

## Goals / Non-Goals

**Goals:** единый продуктовый shell; справочник/автотесты/отчёты как в preview, но на Rust IPC; переиспользование builders без их переписывания.

**Non-Goals:** смена согласованного backend-контракта automation/repository; новый UI Kit; удаление `ux-preview` до конца портирования; macOS-приёмка в этом change.

## Decisions

### Shell: preview-композиция поверх Kit-компонентов
`RepositoryBrowserPage` перестраивается: header → `PageTopbar` + `PageBrand` (как `ComponentCatalogPage`), табы → icon-навигация 5 разделов (как `PreviewChrome`, иконки `IconNames`, `aria-current`, count-бейдж Git), пустое состояние → `StartScreen`-карточки recent, в `App.tsx` добавляются `ToastHost` + `BlockingOverlayHost`. Токены/типографика/брейкпоинты переносятся из `Preview.module.css` в продуктовые CSS Modules. Альтернатива «косметически подкрасить текущий shell» отклонена: расхождение флоу (4 таба без справочника против 5 разделов) косметикой не закрыть.
Guards (draft-close, external changes, suite recovery, needsInitialization) переносятся без изменения логики — меняется только chrome вокруг них.

### Glossary: новый Rust service по образцу repository service
Versioned Markdown `.testoritto/glossary/<uuid>.md` + parser/patch writer (LF/CRLF/unknown round-trip, stable file ID, path policy), service с session/canonical/revision/FIFO/watcher, команды `read_glossary/save_entry/archive_entry` с permissions/capabilities, scoped Git ownership. Frontend: `GlossaryWorkspace` из ux-preview адаптируется на facade + TanStack Query (in-memory заменяется), окружения переключаются с automation metadata на справочник. Альтернатива «оставить окружения в automation» отклонена: это противоречит `add-repository-glossary` и плодит два источника правды.

### Automation workspace: порт `AutomationWorkspace`, удаление v1-панели
`src/automation/useCases/manage-automation/AutomationPanel.tsx` (v1-модель selection) заменяется портом `AutomationWorkspace` из preview на существующем v2 facade. `mergeBindings`/`selectionFrom`-легаси удаляются. `preview` (STALE) показывается до старта и передаётся в `Start.preview`; `save_reports` — «Сохранить в папку прогона». In-memory adapter preview не переиспользуется — только presentation-компоненты и доменная логика `tools/playwright-automation`.

### Reports: builders переиспользуются, добавляется только destination
`buildReport`/`pdfDefinition`/`distributionModel` переносятся как есть (общая report schema уже согласована в `add-run-reports`). Добавляется Rust export service: команды с caller/session/payload/size checks, native dialog/cancel/overwrite, безопасная запись без traversal/symlink escapes. Frontend `ReportPreview` подключается к saved snapshots вместо demo-данных.

### i18n: ключи переносятся, словарь preview не импортируется
Preview-словарь (`manage-glossary/messages.ts`, `explore-design/messages.ts`) изолирован от production i18next. Ключи переносятся в `src/shared/i18n/resources.ts` (RU + EN fallback), импорты preview-messages в продукт запрещены.

## Risks / Trade-offs

- Параллельно правится дерево (v2-срез дописывается на ходу) → перед каждой задачей `git status` и сверка API; чекбоксы только после зелёных проверок.
- Preview и продукт расходятся в деталях (demo-данные vs revision-guarded persistence) → переносить только presentation + domain, весь IO — через facade/IPC.
- Glossary меняет storage-модель automation (environments переезжают) → миграция без потерь: portable-файлы читаются, запись идёт в новое место, старые snapshots валидны.
- Объём: 4 спека в одном change → задачи строго по фазам 0–4, `ux-preview` живёт до конца фазы 2.

## Migration Plan

Фазы 0→1→2→3→4 из плана; каждая — проверяемые artifacts и evidence. Rollback: продуктовые файлы читаемы без приложения, automation sidecar игнорируется старой версией, unknown sidecar version отклоняется без перезаписи. `ux-preview` удаляется только после native-приёмки фазы 4. Windows x64 NSIS собирается без test-плагинов; подпись/notarization — отдельные вопросы distribution.

## References

- [Tauri commands](https://v2.tauri.app/develop/calling-rust/), [capabilities](https://v2.tauri.app/security/capabilities/), [dialog plugin](https://v2.tauri.app/plugin/dialog/)
- Локально: `apps/desktop/src-tauri/src/services/automation/runner.rs` (`Start.preview`, STALE-check), `apps/desktop/src/automation/api/automationApi.ts` (v2 facade), `apps/desktop/src/ux-preview/useCases/explore-design/PreviewChrome.tsx`, `apps/ui-playground/src/catalog/useCases/browse-components/ComponentCatalogPage.tsx`
