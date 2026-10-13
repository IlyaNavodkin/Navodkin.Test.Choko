# Spec Delta

## Purpose

Позволяет пользователю открывать совместимые Git-репозитории и выбирать рабочую область без скрытой миграции или изменения данных.

## ADDED Requirements

### Requirement: Read-only repository opening
WHEN пользователь открывает существующий репозиторий Casewright, система SHALL прочитать config, workspaces, cases и runs без записи, переименования или миграции файлов.

#### Scenario: Open current compatible repository
- **WHEN** открыт repo текущего snapshot-формата с `.casewright/config.yaml` и declared workspace paths
- **THEN** дерево, кейсы и Markdown-прогоны доступны, а SHA256 исходных файлов не меняются

#### Scenario: Unsupported format
- **WHEN** версия или структура данных не поддерживается
- **THEN** система показывает диагностику и не выполняет преобразование или запись

### Requirement: Explicit initialization
WHEN выбран Git repo без продуктового config, система SHALL предложить отдельное действие инициализации совместимой структуры; открытие само по себе SHALL NOT создавать файлы.

#### Scenario: Initialization declined
- **WHEN** пользователь отменяет инициализацию
- **THEN** содержимое repo остаётся неизменным

#### Scenario: Initialization requested
- **WHEN** пользователь явно подтверждает инициализацию
- **THEN** система создаёт согласованную совместимую структуру и показывает созданные файлы как локальные изменения

### Requirement: Workspace selection and recents
Система SHALL разрешать выбор declared workspace и хранить recent repositories и последнюю выбранную область вне пользовательского Git repo.

#### Scenario: Reopen recent repository
- **WHEN** recent repo доступен и пользователь открывает его повторно
- **THEN** система восстанавливает последнюю доступную область без добавления preferences в repo

#### Scenario: Missing recent path
- **WHEN** recent path больше не существует
- **THEN** система сообщает об этом и позволяет выбрать другую папку

### Requirement: Repository access scope
Система SHALL ограничивать файловые операции открытым repo root и защищать writable session от конкурирующих внутренних окон.

#### Scenario: Path escapes repository
- **WHEN** relative path или symlink разрешается за пределы repo root
- **THEN** операция отклоняется и внешние файлы не изменяются

#### Scenario: Same repository opened twice
- **WHEN** пользователь повторно открывает repo с активной writable session
- **THEN** система активирует существующую session или явно запрещает второй writer
