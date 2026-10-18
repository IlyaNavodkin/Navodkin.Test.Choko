# Coverage Matrix

## Inventory

Срез 2026-10-13: `@codaa/ui` 0.2.0, источник [`ui/index.ts`](../../../ui/index.ts). Проверены props и реализация в соответствующих `ui/<family>/*.tsx`, stores, `backgroundTypes.ts`, `i18n/provider.tsx`. 119 runtime exports = **102 визуальных + 17 инфраструктурных**; `export type` исключается отдельно. Это план покрытия, не отчёт о реализованных/проверенных demo.

Каждая строка — отдельный пункт sidebar по точному export name. `Demo` — стабильный идентификатор сценария; несколько строк могут вести к одной композиции, но справа сохраняются выбранное имя, отдельное описание и роль выбранного экспорта. Общие controls, reset и output применяются ко всей композиции. Каждый вариант проверяется в browser; статическое наличие записи не заменяет взаимодействие.

## Visual Exports

| Export | Группа | Demo и варианты | Controls / state | Способ проверки |
| --- | --- | --- | --- | --- |
| `Button` | Действия | `buttons`: primary/secondary/danger/ghost/ghost-danger/ghost-success; sm/md | variant, size, loading, disabled, leadingIcon, текст, счётчик clicks | сменить props; click/Enter; pending и disabled не увеличивают счётчик |
| `ButtonGroup` | Действия | `button-group`: действия с label; compact группа с menu | подпись, состав действий, disabled | кнопка меняет output; menu открывается |
| `ButtonGroupLabel` | Действия | `button-group`: короткий/длинный label среди кнопок | children и окружение | текст меняется, label не становится action |
| `ButtonGroupMenu` | Действия | `button-group`: Menu в slot; альтернативный action slot | содержимое slot, open Menu | slot виден, MenuItem меняет output |
| `ControlButton` | Действия | `control-buttons`: success/danger/neutral/leave; solid/utility/ghost | variant, appearance, shape, size, active, elevated, disabled | click переключает active; заблокированная кнопка не действует |
| `IconButton` | Действия | `icon-buttons`: default/ghost/brand/danger/success; sm/md | active, activeVariant danger/accent, disabled, tooltipText | доступное имя; active/output меняются; tooltip и focus видны |
| `SectionButton` | Действия | `section-button`: compact/control; accent/success/danger | active, rightContent, rightActive, rightDisabled, отдельные counters | основная и правая кнопки выполняют разные действия |
| `SplitButton` | Действия | `split-button`: primary/secondary; sm/md | disabled, loading, menuAlign, onAction, MenuItems | основное действие отличается от menu; pending предотвращает повтор |
| `Input` | Формы | `inputs`: обычный/с leadingIcon и trailingAction; md/sm/xs | value, size, disabled, readOnly, type, trailing clear | ввод обновляет output; clear работает; readOnly не меняется |
| `Textarea` | Формы | `textarea`: короткий/многострочный; readOnly | value, rows, disabled, readOnly, maxLength | ввод/Enter сохраняют строки; лимит и disabled соблюдаются |
| `SearchInput` | Формы | `search-input`: debounce 0/300 ms; md/sm/xs | value, debounceMs, size, disabled, trailing | fixture фильтруется после задержки; быстрый ввод не оставляет старый результат |
| `Select` | Формы | `select`: placeholder/selected; empty/loading/disabled option | value, open, loading, disabled, size xs/sm/md, matchAnchorWidth | открыть, стрелки/Home/End, выбрать; disabled option пропускается; Escape |
| `Checkbox` | Формы | `checkbox`: checked/unchecked; disabled | checked, disabled, текст | Space/click меняют output; disabled сохраняет значение |
| `Toggle` | Формы | `toggle`: on/off; disabled | checked, disabled | Space/Enter меняют checked и output; disabled не действует |
| `Slider` | Формы | `slider`: число/формат процента; шаг 1/5 | value, min, max, step, disabled, label, formatValue | pointer/стрелки меняют output в пределах диапазона |
| `ColorPicker` | Формы | `color-picker`: initial token color/выбранный sample | value, disabled, label | native выбор меняет sample, цвет — fixture, палитра chrome не меняется |
| `Label` | Формы | `field-validation`: текст/сложная подпись с обязательностью | label, окружение Input/Select | подпись меняется; consumer htmlFor/id связывает поле |
| `ErrorLabel` | Формы | `field-validation`: ошибка/нет ошибки | обязательное значение, submit, id | пустое поле показывает role alert и aria-describedby; исправление убирает ошибку |
| `Breadcrumbs` | Навигация | `breadcrumbs`: 3/7 уровней, icons/no icons | items, maxItems, текущий локальный путь | кнопка меняет путь; ellipsis открывает скрытые уровни; current не action |
| `Tabs` | Навигация | `tabs`: короткие/длинные labels; disabled tab | value, набор tabs | Tab/Enter и consumer стрелки переключают panel; длинные labels прокручиваются |
| `Tab` | Навигация | `tabs`: selected/unselected/disabled внутри Tabs | value, disabled, children, локальный panel | aria-selected и panel совпадают; disabled не выбирается |
| `SegmentedControl` | Навигация | `segmented`: text/icon; sm/md, stretch | value, options, size, stretch, disabled option | выбрать segment с клавиатуры; output/panel меняются |
| `PaginationIndicator` | Навигация | `pagination-indicator`: одна/несколько страниц | totalPageCount, currentPage через отдельные Prev/Next controls | indicator отражает заданную страницу; не приписывать ему onPageChange |
| `Table` | Данные | `table`: selectable/dense; empty и sticky scroll | fixture 24 строки, pageSize 5/10, selection, sort, rowDisabled, onRowClick | сортировка, две страницы, select page/row, disabled row, empty/reset |
| `DataTableToolbar` | Данные | `table`: search + status filter; actions + selected count | searchValue, searchSize, totalCount, selectedCount, clear | фильтр меняет rows/count; clear снимает selection |
| `SelectionBar` | Данные | `table`: с selection/без; label+meta | selectedKeys, label, meta, clearLabel, onClear | выбор показывает верный count; clear обнуляет его |
| `FilterChip` | Данные | `filter-chips`: active/inactive; neutral/success/brand/warning/danger | active, tone, count, dot, icon, disabled | click меняет fixture-filter и aria-pressed; count соответствует fixture |
| `FilterChipGroup` | Данные | `filter-chips`: 2/5 chips | состав/счётчики дочерних FilterChip | фильтры работают внутри group; disabled chip не действует |
| `FileTree` | Данные | `file-tree`: flat parentId fixture; empty/disabled node | expandedIds, selectedId, onMove, rowActions, nodes | стрелки/Enter, expand, Menu row action, перенос file; цикл отвергается |
| `DragAndDrop` | Данные | `reorder-list`: 5 элементов/пустой список | items, onReorder, consumer кнопки вверх/вниз | pointer drag меняет порядок; keyboard кнопка даёт тот же результат; reset |
| `Alert` | Обратная связь | `alert`: info/success/warning/danger; action/no action | variant, текст, icon, action | вариант/slots меняются; action обновляет output |
| `Badge` | Обратная связь | `badge`: neutral/brand/success/warning/danger | variant, children | переключить variant и текст; прочитать status независимо от цвета |
| `DotChip` | Обратная связь | `dot-chip`: color dot/custom leading; sm/md | color как token sample, leading, size, текст | leading заменяет dot, размер и подпись меняются |
| `StatusPill` | Обратная связь | `status-pill`: neutral/info/success/warning/danger/brand; sm/md | tone, pulse, icon, текст | статус меняется; reduced motion прекращает pulse |
| `EmptyState` | Обратная связь | `empty-state`: column/row; icon/no icon | title, description, direction, iconSize | переключить ориентацию и контент; проверить длинный текст |
| `LoadingState` | Обратная связь | `loading-state`: title/description; sm/md/lg | size, текст, consumer toggle loading→content | показ состояния и выход в готовый fixture |
| `Skeleton` | Обратная связь | `skeleton`: строки текста/карточка | width, height, количество, loading | размеры меняются; loading off показывает fixture |
| `Spinner` | Обратная связь | `spinner`: sm/md/lg; inline/block окружение | size, aria-label, loading | размеры и label корректны; loading off убирает spinner |
| `Progress` | Обратная связь | `progress`: 0/0.5/1; brand/warning/success/danger | value 0…1, tone, label | полоса и aria-valuenow совпадают с процентом; края/clamp |
| `Menu` | Обратная связь | `menu`: start/end; controlled/uncontrolled | open, align, width, composition | открыть, выбрать действие, outside/Escape, resize у края |
| `MenuTrigger` | Обратная связь | `menu`: текст/icon trigger; disabled | children, disabled, Menu open | Enter/Space открывают Menu, aria-expanded отражает state |
| `MenuItem` | Обратная связь | `menu`: default/danger/disabled, icon+trailing | tone, disabled, action output | стрелки пропускают disabled; Enter меняет output и закрывает Menu |
| `MenuLabel` | Обратная связь | `menu`: один/два раздела | children, окружение sections | label виден внутри menu, не получает action focus |
| `MenuSeparator` | Обратная связь | `menu`: с/без второго раздела | окружение items и labels | separator реально присутствует между группами, не выполняет action |
| `Modal` | Обратная связь | `modal`: обычный/fullScreen; toolbar/actions | open, fullScreen, maxWidth, closeOnBackdrop, closable | open/Tab trap/Escape/backdrop, scroll body; focus возвращён |
| `ConfirmDialog` | Обратная связь | `confirm`: default/danger; success/error pending | open, tone, loading, simulated failure, local counter | consumer catch/finally; pending один раз; success close, error retry |
| `Popover` | Обратная связь | `popover`: top/bottom, start/center/end | open, placement, align, offset, matchAnchorWidth | trigger, inside controls, outside/Escape, viewport collision |
| `PopoverTrigger` | Обратная связь | `popover`: text/icon; disabled | children, disabled, parent open | aria-controls/expanded; Enter открывает, disabled нет |
| `PopoverContent` | Обратная связь | `popover`: текст/мини-форма | autoFocus, content/slots, родитель placement | content portaled, ввод меняет output; focus/close |
| `Toast` | Обратная связь | `toast`: inline сообщение/сообщение с action | children, role, action slot | текст и action меняются; не выдумывать Toast variant prop |
| `ToastHost` | Обратная связь | `toast`: info/error; auto/manual dismiss | showToast variant/duration, tracked ids, dismiss controls | настоящий host показывает сообщение, click/кнопка/timer скрывают; reset |
| `BlockingOverlayHost` | Обратная связь | `blocking-overlay`: default/custom title | show/hide через local timer до 2 s | overlay появляется, автоматически исчезает; focus восстановлен |
| `DropOverlay` | Обратная связь | `drop-overlay`: passive/interactive внутри bounded target | pointerEvents, title, description, icon, drag hover | overlay виден при drag; passive не мешает drop; локальный результат |
| `Accordion` | Layout | `accordion`: closed/open; right slot | open, onOpenChange, title, right | click/Enter раскрывают content; focus скрытого содержимого недоступен |
| `AccentRail` | Layout | `accent-rail`: div/article/button; brand/success/warning/danger/neutral | as, active, variant, left/right slots | button меняет active; статические варианты не притворяются кнопками |
| `Divider` | Layout | `divider`: horizontal/vertical | orientation, длина окружения | ориентация и пространство меняются без наложения |
| `FloatingToolbar` | Layout | `floating-toolbar`: expanded/collapsed | collapsed, onCollapsedChange, labels | collapse/expand работают, consumer исключает скрытые children из focus |
| `FloatingToolbarGroup` | Layout | `floating-toolbar`: 1/2 action groups | label, children/состав действий | кнопки выполняют действия; group доступно именована |
| `GroupLabel` | Layout | `group-label`: controls group/read-only group | label, children | group и label меняются; controls работают внутри |
| `ResizeHandle` | Layout | `resize-handle`: horizontal/vertical; left/right | axis, side, keyboardStep, bounded size, callbacks | pointer delta и arrow step меняют размер; min/max; reset |
| `SplitPane` | Layout | `split-pane`: horizontal/vertical; fixed/resizable | orientation, defaultSize, minSize, maxSize, resizable, firstLabel | ровно две panes; pointer/keyboard resize; clamp; reset без persistKey |
| `PageShell` | Layout | `page-shell`: stage/chrome; sm/md/lg | variant, width, composition | оба layout работают, внутренняя навигация/форма меняются; reset |
| `PageBrand` | Layout | `page-shell`: mark/local logo; md/lg | title, eyebrow, description, size, logoUrl | локальный brand отображается; default Koster текст переопределён |
| `PageTopbar` | Layout | `page-shell`: compact/full chrome header | children, наличие actions | topbar содержит copy/actions; действия работают |
| `PageTopbarCopy` | Layout | `page-shell`: короткий/длинный заголовок topbar | children | текст не перекрывает соседние actions |
| `PageTopbarActions` | Layout | `page-shell`: одна/несколько кнопок | children | actions в slot изменяют локальный output |
| `PageChromeBody` | Layout | `page-shell`: список/форма внутри chrome | children, выбранный segment | содержимое меняется и прокручивается внутри shell |
| `PageEyebrow` | Layout | `page-shell`: короткая/длинная надпись | children | надпись меняется в stage/header |
| `PageTitle` | Layout | `page-shell`: короткий/длинный title | children | заголовок отображается и переносится без overlap |
| `PageDescription` | Layout | `page-shell`: одна/несколько строк | children | описание и высота композиции меняются |
| `PageHeader` | Layout | `page-shell`: copy/no actions; copy+actions | children | обе композиции работают без overlap |
| `PageHeaderCopy` | Layout | `page-shell`: title-only/title+description | children | разные наборы copy сохраняют layout |
| `PageHeaderActions` | Layout | `page-shell`: primary/несколько actions | children, disabled окружение | actions меняют output; disabled сохраняет state |
| `PageMeta` | Layout | `page-shell`: короткий/длинный metadata | children | metadata меняется в row/user context |
| `PageLink` | Layout | `page-shell`: text/icon link | children, local href и handler | Enter/click меняют local panel без внешнего перехода |
| `PageTextButton` | Layout | `page-shell`: enabled/disabled | children, disabled, onClick | click/Enter меняют output; disabled не действует |
| `PageSegmented` | Layout | `page-shell`: 2/3 segments | children, selected state consumer | composition переключает panel, tablist именован |
| `PageSegment` | Layout | `page-shell`: active/inactive/disabled | active, disabled, onClick, children | active и panel совпадают; consumer arrows/Enter |
| `PageToolbar` | Layout | `page-shell`: search/actions; filters/copy | children | controls фильтруют local list |
| `PageToolbarCopy` | Layout | `page-shell`: heading/heading+meta | children | отображаемый count соответствует фильтру |
| `PagePanel` | Layout | `page-shell`: список/форма | children | panel меняет содержимое; overflow доступен |
| `PageList` | Layout | `page-shell`: обычный/scrollable список | scrollable, fixture length | длинный список прокручивается; row actions работают |
| `PageRow` | Layout | `page-shell`: короткая/длинная row | children, fixture | article содержит body/actions без nested interactive конфликтов |
| `PageRowBody` | Layout | `page-shell`: text link/row с metadata | children, local href и handler | activate меняет выбранную fixture-row |
| `PageRowTitle` | Layout | `page-shell`: короткий/длинный title | children | title корректно размещён в row body |
| `PageRowSubtitle` | Layout | `page-shell`: краткий/многострочный subtitle | children | текст переносится без перекрытия actions |
| `PageRowActions` | Layout | `page-shell`: одна/две actions | children | actions меняют fixture и не активируют row body |
| `PageJoinRow` | Layout | `page-shell`: input+button/input+select | children, field values | controls связаны и подтверждают локальное значение |
| `PageFooter` | Layout | `page-shell`: help/links+actions | children | footer доступен после scroll; действия работают |
| `PageUserChip` | Layout | `page-shell`: display/action | username, label, onClick | div вариант статичен; button открывает локальный profile demo |
| `PageMuted` | Layout | `page-shell`: короткий/длинный secondary text | children | текст меняется и читается на исходных tokens |
| `PageForm` | Layout | `page-shell`: valid/invalid submit | onSubmit, local fields | preventDefault; invalid ошибка, valid output; без HTTP |
| `PageHelp` | Layout | `page-shell`: текст/текст+local link | children | help читается; ссылка работает локально |
| `PageDivider` | Layout | `page-shell`: разделитель 2/3 блоков | окружение children | divider виден между реальными блоками |
| `PageSsoLink` | Layout | `page-shell`: label/icon label | children, local href и handler | click выводит «Демо», не вызывает SSO/network |
| `AnimatedBackground` | Контент и media | `background`: none/links/stars/sparkles/snow | preview=true, settings.kind/density/speed/opacity, token brandColor | bounded canvas; сменить kind; reduced-motion скрывает анимацию |
| `Avatar` | Контент и media | `avatar`: initial/local image/broken image; sm/md/lg/xl | src, initial, size, online, isSpeaking, speakingSrc/silentSrc | смена fixture-image; broken src→fallback; online подписан текстом |
| `AudioWaveform` | Контент и media | `waveform`: static/interactive/recording simulation | samples, active, currentTime, duration, playing, recordable, recordDisabled | seek/play/pause работают с local audio; Record меняет synthetic state без устройств |
| `Icon` | Контент и media | `icons`: все уникальные значения IconNames; xs/sm/md/lg/numeric | name, size, strokeWidth, поиск icons | каждый IconNames name рендерится; смена размера; доступные labels |
| `Markdown` | Контент и media | `markdown`: rich fixture/empty; raw HTML text | content через Textarea | headings/list/code/table/link; HTML не исполняется; local link не уводит каталог |
| `SoundPlayer` | Контент и media | `sound-player`: обычный/disabled; navigation on/off | local WAV fixtures, currentTime/duration/playing/volume, seekDisabled/volumeDisabled | реальные play/pause/seek/volume/next/previous; ошибку playback обработать |
| `UploadDropzone` | Контент и media | `upload`: queued/uploading/done/failed; rejection/disabled | accept, multiple, maxSizeBytes, metadata files, retry/remove, simulated timer | picker/drop; type/size rejection; retry/remove/reset; отсутствует upload request |

