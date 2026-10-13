# Spec Delta

## Purpose

Позволяет выполнять ручные тестовые прогоны и хранить результаты и снимки кейсов в формате существующих репозиториев Casewright.

## ADDED Requirements

### Requirement: Compatible run snapshots
WHEN пользователь создаёт прогон, система SHALL сохранять выбранные stable case ids и snapshot содержимого в совместимой `.casewright/runs/<run>/` структуре с `_run.md` и per-case Markdown sidecars.

#### Scenario: Source case changes after run creation
- **WHEN** исходный кейс изменён, перемещён или удалён после создания прогона
- **THEN** snapshot остаётся читаемым и не подменяется новым содержимым

#### Scenario: Existing Markdown run
- **WHEN** открыт существующий прогон со sidecars и `.order`
- **THEN** система показывает сохранённые результаты и порядок, не конвертируя прогон в CSV

### Requirement: Record results and item checks
Система SHALL сохранять not_run/in_progress/pass/fail/blocked/skipped, tester, executed_at, notes и per-item check/fail notes в совместимом формате.

#### Scenario: Failed step saved
- **WHEN** пользователь записывает fail для шага с пояснением
- **THEN** повторное открытие восстанавливает состояние, пояснение и result кейса

#### Scenario: Result write fails
- **WHEN** сохранение результата завершается ошибкой
- **THEN** система показывает pending/error состояние, сохраняет ввод и не сообщает об успешной записи

### Requirement: Preserve run metadata
Система SHALL сохранять open/closed status, Summary, Notes, имеющиеся approvals, date overrides, variable text и неизвестный контент даже при отсутствии UI для редактирования отдельных расширений.

#### Scenario: Existing extended metadata
- **WHEN** пользователь меняет Notes прогона с approvals и test_date
- **THEN** остальные данные остаются доступными в сохранённых файлах

#### Scenario: Invalid sidecar
- **WHEN** sidecar содержит некорректные метаданные
- **THEN** система показывает предупреждение и не переписывает повреждённый файл при одном лишь открытии
