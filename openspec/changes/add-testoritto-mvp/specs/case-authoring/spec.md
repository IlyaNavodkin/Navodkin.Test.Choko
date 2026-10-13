# Spec Delta

## Purpose

Даёт пользователю редактор ручных тест-кейсов и дерева suites с совместимым файловым хранением и защитой существующего содержимого.

## ADDED Requirements

### Requirement: Structured case editing
Система SHALL позволять редактировать displayId, title, status, tags, Objective, Systems, Setup, nested Steps и Acceptance Criteria, сохраняя неизменяемый stable id в совместимом Markdown.

#### Scenario: Edit and reopen
- **WHEN** пользователь изменяет поля и сохраняет валидный кейс
- **THEN** повторное открытие показывает сохранённые данные, а stable id не меняется

#### Scenario: Invalid case input
- **WHEN** обязательные данные некорректны
- **THEN** система показывает ошибки соответствующих полей и не заменяет сохранённый файл

### Requirement: Preserve unknown content
WHEN кейс содержит неизвестные YAML fields или Markdown sections, система SHALL сохранять их при редактировании известных полей и сообщать о несовместимом содержимом без скрытой потери данных.

#### Scenario: Unknown content round trip
- **WHEN** меняется только title файла с дополнительным frontmatter и неизвестной секцией
- **THEN** дополнительные поля и содержимое неизвестной секции остаются сохранёнными

### Requirement: Case and suite organization
Система SHALL разрешать создание, дублирование и перемещение кейсов и suites, сохранять `.order` и folder notes и оставлять stable id существующего кейса при rename/move.

#### Scenario: Move referenced case
- **WHEN** кейс перемещён в другую suite
- **THEN** ссылки прогонов по stable id продолжают работать и snapshot прогонов не изменяется

#### Scenario: Duplicate case
- **WHEN** пользователь дублирует кейс
- **THEN** копия получает новый stable id и не заменяет существующий файл

### Requirement: Reliable saves and external edits
Система SHALL показывать dirty/saving/saved/error состояния и не затирать несохранённый черновик внешней версией без выбора пользователя.

#### Scenario: Disk write fails
- **WHEN** запись отклонена правами доступа или ошибкой диска
- **THEN** draft остаётся dirty, предыдущий корректный файл доступен и сообщение не утверждает успешное сохранение

#### Scenario: External edit while dirty
- **WHEN** watcher обнаруживает внешнее изменение редактируемого dirty файла
- **THEN** система показывает конфликт версий и сохраняет draft до решения пользователя

### Requirement: Explicit deletion and discovery
Система SHALL предоставлять поиск/фильтры кейсов и требовать явное подтверждение удаления с перечнем затрагиваемых объектов.

#### Scenario: Cancel deletion
- **WHEN** пользователь отменяет удаление suite или кейса
- **THEN** файлы и текущая selection сохраняются

#### Scenario: Find a case
- **WHEN** применён title/displayId search или status/tag filter
- **THEN** пользователь видит подходящие кейсы либо явное пустое состояние