## Infrastructure Exports

Эти 17 runtime exports не являются визуальными пунктами. Часть используется для работы demos; каждый всё равно явно классифицируется в future coverage check.

| Export | Классификация / использование |
| --- | --- |
| `canMoveIntoFolder` | helper проверки допустимости перемещения FileTree fixture |
| `collectDescendantIds` | helper дерева, не визуальный компонент |
| `compareFileTreeNodes` | helper сортировки дерева, не визуальный компонент |
| `flattenVisibleTree` | helper получения видимых строк, не визуальный компонент |
| `resolveFileTree` | helper структуры дерева, не визуальный компонент |
| `IconNames` | typed constant map; используется в icons demo и chrome |
| `pageShellStyles` | CSS Module map; не отдельный компонент и не новый style API |
| `showToast` | store command; запускает реальный ToastHost demo |
| `dismissToast` | store command; очищает только tracked demo toast ids |
| `showBlockingOverlay` | store command; запускает bounded blocking demo |
| `hideBlockingOverlay` | store command; timeout/unmount cleanup |
| `I18nProvider` | инфраструктурный context provider без собственного визуального вывода |
| `useI18n` | инфраструктурный hook библиотеки |
| `UI_MESSAGES_EN` | словарь библиотеки, не визуальный компонент |
| `UI_MESSAGES_RU` | словарь библиотеки, не визуальный компонент |
| `BACKGROUND_ANIMATION_DEFAULTS` | объект defaults settings для background demo |
| `BACKGROUND_ANIMATION_KINDS` | список значений kind для background controls |

