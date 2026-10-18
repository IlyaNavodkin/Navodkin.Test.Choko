# Run creation

14 октября 2026. Работа основного агента без субагентов и управления пользовательскими окнами.

Реализована форма создания прогона: название, дата теста, scope и выбранные кейсы текущего workspace. Выбор соответствует порядку catalog/`.order`; доступны только кейсы со stable ID и revision. Прогон ограничен 500 кейсами и 32 MiB snapshot bytes, список показывается порциями по 50. Ошибки удерживают ввод/выбор, cancel ничего не создаёт, незавершённая форма защищена при закрытии окна. Dirty редактор блокирует создание. При stale source нужно отменить форму, обновить catalog и снова выбрать актуальные версии.

`create_run` принимает session, declared workspace и strict `RunCreation`. UUID ресурсов и SHA256 каждого кейса проверяются на IPC/service границе. Backend читает только зарегистрированные case resources, повторно проверяет canonical paths, запрещает повторный resource/stable ID и сверяет версии до подготовки файлов и перед публикацией. Git index и исходные кейсы не изменяются.

Новый `.casewright/runs/YYYY-MM-DD-UUID/` содержит:

- `_run.md`: open status, name, created UTC, test_date, scope, Summary/Notes.
- `NNN-<caseId>.md`: compatible checklist sidecar с frozen texts, case_id/display_id/title и not_run. Для ID, недопустимых в portable filename, используется UUID файла; stable case_id в metadata сохраняется.
- `NNN-<caseId>.source`: побайтная копия полного исходного UTF-8 Markdown, включая unknown YAML/sections, Setup body, nested outline и CRLF.
- `.order`: порядок выбранных sidecars.

`.source` — дополнительный plain-text файл, который Casewright Markdown run loader игнорирует при перечислении sidecars. Ссылка и SHA256 записаны в дополнительных `source_snapshot`/`source_sha256` fields sidecar; существующие прогоны не мигрируют. Полный снимок показывается в раскрываемом readonly блоке. Он читается из прогона, а не из live case; проверяются имя sibling-файла, hash и stable ID. При повреждённом/отсутствующем снимке отображается предупреждение, sidecar/results остаются доступны. Внешний редактор, удаляющий дополнительные metadata fields, может скрыть этот блок; `.source` не удаляется автоматически.

Все файлы сначала пишутся и sync в приватный staging directory. Windows удерживает parent/source directory guards, DELETE-capable handle staging directory и применяет исходные ACL к копиям до записи plaintext. Публикация через handle rename запрещает замену даже пустого существующего каталога; этот edge case покрыт тестом. Тот же no-clobber primitive применён к initialization. Unix использует directory handles/NOFOLLOW и renameat NOREPLACE; macOS build/runtime ещё не проверены. Если `runs/` отсутствовал, при неудачной публикации может остаться его пустой каталог; частичный run folder не публикуется. Full crash recovery остаётся открытым.

Проверки:

- Rust **124/124**, fmt/clippy `--all-targets -D warnings`: успешно. После уточнения portable filenames повторно прошли 3 snapshot tests и clippy.
- Temp Git repositories: order, full raw snapshot/CRLF/unknown fields, nested steps/Setup body, чтение после source edit/move/delete, unchanged index/order, stale/duplicate selection/invalid date, corrupt snapshot warning, late rejection/staging cleanup и collision с пустым каталогом.
- TypeScript и Vitest **49/49**: успешно. Strict creation/date/selection/result contracts, cancel/error/retry, new run selection и unsubmitted-form close guard.
- Headless Chromium production bundle с production Tauri CSP: **22/22**, exit 0, 20.8 секунды. Create/retry, frozen full-case view после изменения live source, empty/stale selection. Ошибок страницы/console и внешних запросов нет; IPC mock расположен только в тестах.
- OpenSpec strict validation **2/2**, UI Kit typecheck: успешно. `casewright-main/` не изменён; MIT notice сохранён.

Скриншоты: [форма создания](browser/create-run-dialog.png), [полный сохранённый снимок](browser/run-source-snapshot.png).

Native GUI создания/просмотра и macOS не проверены. Result/check/note editing, open-close run UI, native E2E и Git workflow остаются впереди. Задачи OpenSpec 4.1/4.2 не объявлены полностью принятыми и change не архивирован.

Windows x64 `tauri build --no-bundle`: успешно, exit 0; optimized Rust build 42.19s. Executable `src-tauri/target/release/testoritto-desktop.exe`, 11809792 bytes, SHA256 `090be2592ea402cac0ce26f34f82af983abf8da38be777b333e24f90c154d456`. Новый executable не запускался. После уточнения наследования test_date и очистки старой selection повторно прошли два новых browser scenarios (2/2, 3.2s); общий 22/22 run зафиксирован выше.

Последняя frontend проверка: 49/49, включая inline error для слишком длинного scope без IPC. Windows executable пересобран после последней UI правки, не запускался.

Следующий срез реализовал result/check/note editing: [Run execution](run-execution.md). Ограничения создания и native приёмки выше сохраняются.
