# Persistence queue and flush

Дата проверки: 2026-10-15. Срез task 3.1: native FIFO admission и explicit flush/barriers перед Git, закрытием repository и окна. Watcher и persistent recovery в этот срез не входят; task 3.1 не отмечена выполненной.

## Contract

`flush_repository` принимает `{ request: { protocolVersion: 1, sessionId } }`, возвращает `null`. Caller/window, protocol и UUID проверяются до admission; актуальность session проверяется перед успехом. Custom command включена в AppManifest и main capability. `WRITE_QUEUE_FULL` и `WRITE_FLUSH_FAILED` проходят typed Rust/TS whitelist и RU/EN i18n, без путей или native stderr.

Native mutations получают FIFO ticket до `spawn_blocking` для одной session на canonical root: save case/run case/run details, create case/run, organize case, initialize, Git commit/sync, close и flush. На session допускается до 128 активных/ожидающих tickets. Ожидающая future хранит Waker, не занимает blocking worker и не удерживает MutexGuard через await. Owned lease остаётся у blocking operation до завершения; отмена queued future удаляет ticket и будит следующего.

Git/close/flush захватывают исходы всех ещё pending predecessors. Ошибка, отмена или panic predecessor запрещает уже ожидавшему barrier утверждать успех/запускать Git. Завершённая историческая ошибка не отравляет очередь: после проверки draft, исправления или явного discard можно снова вызвать действие. Сам save не создаёт commit/push.

Frontend facade синхронно регистрирует собственные pending mutation promises по session; Git/close ждут snapshot всех исходов и затем native flush. Два concurrently отправленных IPC не обходят native очередь. Каталоги не входят в mutation FIFO: refresh переиспользует opaque IDs для прежних relative path/kind/canonical target и обновляет parent/warning references; исчезнувший или сменивший canonical target ресурс по-прежнему отклоняется handler.

Native close всегда предотвращает немедленное закрытие, ждёт flush активной session и только затем вызывает destroy. При ошибке окно остаётся открытым. Automatic close повторно проверяет dirty state после await; explicit discard не сохраняет несохранённый UI draft. Диалог нельзя отменить во время flush/save-and-exit, чтобы последующее завершение ожидания не уничтожило новый draft.

## Verification

- Rust **169/169**, полный Windows x64 run вне sandbox: 32.52 s; cargo fmt и clippy all-targets `-D warnings` проходят. Проверено основным агентом, лог `.cache/persistence-queue-rust-final.log`.
- Queue tests: FIFO при обратном порядке polling, reentrant admission, session isolation, bounded capacity, cancellation, failed pending predecessor и новая попытка. Dispatch test использует настоящий собственный temp Git repo: filesystem write завершается до Git index operation; failed write не запускает Git closure. Закрытая/неизвестная session не проходит flush.
- Catalog regression сохраняет case/folder/run IDs при повторном refresh и позволяет читать прежние зарегистрированные ресурсы.
- Vitest **76/76**: pending save + concurrent create перед Git; rejection запрещает Git/close, последующая попытка разрешена; изоляция session и no-op flush/validation. Native-close hook checks: deferred flush → новый dirty draft не закрывается; failed flush удерживает окно; cancel во время explicit flush не закрывает диалог.
- Headless Chromium **38/38**, 47.0 s: весь существующий browser suite с typed mock IPC и production CSP. Mock явно обслуживает новый `flush_repository`.
- Frontend/browser TypeScript, `pnpm check:ui` и strict `pnpm spec:validate` (**2/2**) проходят.

Sandbox full Rust дал 156 passed / 13 PermissionDenied в прежних atomic ancestor checks под `C:/Users/ilyas`; это ограничение sandbox подтверждено успешным полным run вне него. Atomic security policy не ослаблялась.

## Limits

Native GUI, реальный picker/window close, installers и macOS этим срезом не проверены. Headless browser использует mock IPC; hook tests подменяют native close event/destroy. Native release сборку после итоговых изменений выполняет основной агент. In-memory очередь не восстанавливается после crash; persistent draft recovery и watcher остаются следующими задачами. Внешние Git/filesystem mutations не становятся общей транзакцией с очередью приложения: прежние canonical path и optimistic revision проверки сохраняются.
