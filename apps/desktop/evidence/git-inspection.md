# Git status, diff and explicit commit

15 октября 2026. Срез OpenSpec 5.1. Реализация commit выполнена последовательным субагентом с проверкой основного агента; пользовательские окна не запускались и не управлялись.

## Behavior

Вкладка Git открывается явно после выбора repository. Показываются branch/HEAD, unborn и detached HEAD, upstream, ahead/behind по локальным refs и список staged/unstaged/untracked/renamed/deleted/unmerged файлов. Нет фонового fetch. Фильтр и pagination 25/50/100 меняют только отображение. По выбору файла отдельно показываются staged и working-tree diff; новый UTF-8 файл имеет plain-text preview, двоичный/не-UTF-8 untracked файл — пояснение. Diff рендерится буквальным текстом, без Markdown/HTML execution.

`git_status`/`git_diff` — strict typed IPC с caller/protocol/session/UUID checks, explicit AppManifest и main-window capability permissions. Backend хранит GitChange registry отдельно от case/run resources; renderer передаёт только session/file IDs. Refresh выдаёт новые UUID и инвалидирует старые, close инвалидирует сессию. Перед diff повторно читается status; сохранённый porcelain record включает object IDs, поэтому изменение staged blob даже при прежнем XY отклоняет старую запись. Repo root и пути canonical-проверяются; traversal, Git metadata, escaping symlink/junction и submodule diff не допускаются. При stale/error старый diff не выдаётся за текущий; доступны refresh/retry.

Rust запускает найденный системный Git отдельным процессом, args array и фиксированным cwd, с stdin null, скрытой Windows console и timeout 5s на команду. Унаследованные GIT_* удаляются, затем задаются `GIT_OPTIONAL_LOCKS=0`, `GIT_NO_LAZY_FETCH=1`, `GIT_ALLOW_PROTOCOL=` и `GIT_TERMINAL_PROMPT=0` для локального readonly runner. Ограничения: status/config output 64 KiB, каждая часть diff/новый файл 256 KiB, filter override arguments 16 KiB. При превышении UI показывает диагностическую ошибку.

Status использует porcelain v2, NUL delimiters, branch headers и literal pathspecs. fsmonitor/untracked cache/automatic maintenance отключены на вызов. Имена настроенных clean/smudge/process/required filter keys читаются отдельно и overrides отключают их; diff дополнительно запрещает ext-diff/textconv. При наличии таких фильтров UI явно сообщает, что различия показываются без их преобразований и могут отличаться от обычного Git с этими фильтрами. Submodule commit changes перечисляются, но diff submodule отключён; dirty/untracked содержимое submodules не сканируется. Non-UTF-8 Git paths дают typed ошибку, а не неявную порчу имени.

Просмотр status/diff не изменяет index/HEAD. Явный commit описан ниже; pull/push/abort не реализованы. Конфликтные пути показываются с ошибкой, commit при конфликте блокируется. Источник remote URL/credentials не передаётся в WebView; upstream отображается только как имя refs.

## Setup and usage

1. Системный Git должен быть в абсолютном каталоге PATH вне выбранного repository. Проверенная версия Windows: **2.45.1.windows.1**.
2. Открыть data repo в приложении и перейти во вкладку Git. Для status/diff не нужны настроенные identity или upstream.
3. Выбрать изменённый файл. `Индекс (staged)` сравнивает index с HEAD, `Рабочая копия (unstaged)` — файл с index; новый файл показывается отдельно. Rename показывает исходный и новый путь.
4. После внешней операции или сохранения кейса обновить Git явно. Сводка отражает локальные refs, поэтому сетевую актуальность ahead/behind без fetch не обещает.

## Verification

