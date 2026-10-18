# Spec Delta

## Purpose

Нативный предпросмотр и экспорт отчётов прогона и недели в PDF/JSON через Rust destination service с явным диалогом сохранения, отменой и перезаписью.

## ADDED Requirements

### Requirement: Preview отчётов на реальных данных
Система SHALL строить preview отчёта выбранного run и недели из saved snapshots/metadata/approvals/dates без подстановки live-кейсов и без генерации отсутствующих полей.

#### Scenario: Отчёт прогона
- **WHEN** пользователь открывает отчёт прогона с периодом и includeNotes
- **THEN** видны summary, pass rate, matrix и цветные распределения шести статусов

#### Scenario: Пустой прогон
- **WHEN** в прогоне нет кейсов с результатами
- **THEN** показано empty-состояние, экспорт заблокирован с объяснением

### Requirement: Native сохранение PDF/JSON
Система SHALL сохранять PDF/JSON через Rust service с native dialog, проверкой destination, отменой, перезаписью только после подтверждения и безопасной файловой записью (без traversal/symlink escapes).

#### Scenario: Сохранение PDF
- **WHEN** пользователь подтверждает диалог сохранения PDF
- **THEN** файл записан, имя санитизировано, внешние ресурсы исключены, повторный headings и пагинация корректны

#### Scenario: Отмена диалога
- **WHEN** пользователь отменяет native dialog
- **THEN** файл не создаётся, состояние preview не меняется, ошибки нет

#### Scenario: Ошибка записи
- **WHEN** запись не удалась (путь, права, место)
- **THEN** показана typed ошибка без ложного saved state
