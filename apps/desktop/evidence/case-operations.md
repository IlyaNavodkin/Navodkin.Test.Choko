# Case operations

14 октября 2026. Основной агент, без субагентов и управления пользовательскими окнами.

Реализованы создание, дублирование, перемещение и подтверждаемое удаление кейсов. Формы на `@codaa/ui`, RU/EN, strict Zod contracts; ошибки сохраняют форму/selection. Dirty редактор блокирует операции. Закрытие окна с открытой формой требует явного выбора, выполняющаяся операция блокирует выход. Snapshot revision фиксируется при открытии диалога и не обновляется незаметно для пользователя после external polling.

`create_case` принимает session и strict `CaseCreation`: declared workspace, opaque parent folder resource или workspace root, title, optional opaque source + SHA256 revision. Backend назначает UUID stable ID/имя `.md`, наследует ближайший folder/workspace displayId prefix и увеличивает номер по полному bounded catalog. При ошибках чтения/лимите не назначает потенциально конфликтный displayId. Копия сохраняет source-backed YAML/Markdown, неизвестные поля/секции, nested Steps и CRLF; меняются ID, displayId и выбранное название. Исходник не переписывается.

`organize_case` принимает opaque case resource, declared workspace, expected revision и strict action `move` с opaque destination folder/root либо `delete`. Перемещение внутри workspace сохраняет имя файла, ID и все байты; существующий target никогда не заменяется. Удаление требует подтверждения конкретного repo-relative файла в UI. После изменения старые resource IDs недействительны; frontend перечитывает catalog и открывает созданный/перемещённый кейс либо очищает selection после удаления.

Windows использует directory guards и операции по открытому file handle с DELETE access, отказом от WRITE/DELETE sharing и OPEN_REPARSE_POINT. [SetFileInformationByHandle](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfileinformationbyhandle) с [FILE_RENAME_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_rename_info) запрещает замену target; disposition удаляет именно открытый файл. Новый/скопированный файл публикуется через temp+sync+no-clobber; права копии применяются при создании temp. Unix code использует NOFOLLOW/openat/renameat NOREPLACE/unlinkat по directory handles; его macOS build/runtime ещё не проверены.

`.order`, folder notes и run snapshots сохраняются побайтно. Совместимый loader Casewright (`services/repo-load.ts`) пропускает отсутствующие `.order` keys и добавляет неуказанные файлы после упорядоченных элементов. Новые/перемещённые кейсы используют это правило; UI ручного reorder и автоматическое переписывание `.order` не добавлены. Все операции оставляют Git index без изменений и не выполняют commit/push.

Проверки:

- Rust **121/121**, fmt и clippy `--all-targets -D warnings`: успешно. Реальные temp Git repositories: unique IDs/inherited sequence, unknown fields/CRLF/nested Steps, exact move/reopen, explicit delete, no-clobber, stale revision, read-only refusal, unchanged index/order/notes/snapshots.
- Frontend Vitest **46/46**, app/browser TypeScript: успешно. Cancel/error/retry, новая selection, dirty blocks, unsubmitted-form close guard и strict IPC schemas.
- Headless Chromium production bundle + production Tauri CSP: **20/20**, exit 0, 23.9 секунды. Create/duplicate/move/delete, cancel/failure/retry и external change после открытия delete dialog; page/console errors и внешних запросов нет. IPC подменён только в тестах.
- UI Kit typecheck и OpenSpec strict validation **2/2**: успешно. Snapshot `casewright-main/` не изменён.

Скриншоты: [новый кейс](browser/created-case.png), [копия](browser/duplicated-case.png), [перемещение](browser/move-case-dialog.png), [подтверждение удаления](browser/delete-case-dialog.png).

На дату первого среза полный native UI workflow и macOS не были проверены; последующие срезы описаны ниже и в persistence/watcher/run/Git evidence. Manual ordering UI не входит в обязательный scope. Задача OpenSpec 3.2 не отмечена завершённой: она включает дополнительные сценарии и end-to-end приёмку.

