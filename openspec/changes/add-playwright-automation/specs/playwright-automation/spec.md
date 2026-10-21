# Spec Delta

## Purpose

Показывает автотесты, написанные в VS Code, в приложении, связывает их с кейсами и позволяет запускать их из прогона с аргументами окружения, сохраняя проверяемый результат рядом с ручными результатами.

## ADDED Requirements

### Requirement: Autotest project folder
Система SHALL определять проект автотестов по наличию папки `.ch/autotests/` и SHALL запускать discovery и execution с этой папкой как `cwd`, разрешая `@playwright/test` из её `package.json`/`node_modules`. Отсутствие папки SHALL означать «автотестов нет» и SHALL NOT заставлять приложение искать Playwright в корне репозитория.

#### Scenario: Project present
- **WHEN** в репозитории есть `.ch/autotests/`
- **THEN** discovery и запуск используют её как корень Playwright-проекта, а каталог и результаты относятся к тестам внутри неё

#### Scenario: Project missing
- **WHEN** папки `.ch/autotests/` нет
- **THEN** discovery показывает диагностику с ожидаемым путём и не запускает Playwright из корня репозитория

### Requirement: Autotest catalog from explicit discovery
Система SHALL получать каталог автотестов только по явному действию пользователя для доверенного профиля (cwd, config, projects) и SHALL NOT исполнять config/тестовый код при открытии репозитория или импорте отчёта.

#### Scenario: Discover tests
- **WHEN** пользователь запускает discovery в настроенном профиле
- **THEN** каталог показывает тесты с `automationId`, `project`, `variantId` и пометками expected status, а открытие раздела до этого код не запускает

#### Scenario: No trust or missing Node
- **WHEN** профиль не подтверждён или внешний Node/Playwright отсутствует
- **THEN** система показывает ошибку и не запускает discovery, не устанавливает зависимости и не вызывает shell

### Requirement: Stable test identity
Система SHALL идентифицировать тест по annotations `testoritto.caseId`, `testoritto.automationId`, `testoritto.project`, `testoritto.variantId` и SHALL блокировать запуск при отсутствующем или дублирующемся ключе, не угадывая связь по названию или пути.

#### Scenario: Renamed test
- **WHEN** файл и title теста изменены, а `automationId` сохранён
- **THEN** привязка и прежние результаты остаются связанными с тем же тестом

#### Scenario: Duplicate or missing identity
- **WHEN** discovery находит повтор ключа или тест без обязательной аннотации
- **THEN** пользователь видит диагностику, а запуск этого набора блокируется

### Requirement: Multiple bindings per case
Система SHALL поддерживать несколько привязок на кейс и переиспользование одного автотеста в разных кейсах, с признаком `enabled` и overrides аргументов; архив автотеста SHALL NOT удалять историю и привязки.

#### Scenario: Several autotests for one case
- **WHEN** к кейсу добавлены два автотеста с разными значениями аргументов
- **THEN** сохраняются отдельные привязки, и запуск создаёт отдельный invocation для каждой

#### Scenario: Disabled or archived binding
- **WHEN** привязка отключена или автотест заархивирован
- **THEN** она не участвует в новом запуске, а прежние результаты остаются читаемыми

### Requirement: Typed arguments with reference-book values
Система SHALL разрешать только объявленные автотестом аргументы, проверять типы, обязательность и значения, применять приоритет `schema → autotest → binding → run override` и SHALL поддерживать ссылку на ключ записи «Аргументы» справочника. Перед запуском SHALL показываться preview итоговых значений и источников.

#### Scenario: Dev and stage values
- **WHEN** аргумент `baseUrl` ссылается на `dev` и `stage` из справочника
- **THEN** preview показывает итоговое значение и источник, а manifest фиксирует значение и revision записи

#### Scenario: Stale or invalid value
- **WHEN** запись справочника изменена после preview, архивна или тип значения не совпадает
- **THEN** запуск блокируется с диагностикой; сохранённые прежние результаты не меняются

#### Scenario: False and zero values
- **WHEN** override задаёт `false`, `0` или пустую строку допустимого типа
- **THEN** значение применяется как заданное и не подменяется значением по умолчанию

### Requirement: Run from a test run and save results
Система SHALL запускать выбранные привязки из прогона с выбранным набором аргументов, показывать прогресс, позволять остановку и сохранять результат execution в папку прогона. Система SHALL NOT перезаписывать ручные результаты, checks и notes без явного подтверждённого действия.

#### Scenario: Run linked autotests
- **WHEN** пользователь запускает автотесты для прогона
- **THEN** выполняются только выбранные ключи, результат появляется отдельно от ручных отметок и сохраняется в прогон

#### Scenario: Stop or timeout
- **WHEN** пользователь останавливает запуск или истекает таймаут
- **THEN** дерево процессов завершается, незавершённые попытки помечаются interrupted, а ручные данные не меняются

