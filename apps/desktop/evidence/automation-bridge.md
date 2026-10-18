# Automation bridge: stage 1

Дата: 2026-10-16. Среда: Windows x64, внешний Node v22.23.1, pnpm 11.25.0, установленный @playwright/test 1.64.1. Изменение `add-playwright-automation`, этап 1; **desktop native execution/IPC/install/containment и macOS здесь не проверены**.

Создан workspace `tools/playwright-automation`: TS strict contracts+passive import parser, standalone bundled reporter и bridge (`.mjs` с declarations). Browser entry проверен по esbuild metafile: ни Node imports, ни внешних runtime imports, ни bridge/reporter source. Public contract/setup/ABI и ограничения: [README](../../../tools/playwright-automation/README.md). Для Rust/React последующих этапов: [manifest fixture](../../../tools/playwright-automation/fixtures/manifest.json), [report fixture](../../../tools/playwright-automation/fixtures/report.json).

Проверки:

- `pnpm install --offline --ignore-scripts`: успешно; 0 downloaded, новые runtime versions не добавлены, явные dependencies уже существовали в lock. Первый sandbox вызов не видел user cache; повтор с разрешённым доступом к cache прошёл.
- `pnpm automation:test`: 13/13 Node tests, включающие настоящие Playwright CLI subprocesses без browser launch. Сборка bundles и tsc declarations включена.
- `pnpm automation:typecheck`: успешно.
- `pnpm desktop:frontend:typecheck`: успешно; product frontend не менялся.
- `pnpm spec:validate`: 5 changes прошли strict validation.

Real fixtures подтвердили: discovery, annotation identity, exact selected variant и project, отсутствие соседнего file side effect, repeatEach grouping, pass, unexpected fail, expected fail, skip, retry→flaky с обеими attempts, stdout/stderr, body attachment copy, blocked HTML MIME, aggregate log truncation, stale source digest, missing/duplicate identity, unsupported dependency projects, config/setup failure, `process.exit(0)` без report и ненулевой exit без assertions. START-gate проверен с точным `START\n`, неверным token и EOF до исполнения config. Невалидный JSON final и отсутствующий final отвергаются reader; process exit сравнивается с assertion outcomes, completeness/correlation проверяются.

Parser fixtures подтвердили strict version/unknown fields/paths/UUID/duplicate selection, expected-failure/flaky semantics, malformed/oversized XML, DTD/custom entity/duplicate XML attribute rejection, explicit metadata/mapping, unmatched generic rows, duplicate source rows, foreign run и same-source idempotency preview. JUnit dialect ограничен testcase properties; отсутствующий timestamp остаётся null. Text не исполняется, filesystem/network imports у browser entry отсутствуют. Native independent validation/apply пока принадлежит этапу 2.

Временные fixtures — `.cache/playwright-automation-*` этого репозитория. Пользовательские data repos, `casewright-main`, original Markdown и Git index не менялись. JS bundles включают MIT/ISC notices зависимостей; лицензии сохранены в package `third-party/`.

Ограничения: доверенные config/imports выполняют локальный код; это не sandbox. Rust обязан проверять trust/runtime/paths/output ownership, ограничивать wall clock зависшего config, назначать JobObject/process group перед START, завершать и reap дерево процессов. Playwright globalTimeout и bounded Node pipes не доказывают native containment. macOS runtime/install, desktop native flows, UI/API wiring, persistence/reviewed apply и mixed-run UX не подтверждены этим evidence.
