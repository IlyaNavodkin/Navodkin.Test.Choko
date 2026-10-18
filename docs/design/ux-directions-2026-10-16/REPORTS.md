# Отчёты прогонов в UX preview

Срез change `add-run-reports`, задачи 1.1–1.4. Вход: `http://127.0.0.1:1421/ux-preview.html` → демо-репозиторий → Прогоны → «Отчёт прогона» / «Недельный отчёт». Те же действия доступны при выполнении кейса и в readonly-состоянии. Запись native-файлов и приёмка desktop в этот срез не входят.

## Данные и поведение

`ux-preview/useCases/export-report/schema.ts` публикует Zod `reportSchema`, `types.ts` — `ReportDocument` schemaVersion 1. Корень содержит kind, origin, generatedAt, repoName, period, options, runs, summary, suites и matrix. У кейсов сохранены stable ID, display ID, заголовок, набор, status/tags, имеющиеся systems/filename, snapshot-текст и результаты/исполнитель/отметки шагов. Отсутствующие approvals/executedAt не выдумываются. JSON — формат передачи отчёта, не резервная копия и не импорт репозитория.

Открытие проходит через существующий общий guard черновиков. После успешного сохранения callback читает синхронный saved-state accessor `getSavedRuns()`: асинхронный save может завершиться раньше следующего React render. Затем structuredClone фиксирует источник отчёта; переключение опции заметок и недели пересобирает публичную проекцию только из этого источника. Фильтры списка и live кейсы/словарь не используются. Заметки и пояснения ошибок по умолчанию не входят в объект на любой глубине.

Неделя — понедельник–воскресенье; исходная дата выбранного прогона, date-only арифметика без перевода пользовательской даты через локальный UTC offset. Матрица соединяется по stable case ID, подписи берутся из последнего snapshot в стабильном порядке date/id. `null` означает отсутствие кейса в прогоне; `not_run` сохраняется отдельным статусом. Сводки считают все шесть статусов, доля успеха — pass/(pass+fail), при нулевом знаменателе null/«—».

React выводит snapshot Markdown обычным текстом, не HTML. Ссылки на glossary остаются snapshot-текстом и не разрешаются по текущему справочнику. Browser download использует Blob, очищенное ограниченное имя файла, временный anchor и отложенный revokeObjectURL. Сообщение «Файл передан браузеру» не подтверждает запись файла на диске. При ошибке отчёт остаётся открыт; экспорт можно повторить. Синхронный pending ref блокирует двойной запуск до React render.

## PDF и библиотеки