Windows x64 release `tauri build --no-bundle`: успешно, exit 0, optimized Rust build 1m 11s. Artifact: `src-tauri/target/release/testoritto-desktop.exe` (11 558 912 bytes), SHA256: `f25b05a942c0b80d4707a4d5b9ea886dc05713b0adccbc895688de66fbbd8559`. Это подтверждение сборки; новый executable не запускался, native CRUD UI/installer и macOS не проверены.


## Suite creation and case filename rename — 2026-10-15

Добавлены `create_suite` с opaque parent/session и отдельный Rename action `organize_case`. Имена проверяются Rust/Zod как portable single components; файл кейса должен иметь `.md`. Создание использует atomic no-clobber directory publication; existing directory, file или sibling `<name>.md` не захватываются. Кейсу нельзя назначить имя folder note. Unknown Markdown, stable ID, snapshots, `.order`, folder notes и foreign Git index остаются побайтно сохранены.

UI использует Kit dialog с выбором родителя, ошибками, retry и защитой при закрытии/внешнем обновлении. Новая папка выбирается в дереве; переименованный кейс открывается по новому resource ID. Пустая папка не отслеживается Git до появления кейсов; marker/legacy `_suite.md` не вводится.

Проверки основного агента: полный Rust **182/182** (36.74 s); после выделения destination helper повторно organize **4/4** и clippy all-targets `-D warnings` проходят. TypeScript, Vitest **88/88** (13 files, 11.30 s), полный Chromium **40/40** (45.2 s), browser typecheck, UI Kit и OpenSpec **2/2** проходят. Новые UI tests проверяют failed create/retry/reveal folder, unsubmitted close guard, rename cancel/preview/failure/retry и отсутствие saveCase при rename. Screenshots: `browser/create-suite-retry.png`, `browser/rename-case-file.png` просмотрены основным агентом. Логи `.cache/suite-create-rename-{rust-review,rust-fixes,vitest-final,browser-final}.log`.

Native GUI/macOS/installer этим не проверены. Следующий срез suite duplicate/move/rename/delete описан ниже; task 3.2 целиком здесь не отмечается.


## Suite duplicate, move, rename and permanent delete — 2026-10-15

Реализованы strict `prepare_suite_operation` (без записи) и `apply_suite_operation` (одноразовый opaque confirmation, один FIFO ticket). Preview перечисляет каждый подтверждаемый каталог/файл, включая неизвестный binary, `.order`, внутренние notes и внешнюю `<folder>.md`. Apply повторно проверяет scope/config revision, content hashes, identities и target/note collisions. Ограничения: 1000 объектов, 32 MiB всего, 2 MiB на файл, глубина 64; repo-relative original/result/staging path до 1024 UTF-8 bytes до первой мутации. У create_suite и case rename/move тот же result-path предел теперь проверяется до публикации.

Move/rename сохраняют raw bytes и case stable IDs. Duplicate копирует unknown content и notes/order без нормализации, а валидным именно case Markdown назначает новые UUID через lossless CaseDocument::duplicate. Неоднозначный/повреждённый case даёт typed refusal до записи. Другие declared roots, workspace root, `.git`, `.casewright`/runs, symlinks/junctions, special files и descendant destinations не входят в операцию. Git index, исходные snapshots и неизвестное содержимое вне manifest не меняются. Parent `.order` остаётся byte-exact: совместимый loader пропускает отсутствующие старые ключи и добавляет новые entries в конец. Companion note может задавать прежнее display name после переименования; FolderReader показывает реальный path, dialog поясняет сохранение note.

App-owned `.testoritto-suite-<uuid>` содержит bounded diagnostic journal и промежуточное tree/note. Handle/descriptor-relative no-clobber primitives публикуют/переносят directory + sibling note, проверяют identity; cleanup использует ledger только успешно созданных paths/hashes, а не присваивает ownership найденным неизвестным entries. Journal cleanup требует ожидаемого состава и сохраняет/восстанавливает diagnostic journal при отказе. Успех убирает transaction artifacts; новый trash/backup продукт не добавлен.

