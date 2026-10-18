# Spec Delta

## Purpose

Обеспечивает обмен тест-кейсами и прогонами через Git с явными действиями пользователя и сохранением работы при ошибках и конфликтах.

## ADDED Requirements

### Requirement: Explicit Git actions and scoped commits
Система SHALL показывать status, branch, diff и ahead/behind и выполнять commit только для явно выбранных продуктовых файлов. Save SHALL NOT создавать commit, а commit SHALL NOT выполнять push автоматически.

#### Scenario: Save without commit
- **WHEN** пользователь сохраняет кейс
- **THEN** файл появляется среди локальных изменений, а история commit и remote остаются прежними

#### Scenario: Foreign files in working tree
- **WHEN** repo содержит сторонние staged files и пользователь коммитит выбранный кейс
- **THEN** сторонние файлы не попадают в commit без отдельного выбора

### Requirement: Share changes through configured Git
Система SHALL предоставлять pull/push текущей настроенной ветки через системный Git и credential helper/SSH без хранения credentials в renderer или data repo.

#### Scenario: Two clones collaborate
- **WHEN** пользователь A коммитит и отправляет кейс, а пользователь B делает pull второго клона
- **THEN** B получает тот же stable id и данные кейса

#### Scenario: Authentication or network failure
- **WHEN** remote недоступен или авторизация отклонена
- **THEN** система сообщает причину и следующий шаг, сохраняя локальные commits и pending изменения

### Requirement: Flush saves before Git operations
WHEN Git операция затрагивает working tree, система SHALL завершать pending writes и предотвращать конкурирующие операции одного repo.

#### Scenario: Commit while save pending
- **WHEN** пользователь запускает commit при незавершённом сохранении
- **THEN** операция ждёт successful flush либо прекращается с ошибкой, не создавая commit устаревшего содержимого

### Requirement: Report conflicts and offer safe abort
WHEN pull или другая поддерживаемая Git операция вызывает конфликт, система SHALL сообщить об ошибке, показать unmerged paths и предоставить явный безопасный abort. Система SHALL NOT предоставлять UI разрешения конфликта или автоматические reset/clean/force push.

#### Scenario: Conflicting edits in two clones
- **WHEN** A и B изменяют одно поле и pull создаёт конфликт
- **THEN** система сообщает о конфликте, показывает unmerged paths и предлагает безопасно отменить текущую операцию; приложение не разрешает конфликт и не запускает destructive Git-команды

#### Scenario: Abort fails
- **WHEN** Git не может безопасно отменить конфликтующую операцию
- **THEN** система блокирует дальнейшие Git действия в этом flow, показывает ошибку abort и состояние unmerged paths, не обещая автоматическое восстановление

#### Scenario: Abort preserves work
- **WHEN** пользователь подтверждает abort конфликтующей операции
- **THEN** система использует безопасную команду отмены без reset/clean/force; существующие локальные изменения не удаляются приложением

### Requirement: Diagnose missing Git configuration
Система SHALL показывать actionable ошибку при отсутствующем Git, remote/upstream, identity или неподходящем branch state, не исправляя ситуацию разрушительными командами.

#### Scenario: No upstream
- **WHEN** пользователь нажимает push в ветке без upstream
- **THEN** система объясняет необходимую настройку и не подставляет remote/branch молча

#### Scenario: Push rejected
- **WHEN** remote отклоняет non-fast-forward push
- **THEN** система показывает отказ и путь синхронизации без force push
