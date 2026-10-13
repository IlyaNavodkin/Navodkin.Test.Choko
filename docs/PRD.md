# Testoritto — проект технического задания

Версия 0.2, 2026-10-13. Статус: **для обсуждения**. Подтверждённые ограничения перечислены отдельно от предложенного MVP.

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
- Summary, Notes, open/closed и существующие approvals сохраняются. Управление approvals, variables и полный HTML reporting — вопросы scope; сохранение их данных обязательно независимо от UI.
- Хранилище текущего Casewright: `.casewright/runs/<run>/_run.md` + `NNN-<id>.md` и optional `.order`, **не CSV**.

### 3.4 Git workflow

- status, branch, changed files, diff и ahead/behind; fetch явно или с ограниченным фоновым refresh после согласования.
- Commit с сообщением и явным выбором продуктовых файлов. Save не делает commit, commit не делает push.
- Pull/push текущей настроенной ветки через системный credential helper/SSH. Поддержка remote определяется Git, без обязательной GitHub API интеграции.
- До Git-операции завершить pending disk writes; сериализовать изменения одного repo.
- Ошибки auth, offline, missing remote/upstream и push rejected сохраняют локальные изменения и дают понятный следующий шаг.
- Конфликт не разрешается выбором ours/theirs автоматически. Рекомендуемый MVP: список файлов, внешний редактор, повторная проверка, явный abort. Встроенный structured merge обсуждается отдельно.
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
| Конфликт A/B | Приложение показывает unmerged paths; локальная работа не теряется |
| Отказ авторизации/сети/диска | Понятная ошибка; нет ложного saved/pushed state |
| Внешнее редактирование | Чистый файл обновляется; dirty draft не затирается молча |
| Startup без Git | Доступна диагностика и инструкция установки; нет падения |
| Windows и macOS installers | Установка, запуск, folder picker, open/edit/save/commit проходят на каждой ОС |
| UI | Kit и tokens используются; keyboard labels/focus; минимум loading/error/empty states |

Скорость на large repo измерить на фиксированной машине и fixture до установки численных SLA. Предложенная нагрузка: 5 000 cases и 100 runs; это не результат замера.

## 6. Вне рекомендуемого MVP

Собственный backend и RBAC, realtime collaboration, automated test execution, AI generation, integrations Jira/ADO API, встроенные аккаунты GitHub, marketing site, полноценный branch/PR manager, auto-update из private GitHub, structured merge engine. Данные существующих расширений сохраняются даже при отсутствии их UI.

## 7. Статус и вопросы

Новый application package ещё не создан. В репозитории готова инфраструктура спецификаций, UI workspace и reference source. Перечень решений для согласования — [DISCUSSION.md](DISCUSSION.md); реализация — по [OpenSpec tasks](../openspec/changes/add-testoritto-mvp/tasks.md).
