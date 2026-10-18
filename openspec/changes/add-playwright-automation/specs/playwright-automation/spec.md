# Spec Delta

## Purpose

Связывает ручные кейсы со стабильными идентификаторами Playwright-тестов, позволяет явно запускать доверенные локальные профили и сохранять либо импортировать проверяемые результаты в смешанные прогоны без потери совместимых данных Casewright.

## ADDED Requirements

### Requirement: Stable automation bindings
Система SHALL иметь самостоятельные Autotest entities и CaseAutotestBinding со stable IDs; один кейс может связываться с несколькими автотестами, один автотест может переиспользоваться в нескольких кейсах. Selector использует automationId/project/variant, а не имя кейса. Rename/move не SHALL молча менять связь. Неоднозначные и отсутствующие ID SHALL блокировать применение результата.

#### Scenario: Several autotests per case
- **WHEN** пользователь добавляет в кейс два автотеста либо две привязки с разными аргументами
- **THEN** сохраняются отдельные binding IDs, порядок/включение и значения; запуск создаёт самостоятельный invocation для каждой выбранной привязки

#### Scenario: Manage and archive autotest
- **WHEN** пользователь создаёт, редактирует или архивирует карточку в разделе «Автотесты»
- **THEN** изменения сохраняются явно, доступны поиск и validation; архив не удаляет прежние bindings, snapshots или результаты

#### Scenario: Renamed linked test
- **WHEN** title и путь теста изменены, а явный automationId сохранён
- **THEN** связь восстанавливается по ID, project и variant, прежние attempts остаются доступны

#### Scenario: Duplicate or missing identity
- **WHEN** discovery или импорт содержит повтор одного полного ключа либо не содержит обязательного ID
- **THEN** пользователь видит duplicate/unmatched diagnostics; система не угадывает связь по названию или номеру строки

### Requirement: Explicit trusted local profiles
Система SHALL исполнять discovery и тесты только по явному действию для доверенного профиля с внешним установленным Node и установленным Playwright проекта. Доверие SHALL храниться вне Git и связываться с canonical repo path и revision конфигурации профиля.

#### Scenario: Trust setup and revocation
- **WHEN** пользователь впервые разрешает профиль
- **THEN** setup показывает Node, cwd, config и факт исполнения локального кода без sandbox; изменение связанной конфигурации или canonical path отзывает разрешение

#### Scenario: Repository open or report import
- **WHEN** пользователь открывает repo, просматривает профиль либо импортирует файл
- **THEN** config/test code не запускается; недоверенный discovery отклоняется до spawn

#### Scenario: Missing dependency or injected command
- **WHEN** Node/Playwright отсутствует или запрос содержит shell string/недопустимый путь
- **THEN** система возвращает typed ошибку и не устанавливает зависимости, не вызывает npx install и не исполняет оболочку

### Requirement: Exact selection and controlled rerun
Система SHALL запускать только выбранные связанные test variants и явно требуемые конфигурацией зависимости профиля, показывая их до запуска. Повтор упавших SHALL создавать новый executionId для того же runId, сохраняя предыдущие attempts и ручные результаты.

#### Scenario: Select one variant
- **WHEN** выбран один variant из нескольких проектов и параметров
- **THEN** выполняется его точный ключ; соседние варианты не запускаются, состав dependency projects предварительно виден

#### Scenario: Selection becomes stale
- **WHEN** между discovery и запуском конфигурация или найденный список перестал соответствовать выбранным ключам
- **THEN** выполнение блокируется либо завершается runner_error до исполнения незапрошенных тестов; пользователь получает возможность обновить выбор

#### Scenario: Rerun failed only
- **WHEN** пользователь выбирает повтор упавших завершённого execution
- **THEN** создаётся новая попытка для выбранных unexpected failed/timedOut variants; passed, expected failure, skipped и manual entries не запускаются повторно

### Requirement: Versioned complete result contract
Система SHALL проверять versioned manifest/report, runId/executionId, source metadata и полные test keys. Новый контракт v2 SHALL включать Autotest/binding snapshots, invocation IDs и argument snapshots; проверенный v1 SHALL оставаться доступным импорту без скрытого изменения его схемы. Результат SHALL сохранять expectedStatus, raw status, retries, flaky outcome, timing, logs, errors и ссылки на attachments, отдельно от общей ошибки runner.

#### Scenario: Expected failure and retry
- **WHEN** expected-failed тест падает ожидаемо, а другой тест проходит после retry
- **THEN** первый не помечается unexpected assertion failure; у второго видны все attempts и flaky, а не только последний pass

#### Scenario: Broken reporter or runner
- **WHEN** config не загрузился, worker/bridge упал либо final report отсутствует или невалиден
- **THEN** execution получает runner_error с диагностикой; отсутствие корректных результатов не превращается в success или набор failed assertions

### Requirement: Typed invocation arguments
Система SHALL разрешать только объявленные автотестом аргументы, поддерживать значения по умолчанию и overrides в binding/прогоне, проверять типы и обязательность до исполнения. Значения SHALL передаваться через versioned context helper без shell/eval.

#### Scenario: Review and override arguments
- **WHEN** пользователь выбирает запуск и меняет аргумент
- **THEN** перед стартом показаны итоговые значения и их источники с приоритетом schema → autotest → binding → run override; false/0 не заменяются default, неверные и неизвестные значения блокируют spawn

#### Scenario: Same test with distinct inputs
- **WHEN** один физический тест выбран с двумя наборами аргументов
- **THEN** создаются разные invocation IDs и независимые процессы/контексты, результат одного не перезаписывает другой

### Requirement: Snapshot environment references
Система SHALL выбирать значения из структурированных записей «Окружение» справочника по entry ID и key; descriptions и произвольный Markdown не интерпретируются как параметры.

