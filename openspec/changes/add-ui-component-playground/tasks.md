# Tasks

Все checkbox ниже относятся к будущему apply. На этапе propose выполнены только инвентаризация и создание planning artifacts; приложение ещё не реализовано. Перед apply перечитать proposal, design, три specs, coverage matrix и актуальный checkout. Блокирующих Open Questions в design нет.

## 1. Workspace

- [x] 1.1 Создать `apps/ui-playground` как отдельный React 19/TypeScript strict/Vite package с прямой workspace-зависимостью `@codaa/ui`; проверить установку dependencies и consumer typecheck без deep imports, `any` и native runtime.
- [x] 1.2 Добавить отдельный workspace entry и scripts `ui:dev`, `ui:typecheck`, `ui:test`, `ui:coverage`, `ui:build`, `ui:preview`, сохраняя чужие edits; проверить targeted diff root config/lockfile и отсутствие изменений main MVP/Kit/source snapshot.
- [ ] 1.3 Подключить исходные tokens, CSS Modules, typed i18n RU с EN fallback и library I18nProvider; проверить первый browser render Button и отсутствие собственной палитры/второго Kit; добавить README с проверенными dev-командой, адресом и остановкой.

## 2. Catalog and Coverage

- [x] 2.1 Создать typed per-export registry, classification 17 infrastructure exports и scenario descriptors по matrix; реализовать AST coverage check и тесты missing/duplicate/unknown/type-only/missing-renderer; проверить baseline 119=102+17 и конкретные диагностики ошибок.
- [x] 2.2 Реализовать sidebar с группами/API-именами, верхний SearchInput и detail area через `@codaa/ui`; hook `useComponentCatalog` с Args/Result и typed state; проверить поиск имени/группы/trim/case, начальный Button, выбор первого результата, repeat click и zero-results/clear тестами.
- [x] 2.3 Реализовать controls/details/reset shell, demo error boundary и session cleanup contract; проверить reset props/fixture/internal state, переключение во время timer и восстановление после render error; документировать регистрацию нового demo/defaults/variants/verification mapping в README.
- [ ] 2.4 Проверить каталог клавиатурой и на 1280×800/800×700: labels, focus, Tab/Enter/Space, live count, сохранение focus поиска, достаточная ширина и локальный overflow; записать evidence в runtime report, исправить найденные ошибки.

## 3. Actions and Forms

- [ ] 3.1 Реализовать `buttons`, `button-group`, `control-buttons`, `icon-buttons`, `section-button`, `split-button` из matrix; проверить все их exports/варианты и distinct actions, disabled/loading/repeat click в browser; записать результаты каждой строки.
- [ ] 3.2 Реализовать `inputs`, `textarea`, `search-input`, `checkbox`, `toggle`, `slider`, `color-picker`; проверить свободный ввод, readOnly/disabled где поддерживается, debounce, keyboard/range и отображаемые values; записать browser evidence и тест отмены старого debounce при reset/switch.
- [ ] 3.3 Реализовать Select scenario с placeholder/selected/empty/loading/disabled option, sizes и controlled open; проверить pointer/keyboard/Home/End/Escape, focus return и disabled selection в browser и interaction test.
- [ ] 3.4 Реализовать Label/ErrorLabel `field-validation` composition по frontend reference 13 с typed Zod schema и consumer form hook; проверить invalid→valid submit, aria-describedby/id и schema test без React; документировать локальную природу validation/submit.

## 4. Navigation and Overlays

- [ ] 4.1 Реализовать `breadcrumbs`, `tabs`, `segmented`, `pagination-indicator`, включая consumer keyboard/panel adapters и отдельные indicator controls; проверить все exports/варианты, collapsed breadcrumb levels, disabled options, overflow, keyboard и output в browser; добавить regression test active panel.
- [ ] 4.2 Реализовать Menu family и Popover family с прямыми compound children, action output, positioning controls; проверить каждый export, open/close, disabled, arrow/Home/End, Escape/outside click, focus return и collision при resize в browser.
- [ ] 4.3 Реализовать Modal/ConfirmDialog сценарии с toolbar/actions/fullScreen, local async success/error, caller-managed close/loading/catch; проверить Tab trap, Escape/backdrop, body scroll, pending double click, error retry и unmount cleanup в browser и interaction tests; документировать ownership confirm state.

## 5. Data Scenarios

- [ ] 5.1 Реализовать Table fixture 24 строки, sortable columns, page size 5/10, controlled selection, disabled row и onRowClick; проверить две страницы, сортировку, select row/page, sticky/dense и reset внутренних состояний в browser; добавить meaningful selection/reset test.
- [ ] 5.2 Подключить DataTableToolbar, SelectionBar, FilterChip/FilterChipGroup к общей table/filter композиции; проверить search/filter/empty/count/clear, все варианты из matrix и consistency selection, записать per-export browser evidence.
- [ ] 5.3 Реализовать FileTree fixture, expand/select/row Menu/onMove и invalid-cycle guard; проверить keyboard, pointer перенос file, disabled node/empty, недопустимое перемещение и reset; тестировать изменение fixture/защиту от цикла без fs.
- [ ] 5.4 Реализовать DragAndDrop reorder fixture и consumer keyboard actions; проверить pointer drag и кнопки вверх/вниз, пустой список, reset, отсутствие потери ids; добавить reorder test и README примечание о local fixtures.

