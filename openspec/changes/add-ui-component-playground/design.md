# Design

## Context

Мотивация и scope — [proposal.md](proposal.md). Новый playground создаётся отдельно от draft `add-testoritto-mvp`; на этапе propose продуктовый код не создаётся. Основная Tauri 2 архитектура подтверждена, но каталог локальных компонентов не требует native функций. В workspace сейчас есть только `ui`, React >=19, TypeScript 5.9.3 и Vite 8.3.4 в library tooling.

Прочитаны `docs/START-HERE.md`, `docs/PRD.md`, `docs/adr/0001-desktop-stack.md`, `docs/UI-KIT.md`, `openspec/config.yaml`, frontend skill и references 01/09/11/12. Контракты проверены по [`ui/index.ts`](../../../ui/index.ts), public props и реализации TSX. Полный срез: [coverage-matrix.md](coverage-matrix.md), 102 визуальных и 17 инфраструктурных runtime exports. `pnpm check:ui` выполнен успешно 2026-10-13; это проверка library types, не runtime evidence.

## Goals / Non-Goals

**Goals:**

- Независимый consumer public API с быстрым browser preview и явным контрактом покрытия.
- Сценарии, где видно событие и результат: forms, overlays, selection, reorder, layout, media, pending/error/retry.
- Совместимый с WebView frontend: browser APIs, локальные assets, без Node runtime и без обращения к Rust.
- Локальное состояние, cleanup и доступная навигация без искусственных backend layers.

**Non-Goals:**

- Упаковка отдельного Tauri-приложения и заявления о native проверке Windows/macOS.
- Изменение library API, обновление tsParticles, Storybook infrastructure, main MVP, repo data/Git services.
- Универсальный редактор всех возможных props, автоизвлечение интерфейсов в продуктовый UI или network-песочница.

## Decisions

### 1. Отдельный workspace и browser-first preview

`apps/ui-playground`, имя package `@testoritto/ui-playground`, зависимость `@codaa/ui: workspace:*`. В `pnpm-workspace.yaml` добавить только отдельный entry; существующие scripts сохранять и добавлять `ui:dev`, `ui:typecheck`, `ui:test`, `ui:coverage`, `ui:build`, `ui:preview`. Dev/test/build инструменты — прямые dependencies этого consumer, не phantom dependencies соседнего package. Версии React/TypeScript/Vite согласовать с текущим lockfile на apply, без миграции library.

