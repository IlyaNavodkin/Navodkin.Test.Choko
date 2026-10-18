# Run execution

15 октября 2026. Реализация основным агентом без субагентов и управления пользовательскими окнами.

Добавлен редактор выполнения кейса прогона: все шесть результатов, tester, executed_at с явной кнопкой текущего времени, test_date override, Notes и отметки none/pass/fail с однострочными пояснениями для Setup/Steps/Acceptance Criteria. Пустая дата наследуется от прогона. Тексты чеклиста, идентификаторы и исходный снимок не редактируются.

Typed `save_run_case` проверяет caller, protocol, session/resource UUID, strict payload и лимиты. Rust service принимает только зарегистрированный RunCase resource, сверяет canonical path и SHA256 исходного sidecar, сохраняет через существующий atomic replacement. Ключи и число checklist items должны совпадать с оригиналом. `_run.md`, `.order`, live cases, `.source` и Git index не записываются. Metadata/unknown sections/variable text сохраняются source-backed сериализатором. При числовом начале текста шага добавляется один служебный ordinal, чтобы parser не потерял исходный префикс; новые YAML-поля сохраняют CRLF однородного исходного frontmatter.

Frontend хранит локальный черновик в useZodForm; TanStack Query обновляет документ и result в каталоге без перерегистрации resource IDs. Есть single-flight save, ошибки без потери ввода, Ctrl/Cmd+S, блокировка навигации и close guard. Save-and-exit закрывает окно только после успешной записи. Polling раз в две секунды обновляет чистый документ и удерживает грязный; загрузка новой версии требует явного отказа от черновика. Существующие ответы без revision остаются readonly.

Проверки:

- Rust: **128/128**; fmt и clippy `--all-targets -D warnings` проходят.
- Реальные temp Git repositories: save/reopen result/tester/time/fail-note/date/notes; все шесть результатов и три состояния отметок; numeric text, unknown sections/metadata/CRLF; unchanged index и `_run.md`/aux snapshot bytes; stale revision, неправильные keys/resource kind, readonly sidecar.
- TypeScript strict и Vitest: **52/52**. Payload запрещает правки identity/check text, требует SHA256 и UUID; failed draft retained; native-close mock разрешает destroy только после успешного retry.
- Headless Chromium с production Tauri CSP: **24/24**, 30.1s. Запись после ошибки, сохранённые metadata/check/fail notes, переход и повторное открытие, dirty external change и подтверждённый reload. После расширения теста проверкой dropdown result/check выполнен повторный focused run. IPC mock находится только в тестах, это не native E2E.
- UI Kit typecheck и OpenSpec strict validation проверяются отдельно; source snapshot Casewright не редактируется.

Скриншот: [сохранённое выполнение](browser/saved-run-execution.png).

Native GUI выполнения/сохранения, installers и macOS arm64 не проверены. Watcher/write queue/crash recovery, run grid/guide, suite ordering/CRUD и Git collaboration остаются в работе. OpenSpec 4.2 и change в целом не объявлены завершёнными.

## Run details update

Добавлен `save_run_details` и редактор `_run.md`: open/closed, Summary и Notes. Payload запрещает любые изменения approvals, даты, created, name и scope. Rust service проверяет registered RunDetails resource/canonical path/SHA256 и выполняет atomic replacement. Дублирующиеся редактируемые Markdown-секции и stale revision отклоняются без записи. Чтение само по себе ничего не меняет. Status обновляется в sidebar query cache; сохранённый прогон можно закрыть и вновь открыть.

Оба run editors используют общий typed draft lifecycle с отдельными Zod/adapters для sidecar и details. Тексты RU/EN, примитивы @codaa/ui, общие CSS Modules/Citadelic tokens. Ctrl/Cmd+S, failed save retention, explicit discard/reload, dirty navigation guard и save-and-exit применяются к обоим типам. Approvals по-прежнему отображаются только для чтения; новый UI для их редактирования не добавлен.

Итоговая проверка после добавления редактора сведений:

- Rust **130/130**, 2.20s; clippy `--all-targets -D warnings` и fmt успешно. Новые реальные temp-repo tests проверяют close/reopen, Notes с variables, approvals с дополнительными полями/комментарием, test_date/created/scope/unknown fields/CRLF, unchanged sidecars и Git index; external revision и duplicate Notes оставляют байты неизменными.
- Frontend strict typecheck и Vitest **55/55**, 8.68s: strict edit contracts/API responses, запрет metadata injection, неуспешный save-and-exit удерживает черновик и не вызывает destroy; retry завершает запись.
- Headless Chromium full **26/26**, 33.3s с production Tauri CSP. Новый сценарий close/reopen после failed retry сохраняет approvals, обновляет статус в списке и повторно читает Notes; external details update удерживает dirty draft до подтверждения reload. Перед ним focused run обоих редакторов **4/4**, 12.3s. Реальный браузер использует только тестовый IPC mock.
- UI Kit typecheck/OpenSpec strict validation: успешно; Casewright snapshot не изменён. Скриншоты сохранённых [сведений](browser/saved-run-details.png) и [выполнения](browser/saved-run-execution.png) осмотрены.

Native Windows product flows и macOS не проверены. Полная приёмка 4.2 включает оставшиеся run grid/guide и native E2E, поэтому задача не отмечена выполненной; change не архивирован.

Windows x64 `tauri build --no-bundle`: успешно, exit 0; optimized build 53.95s. Executable `src-tauri/target/release/testoritto-desktop.exe`, 12036608 bytes, SHA256 `9c9d4445012ac12c4840a32e52825cf0c05b24319ead081e8eada31403daaf99`. Собран после последних runtime/UI изменений, не запускался.

15 октября добавлены grid/guide: [Run workflow](run-workflow.md). Указание выше на оставшуюся реализацию этих режимов относится к предыдущему срезу; native приёмка остаётся открытой.
