# Design

Tauri 2 как основа выбрана пользователем 2026-10-13. Пользователь разрешил начать независимый desktop-каркас; реализация ещё не завершена. Clone/branches/stash и UI для расширений остаются вопросами scope.

## Context

See proposal.md — Why. Casewright 0.16.0 использует NW.js/Node bridge; current data format определяется services/repo-load.ts и format parsers, не устаревшим README.
Выбранный runtime требует Rust реализации Node-dependent IO/Git/formats, сохраняя Casewright fixtures и данные. Kit — @codaa/ui/CSS Modules; tokens Citadelic совпадают по SHA256.

## Goals / Non-Goals

**Goals:** Tauri 2 desktop с React/Vite и Rust services, совместимые Markdown/YAML, узкий typed IPC, native checks для Windows x64 и macOS arm64.
**Non-Goals:** Node-sidecar, прямой filesystem/shell API из WebView, собственный backend/DB, автоматическая data migration, inherited upstream updater. Остальной scope — proposal.md/docs/DISCUSSION.md.

## Decisions

1. **Tauri 2 + React 19 + TypeScript strict + Vite**, Rust backend; решение принято пользователем, ADR в docs/adr/0001-desktop-stack.md. Node.js остаётся frontend tooling. Вместо reuse Node runtime переносится контракт поведения/формата, Rust services реализуются заново.
2. React use-case hook → feature API → typed invoke facade → Rust command → service. Rust владеет sessions/picker/IO/watcher/Git. serde DTO и validation; TS types/runtime schemas на frontend. Custom commands ограничиваются AppManifest/permissions/capabilities конкретного окна, handlers проверяют session/path/payload.
3. useCases и typed hooks сохраняют frontend skill. TanStack Query — async repo state через commands, Zustand — UI state, draft — editor hook. HTTP server не требуется.
4. Rust parsers/writers сохраняют .casewright/config.yaml, workspaces, Markdown cases/runs, extras и ordering. Upstream fixtures и независимые expected outputs → Rust parity/round-trip tests до включения writer. No-write open, atomic writes и flush остаются обязательными.
5. Rust Git service запускает системный Git CLI с args array/cwd/timeouts; credential helper/SSH и repo-scoped operation queue. simple-git/git2 не выбраны как runtime. Scoped commits не захватывают чужой index. Dirty-state recovery и conflicts не используют destructive auto-reset.
6. При Git conflict показывать ошибку и unmerged paths; единственное действие приложения — безопасный abort текущей операции. Не предоставлять встроенное разрешение или отдельный flow внешнего editor/recheck. Если abort не удаётся, блокировать продолжение и показывать диагностику; не обещать безусловное сохранение состояния Git. Запрещены автоматические reset/clean/force.
7. Tauri CLI/bundler на native Windows x64 и macOS arm64 runners: Windows NSIS .exe, macOS .app/.dmg. Минимальные версии ОС остаются открытыми. Signing/updater — отдельный future change, без private GitHub token в app.
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
Открытые вопросы scope фиксируются до зависимых задач; Tauri и targets уже выбраны. Проверены Windows desktop-каркас и pure Rust форматы по upstream fixtures. Фактический прогресс и оставшиеся проверки отражены в tasks.md; filesystem/session и продуктовые UI-сценарии ещё не завершены.

## References

