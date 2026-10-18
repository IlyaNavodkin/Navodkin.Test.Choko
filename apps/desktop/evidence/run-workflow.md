# Run grid and guide

15 октября 2026. Основной агент, без субагентов и управления пользовательскими окнами. Срез задачи OpenSpec 4.2 change `add-testoritto-mvp`.

## Implementation

`execute-run/` содержит обзор результатов, навигацию и пошаговый checklist. Grid использует @codaa/ui Table с 25 строками на страницу (25/50/100), поиском по displayId/title и фильтром по всем шести результатам. Номер строки отражает исходный порядок catalog/`.order`; фильтрация его не переписывает. Сводка и progress считаются по всему прогону: pass/fail/blocked/skipped завершены, not_run/in_progress остаются незавершёнными. Фильтры меняют только отображение и не вызывают save.

Guide начинает с первого not_run/in_progress либо первого кейса, если незавершённых нет. Показывает по одному пункту Setup → Steps → Acceptance Criteria и затем поля результата. Objective и Setup body берутся из сохранённого source snapshot, checklist text — из sidecar. Нет обращения к live case для подмены содержимого. Старые sidecars без полного snapshot показывают пояснение и сохранённые пункты; при пустом checklist сразу доступна запись результата.

Локальные отметки/пояснения используют существующий useZodForm draft и `save_run_case`, без новых IPC commands, изменения разрешений или формата хранения. Перемещение между пунктами одного кейса не сбрасывает ввод. Переход к другому кейсу/таблице блокируется dirty/saving состоянием; доступны обычные явные save/discard controls и native close guard. `Сохранить и продолжить` требует result, отличный от not_run, ждёт успешного сохранения и clean React render, затем выбирает следующий незавершённый кейс с wrap-around, исключая текущий. При ошибке ввода/диска/external revision остаётся текущий draft. Если других pending cases нет, возвращается таблица; незавершённый in_progress не выдаётся за completed. Late transition не применяется к другой repo session. При переходе guide фокусируется заголовок текущего кейса.

Код Casewright RunGrid/RunGuide изучен как reference поведения. Node/store/live-case rendering и автозапись upstream не перенесены. Реализация использует собственные typed hooks, @codaa/ui, CSS Modules и Citadelic tokens, RU/EN. Desktop sidebar прокручивается отдельно, длинные title переносятся; узкий экран сохраняет локальную прокрутку таблицы.

## User flow

1. Открыть «Прогоны» и выбрать прогон. В центре доступны таблица, сводка, поиск и фильтр; нажатие ID/title открывает сохранённый кейс.
2. Нажать «Начать / продолжить выполнение» или «Выполнить» нужной строки.
3. Пройти подготовку, шаги и критерии, выбрать отметки и пояснить ошибки. Можно вернуться к предыдущему пункту или явно перейти к записи результата.
4. Выбрать результат, заполнить tester/time/date/Notes при необходимости. Кнопка текущего времени заполняет executed_at явно.
5. «Сохранить и продолжить» записывает результат и открывает следующий pending кейс. При неуспешном save ввод остаётся для исправления/повтора; завершение прогона само по себе не делает commit/push.
6. Для выхода из dirty кейса сначала сохранить либо подтвердить отказ от черновика. Сохранённые сведения и полный снимок доступны в раскрываемом блоке.

## Verification

- TypeScript frontend/browser strict checks: успешно.
- Vitest **59/59**, 9.10s. Новые проверки: terminal/pending summary, Unicode search/order, wrap-around без повторения текущего кейса, ожидание clean render после save и отклонение late transition в другой session.
- Headless Chromium full production bundle/Tauri CSP: **29/29**, 34.7s. Новые сценарии проверяют 60 rows/pagination/filter без записи, frozen Objective/Setup, сохранность failed draft, retry и переход мимо уже пройденного кейса, финальный progress и сохранённое fail note, старый run без snapshot/checklist и незавершённый in_progress. Проверяется отсутствие page/console errors и внешних запросов. IPC mock расположен только в тестах; это browser frontend E2E.
- UI Kit typecheck и OpenSpec strict validation **2/2**: успешно. `git diff --check` прошёл, `casewright-main/` не изменён.

Screenshots: [таблица](browser/run-results-grid.png), [ошибка записи в guide](browser/run-guide-failed-save.png), [после завершения](browser/run-guide-completed.png).

Rust services/formats не менялись в этом срезе; предшествующий baseline — 130/130 Rust tests. Native GUI новых режимов, macOS arm64 и установка не проверены. Задача 4.2 не объявлена полностью принятой без native продуктовой проверки; change не архивирован. Git status/diff/scoped commit/pull/push и безопасный abort конфликтов, watcher/flush/recovery и оставшийся suite UI ещё впереди.

После финальной правки typography/sidebar/focus повторно прошли три новых browser scenarios: **3/3**, 5.4s; проверен focus заголовка после перехода. Windows x64 `tauri build --no-bundle`: exit 0, optimized build 38.49s. Executable `src-tauri/target/release/testoritto-desktop.exe`, 12041728 bytes, SHA256 `88264a59947cc36da8859e03273da748c4f46722ee32f0e6b5950e1129bac159`. Собран после всех runtime/UI изменений, не запускался.
