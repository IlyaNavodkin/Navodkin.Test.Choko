# Направления нового UX/UI Testoritto

16 октября 2026. Пользователь выбрал **вариант 1 — спокойный рабочий интерфейс**. Изображения сгенерированы встроенным `image_gen`. Отдельный React-мок находится в `apps/desktop/ux-preview.html`; продуктовый интерфейс не заменён. Промпты: [исходные направления](prompts.json), [выбранный стиль](selected-style-prompts.json).

## Selected direction

| Макет | Сценарий |
| --- | --- |
| [04-repositories.png](04-repositories.png) | Старт и репозитории |
| [05-run-overview.png](05-run-overview.png) | Обзор прогона |
| [06-run-execution.png](06-run-execution.png) | Выполнение прогона |
| [07-git.png](07-git.png) | Изменения Git и отдельные действия синхронизации |
| [08-case-and-folder-operations.png](08-case-and-folder-operations.png) | Создание, перемещение и удаление |
| [09-suite-preview-and-recovery.png](09-suite-preview-and-recovery.png) | Manifest папки, stale preview и частичный результат |
| [10-drafts-and-git-conflicts.png](10-drafts-and-git-conflicts.png) | Черновики, внешние изменения, конфликты и commit |
| [11-run-creation-and-initialization.png](11-run-creation-and-initialization.png) | Создание прогона и явная инициализация |

Изображения задают визуальное направление; точные поля и поведение определяются спецификацией и кликабельным моком. Текст в растровых макетах не является форматом файлов Casewright.

## Recommendation

За основу рекомендуется **вариант 1**: спокойная композиция, читаемый документ, заметные Save/dirty, компактный выбор репозитория. Для больших наборов из варианта 3 можно взять переключаемый табличный каталог; свойства из варианта 2 показывать по запросу, а не занимать ими экран постоянно.

| Вариант | Макет | Применение |
| --- | --- | --- |
| 1. Спокойный рабочий интерфейс | [01-calm-workspace.png](01-calm-workspace.png) | Основная ежедневная работа с кейсами, ясная иерархия и свободное место для текста |
| 2. Плотная рабочая станция | [02-power-workbench.png](02-power-workbench.png) | Работа с деревом и свойствами одновременно; более высокая плотность |
| 3. Каталог и детали | [03-catalog-details.png](03-catalog-details.png) | Поиск и сравнение большого количества кейсов с выбранным документом рядом |

Это альтернативы одного главного экрана, а не три согласованные реализации и не полный комплект всех страниц. Надписи/даты в изображениях — демонстрационные. Изображение не вводит новый API или поле формата: перед React-моком убираются недоступные данные, например автор/даты/размер из декоративной панели варианта 2. Из варианта 3 уже убраны посторонние разделы, неподдерживаемый статус и отдельный expected result на каждый шаг.

## Screen coverage

Основная навигация: **Кейсы / Прогоны / Git**. Репозиторий выбирается компактным switcher с недавними; рабочая область — внутри раздела кейсов. Recents не занимают постоянный блок над редактором. Save и Git commit/push остаются разными действиями.

| Поверхность | Макеты и сценарии следующего этапа | Обязательные состояния |
| --- | --- | --- |
| Старт / репозитории | Первый запуск, список недавних, открытие локальной папки, repo без config | Loading, пустые recents, недоступная папка, нет Git, неподходящий root/config, repo trust/ownership, browser-only |
| Кейсы и suites | Workspace, дерево и поиск/фильтры, нет selection, заметка папки, просмотр и редактирование кейса | Раздельные загрузки дерева/документа, empty/no results, clean/dirty/saving/saved/error, validation, read-only, unknown content, внешний stale файл |
| Прогоны — каталог и обзор | Список, metadata/open-closed/Summary/Notes, результаты и progress, таблица с поиском/filter/pagination | Нет прогонов, нет результатов поиска, loading/error, invalid sidecar, старый snapshot, dirty/failed save |
| Выполнение прогона | Snapshot кейса, checklist/guide, шесть результатов, tester/time/date/notes, Save and next | None/pass/fail шага и пояснение, начало/конец, pending/failed save/stale draft, переход только после успешного Save, завершение |
| Git | Branch/upstream/ahead-behind, выбор файлов и читаемый staged/unstaged/untracked diff, commit composer, pull/push | Clean/dirty, loading/error, binary/stale diff, foreign files, identity/upstream, offline/auth/rejected push, pending flush, conflict и recovery |

Карточка кейса — detail-область раздела «Кейсы». Выполнение — режим выбранного прогона. Не создаём отдельные страницы для каждого hook и каждой маленькой операции.

## Dialog and state coverage

Для выбранного направления нужны следующие диалоги, drawer или состояния на месте:

