# Design

## Context

См. proposal.md. Исследованы upstream `components/editor/{CaseEditor,ObjectiveEditor,SetupControl,StepsControl,ListControl,FmtBar}.tsx`, `utils/variables.ts`, `utils/markdown.tsx` и `markdown-html.ts`. Переменные разрешают дату; относительные Markdown-ссылки рендерятся текстом (safeUrl разрешает только http/https/mailto). Поэтому совместимость означает сохранение читаемого исходника, а не обещание интерактивной карточки в Casewright.

Текущий `apps/desktop/src/ux-preview` изолирован от `src/main.tsx` и по умолчанию не собирается в release. `usePreviewWorkspace` объединяет участников dirty guard; `usePreviewNavigation` обеспечивает save/discard/cancel. Продуктовый IPC и native формат этим прототипом не меняются. Связанные контракты: docs/DATA-COMPATIBILITY.md, openspec/changes/add-testoritto-mvp/specs/case-authoring/spec.md и test-runs/spec.md.

## Goals / Non-Goals

**Goals:** проверить каталог и редактор на существующих токенах; затем обеспечить переносимость, стабильные ссылки и воспроизводимость прогонов.

**Non-Goals:** обход прав внешних документов, копирование их содержимого, новый wiki-движок, автоматическая подстановка и изменение формата `.casewright`.

## Decisions

1. Один раздел «Справочник» с типами `term | abbreviation | document`. Три отдельных каталога дублировали бы поиск и привязки. Запись: `id`, `kind`, `title`, `aliases: string[]`, `description: string`, `url?: string`, `archived: boolean`. Название обязательно, описание или URL обязательно. Совпадение названий допустимо: ID определяет идентичность, в picker различение по типу и описанию.
2. Первый срез — только память React: каталог/поиск/фильтры, карточка, create/edit/save/discard/archive/restore, общий dirty guard и изоляция демо-репозиториев. URL показывается как текст, без переходов и fetch. Alias допускается в данных и поиске; удобный редактор aliases можно добавить в том же срезе. Будущие связи не имитируются фиктивными счётчиками.
3. Native-хранение предлагается в `<repo>/.testoritto/glossary/<uuid>.md`, YAML frontmatter `schema_version: 1`, `id`, `kind`, `title`, `aliases`, `archived`, `url`; body — Markdown описания. Имя файла не зависит от title. Это намеренное расширение прежней политики «.testoritto не создаётся», не миграция `.casewright`; первый writer создаёт каталог только по явному сохранению. До native-среза документация текущего формата остаётся верной. Отдельные файлы дают короткие Git diffs; единый JSON увеличивал бы конфликты. Unknown fields/blocks и исходные line endings сохраняются при несвязанных правках.
4. Ссылки кейса — `[подпись](относительный-путь/.testoritto/glossary/<uuid>.md)`. Rust вычисляет relative path от case location, разрешает только canonical файл в glossary текущего repo и исключает symlinks наружу. При move кейса ссылка должна быть пересчитана в той же операции; прежний текст подписи сохраняется. При rename записи путь не меняется. Простые регэкспы по всему Markdown непригодны: ссылки внутри code blocks не являются usages. Parser должен разбирать реальные link nodes. Ручной произвольный relative path не означает разрешение открыть файл.
5. Вставка — поиск записи из поля редактора, карточка — по явному действию. Автозамена каждого похожего слова не вводится. Архивные записи доступны старым ссылкам, не предлагаются по умолчанию. Сначала archive/restore; физическое удаление отложено, пока нет проверенного usage index. Alias — поисковая метка, не идентичность.
6. Snapshot-прогон получает копии использованных glossary записей в отдельном расширении внутри run folder, включая ID/source revision/title/description/url и manifest. Его точный writer реализуется совместно с транзакцией создания run, до публикации результата. Неизвестные расширения `.casewright` сохраняются. Относительные ссылки snapshot разрешаются через его manifest, а не от папки исходного кейса. Незавершённый snapshot не выдаётся за созданный прогон.
7. Продуктовый путь: Page → use-case → typed facade → invoke → Rust command/service. Rust валидирует caller/session/schema/path/revision, владеет IO/FIFO/watcher. `list/read/save/archive` получают opaque resource/session и revision; произвольные абсолютные пути из WebView не принимаются. Scope Git расширяется только проверенными glossary/snapshot файлами; save/commit/push остаются разными действиями. Ошибки typed, черновик не сбрасывается.
8. Описание рендерится безопасным Markdown subset; URL HTTP(S) валидируется в обеих границах, native opener только по клику. Ни preview, ни native read не скачивают документ. Windows x64/macOS arm64 требуют собственных round-trip/path/native проверок, новых packaging зависимостей нет.

## Risks / Trade-offs

Уточнение 2026-10-17: к `term | abbreviation | document` добавляется `environment`. У environment собственное структурированное поле `values` с уникальными keys и primitive string/number/boolean значениями; title/description сохраняют обычный смысл. Пароли/токены не хранятся здесь. Изменение значения не переписывает историю: automation invocation сохраняет entry ID/revision/key и resolved value. Поле values не генерируется из description или URL. Версия writer меняется явно с совместимым reader прежних записей; unsupported новые типы не перезаписываются старыми readers. Нативная реализация/round-trip обоих вариантов ещё открыты. Точные arguments contracts, пределы и разрешение references принадлежат `add-playwright-automation/design.md`.

Уточнение UX 16 октября: пользователь потребовал чтение кейса вместо постоянно открытого редактора и полноценную вставку сущности справочника. В следующем browser-срезе кейс открывается для чтения; «Редактировать» включает поля, «Чтение» показывает текущий draft без сохранения/сброса. Ссылка отображает подпись как интерактивное значение; карточка содержит пояснение и переход в раздел справочника. При переходе с draft действуют существующие guards. Picker «Из справочника» вставляет обычный Markdown link в текущую selection/caret, включая Markdown source и компактные шаги; архивные записи исключены из новых вставок, существующие остаются читаемыми. Link resolver в preview сопоставляет только вычисленные ссылки текущего demo repo, ничего не читает с диска. Неразрешённая ссылка показывает диагностику; HTML/небезопасные URL/изображения не исполняются. Reader строит React nodes из Markdown AST, без dangerouslySetInnerHTML. Native writer, usage index и snapshot остаются следующими задачами.

- Casewright не открывает относительные ссылки → честно показывать ограничение, оставлять читаемую подпись/Markdown.
- Справочник новый формат → versioned parser, unsupported read-only, fixtures/unknown round-trip до writer.
- Перенос кейса и snapshot меняют base path → rewrite только распознанных ссылок с manifest и parity тестами.
- Изменение внешнего документа → сохраняется пояснение и URL, не обещается архив содержимого внешнего сервиса.
- In-memory preview не проверяет Rust → задачи native остаются открытыми независимо от browser tests.

## Migration Plan

Не выполнять миграции при открытии. Сначала UX preview, затем отдельно parser/service/IPC с temp repositories, затем product UI/links/snapshot/Git. Откат UI не удаляет сохранённые Markdown-данные; старые версии оставляют неизвестное расширение нетронутым.

## References

- Локальные исходники и совместимость перечислены в Context.
- https://v2.tauri.app/develop/calling-rust/ — существующая IPC граница проекта.
- https://v2.tauri.app/security/capabilities/ — явные разрешения commands.