docs/SOURCE-AUDIT.md, docs/DATA-COMPATIBILITY.md, docs/ARCHITECTURE.md, docs/BUILD-AND-RELEASE.md.
[Tauri commands](https://v2.tauri.app/develop/calling-rust/), [capabilities](https://v2.tauri.app/security/capabilities/), [Vite](https://v2.tauri.app/start/frontend/vite/), [prerequisites](https://v2.tauri.app/start/prerequisites/), [distribution](https://v2.tauri.app/distribute/), [native tests](https://v2.tauri.app/develop/tests/webdriver/).

## Current implementation boundary — scoped commit

В текущем срезе 5.1 реализован только явный commit сохранённых выбранных продуктовых files: native status UUID → повторная scope/HEAD/status/content/index проверка → temporary index под реальным index.lock → стандартный git commit --only → публикация index. Foreign staged entries сохраняются. Неизвестный postcommit результат и отказ публикации сохраняют recovery artifacts и блокируют повтор; подтверждённый commit OID возвращается отдельно от indexPublished. Hooks/core.hooksPath, signing, выбранные external filters и unsupported index/worktree states отклоняются typed диагностикой; policy доверия и поддержка этих конфигураций остаются будущей работой, а не молчаливым обходом Git semantics. Pending editor блокирует переход к Git; FIFO admission и flush описаны в Persistence queue update ниже. Native приёмка остаётся открытой. Details/evidence: apps/desktop/evidence/git-inspection.md. Задача 5.1 остаётся открытой.

## Current implementation boundary — synchronization

Добавлены explicit pull/push configured current branch и safe abort app-owned merge с manifest/HEAD/index checks. Системный Git использует ограниченный noninteractive runner и настроенные credentials; unsupported hooks/filters/SSH overrides/signing/ref mappings отклоняются без молчаливого обхода. Конфликты блокируют запись и предлагают только подтверждённый abort; его отказ не запускает reset/clean/force. Metadata/resource IDs после pull/abort обновляются. FIFO admission и flush реализованы отдельным срезом; persistent recovery, native Windows/macOS acceptance и расширенная trust model остаются открытыми; task 5.1/5.2 пока не отмечены. Evidence: apps/desktop/evidence/git-sync.md.


## Persistence queue update

На IPC-границе до `spawn_blocking` введён FIFO admission для каждой repository session (одна session на canonical root): save case/run, creation/organization/initialization, commit/sync и close. Лимит — 128 активных/ожидающих tickets на session; в blocking pool поступает только голова очереди. Async ожидание хранит Waker, не MutexGuard или blocking worker. Drop ожидающего ticket освобождает очередь; уже запущенная операция удерживает owned lease до результата, даже если её IPC future больше не ожидают.

`flush_repository` принимает строгий protocol/session request, проверяет caller/capability и возвращает null только после успешных pending predecessors и проверки актуальной session. Git и close имеют собственный такой же native barrier, поэтому защита сохраняется при прямом IPC. Ошибка или отмена pending predecessor останавливает уже ожидающие barriers (`WRITE_FLUSH_FAILED`); завершённая историческая ошибка не блокирует новое явное действие после исправления/отказа от draft. Переполнение даёт `WRITE_QUEUE_FULL`, без путей и native stderr.

Frontend facade захватывает snapshot собственных pending mutation promises до первого await, ждёт все исходы и вызывает native flush перед Git/close. Native close окна также ждёт flush активной session; ошибка удерживает окно, а automatic close повторно проверяет dirty state после await. Явный выход с discard не создаёт запись несохранённого draft. Catalog reads остаются вне mutation FIFO; при refresh opaque IDs переиспользуются только для прежних relative path/kind/canonical target, чтобы не отзывать ID из уже отправленной mutation.

Native FIFO/flush дополнены watcher-срезом ниже; native Windows/macOS acceptance остаётся отдельной проверкой. Recovery-действия и ограничения описаны в evidence, наличие очереди не обещает восстановление несохранённого draft после аварийного завершения. Проверки и ограничения: `apps/desktop/evidence/persistence.md`.


## Native exit routing

`RunEvent::ExitRequested` при существующем `main` предотвращает выход приложения и отправляет `window.close()` в event loop. Это направляет native quit в существующий frontend close guard с pending mutation/native flush barrier и явным выбором при dirty/failed save. Rust handler не уничтожает окно напрямую. После разрешённого frontend guard уничтожения `main` Tauri удаляет окно из manager до следующего ExitRequested; отсутствие `main` разрешает выход без рекурсии. Ошибка отправки close оставляет выход предотвращённым. Схема проверена по закреплённым исходникам Tauri 2.12.3/runtime-wry 2.12.1, Rust check/fmt/clippy и existing Vitest suite (95/95); native Windows/macOS close/quit остаётся непроверенным. Evidence: `apps/desktop/evidence/exit-guard.md`.

## Repository watcher and external changes

Repository session владеет `notify = 8.2.0 RecommendedWatcher`: recursive root и nonrecursive parent для удаления/rename root. Открытие и повторная инициализация не создают второй watcher; close/drop останавливают native handle и worker до возврата. Ошибка старта оставляет read-only открытие доступным с `WATCHER_UNAVAILABLE` и явным ручным refresh. Ошибка backend/overflow требует rescan; root rename/remove даёт ту же безопасную health-диагностику и ручное переоткрытие.

Native callback не читает содержимое файлов. Path classification проверяет границу root и symlink ancestors, отбрасывает `.git` objects/logs/locks и app temp/cache до filesystem checks; `HEAD/index/config/packed-refs/refs/MERGE_HEAD` сохраняют Git refresh. Произвольные suites `target/dist/node_modules` не исключаются. Постоянный AtomicU8 bitset coalesces hints: quiet debounce 160 ms, верхняя граница 600 ms, без очереди имён файлов и роста памяти. Frontend получает только `{ sessionId, epoch, kind, errorCode }` без путей/stderr/credentials; `kind` — `content/metadata/git/rescan`, health — `WATCHER_UNAVAILABLE`.

Tauri event направляется только `main`; listen/unlisten permissions уже ограничены этим окном. Frontend регистрируется до picker, валидирует payload strict Zod, session UUID и monotonically increasing epoch, удерживает максимум один последний hint для open IPC gap и снимает listener при dispose (включая late registration). Один async refresh выполняется одновременно; новые hints объединяются в один pending refresh. Startup/per-event ошибки показываются отдельно и не запускают retry loop.

Dirty/saving/discard prompt, создание/перемещение/удаление/initialization dialogs, Git draft/confirmation/operation удерживают catalog/metadata invalidation с русским pending пояснением. Чистая selection сохраняется по opaque resource ID; исчезнувший файл даёт typed read diagnostic. Async metadata response повторно проверяет session и блокировку перед публикацией. Поздний catalog response не размонтирует новый dirty editor; editor baseline не заменяет draft. Выбранный файл дополнительно проверяется существующим bounded polling раз в 2 s с одним запросом одновременно; polling не объявляется native watcher и сохраняет explicit discard/load выбор при конфликте.

`refresh_repository` — ограниченный custom command с protocol/session/caller validation. Metadata refresh сохраняет app-owned merge/recovery flags и snapshots, переиспользует оставшиеся resource IDs, отзывает Case/Folder IDs удалённых workspace scopes и оставляет run IDs. Повторные read/catalog/write проверки читают актуальную безопасную конфигурацию: повреждение даёт typed error; новые/удалённые scopes требуют успешного metadata refresh. Watcher warning сохраняется после refresh/initialize. Git status refresh может выдать новые file IDs; clean diff selection восстанавливается по тому же path, а commit selection/message/confirmation удерживают сам refresh до решения пользователя.

Recovery: failed save оставляет draft и прежний файл, optimistic revision запрещает overwrite внешней версии. Пользователь может продолжить редактирование либо явно отказаться и загрузить файл; после исправления config доступен «Обновить репозиторий». При недоступном watcher нужен ручной refresh, при перемещении root — переоткрытие. Аварийное завершение не обещает восстановление несохранённого UI draft; сохранённые данные остаются в обычных совместимых файлах/Git. Persistent recovery index/merge диагностика не сбрасывается metadata refresh. Подробные проверки: `apps/desktop/evidence/watcher.md`.

Primary API: [notify Watcher 8.2](https://docs.rs/notify/8.2.0/notify/trait.Watcher.html), [notify Config](https://docs.rs/notify/8.2.0/notify/struct.Config.html). Локально проверены `notify-8.2.0/src/config.rs`, `src/windows.rs`, typed Tauri event API и текущие session/catalog/writer handlers. Native GUI, macOS и installers этим срезом не объявляются проверенными.


## Suite creation and case filename rename

`create_suite` создаёт пустую папку внутри declared workspace через existing opaque parent resource и atomic no-clobber directory publication. Existing folder/file/sibling note collision отклоняется. Пустая папка входит в Git только после добавления содержимого. Rename — явный action `organize_case`, независимый от title, с portable `.md` filename и optimistic revision. Companion-dir collision не превращает кейс в folder note. Case raw content, stable ID, snapshots, notes/order и foreign index сохраняются. Новая команда проходит FIFO admission и explicit ACL; UI defers watcher при открытой форме, защищает close и выбирает созданную folder или renamed case после refresh. Проверки: `apps/desktop/evidence/case-operations.md`. Bulk suite operations описаны ниже; native acceptance остаётся открытой.


## Suite operations and guarded recovery

`prepare_suite_operation` принимает session, declared workspace, opaque folder resource и strict `duplicate/move/rename/delete` action. Read-only preview фиксирует один bounded manifest: 1000 объектов, 32 MiB суммарно, 2 MiB на файл, глубина 64, каждый исходный/результирующий путь до 1024 UTF-8 bytes. Включаются дерево, неизвестные файлы, внутренние `.order`/notes и внешняя sibling `<folder>.md`. Workspace roots, другие declared roots, `.git`, `.casewright`, symlink/reparse и специальные объекты исключены с отказом до записи. Duplicate предварительно проверяет все именно case Markdown; неоднозначный/повреждённый case отклоняется, нормальные копии получают новые UUID через lossless writer. Snapshot runs не меняются.

`apply_suite_operation` принимает одноразовый opaque confirmation, повторно проверяет metadata revision, manifest hashes, identities и no-clobber destination/companion collisions, затем получает один FIFO admission. Все новые пути, включая staging, проверяются до мутации. Ограничение 1024 bytes также применяется до публикации существующих create-suite/case-rename результатов. Ни title edit, ни изменение folder basename не переписывают содержимое case/note. Отображаемое имя из companion note может остаться прежним; UI показывает реальный относительный путь папки и поясняет это в rename dialog. Родительская и внутренняя `.order` сохраняются побайтно; отсутствующие старые ключи пропускаются совместимым loader.

Directory + sibling note проходят guarded no-clobber quarantine/publish в app-owned `.testoritto-suite-<uuid>` с diagnostic journal. Windows guards защищают наружных родителей, file handles проверяют reparse/identity и используют handle rename/disposition. Unix использует descriptor-relative NOFOLLOW/identity checks и NOREPLACE. Открытые handles и повторные проверки снижают races с внешними writers; общая filesystem transaction и универсальная изоляция от внешнего процесса не обещаются. Cleanup копии удаляет только успешно созданный ledger с ожидаемыми hashes/identities, никогда не присваивает ownership появившимся неизвестным файлам. Journal удаляется лишь при ожидаемом journal-only составе; отказ cleanup остаётся recovery.

Permanent delete требует отдельного явного подтверждения всего перечня, предупреждает об отсутствии корзины и возможном частичном результате. До первого unlink проверяются и захватываются handles всех entries; предварительный отказ откатывается no-clobber, если исходное место безопасно. Затем удаляются только подтверждённые entries postorder через захваченные handles, без path-based recursive delete. Новые/изменённые объекты не удаляются. После первого unlink ошибка может означать уже удалённые подтверждённые файлы: typed `recoveryRequired` содержит `transactionPath`, `removedPaths`, `remainingPaths`; UI не обещает сохранность уже удалённых байтов и блокирует новые writes/Git. Неудачный move/rename/duplicate сохраняет original, unsafe rollback не выполняется; при препятствии остаётся journal/quarantine с диагностикой.

Open/reopen streaming scan до repository budget 20k root entries обнаруживает app-owned UUID transaction directories и блокирует writes/Git, не выполняя произвольные инструкции из repo JSON и не удаляя артефакты. Пользователь проверяет перечисленные пути/journal внешними средствами и переоткрывает repository после восстановления. Успешный apply удаляет собственные journal/quarantine, не оставляет нового backup/trash в Git worktree. Автоматический recovery manager не добавлен.

UI use-case dialog отделяет параметры, read-only manifest и confirmation; Cancel не вызывает apply. Ошибка stale требует нового preview и повторного подтверждения, ввод сохраняется. Pending single-flight входит в общий frontend mutation barrier; открытый диалог удерживает watcher metadata/catalog refresh и close guard. После успеха выбирается folder по новому path, даже при прежнем display name из note. Recovery имеет отдельное сообщение и списки путей, блокирует editors/Git после refresh/reopen, оставляя открытие/закрытие доступным. Контракты strict serde/Zod, caller/session validation и explicit ACL действуют на обеих командах. Evidence и пределы: `apps/desktop/evidence/case-operations.md`.