Выбран `pdfmake` 0.3.11 с `@types/pdfmake` 0.3.3. Оба browser module — renderer и локальный VFS Roboto — импортируются динамически только при PDF export. JSON и открытие preview не загружают PDF/font bundle. Источник: [официальная инструкция client-side 0.3](https://pdfmake.github.io/docs/0.3/getting-started/client-side/), [pdfmake repository](https://github.com/bpampuch/pdfmake).

`pdfDefinition.ts` строит декларативный PDF только из собственного типизированного ReportDocument: plain text, A4, встроенный Roboto, автоматическая пагинация, headerRows=1, footer с номером страницы и demo origin. Пользовательские данные не становятся image/link/attachment/font URL/document definition. Длинные непрерывные токены переносятся штатным wordBreak: break-all pdfmake 0.3 без изменения исходного текста. Широкая матрица разделяется на группы не более пяти прогонов с повтором кейсов. HTML preview и PDF используют одну модель, но переносы страниц могут отличаться.

Лицензия pdfmake — MIT (файл LICENSE установленного package). Локальный Roboto Regular имеет metadata Version 3.014;2025, Copyright 2011 The Roboto Project Authors (https://github.com/googlefonts/roboto-classic) и SIL Open Font License 1.1 в name.records.license.en. Официальный текст: [Roboto OFL.txt](https://raw.githubusercontent.com/googlefonts/roboto-3-classic/main/OFL.txt). Полные тексты notice сохранены в `apps/desktop/third-party/pdfmake-MIT.txt` и `Roboto-OFL.txt`; источник и SHA256 указаны в README рядом.

Рассмотренные Rust-альтернативы: [genpdf](https://docs.rs/genpdf/latest/genpdf/) (layout/paragraph/table, embedded fonts) и [printpdf](https://docs.rs/printpdf/latest/printpdf/) (PDF operations и отдельная HTML layout ветка). Сейчас отдельный Rust renderer дал бы второй механизм пагинации. Native save остаётся обязанностью Rust; повторное использование frontend renderer не добавляет Node runtime или sidecar.

## Upstream и происхождение

Прочитаны неизменяемые `casewright-main/apps/desktop/src/services/report/run-report-html.ts`, `weekly-report-html.ts`, `report-shared.ts`, а также `store/slices/runs-slice.ts:exportRunToPdf/exportWeeklyReport`. Они подтверждают upstream PDF/weekly scope, six-status summary, pass/(pass+fail), группировку и матрицу. NW.js HTML preview/print script и Node-сервисы не перенесены. JSON export в изученном snapshot отсутствует. Реализация TS/React/pdfmake написана самостоятельно, upstream-код/стили/алгоритмические фрагменты не скопированы; исходный snapshot и его MIT notice остаются неизменными.

## Проверки и ограничения

`tests/runReports.spec.tsx` проверяет границы недель/год/високосную дату, шесть статусов и null rate, stable IDs/rename, absent vs not_run, notes projection, nonmutation, JSON/schema, filename, PDF definition без внешних ресурсов и wide-matrix groups, dirty metadata/guide guard, save/discard/cancel/failure, freshly saved state, readonly, empty/invalid week, export error/retry, duplicate clicks и deferred URL revoke.

Независимая проверка основным агентом, 2026-10-16:

- Прочитаны реализация и тесты. `pnpm desktop:frontend:test`: 200/200 тестов, 19 файлов. TypeScript, `pnpm --filter @testoritto/desktop build`, `pnpm check:ui` и `pnpm spec:validate` прошли. В release input пока входит product UI, а не UX preview; существующие предупреждения Vite о размере chunk и use client сохраняются.
- Headless Chromium: шесть настоящих скачиваний — JSON/PDF прогона без заметок и с заметками, JSON/PDF недели. Проверены schemaVersion 1, total, pass rate, период 2026-10-12–2026-10-18, 2 прогона и 5 строк матрицы. Фильтр списка не обрезает отчёт. Выключенные notes/failNotes отсутствуют на любой глубине. PDF/font bundle загружается только после экспорта PDF. Нет pageerror и внешних сетевых запросов.
- Проверены cancel/discard/save guard, свежие сохранённые данные, сохранение черновика при ошибке записи, доступность экспорта в readonly и disabled export для пустой недели. Диалог и checkbox проверены на 1440 и 760 px без горизонтального переполнения: [1440](reports/weekly-1440.png), [760](reports/weekly-760.png).
- pypdf/pdfplumber: реальные PDF содержат извлекаемую кириллицу и совпадающие данные. Прогон — 3 страницы, неделя — 4. Опция заметок меняет содержание PDF. Примеры: [PDF прогона](reports/run-example.pdf), [PDF недели](reports/weekly-example.pdf), [JSON прогона](reports/run-example.json), [рендер первой страницы](reports/pdf-page1.png).
- Отдельный fixture 40 кейсов со всеми статусами и заголовком из 2000 кириллических символов: 13 страниц, все 40 ID и последний маркер сохранены, длинный заголовок извлекается полностью. Семь прогонов: 10 страниц, матрица разделена на группы 1–5 и 6–7. pdfplumber не обнаружил символов за физическими границами страниц. Все страницы отрендерены и визуально просмотрены: [40 кейсов](reports/long-run-contact.png), [7 прогонов](reports/long-weekly-contact.png). Рабочие PDF и извлечённый текст — `.cache/reports-qa/`.

Browser downloads не подтверждают native dialog/save/install. Windows/macOS native, IPC, repository adapter и native acceptance остаются открытыми задачами 2.1–2.3. Rust не менялся; native runtime этой функции не проверялся.

## Цветные распределения

Дополнение этапа 3 `add-run-reports`: общая сегментированная полоса шести статусов, компактные полосы наборов и каждого прогона недели, цветные точки в результатах/матрице. Числа и названия вынесены в легенду, поэтому узкие сегменты остаются пропорциональными и не перекрывают подписи. При нуле кейсов показаны нейтральная полоса, явная подпись и все шесть нулей. Мелкие подписи тёмные на белом; цвет не является единственным способом прочитать результат.

`distributionModel.ts` хранит порядок и mapping существующих UI Kit токенов: success/pass, danger/fail, warning/blocked, accent-bg/in_progress, fg3/skipped, fg5/not_run. React использует CSS variables, PDF — их hex-эквиваленты, синхронизация проверяется тестом по `ui/theme/tokens.css`. Полосы PDF — собственные canvas rect в пределах 523.28 pt на A4; блок полосы/легенды не разбивается между страницами. Круговые диаграммы, сетевые изображения и новая chart dependency не добавлены. Подход сегментированных полос исследован в Casewright, код и стили написаны самостоятельно.

Новые автоматические проверки: шесть цветов и чисел, точные пропорции малого сегмента, отсутствие текста внутри узких сегментов, zero total без NaN/Infinity, все suite/weekly run distributions. Независимая visual QA этого дополнения ещё не выполнена; предыдущая приёмка выше относится к исходному отчёту.

Проверки дополнения: `pnpm desktop:frontend:test` — 205/205 тестов (19 файлов), `pnpm desktop:frontend:typecheck`, `pnpm check:ui`, `pnpm spec:validate` прошли. Пять новых тестов также проверяют A4 vector geometry и отсутствие мутации ReportDocument. Задача 3.2 остаётся открытой до независимой visual QA основным агентом.


Независимая проверка цветного этапа 2026-10-16: основной агент прочитал model/React/CSS/PDF и новые тесты; повторный frontend прогон — 205/205. Headless Chromium открыл оба отчёта на 1440/760 px, подтвердил resolved RGB success/danger/neutral, пропорциональные сегменты, отсутствие pageerror и горизонтального переполнения. Исправлен устаревший путь в кеше Vite после переименования компонента путём инвалидации импортера; исходный код не менялся. Скачаны реальные цветные PDF, извлечены подписи и проверены векторные цветные заливки. Render первой страницы просмотрен. Большие fixtures повторно дали 13/10 страниц, все 40 ID и последний sentinel сохранены, символов за страницами нет; просмотрены все страницы на contact sheets.

Evidence: [preview 1440](reports/weekly-colors-1440.png), [preview 760](reports/weekly-colors-760.png), [PDF прогона](reports/run-colors.pdf), [PDF недели](reports/weekly-colors.pdf), [PDF render](reports/run-colors-pdf-page1.png), [40 кейсов](reports/long-run-colors-contact.png), [7 прогонов](reports/long-weekly-colors-contact.png). Native scope остаётся открытым.
