# Repository watcher and external changes

Дата: 2026-10-15. Срез task 3.1; checkbox оставлен основному агенту после общей проверки. Native GUI/macOS/installers не проверялись.

## Contract

Закреплён `notify 8.2.0` с lockfile. Используется RecommendedWatcher (Windows ReadDirectoryChangesW, на macOS штатный recommended backend), а не filesystem polling. Session владеет native handle/worker: start при open, повторный open той же session не дублирует watcher, initialization продолжает наблюдение, close/drop join останавливает доставку до возврата. Nonrecursive parent позволяет диагностировать root rename/remove.

Callback классифицирует hints без чтения содержимого. Вне root и symlink ancestors отклоняются, `.git/objects/logs/locks` и app-owned temp/cache отбрасываются; HEAD/index/config/refs/MERGE_HEAD отслеживаются. Product folders с именами target/dist/node_modules остаются наблюдаемыми. AtomicU8 bitset ограничивает память независимо от event storm: 160 ms quiet debounce, maximum batch 600 ms. Ошибка/overflow => rescan + sanitized health. Ошибка старта watcher не мешает открыть repo: warning WATCHER_UNAVAILABLE и ручной refresh.

В main WebView отправляется только `repository-changed { sessionId, epoch, kind, errorCode }`: strict UUID, safe positive epoch, content/metadata/git/rescan, null или WATCHER_UNAVAILABLE. Никаких absolute paths, native stderr или credentials. Frontend listen регистрируется до picker, валидирует unknown payload, игнорирует чужие/поздние epochs, снимает listener при dispose, включая late registration. Refresh single-flight; дополнительные hints объединяются, ошибки не вызывают бесконечный retry.

`refresh_repository { request: { protocolVersion: 1, sessionId } }` проходит caller/window/protocol/session проверки и explicit AppManifest/main capability. Refresh конфигурации не сбрасывает app-owned merge/recovery flags, status/sync snapshots и сохраняет resource IDs оставшихся scopes; old case/folder IDs удалённых workspaces отзываются. Invalid config блокирует read/catalog/write typed error до исправления и успешного refresh. Watcher warning переживает refresh/initialization.

## Draft and recovery behavior

Dirty/saving/editor discard prompt, product dialogs и Git draft/confirmation/operation откладывают catalog/metadata refresh. Pending сообщение объясняет сохранение черновика в редакторе. Чистый документ обновляется с сохранением selection; clean Git diff восстанавливает выбранный path при новых status IDs. Git selection/message/confirmation не отзываются фоновым status refresh, поскольку удерживают его до явного завершения/очистки.

Выбранный case/run продолжает bounded revision polling (2 s, один запрос), чтобы предложить существующий explicit «Загрузить версию с диска» flow. Это дополнительная проверка, не замена native watcher. Ошибки сохранения удерживают draft, optimistic revision не позволяет писать поверх внешнего изменения; discard/load требует явного выбора. Delayed metadata ответ повторно проверяет dirty/session; delayed catalog deletion не размонтирует новый dirty editor.

«Обновить репозиторий» доступно отдельно для ручной диагностики и исправленной config. При root rename/remove нужно переоткрытие. Сохранённые файлы/Git остаются source of truth. Аварийное завершение не гарантирует восстановления несохранённого UI draft; task не вводит crash-persistent cache. Ошибки Git recovery/abort не очищаются watcher refresh и не запускают reset/clean/force. FIFO/flush/close guarantees и проверки — [persistence](persistence.md).

## Verification

- `cargo +1.98.1 check --locked --tests`, `cargo fmt` — проходят.
- Основной агент: полный native Rust **173/173**, затем новые regression tests repository **18/18** и watcher **2/2**, clippy all-targets `-D warnings` — проходят. Совокупный набор содержит **174** теста; отдельный финальный полный run выполняет основной агент. Логи `.cache/watcher-rust-review.log`, `.cache/watcher-rust-review-fixes.log`.
- Настоящие own temp native tests: create/edit/rename/delete/config, coalesced burst, open/initialize/duplicate-open/close/reopen/drop, no late delivery; unit hints outside path/noise/root rename/rescan/backend error. Unix symlink watcher test существует, на Windows не исполнялся. Existing canonical-path/atomic security suite остаётся обязательным.
- Frontend Vitest **85/85**, 12 files: hook single-flight/coalescing/dirty hold/session/epoch/dispose/late subscribe/typed errors; actual page clean reload, delayed metadata workspace removal + newdirty, delayed catalog case deletion + newdirty; прежние case/run/conflict/flush tests проходят.
- Основной агент независимо повторил frontend page + watcher hooks: **41/41** (35 page + 6 hooks), 13.12 s.
- Browser: финальный полный headless Chromium **39/39**, 44.4 s, новый test внутри production CSP/console/network guards. Лог `.cache/watcher-browser-final.log`, screenshot `apps/desktop/evidence/browser/watcher-pending.png`. Новый mock-event scenario использует реальный typed Tauri listen callback bridge, обновляет clean case и удерживает Git message до явной очистки. Mock IPC не подтверждает native GUI.
- Frontend/browser TypeScript, `pnpm check:ui`, `pnpm spec:validate` **2/2** — проходят.

## Limits

Native Window UI и event delivery через настоящий WebView, macOS backend/runtime, installers, network filesystem notifications и large-repo SLA этим срезом не проверены. notify errors/rescan являются hints; canonical paths/revisions/config проверяются повторно каждым handler, а внешний Git/filesystem writer не становится общей транзакцией с приложением. Сеть использована только для загрузки закреплённой зависимости, desktop окна/установщики не открывались; пользовательские repositories/remotes/index не изменялись.
