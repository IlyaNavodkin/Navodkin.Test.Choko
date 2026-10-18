# Section Markdown editor

## Scope

В изолированном React-моке цель, подготовка и ожидаемый результат используют Tiptap. После UX-обратной связи шаги переделаны в компактные Markdown-строки на Textarea: тяжёлый визуальный редактор на каждый пункт мешал работе со списком. Метаданные, stable ID, структура кейса и native writer не меняются.

## Design

Компонент принимает Markdown string, onChange, accessible label и disabled/readOnly. Визуальный режим по умолчанию; исходник Markdown доступен рядом. Переходы между режимами и раскрытие в большой редактор сами по себе не меняют значение и не делают кейс dirty. Изменения сразу попадают в существующий draft, а Save остаётся явным действием кейса.

Оформление продолжает выбранные макеты: читаемый текст, одна постоянно зарезервированная панель форматирования и режимов, выделение активных команд, slash-вставка блоков и большая область для длинного текста. Фокус и выделение не добавляют строки управления; bubble toolbar удалён. Ссылка редактируется в overlay, операции таблицы доступны через «Вставить», поэтому эти действия не сдвигают текст. Планируемый набор: bold/italic/strike, headings, bullet/ordered/task lists, quote, inline/fenced code, links, simple tables, undo/redo. Цвета и controls — Citadelic и @codaa/ui.

Markdown является внешним контрактом; Tiptap JSON — внутреннее состояние. Нет записи HTML/JSON вместо Markdown. Открытие и переключение режимов сохраняют исходную строку. Неизвестный или неподдерживаемый синтаксис нельзя молча выбрасывать: для такого содержимого остаётся исходник с понятным объяснением. Markdown extension Tiptap пока beta, поэтому поддерживаемый набор должен быть подтверждён тестами. Произвольный HTML и загрузки изображений в этот срез не входят.

Без облака, лицензируемых Pro-сервисов, сети/storage/IPC из редактора. Ссылки не открываются при редактировании; небезопасные URL не применяются. Source отображается как текст. Disabled/readOnly блокирует все способы изменения, включая toolbar, shortcuts и раскрытый режим.

## Tasks

### Glossary preview update

Кейс теперь начинает с безопасного чтения Markdown. Явные «Редактировать»/«Чтение» переключают редактор и представление текущего draft; после первого открытия редактор остаётся mounted при чтении, сохраняя собственную undo history. Прямой `CaseDocument` сохраняет editor-only контракт для fixtures; режимы выбирает `CaseReading` внутри `CaseWorkspace`. Run snapshots этим изменением не подключаются к текущему справочнику.

Generic `ReferenceOption[]` добавляет picker «Из справочника» в rich/source editor, без зависимости редактора от glossary use case. Rich-вставка сохраняет selection до modal и использует единственную транзакцию с границами undo; source/step вставка меняет только slice, сохраняя CRLF вне вставки. Поиск/отмена не вызывают onChange. Сохраняются readonly/write guards и прежний сброс истории при внешней замене документа. UI текста находится в typed resource `referenceMessages.ts`.

В дополнение к внешнему `isSafeLink` введён узкий `isGlossaryReferenceHref`: только `../`-префикс и `.testoritto/glossary/<uuid>.md`, без encoding/query/backslash/произвольных относительных путей. Это допускает сохранение ссылок в Tiptap, но не даёт доступа к файлам. Reader рендерит React AST без HTML injection и внешних загрузок. См. [GLOSSARY.md](GLOSSARY.md) для границ demo resolver и незавершённых native задач.

- [x] Проверить актуальный официальный API и совместимые версии Tiptap; зафиксировать зависимости.
- [x] Реализовать компонент, Markdown codec/preservation policy, типизированные props/hooks и UI.
- [x] Подключить внутри четырёх видов секций мока, сохранив операции шагов и существующие guards.
- [x] Проверить Markdown round-trip, no-op переключения, unsupported source, unsafe URLs, readonly, undo/redo, внешние обновления и независимость секций.
- [x] Пройти headless browser сценарии форматирования, slash, source, раскрытия, Save/guard и узкого окна; сохранить скриншоты.
- [x] Выполнить проверки и записать реальные ограничения. Перенос в production/Tauri — отдельный этап.

## Upstream observations

Прочитаны `casewright-main/apps/desktop/src/components/editor/ObjectiveEditor.tsx`, `SetupControl.tsx`, `StepsControl.tsx`, `ListControl.tsx` и `FmtBar.tsx`. Objective использует Markdown textarea с отдельным preview и небольшим FmtBar; Setup — именованные пункты с многострочным Markdown body. Steps/ListControl используют компактные input-строки: Enter добавляет пункт после текущего, Backspace удаляет пустой пункт при наличии соседей, фокус переходит в новую/предыдущую строку. Upstream Steps дополнительно поддерживает depth и drag-reparent, ListControl — drag-reorder. Идея плотных строк подходит списку шагов лучше, чем несколько полных Tiptap-панелей.

В preview поведение реализовано самостоятельно на @codaa/ui, без копирования upstream JSX/CSS/утилит. Шаги остаются `string[]`: Enter добавляет после текущего, Shift+Enter оставляет перенос внутри Markdown, Backspace удаляет только полностью пустую строку при количестве больше одного. Новый/предыдущий пункт получает фокус; кнопки вверх/вниз/удалить доступны с клавиатуры. Локальные ключи перемещаются вместе со строкой, существующие DOM-поля не пересоздаются при reorder или удалении соседей. Новая строка последней кнопкой также получает фокус. В blocked/saving состоянии Textarea и родительский fieldset отключены, handlers не добавляют и не удаляют строки.

