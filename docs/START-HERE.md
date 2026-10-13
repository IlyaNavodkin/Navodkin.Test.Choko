# Пакет для обсуждения Testoritto

Подготовлен 13 октября 2026. Репозиторий: https://github.com/IlyaNavodkin/Navodkin.Testoritto (private).

## Что уже определено

- Tauri 2 как основа, React, десктопные версии Windows/macOS.
- Работа и совместная работа через Git.
- Совместимость с существующими репозиториями Casewright.
- UI Kit из `D:/repo/testoritto/ui`, цветовые токены Citadelic.
- OpenSpec и предоставленный React/TS навык установлены в проект.

## Выбранная основа

**Tauri 2 + React 19 + TypeScript strict + Vite**, Rust backend для файлов и системного Git CLI, локальные Markdown/YAML файлы без собственного сервера. CSS Modules и `@codaa/ui`. Прогоны — совместимые Markdown folders текущей версии Casewright.

Tauri 2 выбран пользователем 2026-10-13. Node.js fs/Git/window services исходника переписываются в Rust, без Node-sidecar. Формат данных и fixtures сохраняются; UI обращается к backend через типизированные Tauri commands.

## Читать в таком порядке

1. [DISCUSSION.md](DISCUSSION.md) — решения, которые нужно принять для старта.
2. [PRD.md](PRD.md) — продуктовые сценарии, scope и приёмка.
3. [ADR: стек](adr/0001-desktop-stack.md) — Electron/NW.js/Tauri и trade-offs.
4. [SOURCE-AUDIT.md](SOURCE-AUDIT.md) — что есть в коде и что следует переносить.
5. [DATA-COMPATIBILITY.md](DATA-COMPATIBILITY.md) — фактический формат и защита данных.
6. [ARCHITECTURE.md](ARCHITECTURE.md), [UI-KIT.md](UI-KIT.md), [BUILD-AND-RELEASE.md](BUILD-AND-RELEASE.md).
7. [OpenSpec proposal](../openspec/changes/add-testoritto-mvp/proposal.md), [design](../openspec/changes/add-testoritto-mvp/design.md), [tasks](../openspec/changes/add-testoritto-mvp/tasks.md).

## Первый результат разработки

Первый срез разработки после согласования продуктового scope: минимальное Tauri 2 окно с React и UI Kit; Vite frontend и Rust src-tauri; dev-команды и smoke artifact для Windows/macOS. Следующий срез — открыть копию настоящего Casewright repo без изменения файлов, показать дерево и прочитать кейс. Затем безопасная запись, прогоны и Git workflow.

В текущем change все продуктовые задачи остаются незавершёнными. Установка навыков и подготовка ТЗ не означают реализацию приложения.
