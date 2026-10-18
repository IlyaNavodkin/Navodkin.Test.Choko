# Repository IPC verification

Дата: 2026-10-14. Основной агент прочитал реализации handlers, общий caller guard, managed state, error mapping, AppManifest и capability после последовательной работы субагента.

Windows x64 / VS18 / Rust 1.98.1: независимо прошли `cargo test --locked --offline` (81/81), `cargo clippy --locked --offline --all-targets -- -D warnings`, `cargo fmt --all -- --check`; OpenSpec strict validation — 2/2. Исходный `casewright-main` не изменён.

Разрешены только семь custom commands главного окна (runtime diagnostics и шесть repository commands). Folder picker находится в Rust, защищён single-flight RAII guard и выполняется через spawn_blocking. WebView не получает arbitrary filesystem/open-path API. Payload проверяет protocolVersion, UUIDv4/RFC4122, workspace length и неизвестные поля; service проверяет declared workspace и resource/session membership. Error mapping не передаёт исходные native paths или stderr.

Тесты проверяют guard cleanup после отмены, ошибки и unwind; invalid requests, safe error codes, Send/Sync состояния и инвалидирование run resources после исчезновения runs directory.

Picker ещё не проверен в работающем приложении; UI пока не вызывает новые команды. macOS runtime/build и installer не проверены. Задача 2.2 остаётся открытой до проверки полного read-only сценария.
