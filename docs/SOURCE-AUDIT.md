# Аудит исходника Casewright

Источник: `D:/repo/testoritto/casewright-main`, root package version **0.16.0**. Дата аудита: 2026-10-13. Git metadata upstream в переданной папке отсутствует, поэтому commit SHA неизвестен. Разрешение автора сообщено пользователем; в копии присутствует MIT License © 2026 Jim Buck.

Это статический аудит исходников, не runtime-проверка и не подтверждение числа проходящих тестов из README.

## Наблюдения по коду

| Область | Найдено | Решение по переносу |
| --- | --- | --- |
| Runtime | NW.js + React/TS; Vite; `lib/node.ts` runtime require; `lib/nwjs.ts` OS/window helpers | React UI/contracts reuse; NW bridge заменить Tauri commands, Node services — Rust |
| UI | Tailwind v4, Radix/shadcn-style primitives, исходная brand palette | Сценарии/композицию изучить; UI переписать на @codaa/ui/CSS Modules |
| Formats | `services/format/` cases, run cases/details, workspace, config, folder notes, `.order` | Контракт для Rust parsers/serializers и parity fixtures; Node parsers не переносить в WebView; unknown content проверить end-to-end |
| Repo | `repo-load.ts`, `repo-fs.ts`, `repo-metadata.ts`, `repo-paths.ts`, `repo-migration.ts` | Переписать на Rust repo services; migration по умолчанию отключить |
| Config | `serializeConfigYaml`, `openRepo` читают declared `workspaces:` | Не полагаться на README про auto-discovery как главный формат |
| Runs | `loadRuns` читает directories с `_run.md` и case `.md` | CSV из старого README не является текущим форматом |
| Git | `services/git.ts` — status/info/diff/commit/fetch/pull/push, stash/discard | Использовать как поведенческий reference; Rust вызывает системный Git CLI, scope/staging/errors проверяются заново |
| Watch/save | watch.ts, persist.ts, repo-self-write.ts | Проверить shutdown/dirty reload/races, затем переносить |
| State | Большой `store/app-store.ts` связывает UI и disk/Git | Не переносить целиком в WebView; IO/state sessions — Rust, queries/UI state — frontend |
| Merge | MergeResolver UI есть; app-store явно содержит deferred structured engine | Не заявлять о готовом merge; проектировать отдельный scope |
| Native shell | Sidebar содержит toast-заглушки `nw.Shell.showItemInFolder/openItem` | Реализовать через Tauri native APIs/opener с capabilities и проверкой разрешённых paths |
| Reports/variables | Сервисы HTML reports, run snapshots, checks, date overrides и approvals | Сохранение данных обязательно; UI scope обсудить |
| Updater | Исходный NW.js updater и его tests | Не включать upstream endpoints/исполнители в новый продукт |
| Distribution | Windows portable/installer pipeline; macOS описан как next step | Новый packaging и per-OS CI, без наследования upstream publish |

## Несогласованность документации

1. `.docs/prd.md` v0.7 описывает прежний `casewright.json` и CSV runs.
2. `apps/desktop/README.md` описывает `.casewright/`, но ещё говорит о CSV и self-declaring workspace walk.
3. Текущий `repo-load.ts` и `format/config.ts` читают `config.yaml` с declared workspace paths; runs — Markdown directories.
4. Domain model содержит Setup, in_progress, approvals/check states/date overrides, отсутствующие в раннем ТЗ.

При переносе порядок доверия: действующий parser/writer + fixtures/tests → актуальные schemas/types → документация после сверки. Не включать migration лишь потому, что она есть в upstream.

## Порядок переноса

1. Создать Tauri 2 runtime, Rust commands с permissions/capabilities и React/Vite frontend без Node runtime.
2. Реализовать Rust parsers/serializers по upstream schemas, fixtures и round-trip tests; перенести только browser-safe TS helpers. Сохранять MIT notice для переносимого кода.
3. Read-only загрузка реального repo; зафиксировать file hashes до/после.
4. Сохранение по одному use case; unknown fields/content не теряются.
5. Rust repo/Git services и cargo integration tests с temp remote.
6. UI workflows на предоставленном Kit, then native OS and packaging smoke.

## Происхождение и snapshot

Снимок хранится в `casewright-main/` без изменения исходных файлов. Его nested `.github/` не является root CI Testoritto.
Нельзя собирать новый installer с именем/иконкой Casewright или с update URL автора автоматически. Сохранять `casewright-main/LICENSE` и notices в будущих переносах/distributions. Лицензия собственных файлов Testoritto пока не выбрана.

## Текущий срез Rust-форматов