1. Явная инициализация репозитория с перечнем создаваемых файлов, отменой и ошибкой.
2. Создание и дублирование кейса: название, destination, validation/pending/error; новый stable ID у копии.
3. Переименование файла кейса отдельно от title, текущий и новый путь.
4. Перемещение кейса: выбор destination; удаление: конкретный файл и подтверждение.
5. Создание папки: имя/destination и пояснение про пустую папку в Git.
6. Операции suite: параметры → список затрагиваемых объектов → подтверждение; отмена без apply, stale preview и повторная подготовка.
7. Частичный результат permanent delete: removed/remaining paths, диагностический каталог, блокировка записи/Git, понятное закрытие сообщения без обещания undo.
8. Создание snapshot-прогона: name/date/scope, поиск и выбор кейсов/наборов, порядок.
9. Dirty navigation/discard/reload: сохранить ввод либо явно отказаться от него; failed save не теряет черновик.
10. Выход: продолжить редактирование, Save and exit, явный discard; pending flush и ошибка выхода.
11. Commit: сообщение и точный список выбранных сохранённых продуктовых файлов.
12. Pull/push/abort: подтверждение нужной ветки/upstream, pending и результат.
13. Git conflict: unmerged paths и только безопасный abort; при отказе — диагностика и блокировка. Без редактора разрешения конфликтов и force/reset/clean.
14. Watcher и recovery: ожидающие внешние изменения, ручной refresh, недоступный watcher/root, commit recovery index и read-only состояния.

Контекстные rename/move/duplicate/delete уходят из стены кнопок над деревом в меню выбранного объекта. Основная панель Save/dirty закреплена. Обзор прогона не выводится большой таблицей над recorder во время выполнения.

## Delivery sequence

- [x] Проанализированы текущие страницы, диалоги и спецификации.
- [x] Подготовлены три сопоставимых изображения главного экрана.
- [x] Выбрано визуальное направление пользователем: вариант 1.
- [x] Подготовлен набор макетов остальных экранов и основных состояний в выбранном направлении.
- [x] Поднят отдельный кликабельный React-мок с демонстрационными данными; проверены основные переходы, формы, keyboard/focus и ширины 760/1280/1440 px.
- [ ] После проверки UX изменения перенесены в продуктовые компоненты `@codaa/ui`/CSS Modules с Citadelic `--app-*` и проверены с реальным IPC.

Clone/branch/stash manager, variables/approvals/reporting UI в этот дизайн не добавляются. Дизайн mock не объявляется проверкой native API или завершением продуктовых задач OpenSpec.

## Interactive preview

Секционные редакторы на Tiptap: [MARKDOWN-EDITOR.md](MARKDOWN-EDITOR.md), [скриншот раскрытого редактора](markdown-editor/expanded.png). Компонент доступен в цели, подготовке, отдельных шагах и ожидаемом результате.

Актуальная визуальная переработка, сравнение с эталонами и результаты проверки: [VISUAL-POLISH.md](VISUAL-POLISH.md). [Кейсы](visual-polish/cases.png), [прогоны](visual-polish/runs.png), [выполнение](visual-polish/guide.png), [Git](visual-polish/git.png). Первый вариант до переработки: [12-react-preview.png](12-react-preview.png).

Из корня проекта: `pnpm --filter @testoritto/desktop dev --port 1421`, затем открыть `http://127.0.0.1:1421/ux-preview.html`.

Демо работает в памяти без Tauri IPC, доступа к репозиториям, сети или storage. Обновление страницы сбрасывает данные. В меню **Состояния макета** доступны 29 состояний и **Начать демо заново**; сброс защищён общим диалогом несохранённых изменений.

Покрыты старт, кейсы и папки, обзор/выполнение прогона, Git; создание/дублирование/переименование/перенос/удаление, manifest и stale/recovery, создание snapshot-прогона с порядком кейсов, явная инициализация, dirty navigation, commit/pull/push/abort confirmation. Компоненты и состояние: `apps/desktop/src/ux-preview/`, entry: `apps/desktop/ux-preview.html`.

Проверено основным агентом в headless Chromium: все 29 состояний открываются без pageerror; редактирование → guard → Save → создание кейса → snapshot-прогон → Save and next → commit точного списка → abort → read-only; stale manifest с повторной подготовкой; частичное удаление и блокировка; init failure. Дополнительно проверены автоматическое открытие нового кейса, сброс с dirty guard, отсутствие page overflow в трёх разделах на 760/1280/1440 px, отдельный scroll Git-файлов и Escape с возвратом фокуса. Frontend Vitest: 114/114, из них тесты мока 19/19. `pnpm check:ui` и `pnpm spec:validate` проходят. Typecheck и default production build проходят; в dist только продуктовый index.html, mock entry в release не включён. Сборка сохраняет прежние предупреждения о use client и размере JS bundle.

Ограничения: это UX-прототип. Редкие ошибки представлены демонстрационными banner/panel; filesystem manifest использует фикстуры; вложенные шаги пока показаны плоским списком; EN использует RU fallback. Переключение demo-репозиториев меняет контекст поверх общего набора примеров. Product/native UI, формат данных и OpenSpec-задачи этим этапом не меняются. Перенос в приложение и проверка реального IPC остаются отдельным этапом после оценки UX.

## Sources

Добавлен [Справочник](GLOSSARY.md): первый интерактивный срез с изолированными данными двух demo repo. [Редактор](MARKDOWN-EDITOR.md) переработан после изучения поведения Casewright: компактные шаги и стабильные панели. Текущие проверки и ограничения описаны в этих двух документах; сведения о прежнем общем наборе fixtures выше не относятся к новому справочнику.

`docs/PRD.md`, OpenSpec `add-testoritto-mvp` specs `repository-workspaces`, `case-authoring`, `test-runs`, `git-collaboration`, `design-system`; `RepositoryBrowserPage.tsx` и текущие create/edit/organize/run/Git use-cases. Токены: `ui/theme/tokens.css`. Инвентаризация выполнена последовательно субагентом `gpt-6.1-sol`, изображения и проверка результата — основным агентом.
