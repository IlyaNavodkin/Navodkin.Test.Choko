# Будущее приложение Testoritto на Tauri 2

Основа Tauri 2 выбрана пользователем. Здесь пока нет application package и исполняемого кода. Целевая структура:

```text
apps/desktop/
  src/
    app/                            root, providers, routing
    repositories/useCases/open-repository/
    cases/useCases/case-editor/
    runs/useCases/run-grid/
    git/useCases/commit-changes/
    shared/ui/                      @codaa/ui layout/adapters
    shared/i18n/
    shared/infrastructure/tauri/     typed invoke/events facade
    shared/contracts/               TS DTO/runtime schemas
  src-tauri/
    Cargo.toml
    Cargo.lock
    tauri.conf.json
    build.rs                        AppManifest command declarations
    capabilities/                   window-scoped permissions
    permissions/                    application command permissions
    src/
      commands/                     validated IPC entry points
      domain/                       formats, serde DTOs, business rules
      services/                     fs, watcher, Git, recents
```

Rust parsers/domain допускают выделение в crate только при необходимости; на старте достаточно модулей native backend. Node-dependent services Casewright переписываются в Rust по fixtures; browser-safe TypeScript helpers можно переносить отдельно.
Node.js — frontend development/build tooling, без Node-sidecar в distribution. Порядок работ — `openspec/changes/add-testoritto-mvp/tasks.md`.
