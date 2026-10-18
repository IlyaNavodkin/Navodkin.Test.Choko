// Явный снимок public API и требований coverage-matrix; проверяется AST checker.
export const visualEntries = [
  {
    "name": "Button",
    "group": "Действия",
    "demo": "buttons",
    "description": "primary/secondary/danger/ghost/ghost-danger/ghost-success; sm/md",
    "controls": "variant, size, loading, disabled, leadingIcon, текст, счётчик clicks",
    "verification": "сменить props; click/Enter; pending и disabled не увеличивают счётчик"
  },
  {
    "name": "ButtonGroup",
    "group": "Действия",
    "demo": "button-group",
    "description": "действия с label; compact группа с menu",
    "controls": "подпись, состав действий, disabled",
    "verification": "кнопка меняет output; menu открывается"
  },
  {
    "name": "ButtonGroupLabel",
    "group": "Действия",
    "demo": "button-group",
    "description": "короткий/длинный label среди кнопок",
    "controls": "children и окружение",
    "verification": "текст меняется, label не становится action"
  },
  {
    "name": "ButtonGroupMenu",
    "group": "Действия",
    "demo": "button-group",
    "description": "Menu в slot; альтернативный action slot",
    "controls": "содержимое slot, open Menu",
    "verification": "slot виден, MenuItem меняет output"
  },
  {
    "name": "ControlButton",
    "group": "Действия",
    "demo": "control-buttons",
    "description": "success/danger/neutral/leave; solid/utility/ghost",
    "controls": "variant, appearance, shape, size, active, elevated, disabled",
    "verification": "click переключает active; заблокированная кнопка не действует"
  },
  {
    "name": "IconButton",
    "group": "Действия",
    "demo": "icon-buttons",
    "description": "default/ghost/brand/danger/success; sm/md",
    "controls": "active, activeVariant danger/accent, disabled, tooltipText",
    "verification": "доступное имя; active/output меняются; tooltip и focus видны"
  },
  {
    "name": "SectionButton",
    "group": "Действия",
    "demo": "section-button",
    "description": "compact/control; accent/success/danger",
    "controls": "active, rightContent, rightActive, rightDisabled, отдельные counters",
    "verification": "основная и правая кнопки выполняют разные действия"
  },
  {
    "name": "SplitButton",
    "group": "Действия",
    "demo": "split-button",
    "description": "primary/secondary; sm/md",
    "controls": "disabled, loading, menuAlign, onAction, MenuItems",
    "verification": "основное действие отличается от menu; pending предотвращает повтор"
  },
  {
    "name": "Input",
    "group": "Формы",
    "demo": "inputs",
    "description": "обычный/с leadingIcon и trailingAction; md/sm/xs",
    "controls": "value, size, disabled, readOnly, type, trailing clear",
    "verification": "ввод обновляет output; clear работает; readOnly не меняется"
  },
  {
    "name": "Textarea",
    "group": "Формы",
    "demo": "textarea",
    "description": "короткий/многострочный; readOnly",
    "controls": "value, rows, disabled, readOnly, maxLength",
    "verification": "ввод/Enter сохраняют строки; лимит и disabled соблюдаются"
  },
  {
    "name": "SearchInput",
    "group": "Формы",
    "demo": "search-input",
    "description": "debounce 0/300 ms; md/sm/xs",
    "controls": "value, debounceMs, size, disabled, trailing",
    "verification": "fixture фильтруется после задержки; быстрый ввод не оставляет старый результат"
  },
  {
    "name": "Select",
    "group": "Формы",
    "demo": "select",
    "description": "placeholder/selected; empty/loading/disabled option",
    "controls": "value, open, loading, disabled, size xs/sm/md, matchAnchorWidth",
    "verification": "открыть, стрелки/Home/End, выбрать; disabled option пропускается; Escape"
  },
  {
    "name": "Checkbox",
    "group": "Формы",
    "demo": "checkbox",
    "description": "checked/unchecked; disabled",
    "controls": "checked, disabled, текст",
    "verification": "Space/click меняют output; disabled сохраняет значение"
  },
  {
    "name": "Toggle",
    "group": "Формы",
    "demo": "toggle",
    "description": "on/off; disabled",
    "controls": "checked, disabled",
    "verification": "Space/Enter меняют checked и output; disabled не действует"
  },
  {
    "name": "Slider",
    "group": "Формы",
    "demo": "slider",
    "description": "число/формат процента; шаг 1/5",
    "controls": "value, min, max, step, disabled, label, formatValue",
    "verification": "pointer/стрелки меняют output в пределах диапазона"
  },
  {
    "name": "ColorPicker",
    "group": "Формы",
    "demo": "color-picker",
    "description": "initial token color/выбранный sample",
    "controls": "value, disabled, label",
    "verification": "native выбор меняет sample, цвет — fixture, палитра chrome не меняется"
  },
  {
    "name": "Label",
    "group": "Формы",
    "demo": "field-validation",
    "description": "текст/сложная подпись с обязательностью",
    "controls": "label, окружение Input/Select",
    "verification": "подпись меняется; consumer htmlFor/id связывает поле"
  },
  {
    "name": "ErrorLabel",
    "group": "Формы",
    "demo": "field-validation",
    "description": "ошибка/нет ошибки",
    "controls": "обязательное значение, submit, id",
    "verification": "пустое поле показывает role alert и aria-describedby; исправление убирает ошибку"
  },
  {
    "name": "Breadcrumbs",
    "group": "Навигация",
    "demo": "breadcrumbs",
    "description": "3/7 уровней, icons/no icons",
    "controls": "items, maxItems, текущий локальный путь",
    "verification": "кнопка меняет путь; ellipsis открывает скрытые уровни; current не action"
  },
  {
    "name": "Tabs",
    "group": "Навигация",
    "demo": "tabs",
    "description": "короткие/длинные labels; disabled tab",
    "controls": "value, набор tabs",
    "verification": "Tab/Enter и consumer стрелки переключают panel; длинные labels прокручиваются"
  },
  {
    "name": "Tab",
    "group": "Навигация",
    "demo": "tabs",
    "description": "selected/unselected/disabled внутри Tabs",
    "controls": "value, disabled, children, локальный panel",
    "verification": "aria-selected и panel совпадают; disabled не выбирается"
  },
  {
    "name": "SegmentedControl",
    "group": "Навигация",
    "demo": "segmented",
    "description": "text/icon; sm/md, stretch",
    "controls": "value, options, size, stretch, disabled option",
    "verification": "выбрать segment с клавиатуры; output/panel меняются"
  },
  {
    "name": "PaginationIndicator",
    "group": "Навигация",
    "demo": "pagination-indicator",
    "description": "одна/несколько страниц",
    "controls": "totalPageCount, currentPage через отдельные Prev/Next controls",
    "verification": "indicator отражает заданную страницу; не приписывать ему onPageChange"
  },
  {
    "name": "Table",
    "group": "Данные",
    "demo": "table",
    "description": "selectable/dense; empty и sticky scroll",
    "controls": "fixture 24 строки, pageSize 5/10, selection, sort, rowDisabled, onRowClick",
    "verification": "сортировка, две страницы, select page/row, disabled row, empty/reset"
  },
  {
    "name": "DataTableToolbar",
    "group": "Данные",
    "demo": "table",
    "description": "search + status filter; actions + selected count",
    "controls": "searchValue, searchSize, totalCount, selectedCount, clear",
    "verification": "фильтр меняет rows/count; clear снимает selection"
  },
  {
    "name": "SelectionBar",
    "group": "Данные",
    "demo": "table",
    "description": "с selection/без; label+meta",
    "controls": "selectedKeys, label, meta, clearLabel, onClear",
    "verification": "выбор показывает верный count; clear обнуляет его"
  },
  {
    "name": "FilterChip",
    "group": "Данные",
    "demo": "filter-chips",
    "description": "active/inactive; neutral/success/brand/warning/danger",
    "controls": "active, tone, count, dot, icon, disabled",
    "verification": "click меняет fixture-filter и aria-pressed; count соответствует fixture"
  },
  {
    "name": "FilterChipGroup",
    "group": "Данные",
    "demo": "filter-chips",
    "description": "2/5 chips",
    "controls": "состав/счётчики дочерних FilterChip",
    "verification": "фильтры работают внутри group; disabled chip не действует"
  },
  {
    "name": "FileTree",
    "group": "Данные",
    "demo": "file-tree",
    "description": "flat parentId fixture; empty/disabled node",
    "controls": "expandedIds, selectedId, onMove, rowActions, nodes",
    "verification": "стрелки/Enter, expand, Menu row action, перенос file; цикл отвергается"
  },
  {
    "name": "DragAndDrop",
    "group": "Данные",
    "demo": "reorder-list",
    "description": "5 элементов/пустой список",
    "controls": "items, onReorder, consumer кнопки вверх/вниз",
    "verification": "pointer drag меняет порядок; keyboard кнопка даёт тот же результат; reset"
  },
  {
    "name": "Alert",
    "group": "Обратная связь",
    "demo": "alert",
    "description": "info/success/warning/danger; action/no action",
    "controls": "variant, текст, icon, action",
    "verification": "вариант/slots меняются; action обновляет output"
  },
  {
    "name": "Badge",
    "group": "Обратная связь",
    "demo": "badge",
    "description": "neutral/brand/success/warning/danger",
    "controls": "variant, children",
    "verification": "переключить variant и текст; прочитать status независимо от цвета"
  },
  {
    "name": "DotChip",
    "group": "Обратная связь",
    "demo": "dot-chip",
    "description": "color dot/custom leading; sm/md",
    "controls": "color как token sample, leading, size, текст",
    "verification": "leading заменяет dot, размер и подпись меняются"
  },
  {
    "name": "StatusPill",
    "group": "Обратная связь",
    "demo": "status-pill",
    "description": "neutral/info/success/warning/danger/brand; sm/md",
    "controls": "tone, pulse, icon, текст",
    "verification": "статус меняется; reduced motion прекращает pulse"
  },
  {
    "name": "EmptyState",
    "group": "Обратная связь",
    "demo": "empty-state",
    "description": "column/row; icon/no icon",
    "controls": "title, description, direction, iconSize",
    "verification": "переключить ориентацию и контент; проверить длинный текст"
  },
  {
    "name": "LoadingState",
    "group": "Обратная связь",
    "demo": "loading-state",
    "description": "title/description; sm/md/lg",
    "controls": "size, текст, consumer toggle loading→content",
    "verification": "показ состояния и выход в готовый fixture"
  },
  {
    "name": "Skeleton",
    "group": "Обратная связь",
    "demo": "skeleton",
    "description": "строки текста/карточка",
    "controls": "width, height, количество, loading",
    "verification": "размеры меняются; loading off показывает fixture"
  },
  {
    "name": "Spinner",
    "group": "Обратная связь",
    "demo": "spinner",
    "description": "sm/md/lg; inline/block окружение",
    "controls": "size, aria-label, loading",
    "verification": "размеры и label корректны; loading off убирает spinner"
  },
  {
    "name": "Progress",
    "group": "Обратная связь",
    "demo": "progress",
    "description": "0/0.5/1; brand/warning/success/danger",
    "controls": "value 0…1, tone, label",
    "verification": "полоса и aria-valuenow совпадают с процентом; края/clamp"
  },
  {
    "name": "Menu",
    "group": "Обратная связь",
    "demo": "menu",
    "description": "start/end; controlled/uncontrolled",
    "controls": "open, align, width, composition",
    "verification": "открыть, выбрать действие, outside/Escape, resize у края"
  },
  {
    "name": "MenuTrigger",
    "group": "Обратная связь",
    "demo": "menu",
    "description": "текст/icon trigger; disabled",
    "controls": "children, disabled, Menu open",
    "verification": "Enter/Space открывают Menu, aria-expanded отражает state"
  },
  {
    "name": "MenuItem",
    "group": "Обратная связь",
    "demo": "menu",
    "description": "default/danger/disabled, icon+trailing",
    "controls": "tone, disabled, action output",
    "verification": "стрелки пропускают disabled; Enter меняет output и закрывает Menu"
  },
  {
    "name": "MenuLabel",
    "group": "Обратная связь",
    "demo": "menu",
    "description": "один/два раздела",
    "controls": "children, окружение sections",
    "verification": "label виден внутри menu, не получает action focus"
  },
  {
    "name": "MenuSeparator",
    "group": "Обратная связь",
    "demo": "menu",
    "description": "с/без второго раздела",
    "controls": "окружение items и labels",
    "verification": "separator реально присутствует между группами, не выполняет action"
  },
  {
    "name": "Modal",
    "group": "Обратная связь",
    "demo": "modal",
    "description": "обычный/fullScreen; toolbar/actions",
    "controls": "open, fullScreen, maxWidth, closeOnBackdrop, closable",
    "verification": "open/Tab trap/Escape/backdrop, scroll body; focus возвращён"
  },
  {
    "name": "ConfirmDialog",
    "group": "Обратная связь",
    "demo": "confirm",
    "description": "default/danger; success/error pending",
    "controls": "open, tone, loading, simulated failure, local counter",
    "verification": "consumer catch/finally; pending один раз; success close, error retry"
  },
  {
    "name": "Popover",
    "group": "Обратная связь",
    "demo": "popover",
    "description": "top/bottom, start/center/end",
    "controls": "open, placement, align, offset, matchAnchorWidth",
    "verification": "trigger, inside controls, outside/Escape, viewport collision"
  },
  {
    "name": "PopoverTrigger",
    "group": "Обратная связь",
    "demo": "popover",
    "description": "text/icon; disabled",
    "controls": "children, disabled, parent open",
    "verification": "aria-controls/expanded; Enter открывает, disabled нет"
  },
  {
    "name": "PopoverContent",
    "group": "Обратная связь",
    "demo": "popover",
    "description": "текст/мини-форма",
    "controls": "autoFocus, content/slots, родитель placement",
    "verification": "content portaled, ввод меняет output; focus/close"
  },
  {
    "name": "Toast",
    "group": "Обратная связь",
    "demo": "toast",
    "description": "inline сообщение/сообщение с action",
    "controls": "children, role, action slot",
    "verification": "текст и action меняются; не выдумывать Toast variant prop"
  },
  {
    "name": "ToastHost",
    "group": "Обратная связь",
    "demo": "toast",
    "description": "info/error; auto/manual dismiss",
    "controls": "showToast variant/duration, tracked ids, dismiss controls",
    "verification": "настоящий host показывает сообщение, click/кнопка/timer скрывают; reset"
  },
  {
    "name": "BlockingOverlayHost",
    "group": "Обратная связь",
    "demo": "blocking-overlay",
    "description": "default/custom title",
    "controls": "show/hide через local timer до 2 s",
    "verification": "overlay появляется, автоматически исчезает; focus восстановлен"
  },
  {
    "name": "DropOverlay",
    "group": "Обратная связь",
    "demo": "drop-overlay",
    "description": "passive/interactive внутри bounded target",
    "controls": "pointerEvents, title, description, icon, drag hover",
    "verification": "overlay виден при drag; passive не мешает drop; локальный результат"
  },
  {
    "name": "Accordion",
    "group": "Layout",
    "demo": "accordion",
    "description": "closed/open; right slot",
    "controls": "open, onOpenChange, title, right",
    "verification": "click/Enter раскрывают content; focus скрытого содержимого недоступен"
  },
  {
    "name": "AccentRail",
    "group": "Layout",
    "demo": "accent-rail",
    "description": "div/article/button; brand/success/warning/danger/neutral",
    "controls": "as, active, variant, left/right slots",
    "verification": "button меняет active; статические варианты не притворяются кнопками"
  },
  {
    "name": "Divider",
    "group": "Layout",
    "demo": "divider",
    "description": "horizontal/vertical",
    "controls": "orientation, длина окружения",
    "verification": "ориентация и пространство меняются без наложения"
  },
  {
    "name": "FloatingToolbar",
    "group": "Layout",
    "demo": "floating-toolbar",
    "description": "expanded/collapsed",
    "controls": "collapsed, onCollapsedChange, labels",
    "verification": "collapse/expand работают, consumer исключает скрытые children из focus"
  },
  {
    "name": "FloatingToolbarGroup",
    "group": "Layout",
    "demo": "floating-toolbar",
    "description": "1/2 action groups",
    "controls": "label, children/состав действий",
    "verification": "кнопки выполняют действия; group доступно именована"
  },
  {
    "name": "GroupLabel",
    "group": "Layout",
    "demo": "group-label",
    "description": "controls group/read-only group",
    "controls": "label, children",
    "verification": "group и label меняются; controls работают внутри"
  },
  {
    "name": "ResizeHandle",
    "group": "Layout",
    "demo": "resize-handle",
    "description": "horizontal/vertical; left/right",
    "controls": "axis, side, keyboardStep, bounded size, callbacks",
    "verification": "pointer delta и arrow step меняют размер; min/max; reset"
  },
  {
    "name": "SplitPane",
    "group": "Layout",
    "demo": "split-pane",
    "description": "horizontal/vertical; fixed/resizable",
    "controls": "orientation, defaultSize, minSize, maxSize, resizable, firstLabel",
    "verification": "ровно две panes; pointer/keyboard resize; clamp; reset без persistKey"
  },
  {
    "name": "PageShell",
    "group": "Layout",
    "demo": "page-shell",
    "description": "stage/chrome; sm/md/lg",
    "controls": "variant, width, composition",
    "verification": "оба layout работают, внутренняя навигация/форма меняются; reset"
  },
  {
    "name": "PageBrand",
    "group": "Layout",
    "demo": "page-shell",
    "description": "mark/local logo; md/lg",
    "controls": "title, eyebrow, description, size, logoUrl",
    "verification": "локальный brand отображается; default Koster текст переопределён"
  },
  {
    "name": "PageTopbar",
    "group": "Layout",
    "demo": "page-shell",
    "description": "compact/full chrome header",
    "controls": "children, наличие actions",
    "verification": "topbar содержит copy/actions; действия работают"
  },
  {
    "name": "PageTopbarCopy",
    "group": "Layout",
    "demo": "page-shell",
    "description": "короткий/длинный заголовок topbar",
    "controls": "children",
    "verification": "текст не перекрывает соседние actions"
  },
  {
    "name": "PageTopbarActions",
    "group": "Layout",
    "demo": "page-shell",
    "description": "одна/несколько кнопок",
    "controls": "children",
    "verification": "actions в slot изменяют локальный output"
  },
  {
    "name": "PageChromeBody",
    "group": "Layout",
    "demo": "page-shell",
    "description": "список/форма внутри chrome",
    "controls": "children, выбранный segment",
    "verification": "содержимое меняется и прокручивается внутри shell"
  },
  {
    "name": "PageEyebrow",
    "group": "Layout",
    "demo": "page-shell",
    "description": "короткая/длинная надпись",
    "controls": "children",
    "verification": "надпись меняется в stage/header"
  },
  {
    "name": "PageTitle",
    "group": "Layout",
    "demo": "page-shell",
    "description": "короткий/длинный title",
    "controls": "children",
    "verification": "заголовок отображается и переносится без overlap"
  },
  {
    "name": "PageDescription",
    "group": "Layout",
    "demo": "page-shell",
    "description": "одна/несколько строк",
    "controls": "children",
    "verification": "описание и высота композиции меняются"
  },
  {
    "name": "PageHeader",
    "group": "Layout",
    "demo": "page-shell",
    "description": "copy/no actions; copy+actions",
    "controls": "children",
    "verification": "обе композиции работают без overlap"
  },
  {
    "name": "PageHeaderCopy",
    "group": "Layout",
    "demo": "page-shell",
    "description": "title-only/title+description",
    "controls": "children",
    "verification": "разные наборы copy сохраняют layout"
  },
  {
    "name": "PageHeaderActions",
    "group": "Layout",
    "demo": "page-shell",
    "description": "primary/несколько actions",
    "controls": "children, disabled окружение",
    "verification": "actions меняют output; disabled сохраняет state"
  },
  {
    "name": "PageMeta",
    "group": "Layout",
    "demo": "page-shell",
    "description": "короткий/длинный metadata",
    "controls": "children",
    "verification": "metadata меняется в row/user context"
  },
  {
    "name": "PageLink",
    "group": "Layout",
    "demo": "page-shell",
    "description": "text/icon link",
    "controls": "children, local href и handler",
    "verification": "Enter/click меняют local panel без внешнего перехода"
  },
  {
    "name": "PageTextButton",
    "group": "Layout",
    "demo": "page-shell",
    "description": "enabled/disabled",
    "controls": "children, disabled, onClick",
    "verification": "click/Enter меняют output; disabled не действует"
  },
  {
    "name": "PageSegmented",
    "group": "Layout",
    "demo": "page-shell",
    "description": "2/3 segments",
    "controls": "children, selected state consumer",
    "verification": "composition переключает panel, tablist именован"
  },
  {
    "name": "PageSegment",
    "group": "Layout",
    "demo": "page-shell",
    "description": "active/inactive/disabled",
    "controls": "active, disabled, onClick, children",
    "verification": "active и panel совпадают; consumer arrows/Enter"
  },
  {
    "name": "PageToolbar",
    "group": "Layout",
    "demo": "page-shell",
    "description": "search/actions; filters/copy",
    "controls": "children",
    "verification": "controls фильтруют local list"
  },
  {
    "name": "PageToolbarCopy",
    "group": "Layout",
    "demo": "page-shell",
    "description": "heading/heading+meta",
    "controls": "children",
    "verification": "отображаемый count соответствует фильтру"
  },
  {
    "name": "PagePanel",
    "group": "Layout",
    "demo": "page-shell",
    "description": "список/форма",
    "controls": "children",
    "verification": "panel меняет содержимое; overflow доступен"
  },
  {
    "name": "PageList",
    "group": "Layout",
    "demo": "page-shell",
    "description": "обычный/scrollable список",
    "controls": "scrollable, fixture length",
    "verification": "длинный список прокручивается; row actions работают"
  },
  {
    "name": "PageRow",
    "group": "Layout",
    "demo": "page-shell",
    "description": "короткая/длинная row",
    "controls": "children, fixture",
    "verification": "article содержит body/actions без nested interactive конфликтов"
  },
  {
    "name": "PageRowBody",
    "group": "Layout",
    "demo": "page-shell",
    "description": "text link/row с metadata",
    "controls": "children, local href и handler",
    "verification": "activate меняет выбранную fixture-row"
  },
  {
    "name": "PageRowTitle",
    "group": "Layout",
    "demo": "page-shell",
    "description": "короткий/длинный title",
    "controls": "children",
    "verification": "title корректно размещён в row body"
  },
  {
    "name": "PageRowSubtitle",
    "group": "Layout",
    "demo": "page-shell",
    "description": "краткий/многострочный subtitle",
    "controls": "children",
    "verification": "текст переносится без перекрытия actions"
  },
  {
    "name": "PageRowActions",
    "group": "Layout",
    "demo": "page-shell",
    "description": "одна/две actions",
    "controls": "children",
    "verification": "actions меняют fixture и не активируют row body"
  },
  {
    "name": "PageJoinRow",
    "group": "Layout",
    "demo": "page-shell",
    "description": "input+button/input+select",
    "controls": "children, field values",
    "verification": "controls связаны и подтверждают локальное значение"
  },
  {
    "name": "PageFooter",
    "group": "Layout",
    "demo": "page-shell",
    "description": "help/links+actions",
    "controls": "children",
    "verification": "footer доступен после scroll; действия работают"
  },
  {
    "name": "PageUserChip",
    "group": "Layout",
    "demo": "page-shell",
    "description": "display/action",
    "controls": "username, label, onClick",
    "verification": "div вариант статичен; button открывает локальный profile demo"
  },
  {
    "name": "PageMuted",
    "group": "Layout",
    "demo": "page-shell",
    "description": "короткий/длинный secondary text",
    "controls": "children",
    "verification": "текст меняется и читается на исходных tokens"
  },
  {
    "name": "PageForm",
    "group": "Layout",
    "demo": "page-shell",
    "description": "valid/invalid submit",
    "controls": "onSubmit, local fields",
    "verification": "preventDefault; invalid ошибка, valid output; без HTTP"
  },
  {
    "name": "PageHelp",
    "group": "Layout",
    "demo": "page-shell",
    "description": "текст/текст+local link",
    "controls": "children",
    "verification": "help читается; ссылка работает локально"
  },
  {
    "name": "PageDivider",
    "group": "Layout",
    "demo": "page-shell",
    "description": "разделитель 2/3 блоков",
    "controls": "окружение children",
    "verification": "divider виден между реальными блоками"
  },
  {
    "name": "PageSsoLink",
    "group": "Layout",
    "demo": "page-shell",
    "description": "label/icon label",
    "controls": "children, local href и handler",
    "verification": "click выводит «Демо», не вызывает SSO/network"
  },
  {
    "name": "AnimatedBackground",
    "group": "Контент и media",
    "demo": "background",
    "description": "none/links/stars/sparkles/snow",
    "controls": "preview=true, settings.kind/density/speed/opacity, token brandColor",
    "verification": "bounded canvas; сменить kind; reduced-motion скрывает анимацию"
  },
  {
    "name": "Avatar",
    "group": "Контент и media",
    "demo": "avatar",
    "description": "initial/local image/broken image; sm/md/lg/xl",
    "controls": "src, initial, size, online, isSpeaking, speakingSrc/silentSrc",
    "verification": "смена fixture-image; broken src→fallback; online подписан текстом"
  },
  {
    "name": "AudioWaveform",
    "group": "Контент и media",
    "demo": "waveform",
    "description": "static/interactive/recording simulation",
    "controls": "samples, active, currentTime, duration, playing, recordable, recordDisabled",
    "verification": "seek/play/pause работают с local audio; Record меняет synthetic state без устройств"
  },
  {
    "name": "Icon",
    "group": "Контент и media",
    "demo": "icons",
    "description": "все уникальные значения IconNames; xs/sm/md/lg/numeric",
    "controls": "name, size, strokeWidth, поиск icons",
    "verification": "каждый IconNames name рендерится; смена размера; доступные labels"
  },
  {
    "name": "Markdown",
    "group": "Контент и media",
    "demo": "markdown",
    "description": "rich fixture/empty; raw HTML text",
    "controls": "content через Textarea",
    "verification": "headings/list/code/table/link; HTML не исполняется; local link не уводит каталог"
  },
  {
    "name": "SoundPlayer",
    "group": "Контент и media",
    "demo": "sound-player",
    "description": "обычный/disabled; navigation on/off",
    "controls": "local WAV fixtures, currentTime/duration/playing/volume, seekDisabled/volumeDisabled",
    "verification": "реальные play/pause/seek/volume/next/previous; ошибку playback обработать"
  },
  {
    "name": "UploadDropzone",
    "group": "Контент и media",
    "demo": "upload",
    "description": "queued/uploading/done/failed; rejection/disabled",
    "controls": "accept, multiple, maxSizeBytes, metadata files, retry/remove, simulated timer",
    "verification": "picker/drop; type/size rejection; retry/remove/reset; отсутствует upload request"
  }
] as const;
export const infrastructureEntries = [
  {
    "name": "canMoveIntoFolder",
    "reason": "helper проверки допустимости перемещения FileTree fixture"
  },
  {
    "name": "collectDescendantIds",
    "reason": "helper дерева, не визуальный компонент"
  },
  {
    "name": "compareFileTreeNodes",
    "reason": "helper сортировки дерева, не визуальный компонент"
  },
  {
    "name": "flattenVisibleTree",
    "reason": "helper получения видимых строк, не визуальный компонент"
  },
  {
    "name": "resolveFileTree",
    "reason": "helper структуры дерева, не визуальный компонент"
  },
  {
    "name": "IconNames",
    "reason": "typed constant map; используется в icons demo и chrome"
  },
  {
    "name": "pageShellStyles",
    "reason": "CSS Module map; не отдельный компонент и не новый style API"
  },
  {
    "name": "showToast",
    "reason": "store command; запускает реальный ToastHost demo"
  },
  {
    "name": "dismissToast",
    "reason": "store command; очищает только tracked demo toast ids"
  },
  {
    "name": "showBlockingOverlay",
    "reason": "store command; запускает bounded blocking demo"
  },
  {
    "name": "hideBlockingOverlay",
    "reason": "store command; timeout/unmount cleanup"
  },
  {
    "name": "I18nProvider",
    "reason": "инфраструктурный context provider без собственного визуального вывода"
  },
  {
    "name": "useI18n",
    "reason": "инфраструктурный hook библиотеки"
  },
  {
    "name": "UI_MESSAGES_EN",
    "reason": "словарь библиотеки, не визуальный компонент"
  },
  {
    "name": "UI_MESSAGES_RU",
    "reason": "словарь библиотеки, не визуальный компонент"
  },
  {
    "name": "BACKGROUND_ANIMATION_DEFAULTS",
    "reason": "объект defaults settings для background demo"
  },
  {
    "name": "BACKGROUND_ANIMATION_KINDS",
    "reason": "список значений kind для background controls"
  }
] as const;
export type VisualExport = typeof visualEntries[number]['name'];
export type DemoId = typeof visualEntries[number]['demo'];
export const groupOrder = ['Действия','Формы','Навигация','Данные','Обратная связь','Layout','Контент и media'] as const;