Это только UX-срез `/ux-preview.html`, без fs/IPC/native writer и без изменения реальных репозиториев. Depth, drag-reparent, именованные Setup items и лист Acceptance не добавлены в текущую упрощённую модель. Совместимость этих структур требует отдельного product-переноса и тестов. Source fallback, явные Markdown/визуальный режим, expand, slash, безопасные ссылки и сброс внешней истории Tiptap сохраняются. Markdown шагов выводится только в текстовом поле, без выполнения HTML.

## Current verification

После переделки: `pnpm --filter @testoritto/desktop typecheck` проходит; focused Vitest `sectionMarkdown.spec.tsx` и `uxPreview.spec.tsx` — 65/65; полный frontend Vitest — 160/160 (16 files). Новые поведенческие проверки подтверждают Enter/Backspace/focus, Shift+Enter, запрет удаления единственного шага, DOM identity/reorder, добавление последнего пункта, readonly boundary, единственную панель при focus/modes и отклонение опасной ссылки. JSDOM не измеряет геометрию и реальный browser layout. Основной агент отдельно подтвердил в headless Chromium Enter → фокус нового Шага 2, Shift+Enter → multiline, смещение текста при фокусе Цели `layoutShift=0` и `pageerror=[]`; просмотрен `.cache/editor-casewright-revised.png`. Полная повторная проверка окна 760 px и всех overlay-сценариев после переделки этим отчётом не подтверждается.

## Previous verification

Ниже зафиксированы проверки предыдущей версии. Скриншоты и bubble-сценарии относятся к версии до переделки; они не подтверждают текущее поведение.


Реализовано в React-моке `/ux-preview.html`. Компонент: `apps/desktop/src/ux-preview/components/markdown-editor/SectionMarkdownEditor.tsx`; контракт `value: string`, `onChange`, `label`, `disabled?`, `readOnly?`. Восемь пакетов Tiptap зафиксированы на одной версии 3.32.0 в desktop package.json и pnpm-lock.yaml. Production/native редактор и writer не изменены.

В предыдущей версии клик по полю показывал панель, выделение — плавающие inline-команды; **Вставить** содержит блоки. `/` в начале пустого параграфа открывает меню с фильтром, стрелками/Enter/Escape. **Markdown** показывает исходник, **Развернуть** открывает тот же экземпляр в большом окне. Родительский Save сохраняет draft в demo-память. После настоящих визуальных правок поддерживаемый Markdown может нормализоваться; без правок исходная строка сохраняется точно.

Скриншоты: [секции](markdown-editor/sections.png), [большой редактор](markdown-editor/expanded.png), [760 px](markdown-editor/narrow.png), [slash-меню](markdown-editor/slash-menu.png).

Основной агент проверил в headless Chromium: no-op focus/modes/expand не делают dirty; bubble bold и undo/redo; изменение в Modal → закрытие → undo; dirty navigation и Save; slash → таблица → редактирование → Markdown; безопасная ссылка и отклонение javascript URL; HTML/image fallback без image DOM и внешних запросов; удаление неподдерживаемого синтаксиса не переключает режим посреди ввода; readonly; 760 px без page overflow. Проверены menu→block command→typing с сохранённым фокусом, bubble внизу длинного документа, flip slash внутри окна и Escape сначала меню/потом Modal с возвратом фокуса. Slash на 760×900: x284/y444/280×234, внутри viewport. Браузерных pageerror нет.

Проверки: frontend Vitest 155/155 (16 files, из них sectionMarkdown 39 тестов); TypeScript и default production build проходят; `check:ui` и `spec:validate` проходят. Mock entry не входит в release: dist содержит только продуктовый index.html. Прежние build warnings use client/chunk size сохраняются.

Ограничения: компонент пока подключён только в UX-моке. Консервативная subset policy оставляет HTML, изображения, footnotes/reference definitions, custom blocks/math, aligned tables и небезопасные ссылки в исходнике. Paste визуального режима — простой текст; изображений/вложений и внешних загрузок нет. В blocked/saving состоянии родительский fieldset также отключает controls режима/раскрытия. Native совместимость и полное сохранение файлов Casewright этим browser-срезом не подтверждаются.

## References

Актуальный browser-срез чтения и вставки glossary links проверен основным агентом; сценарии, 179 frontend tests и screenshots: [GLOSSARY.md](GLOSSARY.md#main-agent-verification--reading-and-references). Rich insertion отделена от соседнего typing в undo history. Source/step вставки сохраняют selected slice и возвращают focus; CRLF offsets/redo caret покрыты тестами. Native writer этим не подтверждается.

Дополнительная проверка основного агента после UX-переделки: на 760×900 три Tiptap-секции и компактные шаги без горизонтального page overflow; focus Цели даёт смещение 0 px. Проверены отклонение javascript URL, границы link overlay, Escape сначала slash/потом Modal. В readonly заблокированы step Textarea, contenteditable и Expand. Pageerrors в этих сценариях нет. [Актуальный редактор](glossary/revised-editor-1440.png); прежние bubble-сценарии выше относятся к исторической реализации.

- https://tiptap.dev/docs/editor/markdown
- https://tiptap.dev/docs/editor/markdown/getting-started/installation
- https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage
- docs/DATA-COMPATIBILITY.md и OpenSpec case-authoring: сохранение неизвестного содержимого и явный Save.
