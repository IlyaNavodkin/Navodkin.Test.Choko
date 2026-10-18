# Case editor, save и initialization

14 октября 2026. Работа выполнена основным агентом без субагентов и без управления пользовательскими окнами.

Реализован сценарий открытия существующего кейса → редактирование → явное сохранение → просмотр результата. Поля: displayId/title/slug/status/tags, Objective/Systems, Setup и nested Steps, Acceptance Criteria. Stable ID не редактируется. Ошибка записи сохраняет dirty draft. Навигация блокируется до save/discard; внешний файл проверяется через Rust API каждые 2 секунды и не заменяет dirty draft. Discard/reload требует подтверждения. Ctrl/Cmd+S вызывает тот же save. Native close handler предлагает сохранить и выйти/продолжить/выйти без сохранения; при save error окно остаётся открытым, а при ошибке закрытия показывается диагностика; пока save выполняется, выход отключён.

Поиск title/displayId и фильтры status/tag комбинируются; сравнение нечувствительно к регистру с Unicode NFKC. Тег ищется по подстроке. Дерево сохраняет порядок и цепочку родительских папок, открытый reader/draft не сбрасывается. Смена repo/workspace сбрасывает фильтры. [Скриншот фильтров](browser/case-filters.png).

`initialize_repository` вызывается только после подтверждения списка создаваемых файлов. Config v1 объявляет корень workspace; создаются `.casewright/config.yaml`, `.casewright/.gitignore` и `.casewright/runs/.gitkeep`. Существующая `.casewright` не перезаписывается, даже если её config отсутствует; показывается диагностика. Сохранение и инициализация не выполняют commit/push и не меняют Git index.

Подтверждённые проверки на Windows x64, Rust 1.98.1, VS18 x64 Developer Environment:

- Rust: **116/116**, включая сохранение/reopen с unknown content и CRLF, immutable ID, foreign staged index, stale revision, read-only target, конкурирующие saves, отказ перед публикацией/очистку temp, защиту directory handle и protected DACL, явную initialization и отказ перезаписать unknown metadata.
- `cargo fmt --check` и clippy `--all-targets -D warnings`: успешно.
- Vitest: **40/40**, включая validation, dirty/error/retry, external edit/discard, Ctrl/Cmd+S и blocked close при pending save, save-and-exit failure/retry и поиск/status/tag filters.
- TypeScript приложения/browser tests, UI Kit typecheck и OpenSpec strict validation (2/2): успешно.
- Headless Chromium на production bundle: **15/15**, CLI exit 0, 13.3 секунды; все страницы получают production Tauri CSP. Проверены edit/save failure/retry и external draft/reload, initialization cancel/confirm и совместные фильтры с сохранением текущего reader. Ошибок страницы/console и внешних запросов нет.

Rust-тесты записывают только свои временные Git repositories. Для directory guards предков Temp выполнен запуск за пределами filesystem sandbox; реальные пользовательские repos/AppData не использовались. Browser tests подменяют IPC только внутри Playwright, production mock mode отсутствует.

[Сохранённый кейс](browser/saved-case.png). Win32 security wrapper использует owned handles и официальные [GetSecurityInfo](https://learn.microsoft.com/en-us/windows/win32/api/aclapi/nf-aclapi-getsecurityinfo)/[CreateFileW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew). Temporary file получает owner/group/DACL исходника при создании, до записи содержимого; ошибка получения или применения security descriptor отменяет публикацию.

Ограничения: полный native UI picker/edit/save/close workflow и macOS build/runtime не проверены. Polling выбранного файла не является backend watcher всего repo; multi-resource write queue/flush и crash recovery ещё не реализованы. Создание/дублирование/move/delete кейсов добавлены следующим срезом: [case operations](case-operations.md). CRUD папок, запись прогонов и Git workflow остаются впереди. Задачи OpenSpec 2.3, 3.1 и 3.2 не отмечены выполненными целиком.