Удаление окончательное: UI явно подтверждает перечень без корзины. До первого unlink выполняются revalidation и capture handles; предварительная ошибка откатывается только безопасным no-clobber. Далее удаляются только захваченные entries postorder, без remove_dir_all. После частичной I/O ошибки некоторые явно подтверждённые файлы уже могут отсутствовать. Ответ `recoveryRequired` честно перечисляет removed/remaining paths и transaction directory, сохраняет оставшиеся данные/journal и блокирует mutations/Git. Нельзя обещать restore-all после подтверждённого permanent delete. Move/rename/duplicate failure сохраняет original; конфликтующий rollback оставляет recovery для внешней проверки.

При reopen streaming discovery до 20k обычных root entries находит unfinished UUID transactions, не исполняет repo JSON и не удаляет quarantine. Пользователь проверяет данные/journal внешними средствами, восстанавливает нужное и переоткрывает repository; UI recovery manager/automatic rollback не добавлены. Журнал не является резервной копией удалённых файлов. На Windows actual handle guards проверены temp tests; macOS/Unix build/runtime и полноценная изоляция от любых внешних writers не обещаются.

Frontend: typed use-case hook/dialog на Kit, RU/EN и CSS Modules. Read-only preview → отдельное confirmation; Cancel ничего не пишет. Stale/error сохраняет параметры и требует нового preview. Single-flight pending, native-close и watcher deferred guards подключены; успех раскрывает новую folder selection по path. Recovery сообщает отдельно о partial result, показывает exact removed/remaining paths и блокирует editors/Git после refresh/reopen, оставляя picker/close доступным.

Проверки:

- Независимый main native: **196/196** (29.54 s), `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` — green; `.cache/suite-operations-rust-review.log`. Новые temp regressions: nonempty handle delete, directory+note relocate, nested/unknown/order/runs/index preservation, duplicate IDs, stale/collision/cancel, malformed case, actual junction escape, long parent >1024, >1000 ordinary root files, late unknown staging child, new source-note collision, partial unlink and journal-only cleanup failure, dual sticky warnings after refresh.
- `pnpm desktop:frontend:test`: **95/95**, 14 files; contracts, cancel/no apply, stale/new preview/retry, exact recovery paths, validation/single-flight, Page reveal and watcher hold, blocked edits/Git with reopen available.
- `pnpm desktop:frontend:typecheck`, `pnpm desktop:browser:typecheck`, `pnpm check:ui`, `pnpm spec:validate` (**2/2**) — green.

- `pnpm desktop:browser:test`: **42/42** (51.6 s), production bundle + exact Tauri CSP, IPC mock. Дублирование/rename/move/подтверждённый delete и cancel без apply; note display name отличается от basename и сохраняется; reveal проверяется по path. Partial delete сообщает paths, watcher refresh сохраняет блокировку, reopen с **новой sessionB** блокирует запись по native warning, а case остаётся read-only. Ошибок console/page и внешних запросов нет. Лог `.cache/suite-operations-browser.log`. Screenshots `browser/suite-operation-preview.png` и `browser/suite-recovery-required.png` просмотрены основным агентом, overflow не обнаружен.

После этого browser прогона выполнена небольшая UX правка recovery: «Закрыть» вместо «Отмена» и скрытие общего описания переноса. После неё focused `pnpm --filter @testoritto/desktop test tests/suiteOperations.spec.tsx tests/RepositoryBrowserPage.spec.tsx`: **44/44**, 2 files, 11.59 s, `.cache/suite-operations-focused-final.log`. Уточнён selector видимой кнопки «Закрыть», чтобы отличать её от Kit cross с тем же accessible name. Финальный независимый browser прогон выполняет main по frozen исходникам. Native GUI/WebView2/WKWebView, installers и macOS остаются ручной/runner приёмкой. Native release build в этом срезе не запускался. `casewright-main/` не изменялся; реальные пользовательские Git repositories/remote/index не использовались. Task 3.2 не отмечается этим отчётом автоматически.
