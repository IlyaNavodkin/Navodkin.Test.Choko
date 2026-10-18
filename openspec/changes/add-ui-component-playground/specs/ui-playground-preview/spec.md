# Spec Delta

## Purpose

Предоставить отдельный локально запускаемый playground, который использует исходную библиотеку и позволяет воспроизводимо проверить полноту и работоспособность её примеров.

## ADDED Requirements

### Requirement: Отдельное приложение и исходная библиотека

Playground SHALL запускаться независимо от основного Testoritto и использовать публичный `@codaa/ui` и исходные tokens без копии компонентов, второй библиотеки или собственной палитры. Его browser frontend SHALL работать без native IPC, Node runtime, backend, credentials и доступа к пользовательским репозиториям.

#### Scenario: Независимый preview
- **WHEN** пользователь запускает playground в подготовленном checkout без desktop package и Rust toolchain
- **THEN** каталог работает в браузере и все демо используют локальные fixtures

#### Scenario: Недоступная библиотека
- **WHEN** локальный workspace package или его public export не разрешается
- **THEN** typecheck/build завершается конкретной ошибкой; каталог не подменяет компонент собственной копией

### Requirement: Воспроизводимые команды

Проект SHALL предоставлять документированные команды dev, typecheck, test, coverage, build и preview для отдельного playground. Dev и preview SHALL слушать loopback и сообщать фактический URL. Занятый заданный порт SHALL давать понятную ошибку без остановки чужого процесса; альтернативный порт SHALL задаваться явно.

#### Scenario: Сборка и запуск
- **WHEN** пользователь выполняет documented build и preview после установки workspace dependencies
- **THEN** build создаёт frontend artifact, preview открывает каталог по указанному loopback URL и загрузка страницы не требует внешних сервисов

#### Scenario: Порт занят
- **WHEN** запрошенный порт используется другим процессом
- **THEN** сервер сообщает причину отказа и инструкцию явного выбора свободного порта, не останавливая другой процесс

### Requirement: Проверяемое покрытие

Проверка SHALL сопоставлять public exports, явную классификацию infrastructure и demo registry. Она SHALL обнаруживать пропущенные, дублированные и устаревшие имена, отсутствие demo/вариантов/controls/verification mapping. Отчёт SHALL различать статическое покрытие и фактически выполненные runtime-сценарии.

#### Scenario: Полный registry
- **WHEN** выполняется проверка текущего registry
- **THEN** все 119 runtime-экспортов классифицированы, 102 визуальных связаны с demo, 17 инфраструктурных исключены с объяснением, неизвестных и повторных записей нет

#### Scenario: Ложное полное покрытие
- **WHEN** запись содержит имя экспортируемого компонента, но renderer не существует или нет вариантов/controls/verification mapping
- **THEN** проверка завершается ошибкой с именем записи, без утверждения о полном покрытии

### Requirement: Runtime evidence

При завершении реализации SHALL быть выполнены typecheck, build, coverage и browser проверки каждого demo из матрицы. Отчёт SHALL содержать проверенные взаимодействия, viewport/focus/console/network результаты и ограничения. Наличие build SHALL не считаться доказательством runtime или native работоспособности.

#### Scenario: Полная browser проверка
- **WHEN** реализация передаётся пользователю
- **THEN** каждый визуальный экспорт открыт в требуемой композиции, варианты и controls проверены; выполнены search/empty/reset, forms, overlays, table/tree, resize, upload и audio сценарии
- **AND** оставлен работающий локальный сервер, указан фактический URL и способ остановки

#### Scenario: Не выполненная проверка
- **WHEN** demo, browser tool или платформа недоступны для проверки
- **THEN** отчёт явно называет непроверенный сценарий и ограничение, соответствующая задача остаётся незавершённой

### Requirement: Документация и границы desktop

Документация SHALL объяснять назначение playground, запуск/остановку, добавление demo, matrix и known limitations. Она SHALL отделять browser preview от Tauri native smoke и installers. Изменения playground SHALL не начинать бизнес-функции или менять specs основного MVP.

#### Scenario: Новый разработчик
- **WHEN** разработчик читает инструкцию из checkout
- **THEN** он может запустить preview и добавить запись для нового экспорта, понимает fixtures и cleanup, а native support не заявлен без отдельной проверки

#### Scenario: Передача в Tauri
- **WHEN** frontend позднее подключается к Tauri 2
- **THEN** browser-only сценарии не требуют Git/fs/IPC permissions; native packaging и проверки каждой ОС выполняются отдельным этапом, не выводятся из результата этого change
