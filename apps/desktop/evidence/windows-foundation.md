# Windows desktop foundation evidence

Дата проверки: 2026-10-13.

## Среда

- ОС: Windows 11 Pro 23H2, build 22631.6199.
- Rust/Cargo: 1.98.1; Node.js: 22.23.1; pnpm: 11.25.0.
- MSVC x64: 19.51.36256; Windows SDK: 10.0.26100.0.
- Tauri: 2.12.3; production target: Windows x64.

## Проверки

- `cargo +1.98.1 check --locked` — успешно.
- `cargo +1.98.1 clippy --locked --all-targets -- -D warnings` — успешно.
- `cargo +1.98.1 test --locked` — 4 теста пройдены.
- `cargo +1.98.1 fmt -- --check` — успешно.
- `pnpm --filter @testoritto/desktop test` — 8 тестов пройдены; typecheck и production Vite build успешны.
- Существующий `apps/ui-playground`: 27 тестов пройдены.
- `pnpm check:ui`, `pnpm spec:validate`, `git diff --check` — успешно.
- `pnpm --filter @testoritto/desktop tauri build --no-bundle` — успешно; собран `src-tauri/target/release/testoritto-desktop.exe`.

## Native smoke

Production executable запущен в обычном desktop-процессе. Native WebView открыл `http://tauri.localhost/`; экран показал ответ runtime diagnostics с версией `0.1.0`, платформой `Windows` и архитектурой `x64`. Accessibility tree содержит экран Testoritto и успешное состояние; browser-only unsupported-native UI не отображался.

Сгенерированная Tauri ACL schema содержит `allow-get-runtime-diagnostics`, связанный с `get_runtime_diagnostics`; capability главного окна использует это разрешение. В конфигурации не добавлены Node sidecar, updater или плагины fs/shell/opener.

## Границы

Проверка подтверждает только Windows x64 foundation и runtime diagnostics. macOS arm64 build/window, installers, installation flow и repository/editor/Git workflows не проверялись. Консольные сообщения native процесса отдельно не проверялись.