## 6. Feedback and Layout

- [ ] 6.1 Реализовать Alert, Badge, DotChip, StatusPill, EmptyState, LoadingState, Skeleton, Spinner, Progress по matrix; проверить variants/slots/размеры/loading→content/0…1 и reduced motion в browser, записать результаты каждого экспорта.
- [ ] 6.2 Добавить один ToastHost с consumer CSS Module позиционированием bottom-right, inline Toast, tracked store ids и accessible dismiss controls; проверить info/error/auto/manual dismiss/reset и cleanup test; документировать отличие Toast primitive от store variants.
- [ ] 6.3 Добавить один BlockingOverlayHost и bounded demo с auto-hide до 2 s, focus return и cleanup; проверить восстановление интерфейса/timers/focus при завершении и unmount, добавить cleanup test, записать evidence.
- [ ] 6.4 Реализовать Accordion, AccentRail, Divider, FloatingToolbar/FloatingToolbarGroup, GroupLabel; проверить slots/open/collapse/actions, семантику as и отсутствие hidden focusable children в browser.
- [ ] 6.5 Реализовать ResizeHandle и SplitPane bounded scenarios без persistKey; проверить horizontal/vertical, pointer/keyboard/min/max/default reset и достаточную область demo; добавить test bounded consumer resize.
- [ ] 6.6 Реализовать всю PageShell family в stage/chrome/list/form-композициях; проверить каждый public export из matrix, widths, длинные copy/rows, scrollable list, local links/SSO stub, user chip, form invalid/valid и row actions, записать per-export browser evidence и local-link test.

## 7. Content and Media

- [ ] 7.1 Реализовать Icon gallery по всем уникальным IconNames и Avatar local/initial/broken/speaking fixtures; проверить sizes, name search, fallback/online label и переключение images в browser; документировать provenance локальных assets.
- [ ] 7.2 Реализовать Markdown с editable rich/empty/HTML fixtures и consumer local-link handling; проверить headings/lists/code/table, raw HTML без исполнения и отсутствие внешнего перехода в browser/interaction test.
- [ ] 7.3 Реализовать AnimatedBackground bounded preview с kind/density/speed/opacity controls; проверить все пять kinds, reduced motion, switch/reset и console в browser; документировать library engine limitation без смены зависимостей.
- [ ] 7.4 Реализовать SoundPlayer/AudioWaveform с двумя локальными audio fixtures, реальным controlled playback/seek/volume/track и явной recording simulation; проверить Play/Pause/Seek/Volume/Next/Previous, disabled/error/retry, отсутствие autoplay/getUserMedia, pause/listener/timer cleanup в browser и cleanup tests; README описывает fixture/симуляцию.
- [ ] 7.5 Реализовать UploadDropzone и DropOverlay: metadata picker/drop, accept/multiple/size rejection, simulated stages/failure/retry/remove; проверить controls/варианты, pointer drop, keyboard file picker, rejection и reset/unmount без чтения/отправки файлов в browser и cleanup tests; документировать отсутствие настоящего upload.

## 8. Integration and Delivery

- [ ] 8.1 Выполнить полную coverage сверку registry с актуальным barrel и matrix, открыть каждый из 102 exports в реальной композиции и проверить все строки variants/controls/reset; сохранить runtime report с export/demo/actions/pass-fail/evidence, без подмены runtime статическим coverage.
- [ ] 8.2 Выполнить сквозные search/empty/keyboard/focus, overlays у края, data/selection/move, resize/reorder, media failures, pending switch/reset, reduced motion и viewport проверки; проверить console/network отсутствие неожиданных errors/rejections/external uploads/devices; закрыть найденные failures до отметки задачи.
- [ ] 8.3 Выполнить `pnpm spec:validate`, `pnpm check:ui`, playground typecheck/test/coverage/build; проверить dist artifact и загрузку через production preview; сохранить фактические команды/результаты и ограничения в отчёте.
- [ ] 8.4 Проверить README-команды dev/preview/explicit port и stop; проверить occupied-port failure без остановки чужого процесса, затем оставить собственный loopback сервер работающим и открыть пользователю browser preview; передать фактический URL, terminal session/способ остановки и результаты проверки, не заявляя о native build.

## Workflow follow-up

- После представления planning artifacts начать отдельный apply workflow по `add-ui-component-playground`; пользователь уже поручил последующие сборку и запуск, повторное согласование того же scope не требуется.
- После завершения и реального подтверждения всех implementation tasks выполнить verify по отдельному этапу workflow. Не архивировать change в propose/apply автоматически.
- Native Tauri wrapper, per-OS smoke/packaging и installers требуют отдельного change; этот frontend не запускает main MVP implementation.