#### Scenario: Prod and stage
- **WHEN** аргумент host или baseUrl ссылается на prod/stage
- **THEN** picker показывает разрешённое значение и тип, manifest фиксирует значение и source revision; последующее изменение записи не меняет старые результаты

#### Scenario: Stale or missing environment
- **WHEN** запись отсутствует, архивирована, имеет неверный тип либо изменилась после preview
- **THEN** новый запуск требует исправления/обновления preview; сохранённый snapshot остаётся читаемым, секреты не записываются в переносимый manifest

### Requirement: Autotest report artifacts
Система SHALL привязывать generated reports к invocation и показывать поддерживаемые данные либо явное действие для файла. Система SHALL поддерживать явное сохранение выбранного набора в namespaced папку результата прогона без автоматического Git staging.

#### Scenario: View and preserve report
- **WHEN** автотест выдаёт JSON/JUnit, лог, screenshot или другой отчёт
- **THEN** пользователь видит название/формат/размер/доступность и связь с invocation; поддерживаемое содержимое показано безопасно, HTML/JS не исполняется автоматически

#### Scenario: Save reports to run folder
- **WHEN** пользователь выбирает «Сохранить в папку прогона»
- **THEN** Rust проверяет destination/artifacts и публикует только выбранные файлы с manifest; повтор идемпотентен, ручные файлы и Git index не меняются, failed/incomplete copy не выглядит сохранённым

### Requirement: Bounded process lifecycle
Система SHALL ограничивать duration и параллельные execution, предоставлять polling состояния и отменять всё дерево процессов при Stop, timeout, закрытии session и выходе приложения. Завершённое состояние SHALL оставаться доступным после reopen.

#### Scenario: Stop or timeout
- **WHEN** пользователь останавливает запуск либо истекает timeout
- **THEN** дерево процессов прекращается; attempts сохраняются, unfinished помечаются interrupted, timeout отличим от ручной отмены

#### Scenario: Session closure and application restart
- **WHEN** session закрывается или приложение штатно выходит во время запуска
- **THEN** cleanup дожидается дерева процессов и сохранения terminal state; reopen не показывает ложный running

#### Scenario: Abrupt previous exit
- **WHEN** приложение открывает оставшийся running execution после аварийного завершения
- **THEN** он отображается как interrupted/recovery diagnostic и не возобновляется автоматически; гарантия containment отдельно проверяется на каждой ОС

### Requirement: Passive bounded result viewing
Система SHALL ограничивать размер отчёта, logs и attachments; отклонять traversal/symlink escapes и активный контент. Просмотр SHALL показывать truncation/ошибку, не открывать автоматически HTML/URL и не записывать секреты окружения в Git.

#### Scenario: Safe error and artifact
- **WHEN** результат содержит error stack, screenshot и trace
- **THEN** error/logs отображаются как текст, вложения доступны только как проверенные локальные references с явным действием пользователя

#### Scenario: Hostile or excessive output
- **WHEN** отчёт слишком велик либо attachment ссылается за разрешённый root, в URL или через symlink
- **THEN** ресурс отклоняется с диагностикой; ограниченный log помечается truncated, оболочка и remote viewer не запускаются

### Requirement: Reviewed idempotent imports
Система SHALL принимать Testoritto JSON, Playwright JSON и JUnit XML как данные, показывать preview matched/unmatched/duplicate/foreign-run и применять только выбранные однозначные записи. Повторный импорт того же источника SHALL быть идемпотентным.

#### Scenario: Import preview and apply
- **WHEN** пользователь выбирает отчёт и целевой прогон
- **THEN** до записи видит source metadata, mapping и конфликты; только явный apply сохраняет согласованные записи, external run identity не подменяет целевой runId

#### Scenario: Duplicate foreign or malformed source
- **WHEN** отчёт повторён, относится к иному runId, содержит повторяющиеся ключи, повреждённый JSON/XML, DTD или external entity
- **THEN** повтор не добавляет attempts, foreign source требует явного выбора назначения, неоднозначные/невалидные данные не применяются и ничего не исполняется

### Requirement: Mixed runs and compatible persistence
Система SHALL хранить automation history в namespaced sidecar, сохраняя original Casewright bytes при open/import. Применение automation outcome к ручному summary SHALL требовать reviewed explicit apply с проверкой revision; записи SHALL сериализоваться с существующими mutations и Git barriers.

#### Scenario: Mixed manual and automated execution
- **WHEN** прогон содержит manual cases и связанные автотесты
- **THEN** manual guide остаётся доступен; automation attempts видны отдельно и не стирают notes/checks/snapshots/unknown metadata

#### Scenario: Explicit summary application conflicts
- **WHEN** после preview ручной результат изменён извне или сохранён из другого draft
- **THEN** apply отклоняется как stale revision; manual content и automation history сохраняются, пользователь может обновить preview

#### Scenario: Persistence failure or concurrent commit
- **WHEN** запись sidecar не удалась либо одновременно запрошен commit/close
- **THEN** отсутствует ложный saved state; записи проходят существующую очередь и flush barriers, commit не захватывает непроверенные attachments или сторонние files

### Requirement: Separate browser and native acceptance
Система SHALL различать реальные runner/IPC проверки, browser preview и native acceptance Windows x64/macOS arm64. Выполненные проверки SHALL иметь evidence с окружением и ограничениями.

#### Scenario: Browser QA passed
- **WHEN** browser tests с IPC fixtures проходят
- **THEN** это подтверждает UI-сценарии, но native spawn/trust/cleanup/install на обеих ОС остаются открытыми до отдельного выполнения

#### Scenario: Native platform unavailable
- **WHEN** нет соответствующего native runner
- **THEN** задачи приёмки этой ОС остаются unchecked, change не архивируется как завершённый