В `apps/desktop/src-tauri/src/domain/formats/` добавлен отдельный Rust-слой для чтения и редактирования `config.yaml`, `.order` и Markdown folder notes. Его тестовые ожидания сверены с `casewright-main/apps/desktop/src/services/format/config.test.ts`, `order.test.ts`, `folder-note.test.ts`, `schemas/config.ts` и `schemas/folder-note.ts`; алгоритмы исходника не переносились. Использованные компактные входные примеры предназначены для проверки совместимости с MIT-проектом Casewright 0.16.0 (Jim Buck, © 2026); происхождение зафиксировано в `apps/desktop/src-tauri/NOTICE.md`, полный текст лицензии сохранён в `casewright-main/LICENSE`.

Этот срез не выполняет файловый ввод-вывод и не открывает snapshot как репозиторий данных. Он сохраняет исходные байты при no-op, неизвестные YAML-поля/комментарии и Markdown body при поддерживаемых edits; ambiguous edits возвращают ошибку. YAML-значения metadata и declared workspace paths приводятся к строкам как в Zod-схемах источника. Повреждённый YAML, дублирующие ключи, неверные типы workspace-структур и неподдерживаемые edit-формы завершаются диагностикой вместо upstream defaults. YAML чтение сначала строит ограниченный `serde_norway::Value` с единым бюджетом 100 000 логических узлов, 8 MiB раскрытых scalar bytes (включая map keys/tag strings) и глубиной не более 128; лимиты учитывают alias expansion до последующего typed conversion и CST edit. Сериализуемое значение setter’а тоже проверяется этими лимитами перед CST edit. YAML edits также проверяют CST comments/anchors/aliases; при невозможности доказать сохранность edit отклоняется. Текущая версия `yaml-edit` классифицирует апостроф в plain scalar (`Bob's repo`) как незавершённую строку; такие документы читаются и сохраняются без изменений, но редактирование отклоняется защитой от потери комментариев. Ограничения ввода/вывода: config/YAML 256 KiB, frontmatter 64 KiB, folder note целиком 1 MiB, `.order` 256 KiB. Это не parity completion: filesystem/session behavior и реальные repository fixtures проверяются отдельными этапами.

### CaseDocument — текущий подэтап

`CaseDocument` добавляет типизированное чтение/edit API для case Markdown: frontmatter `id`, `displayId`, `title`, `slug`, `status`, `tags`; секции Objective, Systems in Scope, Setup, Steps, Acceptance Criteria и legacy alias Expected Results. Fixture и ожидаемые поля canonical case сверены с `casewright-main/apps/desktop/src/services/format/case.test.ts`; edge behavior — с `case.ts`, `schemas/case.ts` и `utils/steps.ts`. Публичные тестовые ожидания происходят из MIT-проекта Casewright 0.16.0; parser/editor Testoritto не копирует upstream serializer, а сохраняет исходное представление и применяет локальные edits.

No-op сохраняет LF/CRLF и исходные байты. Изменение metadata меняет только реально затронутые known YAML keys; неизвестные поля/comments и исходные raw значения остальных полей остаются. Разделы распознаются вне fenced code blocks; изменяется только выбранная секция, unknown blocks сохраняют позицию/bytes. Дубликаты reserved секций дают warning, но соответствующий edit отклоняется; после section edit результат повторно парсится и отклоняется, если typed секция не совпала с намеренной моделью. Отсутствующий/нестроковый id не генерируется и блокирует любые реальные edits (no-op допустим); некорректные status/tags диагностируются, их исходные YAML values сохраняются при unrelated edit. Лимиты case Markdown — 2 MiB на документ и 256 KiB frontmatter. CaseDocument подключён к repository resource/session и save_case; temp Git-fixtures проверяют сохранение/reopen и неизменность чужого index. Полный native UI parity на пользовательском repository ещё не подтверждён.

### RunDetailsDocument и RunCaseDocument — текущий подэтап

`RunDetailsDocument` читает `_run.md`, а `RunCaseDocument` — Markdown snapshot конкретного кейса. Typed models охватывают run status/approvals/metadata, все шесть case result states и checklist Setup/Steps/Acceptance с tri-state marks. Поведение ordinal/glyph и разделение последнего ` !! ` перенесено как адаптированный алгоритм `run.ts`; fixture inputs и поля сверены с `run.test.ts` и `schemas/run.ts`. Полный MIT notice находится в `apps/desktop/src-tauri/NOTICE.md`.

No-op сохраняет исходные LF/CRLF байты; edits затрагивают только изменённые known frontmatter keys или выбранную секцию. Неизвестные поля, approval extensions и Markdown sections сохраняются; изменение section повторно парсится и сверяется с целевой моделью. Неизвестный чекбокс сопровождается warning, дублированные секции блокируют соответствующий edit. `case_id` не генерируется и его отсутствие/неверный тип делает run-case read-only. Документы ограничены 2 MiB (run-case), 1 MiB (`_run.md`) и 256 KiB frontmatter. Форматы остаются pure domain API; RepositoryService уже читает run resources и сохраняет cases, а запись результатов/snapshots прогонов ещё не подключена.

