# Repository catalog verification

Дата: 2026-10-14. Проверил основной агент после последовательной реализации субагентом.

Windows x64, Visual Studio 18 x64 environment, Rust 1.98.1: `cargo test --locked --offline` — 73/73; `cargo clippy --locked --offline --all-targets -- -D warnings` и `cargo fmt --all -- --check` прошли.

Проверены temp Git repositories с Casewright config, workspace/folder notes, `.order`, cases, run details и sidecars. Тесты сравнивают SHA256 файлов, `.git/config` и существующего index до/после catalog/read; дубли case ID остаются разными opaque resources. Проверены session/resource membership, refresh, exact filename stems, nested root workspace, camelCase DTO, общий бюджет чтения и Windows junction/loop/path replacement.

`git diff --exit-code -- casewright-main` и `git diff --check` прошли. Исходный snapshot не служит пользовательским data repository и не изменялся.

Каталоги пока доступны только через Rust service. Picker, IPC и интерфейс чтения ещё не проверены; задача 2.2 остаётся открытой. macOS compilation/runtime не проверены. Unicode default sorting приближённый; `.order` переносится явно. Canonical path checks не устраняют TOCTOU; registry mutex удерживается при чтении.
