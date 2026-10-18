# Пакет для обсуждения Testoritto

**Текущий результат, 16 октября 2026:** собрана Windows x64 версия 0.1.0 с EXE и NSIS для приёмки. Реализованы редактор и операции кейсов/папок, snapshot-прогоны и результаты, Git status/diff/commit/pull/push/abort, очередь и watcher. [Инструкция приёмки](../apps/desktop/ACCEPTANCE.md), [артефакты и проверки](../apps/desktop/evidence/windows-acceptance.md). Установка/native UI этой сборки, macOS, native E2E и large-fixture performance пока не подтверждены. Следующие разделы сохраняют историю обсуждения и срезов; они не заменяют текущий evidence.

Подготовлен 13 октября 2026. Репозиторий: https://github.com/IlyaNavodkin/Navodkin.Testoritto (private).

## Что уже определено

- Tauri 2 как основа, React, targets Windows x64 и macOS arm64.
- Работа и совместная работа через Git.
- Совместимость с существующими репозиториями Casewright.
- UI Kit из `D:/repo/testoritto/ui`, цветовые токены Citadelic.
- OpenSpec и предоставленный React/TS навык установлены в проект.

## Выбранная основа

**Tauri 2 + React 19 + TypeScript strict + Vite**, Rust backend для файлов и системного Git CLI, локальные Markdown/YAML файлы без собственного сервера. CSS Modules и `@codaa/ui`. Прогоны — совместимые Markdown folders текущей версии Casewright.

Tauri 2 выбран пользователем 2026-10-13. Пользователь разрешил начать независимый desktop-каркас; реализация не завершена, а остальной MVP scope остаётся частично draft. Node.js fs/Git/window services исходника переписываются в Rust, без Node-sidecar. Формат данных и fixtures сохраняются; UI обращается к backend через типизированные Tauri commands.

## Читать в таком порядке

1. [DISCUSSION.md](DISCUSSION.md) — подтверждённые решения и открытые вопросы scope.
2. [PRD.md](PRD.md) — продуктовые сценарии, scope и приёмка.
3. [ADR: стек](adr/0001-desktop-stack.md) — Electron/NW.js/Tauri и trade-offs.
4. [SOURCE-AUDIT.md](SOURCE-AUDIT.md) — что есть в коде и что следует переносить.
5. [DATA-COMPATIBILITY.md](DATA-COMPATIBILITY.md) — фактический формат и защита данных.
6. [ARCHITECTURE.md](ARCHITECTURE.md), [UI-KIT.md](UI-KIT.md), [BUILD-AND-RELEASE.md](BUILD-AND-RELEASE.md).
7. [OpenSpec proposal](../openspec/changes/add-testoritto-mvp/proposal.md), [design](../openspec/changes/add-testoritto-mvp/design.md), [tasks](../openspec/changes/add-testoritto-mvp/tasks.md).

## Первый результат разработки

Разрешённый первый срез: минимальное Tauri 2 окно с React и UI Kit; Vite frontend и Rust src-tauri; dev-команды и smoke artifact для Windows x64/macOS arm64. Каркас и сквозной runtime-diagnostics сценарий созданы. Frontend typecheck/tests/build, `check:ui` и `spec:validate` проходят; browser preview проверен в реальном браузере, включая unsupported-native состояние. На Windows x64 прошли Rust check/clippy/test/fmt и production `tauri build --no-bundle`; native окно подтвердило IPC diagnostics `0.1.0 / Windows / x64`. Evidence и ограничения: [Windows foundation](../apps/desktop/evidence/windows-foundation.md). macOS arm64 build/window, installers и продуктовые repo workflows не проверены.

Rust-форматы config/order/folder notes/cases/Markdown runs реализованы и проверены отдельно в памяти: 54 Rust-теста, fmt и clippy проходят. Сохранены MIT notice и upstream fixture provenance. Результаты и ограничения: [Rust formats](../apps/desktop/evidence/formats.md).

В `apps/desktop` теперь есть UI для выбора Git repository через native folder picker, списка и открытия недавних, восстановления последней доступной workspace, дерева кейсов, чтения case/folder notes и просмотра run details/sidecar. Переключение области применяется локально сразу, а сохранение предпочтения — best-effort; ошибка истории не блокирует picker. Headless Chromium сценарии проверяют frontend с тестовой подменой Tauri IPC; это не подтверждение native picker/app-data и реального доступа к repository-файлам. Native Windows foundation/runtime diagnostics проверены ранее, но полный native repository flow, macOS arm64 build/window, installers и Git workflows остаются непроверенными/не реализованы; запись кейсов описана ниже. Подробности: [desktop README](../apps/desktop/README.md), [browser evidence](../apps/desktop/evidence/browser.md). `casewright-main/` — исходный snapshot; использовать его для анализа форматов, не инициализировать как data repo.

Продуктовая приёмка текущего change остаётся незавершённой. Разрешение начать каркас не означает, что реализация выполнена или оставшийся MVP scope согласован.

Дополнительно реализованы редактор существующих кейсов с явным сохранением и подтверждаемая инициализация нового `.casewright`. Rust-тесты используют настоящие временные Git repositories; браузерные edit/save/initialize сценарии — тестовый IPC. Native окно новых сценариев и macOS не проверялись. Проверки, API и оставшиеся ограничения: [editor evidence](../apps/desktop/evidence/editor.md).

Добавлены создание/дублирование/перемещение/подтверждаемое удаление кейсов; подробнее [case operations evidence](../apps/desktop/evidence/case-operations.md). Native UI этих операций и macOS остаются непроверенными; задача 3.2 целиком не завершена.

Создание snapshot runs с выбором кейсов, порядком, полным source Markdown и просмотром снимка реализовано. Rust temp-repo checks и browser mock scenarios подтверждены; native GUI/macOS и запись результатов впереди: [run creation evidence](../apps/desktop/evidence/run-creation.md).

## Run execution update

Реализованы явное сохранение результатов, per-item отметок и пояснений, tester/time/date override и Notes sidecar, а также open/closed, Summary/Notes самого прогона с сохранением approvals/date/unknown metadata. Запись использует optimistic SHA256 и atomic replacement. Черновик удерживается при ошибке/внешнем изменении. Проверки и ограничения: [Run execution](../apps/desktop/evidence/run-execution.md). Native UI и macOS не объявлены проверенными.

## Run workflow update

Добавлены таблица результатов с pagination/search/filter и пошаговое выполнение snapshot-кейсов. Failed save удерживает draft; переход к следующему pending кейсу выполняется только после успешной записи. Проверки и сценарий: [Run grid and guide](../apps/desktop/evidence/run-workflow.md). Native приёмка новых режимов остаётся открытой.

## Git inspection update

Добавлены readonly Git status/branch/upstream/ahead-behind и выбранный staged/unstaged diff через scoped typed IPC. Просмотр не изменяет index/историю; добавлен явный commit выбранных сохранённых продуктовых файлов с сохранением foreign staged entries и отдельным подтверждением. Pull/push/abort ещё не реализованы. Проверки, лимиты и setup: [Git inspection](../apps/desktop/evidence/git-inspection.md). Native приёмка новых сценариев остаётся открытой.

## Git synchronization update

Добавлены подтверждаемые pull/push текущей настроенной ветки и явный safe abort app-owned merge. Конфликты показываются без UI разрешения; внешние правки или отказ abort блокируют продолжение. Проверки, ограничения Git configuration и native приёмки: [Git synchronization](../apps/desktop/evidence/git-sync.md).