#### Scenario: Explicit apply to summary
- **WHEN** пользователь применяет автоматический результат к сводке
- **THEN** изменение выполняется только после preview, а конфликт revision отменяет применение без потери данных

#### Scenario: Rerun failed only
- **WHEN** пользователь повторяет упавшие тесты завершённого execution
- **THEN** создаётся новый execution с `parentExecutionId`, прежние attempts сохраняются

### Requirement: Exact selection and manual-run compatible argument channel
Система SHALL запускать только выбранные тесты: точный набор определяется фильтруемым маркером теста (тег/список тестов) вместе с `project`, при отсутствии однозначного маркера запуск SHALL быть заблокирован с диагностикой. Аргументы SHALL передаваться тесту каналом, работающим и при ручном запуске в VS Code, без записи секретов в репозиторий.

#### Scenario: Only the selected variant runs
- **WHEN** у теста несколько projects/вариантов, выбран один
- **THEN** выполняются только его invocation, соседние варианты не запускаются

#### Scenario: Manual run in VS Code
- **WHEN** тестировщик запускает тест напрямую из VS Code без приложения
- **THEN** тест получает значения по умолчанию и корректно выполняется

#### Scenario: Ambiguous marker
- **WHEN** у теста нет фильтруемого тега или ключ дублируется
- **THEN** запуск блокируется с понятной диагностикой и не запускает лишние тесты

### Requirement: Observable execution lifecycle
Система SHALL показывать состояние запуска автотестов с проверяемыми переходами `queued → starting → running → finishing → completed | runner_error | cancelled | interrupted`. Система SHALL NOT показывать «выполняется», если процесс не запустился, и SHALL NOT считать успехом завершение без валидного отчёта.

#### Scenario: Start is visible
- **WHEN** пользователь запускает автотесты для прогона
- **THEN** появляется execution со временем старта и состоянием `starting`/`running`; если Playwright не начал выполнение за порог, показывается диагностика с хвостом логов

#### Scenario: Progress is visible but not authoritative
- **WHEN** тесты выполняются
- **THEN** видны число завершённых из выбранных, текущий invocation, прошедшее время и хвост логов, а итоговый статус по-прежнему берётся только из отчёта

#### Scenario: Finish is explicit
- **WHEN** процесс завершился
- **THEN** система показывает `completed` с результатами или `runner_error` с диагностикой, уведомляет пользователя, а execution остаётся доступным после переоткрытия

#### Scenario: Cancel and crash are distinct
- **WHEN** пользователь остановил запуск или приложение оборвалось
- **THEN** различаются `cancelled` и `interrupted`, дерево процессов завершено, а прерванный execution не продолжается автоматически

### Requirement: Deterministic grouping and ordering
Система SHALL группировать выбранные тесты в invocation'ы по одинаковому набору разрешённых аргументов и project, SHALL выполнять invocation'ы в детерминированном порядке (порядок выбора/строк прогона) и SHALL NOT переупорядочивать тесты внутри одного запуска Playwright — порядок и параллелизм там определяются конфигурацией проекта.

#### Scenario: Same arguments grouped
- **WHEN** несколько привязок имеют одинаковые resolved args и project
- **THEN** они выполняются одним invocation, а тесты с другими аргументами — отдельными

#### Scenario: Playwright owns order
- **WHEN** проект настроен на параллельные workers или dependency projects
- **THEN** приложение не форсирует последовательный режим, заранее показывает зависимости и предупреждает о параллельном выполнении

#### Scenario: Sequential invocations by default
- **WHEN** выбранные привязки требуют разных наборов аргументов
- **THEN** invocation'ы выполняются последовательно, и состояние каждого видно отдельно

### Requirement: Bounded results and artifacts
Система SHALL сохранять attempts, статусы (включая expected failure и flaky), длительность, логи и вложения в пределах лимитов, помечать усечение и SHALL NOT открывать автоматически HTML/внешние ресурсы.

#### Scenario: Flaky and expected failures
- **WHEN** тест прошёл после retry, а другой упал ожидаемо
- **THEN** у первого видны обе попытки и статус flaky, второй не помечается неожиданной ошибкой

#### Scenario: Runner failure
- **WHEN** config не загрузился или отчёт отсутствует/невалиден
- **THEN** execution получает runner_error с диагностикой, а не ложный успех

### Requirement: Automation results in run reports
Система SHALL включать в отчёт прогона (PDF/JSON) раздел автотестов со статусами, длительностью и таблицей аргументов с источниками и именем набора окружения.

#### Scenario: Report with arguments
- **WHEN** прогон с запущенными автотестами экспортируется
- **THEN** отчёт содержит статусы привязок и снимок аргументов, по которым они выполнялись
