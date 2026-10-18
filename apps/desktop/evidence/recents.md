# Recents: backend и IPC

Проверено основным агентом 14 октября 2026 на Windows x64, Rust 1.98.1 в VS18 x64 Developer Environment.

- `cargo test --locked --offline`: 99/99.
- `cargo clippy --locked --offline --all-targets -- -D warnings`: успешно.
- `cargo fmt --all -- --check`: успешно.
- `pnpm desktop:frontend:typecheck`: успешно.
- `pnpm desktop:frontend:test`: 21/21.
- `git diff --check`: успешно.

Хранилище JSON v1 ограничено 20 записями и 64 KiB. Чтение отсутствующей истории не создаёт файлы. Повреждённая история не перезаписывается; запись использует временный файл в app data и атомарную публикацию. Публичные DTO содержат UUID, имя и Unix milliseconds, без абсолютного пути.

Команды `list_recent_repositories` и `open_recent_repository` ограничены главным окном, origin и protocol v1. Открытие по ID повторно проверяет репозиторий через repository service. Отмена picker не пишет историю; отказ записи истории возвращает предупреждение и сохраняет успешное открытие. Temp-repository проверки сравнивают hashes содержимого, config и Git index/config. Реальный пользовательский app data в тестах не используется.

В следующем backend increment добавлено поле `lastWorkspacePath` для JSON v1. Старые записи без поля читаются без записи/миграции; путь хранится только как нормализованный declared relative path. `remember_workspace` проверяет UUID/session, точное членство среди загруженных declared workspaces и повторно разрешает каталог внутри `RepoRoot`, затем обновляет уже существующую запись. Перед записью проверяется, что app-data находится вне repo; чтение истории каталог не создаёт и не записывает. При открытии возвращается только сохранённый path, который заново подтверждён среди доступных DTO; для удалённой области используется первая оставшаяся доступная, а history при чтении не переписывается. Пустая строка `""` обозначает root workspace и отличается от `null`.

Проверено субагентом 14 октября 2026 после этого increment в VS18 x64 Developer Environment:

- `cargo fmt --all`: успешно.
- `cargo test --locked --offline`: 106/106.
- `cargo clippy --locked --offline --all-targets -- -D warnings`: успешно.
- `pnpm desktop:frontend:typecheck`: успешно.
- `pnpm desktop:frontend:test`: 22/22.
- `pnpm check:ui`: успешно.
- `pnpm spec:validate`: 2/2 changes.

Проверки охватывают reopen с сохранённой workspace, удалённую объявленную область и удалённую директорию в кэшированной session, fallback без переписывания preference, root `""`, старую JSON v1 форму без поля и отказ от malformed path без перезаписи. TS контракт допускает отсутствие поля в старом DTO и различает его с null/пустой строкой.

UI подключает список/открытие недавних и сохранение workspace; headless сценарии проверяют typed IPC mock, ошибки истории и best-effort повтор сохранения. Они не проверяют работающий native app-data store или native picker. Если config меняется в уже открытой session, service использует загруженный workspace DTO; повторное открытие после закрытия перечитывает config. Unix symlink-тест хранилища не запускался на Windows. Проверки app-data пути не являются полноценной защитой от конкурентной подмены файлов внешним процессом и не предназначены для будущего writer пользовательских кейсов. Задача OpenSpec 2.3 остаётся незавершённой.

Независимая основная проверка после UI-среза: Rust 106/106 tests, `cargo fmt --check` и clippy прошли; Vitest 30/30; headless browser E2E 12/12 за 6,6 секунды; TypeScript, `check:ui` и `spec:validate` (2/2) прошли. `git diff --check` чистый. Native app-data/picker сценарий по-прежнему отдельно не проверен.