Browser preview является обязательным результатом change, поскольку все Kit-компоненты browser-safe. Tauri 2 может использовать тот же Vite dev server и `dist` как `frontendDist`; это подтверждается [Tauri Vite guide](https://v2.tauri.app/start/frontend/vite/). Здесь `src-tauri` не создаётся. При последующем wrapper потребуется отдельная native проверка WebView2 и WKWebView и packaging на соответствующих Windows/macOS runners; browser build не доказывает их работоспособность. Ни fs/Git commands, ни permissions/capabilities этому каталогу не нужны. Git используется для разработки исходника; каталог не выполняет Git-операции с данными пользователя и не меняет Casewright.

Альтернативы: размещение каталога в `apps/desktop` связало бы проверку Kit с несогласованным MVP; Storybook добавил бы отдельный UI/tooling и затруднил заданную форму каталога. Самостоятельный Vite consumer сохраняет требуемый интерфейс и общий стек. [Vite guide](https://vite.dev/guide/) описывает отдельные dev/build сценарии; [pnpm workspace documentation](https://pnpm.io/workspaces) — локальную связь через workspace protocol.

### 2. Структура по use cases

Предлагаемое дерево (создаётся на apply):

```text
apps/ui-playground/
  package.json, index.html, vite.config.ts, tsconfig*.json
  scripts/check-coverage.ts
  public/fixtures/                 # локальные images/audio, без remote URLs
  src/
    app/App.tsx, main.tsx, providers.tsx
    catalog/
      registry/                   # metadata, visual/infrastructure classification, demo loaders
      useCases/browse-components/
        ComponentCatalogPage.tsx, CatalogSidebar.tsx, CatalogSearch.tsx
        useComponentCatalog.ts, types.ts, *.module.css
      useCases/inspect-component/
        ComponentDemo.tsx, DemoBoundary.tsx, DemoControls.tsx
        useComponentDemo.ts, types.ts, *.module.css
      useCases/<demo-id>/          # из матрицы: inputs, table, file-tree, page-shell…
        XxxDemo.tsx, useXxxDemo.ts, types.ts, fixtures.ts, *.module.css
    shared/i18n/                  # типизированные resources RU, предусмотрен EN
    shared/ui/layout/             # shell и адаптер позиционирования host
  tests/                          # meaningful catalog/coverage/interaction tests
  README.md
```

Page собирает соседние presentational components; hooks экспортируют `UseXxxArgs`/`UseXxxResult`; одноэкранные типы — в `useCases/.../types.ts`. UI-состояние поиска/выбора в родительском typed hook; локальные values/fixtures — `useState` в demo hook. TanStack Query и Zustand не добавляются без соответствующего server/global state; локальный каталог не имитирует HTTP, auth, admin, repository API или Tauri invoke. `api/contracts.ts` не нужен при отсутствии транспорта.

Для validation composition использовать Zod и небольшой consumer `useZodForm` по reference 13 при его реализации; nested blocks получают values/errors/callbacks, без общего form prop. Простые props controls не превращать в business editor и не валидировать через HTTP. Тексты chrome, descriptions, labels и action output — typed i18n RU по умолчанию, предусмотренный EN fallback; точные export names/prop names остаются API-именами. Library `I18nProvider` получает согласованную locale; его untyped `TranslateFn` не заменяет typed product resources.

### 3. Registry и проверка полного покрытия

Единица sidebar — public visual export, а единица renderer — demo scenario. Registry содержит export name, group, description key, demo id, роль в композиции. Scenario содержит renderer, defaults, варианты, controls и verification mapping; controls конкретного demo типизированы по его реальному state, без `any` или универсальной записи props.

Будущий `check-coverage.ts` через TypeScript AST читает `ui/index.ts`, отличает value и type-only exports, сверяет явную infrastructure classification и visual registry. Проверяет уникальность, отсутствие неизвестных names, renderer/defaults/variants/controls/verification mapping и наличие всех matrix rows. Новые value exports требуют явной классификации; никаких правил «начинается с большой буквы — значит компонент». Неизвестные export формы вроде нового wildcard должны вызывать диагностическую ошибку, а не теряться. Счётчик 102 — текущий baseline, не hardcoded предел на будущее.

Инфраструктурные exports с объяснениями перечислены в matrix; `I18nProvider` не имеет собственного визуального вывода. Compound child получает собственный пункт и описание, но открывается в рабочем parent context. Например `MenuItem` не рендерится без Menu; Page family распределена между stage/chrome/list/form-композициями одного `page-shell` demo. Не считать наличие записи доказательством того, что компонент реально показан: runtime report отдельно перечисляет проверенные экспорты и действия.

### 4. Layout, фильтрация и focus

Chrome: существующие `PageTopbar`, `PageBrand` с явно заданным Testoritto title, `SearchInput`, `SectionButton`, `GroupLabel`, `Divider`, `Badge`, `Button`/`IconButton`; responsive layout — CSS Modules на `--app-*`. Предпочтительно использовать `SplitPane` для sidebar/content на широком экране, без persistKey. Default sidebar около 260 px, controls около 280 px; на меньшей ширине controls под примером. Table/PageShell demo занимают доступную широкую область, локальный horizontal overflow допустим; ограниченные карточки не сжимают таблицу до 300 px. Когда выбранный demo создаёт `PageShell` с `<main>`, outer detail container не создаёт вложенный `<main>`.

Один запрос: `trim` + case-insensitive match API name либо локализованной group label. Стабильный порядок групп из spec, имён — по API имени. Поиск синхронный, `SearchInput.debounceMs=0` в chrome; собственный search demo проверяет debounce отдельно. Выбор: Button при старте, сохранение видимого selected export, иначе первый результат, zero results — `null`; очистка сохраняет выбор или возвращает Button. Repeat click не меняет reset epoch.

Sidebar — `<nav aria-label>` и настоящие buttons; selected state через доступный атрибут, без притворного tree/widget keyboard API. Controls имеют labels, icon-only actions — aria-label. Поиск удерживает focus при фильтрации, result count — ненавязчивый live status. Выбор не перетаскивает focus в demo; next Tab достигает controls. Tabs/PageSegmented получают consumer roving keyboard adapter через поддерживаемые DOM/event props, согласованные ids/aria-controls и panels: в исходном [`Tabs.tsx`](../../../ui/Tabs/Tabs.tsx) есть click/aria-selected, но нет arrow navigation. Compound children рендерятся непосредственно внутри требуемого родителя; MenuTrigger определяется родителем по `child.type`, поэтому не скрывать trigger за wrapper.

### 5. Сценарии и fixtures

Фактические API и обязательные варианты — [coverage matrix](coverage-matrix.md); не добавлять несуществующие props. В частности:

- [`Table.tsx`](../../../ui/Table/Table.tsx): сортировка и page/pageSize внутри компонента, selection controlled через `selectedKeys/onSelectedKeysChange`. Fixture 24 строки, page size 5/10, часть rows disabled; toolbar/filter state у consumer. Reset remount сбрасывает внутренние sort/page. Loading/error показывать внешними `LoadingState/Alert`, без выдуманного Table `loadingStatus`.
- [`FileTree.tsx`](../../../ui/FileTree/FileTree.tsx): stable fixture ids, flat parentId nodes, controlled selection/expandedIds, onMove и rowActions. Consumer безопасно обновляет fixture и использует публичный `canMoveIntoFolder`; invalid cycle не меняет данные. Никакой fs операции.
- [`DragAndDrop.tsx`](../../../ui/DragAndDrop/DragAndDrop.tsx): HTML5 reorder; consumer buttons «Вверх/Вниз» дают доступную альтернативу. `SplitPane` ожидает ровно две panes; `ResizeHandle` отдаёт delta/step callbacks, consumer ограничивает размеры.
- [`ConfirmDialog.tsx`](../../../ui/ConfirmDialog/ConfirmDialog.tsx): caller выполняет `onOpenChange(false)` после success, управляет loading и ловит rejection внутри callback. Local pending/error timers очищаются; error остаётся в открытом dialog, repeat click заблокирован.
- [`Progress.tsx`](../../../ui/Progress/Progress.tsx): value 0…1. [`PaginationIndicator.tsx`](../../../ui/PaginationIndicator/PaginationIndicator.tsx): визуальный indicator, отдельные consumer Prev/Next controls управляют currentPage. Checkbox не получает выдуманный indeterminate prop.
- [`Markdown.tsx`](../../../ui/Markdown/Markdown.tsx): raw HTML выключен. Editable fixture включает headings, list, table, code и локальные ссылки; consumer перехватывает links внутри demo, чтобы не уходить из каталога. Пример не обещает универсальную sanitization произвольных внешних источников.
- [`SoundPlayer.tsx`](../../../ui/SoundPlayer/SoundPlayer.tsx) и [`AudioWaveform.tsx`](../../../ui/AudioWaveform/AudioWaveform.tsx) — controlled UI; consumer владеет локальным HTMLAudioElement, двумя WAV fixtures, events и catch для `play()`. Нет autoplay. Waveform Record — synthetic samples и явно обозначенная симуляция, без `getUserMedia`. На stop/reset/unmount — pause, снять event listeners и object URLs, если созданы.
- [`UploadDropzone.tsx`](../../../ui/UploadDropzone/UploadDropzone.tsx): browser File picker/drop, accept/maxSize rejection, queued/uploading/done/failed metadata. Consumer хранит только metadata, synthetic progress с bounded timers, retry/remove; не читает содержимое и не отправляет файл. Fixtures можно запускать без выбора пользовательского файла.
- [`AnimatedBackground.tsx`](../../../ui/AnimatedBackground/AnimatedBackground.tsx): `preview=true`, bounded область с `position:relative`, controls по `backgroundTypes.ts`; reduced motion respect. Текущий particles engine оставляем, его отдельная миграция не относится к change. Renderer желательно lazy-load по demo family, чтобы тяжёлый media example не монтировался во всех страницах.

### 6. Hosts и cleanup

Один `ToastHost` и один `BlockingOverlayHost` в App. Toast store поддерживает только `info/error`, возвращает id; consumer tracks ids и вызывает dismiss только для собственных эффектов. [`Toast.module.css`](../../../ui/Toast/Toast.module.css) сейчас размещает host top-center, а Host не имеет className: CSS Module wrapper вокруг Host локально переопределяет позицию прямого `[aria-live="polite"]` child на bottom/right, top/left auto, transform none. Это consumer adaptation без изменения API; selective selector проверяется runtime. Управляющая dismiss button с label доступна в demo, потому что Host toast сам plain clickable div. Inline `Toast` и Host демонстрируются отдельно в одной family.

Blocking overlay блокирует Tab/Escape в [`BlockingOverlayHost.tsx`](../../../ui/BlockingOverlay/BlockingOverlayHost.tsx); demo всегда имеет auto-hide timeout до 2 s и `finally/unmount` cleanup. Consumer сохраняет trigger ref и восстанавливает focus после hide; не рассчитывает на отсутствующее в Host восстановление. Нельзя создавать «вечный» overlay, который лишает пользователя reset.

Demo session имеет `selectedExport + resetEpoch` key. Reset сбрасывает локальный props/state/fixtures и remount внутренних состояний (Table, Avatar, SplitPane). React документирует этот механизм в [Resetting state with a key](https://react.dev/learn/preserving-and-resetting-state). Cleanup — отдельная обязанность эффектов, remount не заменяет pause/dismiss/hide/cancel. Нет persistKey в SplitPane demo; поиск/selection каталога не сохраняются в browser storage. Новый export начинает с defaults. Error boundary локален demo, reset очищает его ошибку.

FloatingToolbar/Accordion hidden children не оставляют focusable элементы: consumer wrapper с `inert` или conditional children на collapsed/closed, используя только public slots. Modal/Popover/Menu получают реальный trigger, доступный title, Escape/outside handling; проверять focus restore и body overflow. Любой обнаруженный дефект public component сначала воспроизводится и записывается; при невозможности consumer adaptation — отдельный минимальный fix, а не незаявленная смена library API.

### 7. Build, tests и локальный процесс

Будущие package scripts: `dev` → Vite, `typecheck` → tsc --noEmit, `test` → Vitest run, `coverage` → inventory checker, `build` → typecheck + coverage + Vite build, `preview` → Vite preview. `test` — meaningful проверки фильтрации/выбора, registry completeness, reset/cleanup и сложных interactions; не зеркальные тесты каждого статического wrapper. Browser E2E/automation проверяет фактические элементы, а не наличие labels.

Dev: `http://127.0.0.1:5174`, preview: `http://127.0.0.1:4174`, `host=127.0.0.1`, `strictPort=true`; явный `--port` меняет адрес при конфликте. Browser build output `apps/ui-playground/dist`. README содержит команды, Node/pnpm требования из root, fixture policy, добавление exports и matrix, запуск и остановку собственного процесса. Сервер оставляется работающим в управляемой terminal session, пользователь получает фактический URL и stop command/terminal instruction. Ни опубликованного сайта, ни сетевого интерфейса 0.0.0.0.

При завершении apply: `pnpm spec:validate`, `pnpm check:ui`, playground typecheck/test/coverage/build; runtime по каждой строке matrix с console/network и screenshot/interaction evidence на 1280×800, 800×700. Browser automation предпочтительно Chrome DevTools, доступный browser tool может служить fallback. Если реальные browser проверки недоступны, задачи runtime остаются unchecked, ограничение сообщается, build не выдаётся за runtime успех. Playwright допустим только для browser frontend; native E2E вне change.

## Risks / Trade-offs

- 102 exports, но меньше renderer families → matrix остаётся per-export; runtime evidence отдельно проверяет каждую роль, чтобы compound children не потерялись за общим demo.
- Library quirks и старые tsParticles зависимости → чтение API, lazy mount, consumer adapters и диагностируемые failures; typecheck alone не гарантирует runtime.
- Fixed CSS/порт/много overlay → bounded demo области, scoped ToastHost override, strictPort и explicit port; проверять resize/collision, не убивать чужой сервер.
- Pending timers и module stores могут пережить switch → ownership ids, cleanup/finally, bounded blocking, reset key; regression tests на уход во время эффекта.
- Частично доступные primitives → label/focus/keyboard consumer composition; нельзя объявлять WCAG compliance только по tokens или names.
- Общий checkout и lockfile → перед apply перечитать status и текущие config/lock; вносить отдельные additions без смены branch, без перезаписи чужих edits. Git config не менять глобально; read-only status допустим с per-command safe.directory.
- Browser-only результат не доказывает native поддержку → граница явно в proposal/spec/README; native wrapper и installers остаются отдельной работой.

## Migration Plan

Миграции пользовательских данных нет. После представления полной спеки выполнить отдельный apply: scaffold consumer, shell+registry, группы demos, проверки, docs, build и локальный запуск. Root script/workspace/lock изменения вносить согласованно с актуальным checkout. При отмене реализации убрать только принадлежащие playground файлы/entries и его собственный сервер после проверки текущего diff; не откатывать параллельные изменения, не затрагивать Kit или source snapshot. Change остаётся активным до реальной проверки всех implementation tasks; archive не относится к этому этапу.
