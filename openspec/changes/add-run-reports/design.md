# Design

## Context

Пользователь разрешил ранее отложенный reporting scope. Исследованы Casewright `store/slices/runs-slice.ts:exportRunToPdf/exportWeeklyReport`, `services/report/{run-report,run-report-html,weekly-report-html,report-shared}.ts`, `components/runs/{RunGrid,RunsList}.tsx`. Upstream открывает HTML в NW.js и вызывает win.print; этот runtime в Tauri не переносится. JSON-export в данном snapshot отсутствует.

Текущий UX preview использует DemoRun snapshots/results и общий usePreviewNavigation. Он изолирован от product entry; сохранённые demo данные живут в памяти. Продуктовые Rust handlers владеют fs/Git. Не смешивать browser download с native acceptance.

## Goals / Non-Goals

**Goals:** законченный интерактивный browser-срез с реальными файлами и общей моделью; затем native save adapter и product UI без Node sidecar.

**Non-Goals:** копирование NW.js print script, сервер, внешние ресурсы, импорт JSON, новая миграция run format, раскрытие live glossary данных вместо snapshot.

## Decisions

1. Единая immutable versioned ReportDocument: schemaVersion=1, kind=run|weekly, generatedAt ISO, repoName, weekStart/weekEnd для недели, options.includeNotes, runs со stable snapshot IDs/results, computed summary и weekly matrix. Модель строится после guard только из saved runs, клонируется при открытии; render/export не читают live draft. Изменение includeNotes перестраивает публичную модель, убирая notes/failNotes из всех трёх представлений. JSON Zod schema проверяет выход; JSON не считается форматом восстановления репозитория.
2. Недельный период — date-only ISO, понедельник–воскресенье, без UTC rollover. Дата определяется run.date в demo; native адаптер использует согласованное поле testDate/created. Начальный период в demo берётся от выбранного run, не произвольных текущих часов; можно выбрать другую неделю. Stable ID определяет строку матрицы, displayId/title берутся из snapshot. Нет кейса в run → null/«—», not_run → отдельный статус.
3. PDF renderer: закреплён pdfmake 0.3.11 и @types/pdfmake 0.3.3, browser build динамическим import, локальный VFS Roboto. Его декларативные таблицы и автоматическая пагинация подходят для одинакового браузерного/WebView сценария. Только собственный document-definition builder; пользовательские строки никогда не принимаются как готовые document definitions, URLs, attachments, HTML или image nodes. Сеть и font URL отключены архитектурно: только bundled VFS. JSON-builder не загружает тяжёлый PDF bundle. Public exports основаны на schema, не на произвольном объекте.
4. Rust-кандидаты проверены: genpdf 0.2.0 (pure Rust, layout/Paragraph/Table, embedded fonts) и printpdf 0.12.8 (низкоуровневые PDF ops и отдельный HTML layout engine). Они остаются вариантом отдельного backend renderer, но вводить второй renderer сейчас означало бы разную пагинацию preview/browser/native. Rust native остаётся владельцем destination/save и не обязан владеть раскладкой документа; это не Node runtime. Точное решение native adapter проверяется отдельно до объявления готовности desktop.
5. UI: действия «Отчёт прогона» в выбранном run и «Недельный отчёт» в списке; dedicated report preview с периодом, includeNotes, экспорт PDF/JSON, visible loading/error/retry. React/CSS Modules/@codaa/ui и существующие --app-* для интерфейса. Печатный документ — белый лист с тёмными подписями и цветными распределениями шести статусов. Общая полоса и компактные полосы наборов/прогонов недели показывают точные пропорции; числа и легенда вынесены из сегментов, чтобы узкие сегменты не перекрывались. Mapping общий для React/PDF: pass → --app-success, fail → --app-danger, blocked → --app-warning, in_progress → --app-accent-bg, skipped → --app-fg3, not_run → --app-fg5. PDF использует проверяемые тестом hex-эквиваленты UI Kit; цвет — точки, полосы и акценты метрик, мелкий текст остаётся тёмным. PDF canvas строится самим приложением, без пользовательского SVG или сетевых ресурсов. При total=0 показываются нейтральная полоса, явная подпись и все шесть нулей. React-группа имеет доступное имя; легенда и таблицы не требуют распознавания цвета. JSON contract и вычисления не меняются. Readonly repo не блокирует read-only export, но pending mutation/dirty защищены общим guard.
6. Сначала browser download Blob/application-pdf или JSON с временным object URL и отложенным revoke. Это только download started, без обещания фактической записи на диск. Далее typed IPC native sink с payload limits/caller/session/schema checks, native destination dialog и атомарной записью без silent overwrite. Git index и repo content не затрагиваются; destination внутри repo не выбирается автоматически. Windows x64/macOS arm64 требуют отдельных проверок dialog/cancel/overwrite/path/installation; browser e2e их не заменяет.
7. Сохранённая совместимость: existing run Markdown/.order/approvals/unknown metadata не меняются; если current demo не моделирует approvals/executedAt, не придумывать их для отчёта. Snapshot текст экспортируется как сохранённый Markdown/безопасный текст; live dictionary не подставляется. При адаптации upstream algorithms сохранять MIT notice в SOURCE-AUDIT/NOTICE.

## Risks / Trade-offs

- PDF bundle/embedded fonts крупные → lazy import только по экспорту, проверить отсутствие сетевых fonts и build.
- Browser HTML preview и PDF могут иметь разные page breaks → одинаковая модель и table headings; PDF text/page extraction и render QA на длинном fixture.
- N недельных run columns слишком широки → PDF разбивает матрицу на группы columns с повтором case labels, UI горизонтальный scroll без page overflow.
- Отчёт может содержать заметки → опция выключена по умолчанию, единый projection для JSON/PDF/preview, тесты исключения.
- Отмена browser save dialog недоступна download API → честно писать «передано браузеру», не «файл сохранён».

## References

- https://pdfmake.github.io/docs/0.3/getting-started/client-side/ — bundled browser build/VFS.
- https://github.com/bpampuch/pdfmake — библиотека и лицензия.
- https://docs.rs/genpdf/latest/genpdf/ — pure Rust layout и font embedding.
- https://docs.rs/printpdf/latest/printpdf/ — Rust PDF ops/HTML engine.
- https://v2.tauri.app/develop/calling-rust/ — существующая typed IPC граница.
