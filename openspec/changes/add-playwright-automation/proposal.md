# Proposal

## Why

Ручные кейсы и snapshot-прогоны уже имеют стабильные идентификаторы и сохранённые результаты, но запуск Node.js автотестов и перенос их результатов остаются отдельной работой пользователя. Согласованная интеграция Playwright объединит ручную проверку и автотесты в одном прогоне без изменения формата исходных Casewright-файлов при открытии.

## What Changes

- Уточнение пользователя 2026-10-17: отдельный каталог «Автотесты» с созданием и редактированием сущностей; к одному кейсу привязываются несколько автотестов. Автотест объявляет поддерживаемые аргументы, значения задаются по умолчанию, в привязке и перед запуском. Значения окружений (`prod`, `stage`) выбираются из справочника. Результат фиксирует снимок аргументов и отчёты конкретного execution; поддерживается явное сохранение отчётов в папку прогона без automatic Git staging.
- Подтверждён пользователем 2026-10-16: Playwright reporter, стабильная связь с case ID, доверенные профили локального запуска, выбор тестов, повтор упавших, остановка, смешанные прогоны, attempts/logs/errors/attachments и импорт JSON/JUnit. Реализация этого объёма разрешена; дополнительное согласование этапов не требуется.
- Этап 1: versioned manifest/report contracts, общий parser, настоящий Node.js reporter и контролируемый bridge CLI с реальными fixture-запусками Playwright.
- Этап 2: Rust process/session service, локальное доверие, ограниченный IPC, polling, остановка дерева процессов, persistence и integration tests.
- Этап 3: привязка кейса, профили, запуск/повтор/остановка, импорт с preview, история попыток в product UI и изолированном UX preview; browser QA.
- Этап 4: native приёмка Windows x64/macOS arm64, отдельно от browser fixtures и компиляции. До её выполнения результат не объявляется проверенным на этих targets.
- Node и Playwright уже установлены пользователем вне приложения; Tauri запускает внешний Node с проверенными аргументами. Node в WebView и Node-sidecar не добавляются.
- Открытие, чтение отчёта и импорт не исполняют config/test code. Discovery и запуск разрешены только явным действием для доверенного профиля.

Не входят: CI orchestration, контейнерная sandbox, встроенный редактор кода, установка Node/Playwright/browsers, arbitrary shell scripts, автоматические commit/push и миграция существующих repos. Численные лимиты и формат аннотаций ниже — предложенные технические решения, проверяемые fixture-тестами. Другие решения MVP остаются в прежнем статусе.

## Capabilities

### New Capabilities

- `playwright-automation`: профили и доверие, stable bindings, контролируемое выполнение, versioned results, безопасный импорт и смешанные прогоны.

### Modified Capabilities

Нет living specs: `pnpm spec list --specs` возвращает пустой список. Дополнение согласуется с in-flight `add-testoritto-mvp/specs/test-runs/spec.md`; его совместимые ручные результаты и сохранение неизвестного контента остаются обязательными.

## Impact

Расширяется change `add-repository-glossary`: тип «Окружение» со структурированными значениями. Autotest и case binding получают самостоятельные ID; отдельный invocation различает повторное использование одного автотеста с разными аргументами. Проверенный runner v1 остаётся baseline; новый контракт v2 требует новых проверок, прежде чем объявлять этот scope реализованным. Runtime-интеграция и UI пока не завершены.

Новый workspace `tools/playwright-automation` (reporter/bridge/parser/contracts), Rust automation service и process containment, команды/permissions/capabilities, типизированный frontend facade и useCases. Ресурсы reporter/bridge поставляются как JS assets без Node runtime. Новые данные принадлежат `.testoritto/automation/`, локальное доверие и секреты — OS app-data вне Git. Изменения Casewright Markdown допускаются только отдельным reviewed apply с revision check; ручные результаты автоматически не перезаписываются. PRD получает отдельный согласованный scope; исходный snapshot `casewright-main/` не изменяется.