- Полный Rust suite: **135/135**, 3.87s, clippy all-targets `-D warnings` и fmt успешно. После усиления cache fingerprint повторены Git tests и clippy.
- Пять настоящих temp Git repositories scenarios: unborn/detached/upstream counts; staged + working-tree content одного файла, foreign staged index/HEAD unchanged; Unicode/spaces/literal bracket paths, rename/delete/binary untracked; external clean/process/fsmonitor/diff/textconv sentinels не исполняются; old IDs/session invalidation, stale state, oversized file, traversal и зарегистрированный путь с parent junction за пределы root; conflict read сохраняет index и MERGE_HEAD. Commit/checkout/merge/add в fixtures выполняются только тестами в собственных temp directories.
- Frontend/browser strict TypeScript и Vitest **62/62**, 9.70s. Payload запрещает path injection и требует UUID; oversized/malformed DTO отклоняются; UI читает Git только по запросу, очищает selected diff после refresh.
- Headless Chromium full **32/32**, 36.0s с production Tauri CSP: status error/retry, staged/working-tree preview, literal `<script>` без исполнения, unborn/detached/conflict/filter warnings, bounded-output error/retry, refresh invalidation. Нет console/page errors или внешних browser requests; IPC mock остаётся только в тестах. После финальных UI уточнений повторены Git scenarios **3/3**, 3.2s.
- UI Kit typecheck и OpenSpec strict validation **2/2** успешно; Casewright snapshot не изменён, whitespace check прошёл.

Screenshots: [status/diff](browser/git-status-diff.png), [conflict/detached](browser/git-conflict-state.png). Осмотрены визуально.

## Limits and next work

Native UI status/diff и macOS arm64 не проверены. Missing promisor objects в partial clone отдельно не протестированы. Git errors не раскрывают stderr или абсолютные local paths. Просмотр ограничен локальными состояниями; shared runner для будущих сетевых/записывающих операций потребует отдельной политики environment, helpers, hooks, credentials и timeout.

Общая flush queue перед Git, pull/push с system credentials, safe abort, two-clone remote tests, installers/native E2E остаются впереди. Задачи 5.1/5.2 не отмечены завершёнными; change не архивирован.

## References

