# Будущее приложение Testoritto

Этот каталог подготовлен для начала разработки; здесь пока нет нового application package и исполняемого кода.
Целевая структура после согласования стека:

```text
apps/desktop/
  main/                  filesystem, Git, watcher, recents, OS integration
  preload/               narrow typed contextBridge API
  renderer/src/
    app/                 root, providers, routing
    repositories/useCases/open-repository/
    cases/useCases/case-editor/
    runs/useCases/run-grid/
    git/useCases/commit-changes/
    shared/ui/           product layout/adapters over @codaa/ui
    shared/i18n/
    shared/infrastructure/desktop/
  contracts/             serializable DTOs and IPC schemas
```

Чистые parsers/domain при необходимости выделяются в `packages/core/`, без React и Electron. Для старта дополнительный monorepo orchestrator не нужен.
Порядок работ и проверок — `openspec/changes/add-testoritto-mvp/tasks.md`.