### RepositoryService — read-only repository foundation

`services::repository::RepositoryService` канонизирует native-selected каталог, принимает только точный Git worktree root, запускает абсолютный system Git executable из абсолютных PATH entries через фиксированные аргументы/cwd, очищает унаследованные `GIT_*` overrides, запрещает optional locks и ограничивает вывод/время. Токен сессии — UUIDv4; registry переиспользует его для того же root и инвалидирует при close. Canonical root не сериализуется.

Открытие через native folder picker читает `.casewright/config.yaml` bounded UTF-8 API и root/workspace metadata, sibling folder notes, нормализует `.`/`./`/trailing slash и диагностирует duplicate, missing и traversal paths. Версии config 1 и 2 читаются; неизвестные версии, malformed config и legacy layout завершаются диагностикой без миграции. Отсутствующий config возвращает `needsInitialization` без создания файлов. В памяти service каталогизирует только объявленные workspaces, возвращает плоские folder/case DTO и opaque IDs для последующего typed case read; `catalog_runs`/`read_run` ограничены `_run.md` и перечисленными sidecars. Native IPC-команды проверяют window/origin, payload, session и membership до IO; повторное чтение проверяет исходный относительный путь и canonical target. Frontend UI вызывает эти команды через типизированный facade. Произвольного абсолютного пути или общего frontend file-read API нет.

Каталоги ограничены 20 000 посещёнными entries, глубиной 64 и 32 MiB суммарного чтения; отдельные case/run-case ограничены 2 MiB, folder note и `_run.md` — 1 MiB, `.order` — 256 KiB. Скрытые каталоги не обходятся, обычные Markdown-файлы с точкой в имени учитываются; legacy `_suite.md` диагностируется. Symlink/junction entries пропускаются, а повторный read отклоняет изменённый canonical target. Path canonicalization не закрывает TOCTOU race при внешней параллельной замене пути. Registry mutex удерживается во время файлового обхода/чтения; cancellation и конкурентное close пока не поддержаны. Без `.order` используется детерминированная сортировка по lowercase и исходному имени; она не полностью совпадает с locale-aware Unicode `localeCompare` upstream.

`read_text` остаётся внутренним foundation API с repo-relative canonical targets, обычными файлами, UTF-8 и лимитом 2 MiB; абсолютные/parent/drive/UNC/ADS paths и `.git` запрещены. Temp Git-fixture проверяет config/workspace sibling note, case, `.order`, run Markdown и SHA256 неизменность файлов, `.git/config` и `.git/index` при open/catalog/read. Snapshot исходника не менялся.

### Case editor/save и explicit initialization

Writer опирается на уже портированный loss-preserving CaseDocument и контракты upstream `services/persist.ts`, `repo-fs.ts`, `repo-metadata.ts`, `format/config.ts`. Node fs/debounce реализация не переносилась в runtime: Rust выполняет bounded/revision-checked atomic save, frontend удерживает draft. Инициализация совместима с upstream config v1, cache ignore и runs/.gitkeep, с явной root workspace и отказом перезаписать существующую metadata. MIT notice в src-tauri/NOTICE.md сохранён.

CaseDocument подключён к зарегистрированным repository resources и `save_case`; старые описания pure in-memory стадии выше являются историческими. Git collaboration, запись run snapshots, backend watcher/flush и организация кейсов ещё не завершены.

Для case CRUD сверены `store/slices/cases-slice.ts` (fresh duplicate ID/displayId, inherited prefix) и `services/repo-load.ts` (absent order keys, appended new children). FS/IPC реализованы в Rust самостоятельно; snapshot не изменён. Copy в Testoritto удерживает неизвестные YAML/Markdown через source-backed editor. Existing MIT notice сохранён.

Run creation сверено по `services/format/run.ts`, `utils/run-items.ts` и `store/slices/runs-slice.ts`: snake_case frontmatter, positional checklist keys, Details/Notes и `.order`. Rust serializer/publisher реализован самостоятельно. Дополнительные `.source` сохраняют полный case payload; upstream snapshot untouched, MIT notice сохраняется.

## Run workflow reference

Для таблицы и пошагового режима изучены `casewright-main/apps/desktop/src/components/runs/RunGrid.tsx` и `components/guide/RunGuide.tsx`. Поведение реализовано заново на @codaa/ui и typed run hooks: snapshot вместо live case, явный save вместо переноса upstream store/autosave, safe transition после подтверждённой записи. Файлы source snapshot не изменены. Evidence: [Run workflow](../apps/desktop/evidence/run-workflow.md).
