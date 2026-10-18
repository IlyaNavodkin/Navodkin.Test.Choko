# Rust formats verification

Дата: 2026-10-13. Проверка выполнена основным агентом после трёх последовательных подэтапов субагента.

## Проверено

- `cargo +1.98.1 test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml`: 54 теста пройдены, включая 4 ранее существовавших теста runtime diagnostics.
- `cargo +1.98.1 clippy --locked --all-targets --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings`: успешно.
- `cargo +1.98.1 fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --all -- --check`: успешно.
- Rust-команды выполнены в VS18 x64 Developer Environment на Windows.
- `git diff --check`: успешно; `git diff --exit-code -- casewright-main`: изменений snapshot нет.

## Покрытие

Config, `.order`, folder notes, кейсы и оба Markdown sidecar-формата прогонов. Независимые ожидаемые поля взяты из upstream-тестов; canonical case, SAMPLE_CASE и SAMPLE_DETAILS проверяются целиком. Проверены точные no-op LF/CRLF, возврат прежних значений, Unicode, неизвестный YAML/Markdown, комментарии и ссылки YAML, approvals с дополнительными вложенными полями, даты, вложенность Steps, legacy Expected Results, fenced code, неоднозначные секции, tri-state checklist и последний разделитель fail note.

Неподдерживаемые безопасным редактором YAML-правки возвращают ошибку. Отсутствующий или некорректный stable id не генерируется при чтении; реальные изменения таких кейсов и run-case отклоняются. Полный MIT notice и происхождение адаптированного алгоритма находятся в `src-tauri/NOTICE.md`.

## Границы

Форматы работают со строками в памяти. Репозиторий не открывается, файловые записи и IPC чтения ещё не реализованы. Эти тесты не подтверждают установку, native runtime форматов, macOS или неизменность хешей настоящего data repo при открытии — это следующие проверки. Каталог `casewright-main` является исходным snapshot, а не готовым Casewright data repo.
