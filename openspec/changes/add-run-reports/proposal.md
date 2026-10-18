# Proposal

## Why

Пользователь подтвердил добавление предпросмотра отчётов и экспорта PDF/JSON после обнаружения отсутствующего блока Casewright. В upstream есть PDF выбранного прогона и недельный отчёт с матрицей; JSON-export в исследованном snapshot не обнаружен и добавляется как новая возможность.

## What Changes

- Отчёт выбранного прогона и недельный отчёт: сводка, распределение шести статусов, suites/cases, результаты, tester, snapshot-контекст; для недели — матрица по stable case ID.
- Предпросмотр перед экспортом, явное включение заметок и пояснений ошибок, согласованные PDF/JSON из одной модели.
- Первый срез в текущем UX preview: реальные локальные PDF/JSON downloads из сохранённой demo-памяти; без сети и записи пользовательских repositories.
- Native-срез: typed IPC/save dialog/контролируемая запись экспортного файла Rust и подключение product UI. Browser download не считается native сохранением.
- Вне объёма: импорт JSON, автоматическая рассылка, сервер генерации, сетевые шрифты/картинки, silent export поверх чужих файлов.

## Capabilities

### New Capabilities

- `run-reporting`: предпросмотр и переносимые отчёты прогона/недели в PDF и versioned JSON.

### Modified Capabilities

Нет. Это отдельно подтверждённое расширение ранее открытого reporting scope MVP.

## Impact

React reporting use case, локальный PDF renderer с встроенным Cyrillic font, typed contracts/tests, затем Rust save service/capability и native acceptance. Ни Git index, ни Casewright source/run files экспорт не изменяет. `casewright-main` остаётся неизменённым; при адаптации algorithms сохраняются MIT notice и provenance. Выбор renderer основан на текущем браузерном сценарии; Rust-кандидаты изучены отдельно в design.