Все `export type` из barrel классифицируются автоматически как type-only. `AnimatedBackgroundProps` и `InputSize` объявлены в исходниках, но не экспортируются root barrel: consumer использует `ComponentProps<typeof Component>` или собственные typed view-models, не deep import. Внутренние components/functions, которых нет в `ui/index.ts`, не расширяют публичный каталог.

## Verification Protocol

1. Static: public runtime exports = visual registry ∪ explicit infrastructure; sets не пересекаются; type-only отсутствуют. Каждая visual row ссылается на существующий renderer, defaults, варианты, controls и verification mapping. Смена public API выявляется проверкой.
2. Browser: открыть каждый export; проверить варианты и controls из его строки, затем reset; для compound exports реально открыть/использовать родительскую композицию. Записать export, demo id, действия, pass/fail и evidence в runtime report. Один пройденный demo может покрыть несколько exports только при явной проверке каждого элемента.
3. Сквозные: search by name/group, zero results/clear, keyboard/focus, overlays у края, Table pages/selection, tree invalid move, pointer/keyboard resize/reorder, file type/size errors, audio permission failure, reset/unmount pending effects, reduced motion.
4. Visual: 1280×800 и 800×700; достаточная ширина, overflow и видимый focus. Console без неожиданных errors/unhandled rejections; network без внешних fixture requests, uploads или обращения к credentials/devices.

Текущий этап: выполнена инвентаризация public API и `pnpm check:ui`; renderer registry, build и runtime проверки ещё не существуют.
