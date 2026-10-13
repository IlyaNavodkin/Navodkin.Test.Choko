# ADR-0001: Tauri 2 + React для Testoritto

Статус: **основа выбрана пользователем**. Дата: 2026-10-13. Детали MVP остаются для обсуждения.

## Context

Пользователь выбрал Tauri 2 как основу. React, Windows/macOS, Git workflow, совместимость Casewright и предоставленный UI Kit обязательны. Исходник использует NW.js и Node.js fs/simple-git; эти runtime-сервисы требуют новой Rust реализации.

## Decision

**Tauri 2 + React 19 + TypeScript strict + Vite**, нативная часть — **Rust**. Packaging — Tauri CLI/bundler. Rust-сервис запускает системный Git CLI с credentials ОС. Данные — совместимые Markdown/YAML файлы.

| Часть | Решение | Назначение |
| --- | --- | --- |
| Desktop | Tauri 2 | Выбранная пользователем основа, OS WebView |
| Frontend | React 19 + TypeScript strict + Vite | UI Kit и frontend patterns |
| Native backend | Rust, Tauri commands/events | Repo sessions, IO, watcher, Git, OS APIs |
| UI/styles | @codaa/ui + CSS Modules + Citadelic tokens | Существующий пользовательский дизайн |
| Async/UI state | TanStack Query / Zustand | Repo snapshots через IPC / интерфейс |
| Formats/validation | Rust parser/serializer + serde DTO, Zod во frontend | Совместимость и проверка IPC на обеих сторонах |
| Git | Системный Git CLI из Rust | Credential helper/SSH, явные аргументы |
| Tests | cargo test/fmt/clippy, Vitest, WebdriverIO Tauri service | Backend, frontend и native smoke |
| Build | pnpm + Cargo + Tauri bundler | pnpm-lock.yaml и Cargo.lock |
| Specs | OpenSpec 1.14.1 + 12 skills | Установлено в preparation workspace |

Node.js нужен для frontend build/dev tools; в приложении не используется Node-sidecar. Rust Git service исполняет конкретные операции, не даёт WebView arbitrary shell API. Git2/libgit2 не выбирается на старте: системный CLI сохраняет существующую credential/helper модель.

## Alternatives

| Вариант | Trade-off |
| --- | --- |
| NW.js | Ближе к исходнику, но не соответствует выбранной основе |
| Electron | Node services переносились бы проще; общий Chromium runtime не выбран пользователем |
| Tauri 2 — выбран | Rust rewrite и два WebView для проверки; Node runtime в distribution не требуется |
| Tauri + Node-sidecar | Упростил бы reuse, но добавляет второй runtime, процессы и platform packaging; в план не входит |

## Consequences

- Rust переписывает Node-dependent fs/Git/window services и format parsers. Upstream fixtures/тестовые ожидания служат контрактом совместимости; browser-safe TS helpers можно переносить отдельно.
- Frontend обращается к Rust через typed invoke facade и команды. DTO типизированы с обеих сторон, payload/results проверяются runtime; TypeScript generic invoke не заменяет проверку.
- Custom commands явно ограничиваются AppManifest/permissions и capabilities для конкретного окна. Repo session, canonical paths и допустимые аргументы проверяются в handlers.
- На Windows используется WebView2, на macOS — WKWebView; нужны native UI/smoke проверки обеих платформ.
- Build tools: Node/pnpm, Rust, Microsoft C++ Build Tools/WebView2 на Windows, Xcode tooling на macOS. Конкретные версии и OS baseline фиксируются при создании application package.
- Native E2E: WebdriverIO Tauri service с embedded driver для обеих ОС; его test-only plugins не включаются в release. Прямой tauri-driver сам по себе не обеспечивает macOS E2E.
- Tauri build/bundle, signing и notarization заменяют прежний план desktop packaging. Application code/toolchains в текущем шаге не устанавливались.

## Primary sources

- [Tauri Vite configuration](https://v2.tauri.app/start/frontend/vite/)
- [Tauri Rust commands](https://v2.tauri.app/develop/calling-rust/)
- [Tauri capabilities and custom commands](https://v2.tauri.app/security/capabilities/)
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Tauri WebDriver testing](https://v2.tauri.app/develop/tests/webdriver/)
- [Windows installers](https://v2.tauri.app/distribute/windows-installer/) и [macOS DMG](https://v2.tauri.app/distribute/dmg/)
- Локальный reference: `casewright-main/apps/desktop/src/services/`, `src/lib/node.ts`, `src/lib/nwjs.ts`.
