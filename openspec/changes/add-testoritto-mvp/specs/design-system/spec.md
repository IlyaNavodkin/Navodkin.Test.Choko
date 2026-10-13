# Spec Delta

## Purpose

Задаёт единый интерфейс Testoritto на предоставленном UI Kit и цветовых токенах Citadelic с доступными состояниями пользовательских сценариев.

## ADDED Requirements

### Requirement: Provided UI Kit and palette
Интерфейс SHALL использовать предоставленные @codaa/ui компоненты и палитру Citadelic `--app-*` без подмены продуктовых цветов палитрой исходного Casewright.

#### Scenario: Shared control styling
- **WHEN** отображаются button/input/status controls
- **THEN** они используют Kit и согласованные tokens, включая accent `#5e7b96`

### Requirement: Accessible interaction states
Система SHALL предоставлять видимые loading/error/empty/pending состояния и доступные keyboard labels/focus; статус SHALL иметь текст или символ помимо цвета.

#### Scenario: Empty repository query
- **WHEN** список кейсов пуст или фильтр не даёт результатов
- **THEN** пользователь видит пояснение и доступное следующее действие, а не пустую панель

#### Scenario: Keyboard form operation
- **WHEN** пользователь перемещается по форме клавишей Tab
- **THEN** controls имеют понятные labels и видимый focus, а сохранение доступно с клавиатуры

#### Scenario: Pending action clicked again
- **WHEN** пользователь повторно активирует незавершённое сохранение или Git действие
- **THEN** система показывает pending state и не создаёт дублирующую операцию

### Requirement: Localized product text
Система SHALL предоставлять русский интерфейс MVP через единую систему локализуемых сообщений с понятными field errors и command error titles.

#### Scenario: Validation failure
- **WHEN** пользователь сохраняет невалидную форму
- **THEN** соответствующие поля показывают русские сообщения, а внутренний stack trace не выводится как пользовательский текст
