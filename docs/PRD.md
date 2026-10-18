# Testoritto — проект технического задания

Версия 0.3, 2026-10-13. Статус: основа и targets подтверждены; остальной MVP scope частично **для обсуждения**. Пользователь разрешил начать независимый Tauri-каркас; реализация не завершена.

## 1. Назначение

Testoritto — десктопный редактор ручных тест-кейсов и результатов тестирования. Пользователь открывает локальную копию Git-репозитория, редактирует тесты и прогоны, просматривает изменения и обменивается ими через commit/pull/push. Файлы читаются редактором и Git без приложения.

Основные пользователи: QA, аналитики и разработчики. Git credentials и права доступа определяет настроенный Git remote. Собственного сервера, аккаунтов Testoritto и realtime синхронизации в рекомендуемом MVP нет.

## 2. Обязательные ограничения

1. Tauri 2 как desktop runtime; React + TypeScript + Vite frontend; Rust native backend.
2. Desktop на Windows и macOS.
3. Данные и совместная работа через Git.
4. Совместимость с существующими репозиториями Casewright.
5. UI Kit из `ui/`; палитра из Citadelic.
6. Работа по OpenSpec с предоставленным frontend skill.

Первая поставка ориентирована на Windows x64 и macOS arm64. Минимальные версии ОС остаются открытыми.

Основа Tauri 2 выбрана пользователем. Файловые операции, Git и OS integration выполняются Rust backend через ограниченный Tauri IPC. Формат Casewright сохраняется; Node.js используется для frontend tooling, Node-sidecar не планируется.

## 3. Рекомендуемый MVP

### 3.1 Открытие репозитория

- Открыть уже клонированный Git repo через нативный folder picker, запомнить recent repositories в OS app data.
- Проверить наличие Git, repo root, `.casewright/config.yaml` и workspace paths. Отобразить понятную ошибку для неподходящего repo.
- Инициализацию Casewright-compatible структуры выполнять отдельным явным действием; само открытие ничего не меняет.
- Показать ветку, remote, рабочие области, suites и кейсы. История recent и preferences не коммитятся в data repo.
- Один активный writable session на repo, без конкурирующих внутренних окон.

### 3.2 Кейсы и suites

- Создание, редактирование, дублирование, перемещение и удаление кейса; suites как папки; keyboard navigation.
- Поля: неизменяемый `id`, `displayId`, title, optional slug, status, tags, Objective, Systems, Setup, Steps, Acceptance Criteria.
- Статусы: draft / active / deprecated. Steps допускают вложенность. Поиск и фильтры по title, displayId, tags, status.
- Сохранять в совместимый Markdown + YAML frontmatter с детерминированной сериализацией. Стабильный id не меняется при rename/move.
- Существующие `.order` и folder notes сохраняются. Неизвестные поля и секции нельзя потерять при сохранении.
- Для форм загрузка/ошибка/dirty/saving/saved; ошибка диска не должна выглядеть как успешное сохранение.
- Удаление и discard показывают конкретные затрагиваемые файлы и требуют явного подтверждения в интерфейсе.

### 3.3 Прогоны

- Создать прогон из выбранных кейсов/наборов и показать порядок выполнения.
- Сохранять snapshot текста и stable case id, чтобы последующие изменения исходных кейсов не меняли старый прогон.
- Результаты: not_run / in_progress / pass / fail / blocked / skipped; tester, executed_at, notes, item check states и fail notes.
- Summary, Notes, open/closed и существующие approvals сохраняются. Управление approvals и variables — вопросы scope; сохранение их данных обязательно независимо от UI.
- Хранилище текущего Casewright: `.casewright/runs/<run>/_run.md` + `NNN-<id>.md` и optional `.order`, **не CSV**.

### 3.4 Git workflow

- status, branch, changed files, diff и ahead/behind; fetch явно или с ограниченным фоновым refresh после согласования.
- Commit с сообщением и явным выбором продуктовых файлов. Save не делает commit, commit не делает push.
- Pull/push текущей настроенной ветки через системный credential helper/SSH. Поддержка remote определяется Git, без обязательной GitHub API интеграции.
- До Git-операции завершить pending disk writes; сериализовать изменения одного repo.
- Ошибки auth, offline, missing remote/upstream и push rejected сохраняют локальные изменения и дают понятный следующий шаг.
- При конфликте приложение сообщает об ошибке и показывает unmerged paths; единственное действие приложения — явный безопасный abort текущей операции. Разрешение конфликтов внутри приложения и отдельный UI для внешнего редактора не поддерживаются. Если Git не может безопасно выполнить abort, приложение блокирует продолжение и показывает диагностику; безусловное восстановление состояния не обещается. Автоматические reset/clean/force запрещены.
- Detached HEAD, rebase/merge in progress и non-fast-forward не должны приводить к автоматическому reset/clean/force push.

### 3.5 UI и ОС

- Рабочее пространство: дерево слева, редактор/прогон в центре, Git status и команды в chrome; desktop-first плотность.
- @codaa/ui для кнопок, форм, modal, tree, table, status, toast. Missing composite создаётся как продуктовый компонент поверх Kit.
- Тема dark-first на `--app-*`, особенно accent #5e7b96. Цвет не является единственным индикатором результата.
- Native menus/shortcuts: Ctrl на Windows, Cmd на macOS, нативное закрытие и folder picker. Штатный OS frame на MVP — предложение для снижения platform work.
- RU strings через i18n; EN и светлая тема не обязательны для MVP до согласования.

