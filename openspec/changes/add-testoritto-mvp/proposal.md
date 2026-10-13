# Proposal

Статус: draft для обсуждения, 2026-10-13. Реализация ещё не началась.

## Why

Нужно самостоятельное десктопное приложение Testoritto для ручных тест-кейсов и прогонов, совместимое с разрешённым к использованию Casewright и работающее через Git. Сейчас есть reference source и пользовательский UI Kit, но нет согласованного ТЗ, нового desktop runtime и сборок обеих ОС.

## What Changes

- Подтверждённые требования: React, Windows/macOS, Git collaboration, совместимость существующих Casewright repos, @codaa/ui и палитра Citadelic.
- Предложение: Electron + TypeScript strict + electron-vite, main-process fs/Git и typed preload IPC; Git CLI с credentials ОС.
- Основные сценарии: открытие repo/workspaces, suites и кейсы, Markdown runs, явные status/diff/commit/pull/push.
- No-write open, сохранение unknown fields/sections, защита pending drafts и конфликтов.
- Новая UI композиция на предоставленном Kit и tokens вместо upstream Tailwind/brand.
- Per-OS packaging/smoke, отдельный будущий signing/release этап.

Обсудить до фиксации scope: structured merge в MVP или внешний редактор, clone/branches UI, variables/approvals/reporting UI, поддерживаемые OS versions и distribution. Предлагаемый default conflict workflow — внешний редактор; это ещё не ответ пользователя.

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

Будущие `apps/desktop/{main,preload,renderer,contracts}` и при необходимости `packages/core`; UI workspace `ui/`. Перенос formats/tests и services из `casewright-main/apps/desktop/src` с сохранением MIT notice.
Новый typed IPC API вместо renderer Node bridge. Новые native build jobs вместо upstream release/updater. Существующие пользовательские data repos не мигрируются автоматически.

Полное ТЗ — `docs/PRD.md`, audit — `docs/SOURCE-AUDIT.md`, предложенный стек — `docs/adr/0001-desktop-stack.md`.
