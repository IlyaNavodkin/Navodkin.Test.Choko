# Proposal

Статус: scope MVP частично draft; пользователь разрешил начать независимый Tauri-каркас. Реализация ещё не завершена.

## Why

Нужно самостоятельное десктопное приложение Testoritto для ручных тест-кейсов и прогонов, совместимое с разрешённым к использованию Casewright и работающее через Git. Сейчас есть reference source и пользовательский UI Kit, но нет согласованного ТЗ, нового desktop runtime и сборок обеих ОС.

## What Changes

- Подтверждённые требования: Tauri 2, React, Windows/macOS, Git collaboration, совместимость существующих Casewright repos, @codaa/ui и палитра Citadelic.
- Выбранная пользователем основа: Tauri 2 + React/TypeScript strict + Vite; Rust fs/Git services и typed commands/events. Git CLI с credentials ОС, без Node-sidecar.
- Подтверждённые targets первой поставки: Windows x64 и macOS arm64. Минимальные версии ОС остаются открытыми.
- Разрешён старт независимого desktop-каркаса; разрешение не означает, что реализация уже выполнена или весь MVP scope согласован.
- Основные сценарии: открытие repo/workspaces, suites и кейсы, Markdown runs, явные status/diff/commit/pull/push.
- No-write open, сохранение unknown fields/sections, защита pending drafts и конфликтов.
- Новая UI композиция на предоставленном Kit и tokens вместо upstream Tailwind/brand.
- Per-OS packaging/smoke, отдельный будущий signing/release этап.

При конфликте Git MVP показывает ошибку и unmerged paths, предлагает только безопасный abort текущей операции и сообщает об отказе abort. Интерфейса разрешения конфликтов и отдельного UI для внешнего редактора нет; автоматические reset/clean/force запрещены. Если Git не может безопасно выполнить abort, операция блокируется с диагностикой, без обещания безусловного сохранения состояния.

До фиксации оставшегося scope открыты: clone/branches/stash UI, перенос UI для variables/approvals, минимальные версии ОС и детали distribution. Не включать их молча в обязательный MVP; существующие данные расширений сохранять.

Не входит в рекомендуемый MVP: собственный backend, realtime sync, automated test execution, marketing site, private GitHub auto-update и новый несовместимый data format.

## Capabilities

### New Capabilities

- `repository-workspaces`: открыть/инициализировать repo, выбрать workspace, сохранить recents.
- `case-authoring`: редактировать совместимые кейсы и suites без потери содержимого.
- `test-runs`: создавать и выполнять совместимые snapshot-прогоны.
- `git-collaboration`: явный безопасный Git workflow и обнаружение конфликтов.
- `desktop-platform`: React desktop, OS integration и Windows/macOS distribution.
- `design-system`: UI Kit, Citadelic tokens, use-case structure и доступные UI states.

### Modified Capabilities

Нет: living specs Testoritto ещё отсутствуют. Snapshot Casewright не объявляется реализованной capability нового приложения.

## Impact

Будущие `apps/desktop/src`, `apps/desktop/src-tauri/{src,capabilities,permissions}` и frontend contracts; UI workspace `ui/`. Node-dependent formats и fs/Git services переписываются на Rust по fixtures исходника с сохранением совместимости и MIT notice при переносе кода.
Новый typed Tauri command API вместо NW.js Node bridge. Новые native build jobs вместо upstream release/updater. Существующие пользовательские data repos не мигрируются автоматически.

Полное ТЗ — `docs/PRD.md`, audit — `docs/SOURCE-AUDIT.md`, выбранный стек — `docs/adr/0001-desktop-stack.md`.


Отдельное решение 2026-10-16: предпросмотр отчётов прогона и недели, экспорт PDF/JSON согласованы пользователем и отслеживаются в `openspec/changes/add-run-reports/`. Browser-срез реализован и проверен; подключение реальных repository snapshots, native IPC/save и desktop-приёмка остаются открытыми. Это решение не расширяет scope variables/approvals.