## 4. Данные и надёжность

- Репозиторий — source of truth. Кэш можно удалить без потери данных.
- Открытие не выполняет migration/normalization. Изменение формата — отдельный change и явное пользовательское действие с backup.
- Atomic writes через временный файл в той же папке и rename. Pending saves завершаются перед close/commit; ошибки оставляют dirty state.
- Watcher уведомляет о внешних изменениях; reload чистого файла допустим, dirty editor требует выбора пользователя.
- Перечислить ownership data paths; работа внутри чужого code repo не должна захватывать `.env` или сторонние staged files.
- Symlink/path traversal за пределы открытого repo отклонять. Не запускать встроенные scripts из контента кейсов, не предоставлять Markdown произвольный доступ к Tauri commands, fs или процессам.
- Auth secrets отсутствуют в files/cache/logs приложения. Git hooks исполняются системным Git в рамках доверия к выбранному repo; политику для чужих repos обсудить перед релизом.

## 5. Предложенная приёмка

| Сценарий | Наблюдаемый результат |
| --- | --- |
| Открыть копию настоящего Casewright repo | Tree/cases/runs читаются; byte hash файлов не меняется |
| Изменить title и сохранить | Меняется соответствующий файл; id, неизвестные fields/sections сохранены |
| Перенести кейс | Данные старого прогона и ссылки по stable id остаются корректными |
| Два клона одного temp remote | Изменение в A после commit/push доступно B после pull |
| Конфликт A/B | Приложение показывает ошибку и unmerged paths, предлагает безопасный abort; при отказе abort блокирует продолжение и показывает диагностику |
| Отказ авторизации/сети/диска | Понятная ошибка; нет ложного saved/pushed state |
| Внешнее редактирование | Чистый файл обновляется; dirty draft не затирается молча |
| Startup без Git | Доступна диагностика и инструкция установки; нет падения |
| Windows и macOS installers | Установка, запуск, folder picker, open/edit/save/commit проходят на каждой ОС |
| UI | Kit и tokens используются; keyboard labels/focus; минимум loading/error/empty states |

Скорость на large repo измерить на фиксированной машине и fixture до установки численных SLA. Предложенная нагрузка: 5 000 cases и 100 runs; это не результат замера.

## 6. За пределами обязательного MVP и открытый scope

Собственный backend и RBAC, realtime collaboration, AI generation, integrations Jira/ADO API, встроенные аккаунты GitHub, marketing site, полноценный branch/PR manager, auto-update из private GitHub и conflict resolution UI. Clone/branches/stash UI и UI для variables/approvals остаются открытым scope; не считать их обязательной частью MVP до отдельного решения. Данные существующих расширений сохраняются даже при отсутствии их UI.

Отдельный согласованный scope 2026-10-16: локальная интеграция Node.js автотестов через Playwright reporter, stable case IDs и automation IDs с project/parameter variants, доверенные профили, явный выбор/запуск/повтор упавших/остановка, смешанные ручные и автоматические прогоны, attempts/retry/flaky, logs/errors/attachments и импорт JSON/JUnit с preview и идемпотентным применением. Реализация разрешена и отслеживается в [add-playwright-automation](../openspec/changes/add-playwright-automation/proposal.md). Внешний установленный Node запускается Rust-сервисом только для доверенного профиля; Node в WebView/sidecar не добавляется. Доверие хранится в app-data вне Git; open/import не исполняет код. Automation sidecar сохраняет совместимость Casewright, ручные результаты меняются только после reviewed explicit apply и revision check. CI orchestration, контейнерная sandbox и редактор кода отложены. Native приёмка Windows x64/macOS arm64 остаётся непроверенной до отдельного выполнения; это согласование не расширяет остальной draft MVP.

## 7. Статус и вопросы

Уточнение automation scope 2026-10-17: самостоятельный каталог «Автотесты», несколько автотестов на кейс, переиспользуемые bindings и typed arguments с overrides в прогоне. В справочнике добавляется «Окружение» для несекретных prod/stage values; invocation фиксирует разрешённые значения и source revisions. Generated reports показываются как безопасные данные/вложения и могут явно сохраняться в namespaced папку результата прогона без автоматического stage/commit. Новые contracts/UI/native задачи открыты; проверенный v1 bridge не подтверждает этот новый scope.

Создан минимальный application package `apps/desktop` с React/Tauri каркасом и runtime-diagnostics сценарием. Frontend checks и browser preview проверены; Windows x64 Rust checks, production native build и запуск окна с IPC diagnostics подтверждены. macOS arm64, installers и остальные продуктовые сценарии не проверены. Пользователь разрешил независимый старт каркаса, но оставшийся MVP scope согласован не полностью. Открытые решения перечислены в [DISCUSSION.md](DISCUSSION.md); реализация и проверки отслеживаются в [OpenSpec tasks](../openspec/changes/add-testoritto-mvp/tasks.md). Evidence: [Windows foundation](../apps/desktop/evidence/windows-foundation.md).


Отдельное решение 2026-10-16: предпросмотр отчётов прогона и недели, экспорт PDF/JSON согласованы пользователем и отслеживаются в `openspec/changes/add-run-reports/`. Browser-срез реализован и проверен; подключение реальных repository snapshots, native IPC/save и desktop-приёмка остаются открытыми. Это решение не расширяет scope variables/approvals.
