# Tasks

Уточнение 2026-10-17: выполненный browser-срез пока поддерживает только term/abbreviation/document. Тип environment и argument references ниже ещё не реализованы.

## 0. Environment entries extension

- [ ] 0.1 Добавить тип «Окружение» и typed values/key editor, validation/unique keys/limits/archive; проверить сохранение старых типов, absence secrets и совместимые round-trip/native schema version guards.
- [ ] 0.2 Подключить entryId/key picker к аргументам `add-playwright-automation`, immutable entry revisions/resolved snapshots; проверить изменение/архивирование/удалённый источник, isolation repos и отсутствие изменения исторических результатов.

## 1. UX prototype

- [x] 1.1 Реализовать изолированный in-memory каталог с типами, поиском по title/aliases/description, фильтрами и empty state; создать/изменить запись с валидацией и неизменяемым ID. Проверить TypeScript и поведенческие Vitest.
- [x] 1.2 Добавить archive/restore и save/discard/cancel guards для выбора записи/create/navigation/repo/close; изолировать сохранённые данные разных demo repo, поддержать readonly и failed save без потери draft. Проверить Vitest и headless Chromium, desktop/760 px, отсутствие внешних запросов и pageerrors.

Перед native-срезом выполняется уточнённый пользователем UX-срез:

- [x] 1.3 Добавить в UX preview чтение кейса по умолчанию, явное редактирование, безопасный Markdown render, inline glossary references → карточка → переход в справочник с guards; вставку записи в позицию курсора rich/source/step, поиск и запрет новых archived refs. Проверить no-op/dirty/history, missing refs, безопасность, repo scope, frontend tests и headless Chromium 760/1440. Это не закрывает native задачу 3.1.

## 2. Native format and storage

- [ ] 2.1 Реализовать versioned Markdown parser/patch writer отдельного расширения, LF/CRLF/unknown round-trip/unsupported diagnostics, stable file ID и path policy. Проверить Rust parity/temp-repo tests; обновить DATA-COMPATIBILITY и SOURCE-AUDIT.
- [ ] 2.2 Реализовать Rust service + strict IPC contracts/capabilities, session/canonical/revision/FIFO/watcher checks; открыть без writes, explicit save/atomic replace/archive. Проверить fmt/clippy/test, stale/symlink/traversal/read-only/failure fixtures.
- [ ] 2.3 Подключить product каталог через typed facade/TanStack Query, сохранить guards/errors/loading; проверить browser с IPC fixture и native Windows x64/macOS arm64 отдельно.

## 3. References and snapshots

- [ ] 3.1 Реализовать безопасную вставку Markdown-ссылки, карточку и usage index по link nodes; unresolved/archive diagnostics, исключить code blocks; preserve no-op и пересчитать ссылки при move. Проверить fixtures на nested workspace paths и round-trip, без чтения вне repo.
- [ ] 3.2 Создавать glossary snapshot/manifest вместе с run, показывать историческое пояснение, диагностировать missing refs до создания. Проверить изменение/архив/перенос исходной записи после создания run и rollback при failed snapshot.
- [ ] 3.3 Расширить scoped Git только подтверждёнными glossary/snapshot файлами; проверить сохранение foreign staged entries, независимые save/commit/push и конфликты с abort без resolution UI.

## 4. Verification

- [ ] 4.1 Выполнить spec:validate/check:ui, подходящие frontend/Rust/browser checks и native acceptance на обоих targets; записать evidence и оставшиеся ограничения. Не архивировать change до завершения native scope.
