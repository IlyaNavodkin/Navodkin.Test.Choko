# Tasks

## 1. Browser preview and real export

- [x] 1.1 Реализовать typed/Zod ReportDocument builders выбранного run и недели, summary/pass rate/matrix, saved snapshot projection и includeNotes. Проверить boundaries week, stable IDs/renames, missing case vs not_run, no mutation, отсутствие notes при выключенной опции.
- [x] 1.2 Подключить guarded run/weekly действия и preview с периодом, includeNotes, empty/loading/error/retry, экспортными кнопками и честным demo/download статусом. Проверить frontend tests/typecheck, dirty save/discard/cancel и failed save.
- [x] 1.3 Реализовать настоящий lazy PDF export с bundled VFS Roboto, таблицами/пагинацией/повторными headings, wide-matrix splitting и versioned JSON download из той же модели. Проверить filename sanitization, исключение внешних ресурсов, errors/double clicks и соответствие данных.
- [x] 1.4 Основному агенту проверить diff и headless Chromium 760/1440, фактические PDF/JSON downloads, schema/text/data parity, кириллицу и многостраничный PDF с длинным fixture; render и просмотреть PDF, записать evidence. Выполнить frontend tests/typecheck/check:ui/spec:validate.

## 2. Native integration

- [ ] 2.1 Реализовать scoped typed export IPC и Rust destination/save service с caller/session/payload/schema/size checks, native dialog/cancel/overwrite и безопасной файловой записью; temp path/symlink/error tests, fmt/clippy/test.
- [ ] 2.2 Адаптировать реальные saved run snapshots/metadata/approvals/dates к общей report schema, подключить product preview и native save; не генерировать отсутствующие поля, не подставлять live cases, сохранить unknown source bytes и Git index.
- [ ] 2.3 Проверить Windows x64/macOS arm64 native preview/dialog/save/cancel/install и PDF consistency; зафиксировать evidence. Не архивировать change до native acceptance.

## 3. Colored distributions

- [x] 3.1 Реализовать общую цветную полосу и легенду шести статусов, компактные распределения наборов/прогонов недели и цветные маркеры таблиц в React/PDF. Проверить числа, пропорции малых сегментов, zero total, совпадение цветов с UI Kit, frontend tests/typecheck.
- [x] 3.2 Основному агенту независимо проверить diff, browser preview 760/1440, фактические PDF downloads, render/pagination длинного отчёта и совпадение цветов/чисел; сохранить visual evidence. Native остаётся отдельным незавершённым этапом.
