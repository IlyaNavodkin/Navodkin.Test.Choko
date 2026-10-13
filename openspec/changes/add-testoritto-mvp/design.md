# Design

Tauri 2 как основа выбран пользователем 2026-10-13. Неподтверждённые детали продуктового scope остаются draft; implementation не началась.

## Context

See proposal.md — Why. Casewright 0.16.0 использует NW.js/Node bridge; current data format определяется services/repo-load.ts и format parsers, не устаревшим README.
Выбранный runtime требует Rust реализации Node-dependent IO/Git/formats, сохраняя Casewright fixtures и данные. Kit — @codaa/ui/CSS Modules; tokens Citadelic совпадают по SHA256.

## Goals / Non-Goals

**Goals:** Tauri 2 desktop с React/Vite и Rust services, совместимые Markdown/YAML, узкий typed IPC, native Windows/macOS checks.
**Non-Goals:** Node-sidecar, прямой filesystem/shell API из WebView, собственный backend/DB, автоматическая data migration, inherited upstream updater. Остальной scope — proposal.md/docs/DISCUSSION.md.

## Decisions

1. **Tauri 2 + React 19 + TypeScript strict + Vite**, Rust backend; решение принято пользователем, ADR в docs/adr/0001-desktop-stack.md. Node.js остаётся frontend tooling. Вместо reuse Node runtime переносится контракт поведения/формата, Rust services реализуются заново.
2. React use-case hook → feature API → typed invoke facade → Rust command → service. Rust владеет sessions/picker/IO/watcher/Git. serde DTO и validation; TS types/runtime schemas на frontend. Custom commands ограничиваются AppManifest/permissions/capabilities конкретного окна, handlers проверяют session/path/payload.
3. useCases и typed hooks сохраняют frontend skill. TanStack Query — async repo state через commands, Zustand — UI state, draft — editor hook. HTTP server не требуется.
4. Rust parsers/writers сохраняют .casewright/config.yaml, workspaces, Markdown cases/runs, extras и ordering. Upstream fixtures и независимые expected outputs → Rust parity/round-trip tests до включения writer. No-write open, atomic writes и flush остаются обязательными.
5. Rust Git service запускает системный Git CLI с args array/cwd/timeouts; credential helper/SSH и repo-scoped operation queue. simple-git/git2 не выбраны как runtime. Scoped commits не захватывают чужой index. Dirty-state recovery и conflicts не используют destructive auto-reset.
6. Conflict workflow draft: внешний editor + recheck/abort; structured merge scope согласовать отдельно. Выбор Tauri не требует нового согласования runtime.
7. Tauri CLI/bundler на native Windows/macOS runners: Windows NSIS .exe, macOS .app/.dmg; target architectures остаются draft baseline. Signing/updater — отдельный future change, без private GitHub token в app.
8. cargo test/fmt/clippy + TypeScript/Vitest; native WebdriverIO Tauri service. Embedded driver поддерживает обе ОС; test-only plugins исключены из release. Прямой tauri-driver не заменяет macOS smoke. UI/WebView2/WKWebView и установку проверять отдельно.

## Risks / Trade-offs

- Rewrite вместо Node reuse → ранний Rust read-only slice, parity fixtures и writer preservation tests.
- Разные OS WebView → native UI/smoke на Windows/macOS, не полагаться на Chromium preview.
- Custom commands разрешены app windows по умолчанию → explicit AppManifest permissions/capabilities и handler validation; один plugin ACL недостаточен.
- Upstream extras могут теряться после parse → end-to-end preservation до writer.
- Git hooks/credentials → repo trust model, timeout/error handling, temp-remote tests; capabilities не изолируют исполняемый Git.
- Rust/OS tooling и private signing → закреплённые toolchains и separate internal/public release steps.
- Test-only WebDriver backend → feature-gated test builds, отдельный release smoke без debug access.
- Large repo/watch storms и deprecated Kit animations → измерять реальную нагрузку, отдельные migration tasks без расширения текущего scope.

## Migration Plan

Tauri/Rust/React window и command smoke → Rust formats parity → read-only repo load и hashes → один atomic writer → cases/runs → system Git workflow → native packaging/tests.
Не выполнять migration пользовательских repos при открытии. Rollback: прежний app build и обычная Git history, без автоматического reset/clean.
Продуктовые вопросы фиксируются до зависимых задач; Tauri уже выбран. Все implementation tasks остаются unchecked.

## References

docs/SOURCE-AUDIT.md, docs/DATA-COMPATIBILITY.md, docs/ARCHITECTURE.md, docs/BUILD-AND-RELEASE.md.
[Tauri commands](https://v2.tauri.app/develop/calling-rust/), [capabilities](https://v2.tauri.app/security/capabilities/), [Vite](https://v2.tauri.app/start/frontend/vite/), [prerequisites](https://v2.tauri.app/start/prerequisites/), [distribution](https://v2.tauri.app/distribute/), [native tests](https://v2.tauri.app/develop/tests/webdriver/).
