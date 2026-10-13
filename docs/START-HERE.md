# Пакет для обсуждения Testoritto

Подготовлен 13 октября 2026. Репозиторий: https://github.com/IlyaNavodkin/Navodkin.Testoritto (private).

## Что уже определено

- React, десктопные версии Windows/macOS.
- Работа и совместная работа через Git.
- Совместимость с существующими репозиториями Casewright.
- UI Kit из `D:/repo/testoritto/ui`, цветовые токены Citadelic.
- OpenSpec и предоставленный React/TS навык установлены в проект.

## Рекомендуемое решение

**Electron + React 19 + TypeScript strict + electron-vite**, Git CLI через simple-git в main process, локальные Markdown/YAML файлы без собственного сервера. CSS Modules и `@codaa/ui`. Прогоны — совместимые Markdown folders текущей версии Casewright.

Electron выбран для повторного использования существующего Node.js слоя. Переход с NW.js потребует вынести файловые операции из renderer в main и заменить обращения через preload IPC; это не простая замена названия runtime.

## Читать в таком порядке

1. [DISCUSSION.md](DISCUSSION.md) — решения, которые нужно принять для старта.
2. [PRD.md](PRD.md) — продуктовые сценарии, scope и приёмка.
3. [ADR: стек](adr/0001-desktop-stack.md) — Electron/NW.js/Tauri и trade-offs.
4. [SOURCE-AUDIT.md](SOURCE-AUDIT.md) — что есть в коде и что следует переносить.
5. [DATA-COMPATIBILITY.md](DATA-COMPATIBILITY.md) — фактический формат и защита данных.
6. [ARCHITECTURE.md](ARCHITECTURE.md), [UI-KIT.md](UI-KIT.md), [BUILD-AND-RELEASE.md](BUILD-AND-RELEASE.md).
7. [OpenSpec proposal](../openspec/changes/add-testoritto-mvp/proposal.md), [design](../openspec/changes/add-testoritto-mvp/design.md), [tasks](../openspec/changes/add-testoritto-mvp/tasks.md).

## Первый результат разработки

После согласования: минимальное Electron окно с React и UI Kit; сборка renderer/main/preload; dev-команды и smoke artifact для Windows/macOS. Следующий срез — открыть копию настоящего Casewright repo без изменения файлов, показать дерево и прочитать кейс. Затем безопасная запись, прогоны и Git workflow.

В текущем change все продуктовые задачи остаются незавершёнными. Установка навыков и подготовка ТЗ не означают реализацию приложения.
