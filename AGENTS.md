# Testoritto: правила проекта

Общение, ТЗ и решения писать по-русски. Имена API и структурные заголовки OpenSpec — по-английски.

## Контекст и текущий этап

Сначала прочитать `docs/START-HERE.md`, `docs/PRD.md`, `docs/adr/0001-desktop-stack.md` и `openspec/config.yaml`.
Это подготовленный проект: код нового приложения ещё не реализован. `casewright-main/` — неизменённый снимок исходника для анализа и выборочного переноса. Не считать README актуальной спецификацией: формат проверять по коду и тестам.
Подтверждено: Tauri 2, React, Windows/macOS, работа через Git, совместимость с Casewright, локальный UI Kit и токены Citadelic.
Основа Tauri 2 выбрана пользователем. Неподтверждённый объём MVP остаётся draft; выбор runtime не означает начало реализации.

## OpenSpec

Единственный каталог спецификаций — `openspec/`; не создавать второй `spec/`.
Навыки установлены в `.agents/skills/`: explore → propose/new/continue/ff → apply → verify → archive.
Перед значимыми изменениями прочитать proposal, design, specs и tasks соответствующего change.
Новый продуктовый код начинать после согласования scope. Инструкции пользователя имеют приоритет; не требовать повторное согласование уже разрешённой работы.
Не отмечать непроверенные задачи выполненными и не архивировать незавершённые changes.
Валидация: `pnpm spec:validate`; проверка доступного UI Kit: `pnpm check:ui`.
Для обновления полного набора навыков использовать `docs/OPEN-SPEC.md`.

## Фронтенд

Применять `.agents/skills/react-ts-frontend-patterns/SKILL.md` и его references.
Примитивы Testoritto берутся из **`@codaa/ui`**, workspace `ui/`, вместо `@apex/react-apex-ui` в исходном Hub-примере.
Новый UI — React + TypeScript strict, CSS Modules и `--app-*`; не добавлять второй UI Kit или собственную палитру.
Токены `ui/theme/tokens.css` совпадают с Citadelic; источник и SHA256 в `docs/UI-KIT.md`.
Сценарии: `apps/desktop/src/<domain>/useCases/<scenario>/`; хуки рядом, типы `UseXxxArgs` и `UseXxxResult`.
Примеры Hub `admin`, auth, HTTP и request<T> не требуют создавать такие модули в Testoritto.
Транспорт — типизированный Tauri IPC: Page → use-case hook → api facade → invoke wrapper → Rust command → Rust service. Preload/main Electron не создаются.
TanStack Query — данные репозитория через IPC; Zustand — состояние интерфейса; useState — локальное состояние.
Тексты — типизированный i18n, RU по умолчанию, архитектура предусматривает EN.

## Desktop и Git

Основа: Tauri 2 + React/Vite; Rust backend владеет fs/Git, watcher, session и native APIs. WebView без Node.js; Node нужен только для development/build tooling, без Node-sidecar.
IPC должен проверять window/webview, payload и repo session, использовать canonical path-проверки. Явно ограничивать custom commands через AppManifest/permissions/capabilities; plugin permissions не заменяют проверки Rust handlers.
Не переносить NW.js node-remote, общий require, updater автора и release workflow автоматически.
Системный Git CLI запускается Rust-сервисом с массивом аргументов и фиксированным repo cwd; simple-git не входит в runtime. Credentials через системный credential helper/SSH, без PAT в WebView или исходниках.
Save, commit, push, pull — разные действия. Не коммитить все файлы пользовательского репозитория и не выполнять destructive Git-команды без явного действия пользователя.
Совместимость: `.casewright/config.yaml`, workspace paths, Markdown cases и Markdown run folders, `.order` и folder notes.
Не выполнять миграцию при открытии. Не терять неизвестный контент. Незавершённый merge UI не считать готовым движком.
Сохранять MIT notice при переносе кода; источник и ограничения в `docs/SOURCE-AUDIT.md`.

## Качество

Для приложения потребуются TypeScript/Vitest, cargo fmt/clippy/test, Rust round-trip/parity тесты форматов, Git integration tests на temp repositories и desktop E2E на Windows/macOS. Для native E2E — WebdriverIO Tauri service; test-only WebDriver plugins исключать из release. Playwright применять только к browser frontend, не как Electron driver.
Сборки выполнять на соответствующих runners; проверять установку отдельно от компиляции.
Не заявлять о сборке или runtime-проверке приложения, пока они не выполнены. Шаблон `docs/ci/preparation-checks.yml` проверяет подготовку; его активация пока требует GitHub workflow scope.
При работе с Rust читать rust-router и подходящие Rust skills; backend types/errors должны быть сериализуемы и проверены на IPC-границе.
Не создавать дополнительные чаты или агентов без поручения пользователя.
