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

### Requirement: Conflicts preserve local work
WHEN pull или повторное применение сохранённых изменений вызывает конфликт, система SHALL показывать unmerged paths, сохранять конфликтное состояние и требовать явного решения пользователя вместо автоматического reset/clean/force push.

#### Scenario: Conflicting edits in two clones
- **WHEN** A и B изменяют одно поле и pull создаёт конфликт
- **THEN** система показывает файлы и доступные действия, не выбирая ours/theirs самостоятельно

#### Scenario: Resume after external resolution
- **WHEN** пользователь разрешил и сохранил конфликт внешним инструментом
- **THEN** повторная проверка показывает фактический Git status и продолжение доступно только после завершения unmerged state

### Requirement: Diagnose missing Git configuration
Система SHALL показывать actionable ошибку при отсутствующем Git, remote/upstream, identity или неподходящем branch state, не исправляя ситуацию разрушительными командами.

#### Scenario: No upstream
- **WHEN** пользователь нажимает push в ветке без upstream
- **THEN** система объясняет необходимую настройку и не подставляет remote/branch молча

#### Scenario: Push rejected
- **WHEN** remote отклоняет non-fast-forward push
- **THEN** система показывает отказ и путь синхронизации без force push
