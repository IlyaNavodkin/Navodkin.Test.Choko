# Native exit guard

Проверено 2026-10-16 на Windows x64 без запуска native GUI.

`lib.rs` использует `Builder.build(...).run(...)`: при `RunEvent::ExitRequested` и существующем `main` вызывает `prevent_exit()` и `window.close()`. Native quit проходит существующий frontend `useDraftCloseGuard`: pending mutations и native flush завершаются перед уничтожением окна; failed flush удерживает окно; dirty draft требует явного выбора. Frontend guard не изменён. Ошибка отправки close оставляет приложение открытым, без fallback на принудительный exit.

Семантика проверена по закреплённым локальным исходникам:

- `tauri-2.12.3/src/app.rs`: `Builder::run` — shorthand build + пустой callback; `on_event_loop_event` удаляет Destroyed window через manager до последующих событий.
- `tauri-2.12.3/src/webview/webview_window.rs`: `close()` создаёт перехватываемый `CloseRequested`, в отличие от `destroy()`.
- `tauri-2.12.3/src/manager/window.rs`: зарегистрированный JS close listener предотвращает native close и получает событие.
- `tauri-runtime-wry-2.12.1/src/lib.rs`: dispatcher `close()` отправляет событие в event-loop proxy, без синхронной рекурсии. После Destroyed последнего окна возникает новый ExitRequested; `main` уже отсутствует, выход разрешается.

Проверки:

- `cargo +1.98.1 fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --all -- --check` — PASS.
- В VS18 amd64 environment: `cargo +1.98.1 check --locked --offline --manifest-path apps/desktop/src-tauri/Cargo.toml` — PASS.
- В том же environment: `cargo +1.98.1 clippy --locked --offline --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings` — PASS.
- `pnpm --filter @testoritto/desktop test -- tests/draftCloseGuard.spec.tsx tests/RepositoryBrowserPage.spec.tsx tests/persistence.spec.ts` фактически выполнил весь Vitest suite: **14 файлов, 95/95 PASS**, включая existing close guard/pending flush/failed-save tests.

Native Windows close/quit, macOS Cmd+Q/OS Quit, установка и runtime нового build не проверены. Проверка исходников и mocks не заменяет native приёмку; задачи 6.1/7.1/7.2 остаются открытыми. Аварийное завершение процесса/принудительное завершение ОС не проходит этот guard.
