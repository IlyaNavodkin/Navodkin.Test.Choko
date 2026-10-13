# Tasks

Draft план после обсуждения. Установка OpenSpec/навыков и подготовка документов выполнены отдельно; ни одна задача реализации приложения здесь ещё не выполнена.
Перед зависимыми продуктовыми задачами подтвердить scope из docs/DISCUSSION.md. Этот список отражает предложенный MVP, а не финальное согласование.

## 1. Scope и runtime

- [ ] 1.1 Для уже выбранной основы Tauri 2 согласовать conflict workflow, OS targets и MVP extensions; обновить PRD/design/specs/tasks и пройти strict validation.
- [ ] 1.2 Создать apps/desktop с React/Vite и src-tauri Rust crate, закрепить JS/Rust toolchains и оба lockfiles; добавить tauri dev/build, typecheck и Rust checks; проверить окно с @codaa/ui/Citadelic tokens, capabilities и отсутствие Node-sidecar.

## 2. Formats и чтение repo

- [ ] 2.1 Реализовать Rust domain/parsers/serializers по upstream fixtures, сохранить MIT notice для переносимого кода; пройти cargo test с parity и round-trip tests для cases, config, order, folder notes и Markdown runs с unknown content.
- [ ] 2.2 Реализовать scoped repo sessions, picker и read-only load через typed Tauri commands с serde DTO и runtime validation; проверить path/symlink rejection и неизменность file hashes на real fixture; описать API/unsupported formats.
- [ ] 2.3 Добавить workspace selection/tree/recents и явную initialization; проверить empty/missing path, отказ инициализации и duplicate writable session.

## 3. Persistence и кейсы

- [ ] 3.1 Реализовать atomic writes, write queue, flush и watcher; проверить failure сохраняет draft/file, external dirty edit не затирает draft и shutdown/commit ждут flush; описать recovery.
- [ ] 3.2 Создать case editor и create/duplicate/move/delete сценарии с typed hooks/i18n; проверить stable id, nested steps, unknown fields/sections и `.order`/folder notes end-to-end; обновить описание формата.

## 4. Прогоны

- [ ] 4.1 Реализовать создание snapshot run и чтение старых sidecars; проверить snapshot после source rename/delete, ordering и существующие approvals/date metadata.
- [ ] 4.2 Добавить run grid/guide, statuses/checks/notes/open-close в согласованном scope; проверить save/reopen/failure и preservation расширений; описать сценарий выполнения.

## 5. Git collaboration

- [ ] 5.1 Реализовать Rust Git service и typed commands status/diff/commit/pull/push с system credentials и scoped staging; пройти temp-remote two-clone tests, foreign index, pending flush, offline/auth/upstream/rejected push; описать setup Git.
- [ ] 5.2 Реализовать согласованный conflict workflow без destructive auto-recovery; проверить A/B conflict, external resolution/recheck и явный abort с сохранением работы; описать recovery пользователю.

## 6. ОС и качество интерфейса

- [ ] 6.1 Проверить labels/focus/keyboard, loading/error/empty/pending, native shortcuts/picker, close with failed save, Tauri CSP/capabilities/custom-command permissions и hostile Markdown; зафиксировать результаты и ограничения.
- [ ] 6.2 Измерить согласованный large fixture, устранить доказанные bottlenecks и установить реалистичные performance targets; документировать машину, объём данных и результаты.

## 7. Packaging и интеграционная приёмка

- [ ] 7.1 Добавить native Windows/macOS jobs для tauri build с private artifacts без публикации; проверить Rust prerequisites, WebView2 installer policy и macOS bundles; проверить установку/запуск на каждом согласованном target, собственное имя/icons и отсутствие upstream updater; описать сборку/signing gaps.
- [ ] 7.2 Пройти native WebdriverIO/Tauri smoke и полный open → edit → save → run → commit → push → second-clone pull сценарий на обеих ОС; исключить test-only WebDriver plugins из release и проверить repo compatibility; выполнить openspec verify, финализировать release scope и результаты приёмки.

## Workflow follow-up

- Архивировать change только после реального выполнения, проверки задач и выполнения согласованных review requirements.
- При смене scope обновить planning artifacts до реализации зависимых частей.
