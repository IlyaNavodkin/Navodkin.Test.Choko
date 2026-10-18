# Tasks

План отражает подтверждённые решения и оставшиеся вопросы. Пользователь разрешил начать независимый Tauri-каркас; задачи отмечаются выполненными только после реализации и проверки.
Перед зависимыми продуктовыми задачами подтвердить оставшийся scope из docs/DISCUSSION.md.

## 1. Scope и runtime

- [ ] 1.1 Согласовать оставшийся scope clone/branches/stash и UI для variables/approvals/reporting, определить минимальные версии ОС; обновить артефакты и пройти strict validation.
- [x] 1.2 Создать apps/desktop с React/Vite и src-tauri Rust crate, закрепить JS/Rust toolchains и оба lockfiles; добавить tauri dev/build, typecheck и Rust checks; проверить окно с @codaa/ui/Citadelic tokens, capabilities и отсутствие Node-sidecar.

## 2. Formats и чтение repo

- [x] 2.1 Реализовать Rust domain/parsers/serializers по upstream fixtures, сохранить MIT notice для переносимого кода; пройти cargo test с parity и round-trip tests для cases, config, order, folder notes и Markdown runs с unknown content.
- [ ] 2.2 Реализовать scoped repo sessions, picker и read-only load через typed Tauri commands с serde DTO и runtime validation; проверить path/symlink rejection и неизменность file hashes на real fixture; описать API/unsupported formats.
- [ ] 2.3 Добавить workspace selection/tree/recents и явную initialization; проверить empty/missing path, отказ инициализации и duplicate writable session.

## 3. Persistence и кейсы

- [x] 3.1 Реализовать atomic writes, write queue, flush и watcher; проверить failure сохраняет draft/file, external dirty edit не затирает draft и shutdown/commit ждут flush; описать recovery.
- [ ] 3.2 Создать case editor и create/duplicate/move/delete сценарии с typed hooks/i18n; проверить stable id, nested steps, unknown fields/sections и `.order`/folder notes end-to-end; обновить описание формата.

## 4. Прогоны

- [ ] 4.1 Реализовать создание snapshot run и чтение старых sidecars; проверить snapshot после source rename/delete, ordering и существующие approvals/date metadata.
- [ ] 4.2 Добавить run grid/guide, statuses/checks/notes/open-close в согласованном scope; проверить save/reopen/failure и preservation расширений; описать сценарий выполнения.

## 5. Git collaboration

- [ ] 5.1 Реализовать Rust Git service и typed commands status/diff/commit/pull/push с system credentials и scoped staging; пройти temp-remote two-clone tests, foreign index, pending flush, offline/auth/upstream/rejected push; описать setup Git.
- [ ] 5.2 При конфликте показать ошибку и unmerged paths, выполнить только явный безопасный abort текущей операции; проверить успешный и отказавший abort, не терять конфликтные файлы или локальную работу, запретить автоматические reset/clean/force и описать блокировку/диагностику при невозможности безопасного abort.

## 6. ОС и качество интерфейса

- [ ] 6.1 Проверить labels/focus/keyboard, loading/error/empty/pending, native shortcuts/picker, close with failed save, Tauri CSP/capabilities/custom-command permissions и hostile Markdown; зафиксировать результаты и ограничения.
- [ ] 6.2 Измерить согласованный large fixture, устранить доказанные bottlenecks и установить реалистичные performance targets; документировать машину, объём данных и результаты.

## 7. Packaging и интеграционная приёмка

- [ ] 7.1 Добавить native Windows x64/macOS arm64 jobs для tauri build с private artifacts без публикации; проверить Rust prerequisites, WebView2 installer policy и macOS bundles; проверить установку/запуск на обоих targets, собственное имя/icons и отсутствие upstream updater; описать сборку/signing gaps и открытые минимальные версии ОС.
- [ ] 7.2 Пройти native WebdriverIO/Tauri smoke и полный open → edit → save → run → commit → push → second-clone pull сценарий на обеих ОС; исключить test-only WebDriver plugins из release и проверить repo compatibility; выполнить openspec verify, финализировать release scope и результаты приёмки.

## Workflow follow-up

- Проверка 3.1: `apps/desktop/evidence/persistence.md` и `apps/desktop/evidence/watcher.md`. Native FIFO/atomic/service tests и frontend/browser regression checks подтверждены; native window/installer приёмка остаётся в 6.1/7.1/7.2. Несохранённый UI draft не обещается восстанавливать после аварийного завершения.
- Архивировать change только после реального выполнения, проверки задач и выполнения согласованных review requirements.
- При смене scope обновить planning artifacts до реализации зависимых частей.
