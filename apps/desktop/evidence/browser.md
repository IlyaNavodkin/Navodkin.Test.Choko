# Browser frontend evidence

Дата проверки: 2026-10-14. Проверка выполнялась headless Chromium 156.0.8078.4 (Playwright Test 1.64.1) на production Vite bundle через отдельный loopback preview `127.0.0.1:4175`, один worker. Каталог браузерных бинарников — workspace `.cache/playwright`; `pnpm desktop:browser:test` проверяет TypeScript приложения и browser-тестов, собирает bundle, запускает и останавливает принадлежащий runner локальный preview.

Headless прогон субагента: `14 passed (13.3s)`, CLI exit code 0. Основной агент независимо повторил набор: `14 passed (13.3s)`. Runner собрал production bundle, запустил собственный preview на 4175 и завершился после тестов; preview порт освобождён. Тесты используют изолированный Playwright context и test-only mock `window.__TAURI_INTERNALS__.invoke`; production приложение и bundle не содержат mock-режима. Mock data соответствует serde DTO и задаётся в тестах.

Покрыты: browser preview с явным unsupported-native состоянием; открытие mock repository, workspace tree, folder note, case, run metadata/checklist и узкий viewport; picker cancel/failure с сохранением выбора; список и open recent с восстановлением workspace, явное состояние отсутствующей workspace, ошибка истории без блокировки picker, recent-open retry с сохранением текущего reader и best-effort ошибка/повтор сохранения workspace; refresh/workspace смена с новыми resource IDs и retry документа; поздний ответ старой сессии и invalid DTO; repository без конфигурации без создания файлов; keyboard activation и hostile Markdown; workspace Select и case reader под точным production `app.security.csp` из `src-tauri/tauri.conf.json`. CSP-сценарий проверил фактический response header, взаимодействие и Markdown; hostile HTML не исполнился и внешний ресурс не запрашивался. Во всех сценариях не было browser page/console errors или внешних запросов.

Эти browser tests проверяют frontend при mock IPC и не проверяют Rust IPC, нативный picker, файловую систему или Git. Отдельно ранее подтверждены Windows x64 native build, окно и runtime diagnostics в [Windows foundation evidence](windows-foundation.md). Полный native picker → repository → case/run сценарий, macOS arm64 build/window и installers остаются непроверенными.

Снимки интерфейса перезаписываются headless Playwright сценариями из текущего production bundle:

- [Case reader](browser/case-reader.png)
- [Case reader under production CSP](browser/csp-case-reader.png)
- [Run reader](browser/run-reader.png)
- [Узкий viewport](browser/narrow-layout.png)

В последнем increment дополнительно проверены редактор/save с отказом записи и retry, external dirty edit и подтверждаемый reload, initialization cancel/confirm. Все 14 страниц тестов получают production CSP. Подробности backend/frontend checks и ограничения: [editor evidence](editor.md). Снимок результата: [saved case](browser/saved-case.png).

Дополнительно проверены поиск title/displayId, совместные status/tag filters, empty/reset и сохранение текущего reader/родительских папок. Скриншот: [case-filters.png](browser/case-filters.png).

Следующий срез включает create/duplicate/move/delete и stale-delete confirmation: 20/20 production Chromium сценариев, 23.9 секунды, IPC только тестовый. Актуальный отчёт: [case operations](case-operations.md).

Следующий срез: создание snapshot run и immutable full-case preview после изменения исходника, empty/stale selection/error/retry. 22/22 headless Chromium production scenarios, 20.8 секунды; IPC test-only. Подробности: [run creation](run-creation.md).
