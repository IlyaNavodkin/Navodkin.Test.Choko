# ADR-0001: React + Electron для Testoritto

Статус: **предложено для обсуждения**. Дата: 2026-10-13.

## Context

React задан пользователем. Нужны Windows/macOS, Git workflow и совместимость с Casewright. В исходнике — NW.js + React 19 + TypeScript + Node.js fs/simple-git; UI Kit пользователя — отдельная React библиотека CSS Modules.

## Decision

Рекомендуется **Electron + React 19 + TypeScript strict + Vite/electron-vite**. Packaging — electron-builder. Git CLI через simple-git, credentials ОС. Данные остаются обычными файлами, без backend/SQLite как основного хранилища.

| Часть | Предложение | Причина |
| --- | --- | --- |
| Desktop | Electron | Повторное использование Node-сервисов, единый Chromium renderer |
| UI | React 19 + TypeScript strict | Требование пользователя и совместимость UI Kit |
| Build/dev | electron-vite | Отдельные main/preload/renderer bundles |
| Layout/styles | @codaa/ui + CSS Modules + Citadelic tokens | Пользовательский дизайн без второго UI Kit |
| Async repo state | TanStack Query | Загрузка/инвалидация через IPC, без дублирования данных в Zustand |
| UI state | Zustand | Selection, panels, filters и preferences |
| Formats/validation | Zod + Node parsers после аудита | Проверка файлов и IPC, сохранение совместимости |
| Git | simple-git + системный Git | Существующий код и credential helper/SSH |
| Test | Vitest + temp Git repos + Playwright Electron smoke/E2E | Formats, services и реальные окна приложения |
| Workspace | pnpm | Локальный UI workspace, фиксированный lockfile |
| Specs | OpenSpec 1.14.1 + 12 skills | Установлено и воспроизводимо |

## Alternatives

| Вариант | Преимущества | Стоимость для этого проекта |
| --- | --- | --- |
| Сохранить NW.js | Самый быстрый прямой fork, минимум перемещения кода | Текущий renderer имеет Node-доступ; macOS packaging отсутствует в исходном pipeline; потребуется отдельно перестроить привилегии и updater |
| Electron — рекомендация | Node reuse, main/preload isolation, packaging обеих ОС | Перенос fs/Git из renderer, новый window/updater adapter; размер Chromium runtime |
| Tauri 2 + React | Системный WebView, потенциально меньший distribution | Node-сервисы нужно переписывать или вводить sidecar; Rust/native toolchain; разные WebView для тестирования |

Tauri технически подходит React-приложению, но экономия размера не оправдывает переписывание существующего Node.js/Git слоя на старте. Это инженерный вывод по изученному исходнику, а не общий рейтинг технологий.

## Consequences

- Форматные parsers/serializers и тесты можно переносить выборочно; `lib/node.ts` NW.js bridge переносить нельзя.
- fs, watcher, git, recents и OS APIs реализуются в main; renderer имеет узкий API.
- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`; preload не выдаёт ipcRenderer/require наружу.
- Изучить сохранение неизвестного контента до разрешения записи. Совместимость — не переименование `.casewright/`.
- Windows и macOS собираются на своих native runners. Публичный macOS release требует отдельного signing/notarization этапа.
- Версии Electron/Vite/builders фиксировать в application lockfile после согласования стека. Наличие будущих версий в этом ADR не означает их установку или проверку.

## Primary sources

- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [electron-vite guide](https://electron-vite.org/guide/)
- [electron-builder architecture and multi-arch](https://www.electron.build/docs/architecture/)
- [electron-builder v26 macOS](https://www.electron.build/v26/docs/mac/)
- [Tauri frontend configuration](https://tauri.app/start/frontend/)
- Локальный исходник: `casewright-main/apps/desktop/src/services/`, `src/lib/node.ts`, `src/lib/nwjs.ts`, `apps/desktop/package.json`.