[Git porcelain v2](https://git-scm.com/docs/git-status#_porcelain_format_version_2), [diff flags](https://git-scm.com/docs/git-diff), [literal paths, optional locks and no-lazy-fetch](https://git-scm.com/docs/git), [configuration lookup/overrides](https://git-scm.com/docs/git-config).

Windows x64 `tauri build --no-bundle`: exit 0, optimized build 42.50s. Executable `src-tauri/target/release/testoritto-desktop.exe`, 12188672 bytes, SHA256 `d0a896a97f2a4a9c31c14e2ac4b43df441b5b12759dc8a710769de0a82bfb091`. Собран после последних native/UI изменений, не запускался. Финальный focused Git Rust run: 5/5, 2.29s; clippy успешно.


## Explicit commit slice — 15 October 2026

UI предлагает выбрать только `committable` записи native status, ввести сообщение и подтвердить конкретный список файлов. Renderer передаёт `git_commit` только protocol/session, UUID выбранных записей и message (1–200 уникальных файлов; непустой UTF-8 message до 4096 байт). serde deny-unknown-fields, Zod, caller/origin/session checks и отдельные AppManifest/capability permissions действуют на команду. Backend повторно классифицирует paths: `.casewright/config.yaml`, Markdown/`.order` в `.casewright/runs/`, `.order` в объявленных workspaces, корректные case Markdown с ID и folder notes. Generic Markdown без case ID не считается кейсом; большие/нечитаемые непродуктовые файлы остаются доступны в status. Переименование требует продуктового scope обоих путей; оно может отображаться двумя отдельными delete/add записями, которые надо выбрать явно.

Commit сохраняет полные **уже сохранённые рабочие версии** выбранных файлов, включая unstaged часть partially staged файла; это явно написано в UI и подтверждении. Autosave и push отсутствуют. Dirty/pending editor не позволяет перейти к Git. Git draft/confirm/pending блокируют смену вкладки/repo; pending commit также блокирует подтверждение native close. Есть single-flight guard; отмена подтверждения не вызывает native mutation, ошибка сохраняет выбор и message, успешный commit очищает их и обновляет status.

Сервис удерживает native session mutex, проверяет HEAD/branch, status fingerprints, index SHA256 и content SHA256, захватывает `index.lock` через create_new. Реальный index копируется в отдельный `.git/testoritto-index-UUID`; `git add --all -- выбранные существующие paths` и стандартный `git commit --only -- выбранные paths` используют только копию через `GIT_INDEX_FILE`, фиксированный cwd и literal pathspecs. Это не `git add` в пользовательский index. Перед commit проверки повторяются; Git сам проверяет update branch ref. После успеха проверяется parent HEAD, результат index атомарно публикуется через удерживаемый index.lock. Foreign/unselected staged blob/mode/flags сохраняются; bytes всего index после успеха могут измениться. Ошибка до commit удаляет только собственные временные файлы и lock, сохраняя HEAD и исходный index.

Если Git мог успеть создать commit, но дальнейшая диагностика не завершилась, возвращается `GIT_RECOVERY_REQUIRED`, сохраняются index.lock и temporary index, повторный commit в session блокируется. Если HEAD подтверждён, но index publish отказал, возвращается typed `{head,indexPublished:false,recoveryIndex}`; UI сообщает OID и имя сохранённой копии, запрещает повтор. Автоматического reset/rollback HEAD нет. Закройте приложение и проверьте HEAD во внешнем Git; перед восстановлением index сохраните исходный `.git/index`, `.git/index.lock` и названный temporary index. Копия содержит подготовленное состояние index, которое надо сверить с фактическим HEAD; приложение не удаляет recovery artifacts автоматически. Это recovery path, а не заявление об общей crash-safe транзакции HEAD+index.

Поддерживается attached branch с существующим HEAD и обычным index в директории `.git` внутри root. Unborn/detached HEAD, unmerged/merge/rebase/cherry-pick/revert/sequencer/bisect состояния, active commit/reference/index hooks, любой заданный core.hooksPath (включая `false`), signing, split/sparse index и worktreeConfig отклоняются до mutation. `.sample` hooks не мешают. Репозитории с linked worktree/.git indirection writer не поддерживает. Для выбранных файлов external filter attributes запрещены; наличие неиспользуемого глобального LFS filter не блокирует commit. Hooks/signing/активные filters **не обходятся молча**: используйте внешний Git для таких репозиториев. Trust model и полная поддержка остаются будущей работой; это ограничение текущего среза, не изменение целевого MVP.

Для commit настройте системный Git `user.name`/`user.email`; upstream и remote для локального commit не нужны. Ошибки identity имеют отдельный безопасный код. Working-tree/index/refs не должны одновременно изменяться внешними процессами: `index.lock` координирует обычных Git writers, но не устраняет произвольные внешние filesystem TOCTOU races. Git timeout остаётся 5s на команду.

Проверено: полный Rust suite **144/144** и clippy all-targets `-D warnings` в MSVC environment вне ограничений sandbox; fmt успешно. Новые temp-repo сценарии покрывают foreign staged blob/mode/assume-unchanged, unselected staged product, partial staged saved working content, new/delete/rename, stale content/HEAD/index и чужой index.lock, actual unmerged, identity/detached/ongoing operation, hooksPath=false/signing/split/sparse/worktree config/filter sentinel, oversized generic Markdown, fault отказ публикации с recovery OID/artifacts и блокировкой повтора. Sandbox full run дал 129/142 (13 существующих atomic IO tests отказали на ancestor handles); после этого основной агент выполнил полный разрешённый run 144/144. Frontend/API Vitest **66/66** (10.44s), frontend/browser strict typecheck прошёл. Полный headless Chromium **34/34** (39.8s): explicit selection, foreign disabled, подтверждение конкретных paths, cancel без mutation, typed identity failure с сохранением draft, single-flight pending, success refresh, recovery OID и запрет повтора/refresh. Console/page errors и внешние requests проверены afterEach. Логи: `.cache/git-commit-rust-final.log`, `.cache/git-commit-vitest-final.log`, `.cache/git-commit-browser-final.log`. Screenshots [confirmation](browser/git-commit-confirmation.png) и [recovery](browser/git-commit-recovery.png) осмотрены. UI Kit typecheck и strict OpenSpec validation 2/2 успешно. Native окно commit, macOS, installer и full collaborative flow не проверялись. Задача 5.1 целиком не завершена, checkboxes не изменены.

Семантика: [git commit explicit paths/--only](https://git-scm.com/docs/git-commit), [GIT_INDEX_FILE](https://git-scm.com/docs/git), [index flags](https://git-scm.com/docs/git-update-index).

После итогового review основной агент выполнил Windows x64 `tauri build --no-bundle` с финальным frontend, включая whitelist новых IPC ошибок: release compilation успешно за 36.89s. Артефакт `apps/desktop/src-tauri/target/release/testoritto-desktop.exe`, 12 310 528 bytes, SHA256 `f9db2f04611bca6f1a0e5d9fff2e533ae5a5f706e65e91d60e33195ac681056a`; лог `.cache/git-commit-build-final.log`. Окно приложения и установщик не запускались; эта сборка не подтверждает native UI, установку или macOS.
