# Playwright automation

Этап 1 `add-playwright-automation`: standalone bridge/reporter и browser-safe parser/contracts. Это не native acceptance desktop-приложения.

## Setup

Требуются внешний Node >=22.12 и уже установленный **в выбранном проекте** `@playwright/test` >=1.64.1. Проверенная версия — 1.64.1. Bridge не запускает package manager, shell, `npx` или установку browsers. User config, imports, globalSetup/teardown, webServer и test code исполняются с правами пользователя; явное доверие и containment принадлежат Rust service этапа 2.

`pnpm automation:build` создаёт `dist/index.mjs`, `dist/reporter.mjs`, `dist/bridge.mjs` и `.d.ts`. Каждый `.mjs` самодостаточен; Node bundles не требуют локальных runtime node_modules. При упаковке bridge и reporter должны находиться рядом. Browser entry `@testoritto/playwright-automation` экспортирует только contracts/parser; Node entrypoints имеют export condition `node`. Исходники TS strict, bundle собирает esbuild, declarations проверяет tsc. Зависимости zod 3.25.76, saxes 6.0.0 и xmlchars 2.2.0 уже присутствовали в workspace lock; добавлена явная package ownership. Их лицензии сохранены в `third-party/`.

## Bridge ABI

```text
node <readonly-resource>/bridge.mjs discover <absolute-manifest.json> [--await-start]
node <readonly-resource>/bridge.mjs run      <absolute-manifest.json> [--await-start]
```

Process cwd — canonical repo root. `profile.cwd` разрешается относительно него; `profile.config` — относительно выбранного cwd. Оба проверяются на canonical descendant. CLI установленного `@playwright/test` разрешается через `createRequire` от cwd, запускается тем же Node с массивом аргументов и `shell:false`. Выбранные projects передаются CLI; другие tests исключает `preprocess`.

С `--await-start` bridge **до чтения manifest/резолва проекта/spawn** ждёт точные bytes `START\n` по stdin; 30 секунд, EOF или другая строка завершают процесс кодом 2. Rust должен очистить опасные Node env options, назначить JobObject/process group до отправки `START\n`. Это позволяет исключить race назначения JobObject без исполнения config до containment. Наличие flag не делает процесс sandbox. Без flag CLI запускается сразу (fixture/developer flow).

Manifest создаёт приложение; `outputRoot` — существующий app-owned canonical absolute directory уникального execution. Он **не принимается из WebView как filesystem authority**. Bridge отказывается использовать root с существующим report/catalog/events. Доверенное приложение само проверяет root ownership, runtime/CLI identities, revisions, timeout и kill/reap дерева процессов. Bridge ограничивает buffers и устанавливает Playwright globalTimeout; hard deadline для зависшего config и lifecycle дерева обязан обеспечивать Rust. Node bridge не обещает containment потомков и не предоставляет arbitrary spawn API.

Stdout bridge — одна JSON строка `{schemaVersion:1,ok,operation,executionId,state,exitCode,error}`. Ранние validation failures могут иметь только schemaVersion/ok/state/error. Child stdout/stderr не транслируются: ограничены и попадают в failure diagnostic. Exit bridge: 0 — валидный completed report/catalog; 2 — runner/config/validation failure. Assertion failures дают bridge exit 0, `exitCode:1`, report `state:completed`, test `outcome:unexpected`. Completed exit 0 с unexpected и exit !=0 без unexpected отклоняются. Discovery создаёт `catalog.json`; run создаёт `report.json`. Reporter публикует JSON через temporary file + rename, events — bounded `events.ndjson`. Отсутствующий/повреждённый/несогласованный final report не считается успехом; bridge публикует runner_error fallback. Native storage публикует sidecar/index отдельно.

## Identity and selection

Каждый test в выбранных projects должен объявлять в test details:

```ts
test('example', { annotation: [
  { type: 'testoritto.caseId', description: 'case-123' },
  { type: 'testoritto.automationId', description: 'login' },
  { type: 'testoritto.variantId', description: 'valid-user' },
] }, async () => { /* ... */ });
```

Stable key — JSON tuple `[caseId,automationId,project,variantId]`. Отсутствующий variantId означает `default`; параметризованные tests должны задавать разные variantId. Runtime-added annotations слишком поздние для discovery. Missing/duplicate identities блокируют весь выбранный catalog; title/file/line не используются для guessing. Project dependencies/teardown projects пока отвергаются явно. `repeatEachIndex` группируется в attempts одного key, retry не изменяет identity. Catalog digest включает profileRevision, sorted catalog/hints/expectedStatus, содержимое test source/config и доступные cwd lockfiles/package.json. Изменение imported helpers/dependencies покрывает native trust policy в пределах design; digest не является аудитом всего исполняемого дерева. Stale catalog и missing selection исключают все test bodies до начала выполнения. Discovery всё равно выполняет config/test module imports, поэтому требует доверия.

## Public schema v1

Источник обязательных полей и runtime-проверок — `src/contracts.ts`; generated declarations — `dist/index.d.ts`, `dist/contracts.d.ts`. JSON examples: `fixtures/manifest.json`, `fixtures/report.json`. Все объекты contract strict: unknown fields/versions отвергаются. IDs непустые, <=256, без control chars; execution IDs UUID; revisions SHA256 lowercase. Relative paths не содержат absolute/UNC/colon/backslash/traversal/control chars. Диагностические file/title hints не дают доступа к FS.

| Object | Fields |
| --- | --- |
| Profile | schemaVersion=1, profileId, label, cwd (`.` разрешён), config, projects (уникальные), timeoutMs, retries 0–10, workers 1–32 |
| Binding | caseId, automationId, project, variantId, profileId |
| Manifest | schemaVersion=1, operation discover/run, runId (repo-relative), executionId, parentExecutionId (UUID/null), profileId, profileRevision, catalogRevision (hash/null для discovery), createdAt ISO, source, selection, profile, outputRoot |
| Source | commit SHA/null, branch string/null, dirty boolean |
| Catalog | schemaVersion=1, executionId, profileId, profileRevision, catalogRevision, tests (key+title/file/expectedStatus), dependencies (сейчас []) |
| Report | manifest correlation/source/selection без operation/profile/outputRoot; state, reason (string/null), startedAt/finishedAt ISO, complete=true, tests, runnerErrors, logs, attachments |
| Test | key + title, file, expectedStatus passed/failed/skipped, outcome expected/unexpected/flaky/skipped/interrupted, attempts |
| Attempt | retry, repeatEachIndex, status passed/failed/timedOut/skipped/interrupted, startedAt ISO/null (null для отсутствующего import metadata), durationMs, errors, stdout, stderr, attachments (UUID references) |
| Error | message, stack (string/null) |
| Attachment | id UUID, name, contentType, path (safe relative/null), size, unavailableReason (string/null) |
| Logs | stdout, stderr, truncated |

Terminal state: completed/runner_error/interrupted/timed_out. Failed с expectedStatus=failed — expected; successful retry после неожиданной неудачи — flaky, обе attempts сохраняются. Для repeatEach каждый repeat должен завершиться ожидаемо; неудачный repeat не скрывается успешным другим repeat. Невыполненная selection, runnerErrors или interrupted outcome не допускают completed. `parseReport(data,manifest)` дополнительно сверяет все correlation поля, включая source/selection.

Лимиты `LIMITS`: report/import 16 MiB UTF-8, 10 000 tests, 100 attempts/test, aggregate logs 1 MiB с truncation, 100 attachments, 25 MiB/attachment, 100 MiB aggregate artifacts, runtime 30 min, discovery 60 sec, native poll 256 KiB. Error message 16 KiB, stack 32 KiB; failed report size не маскируется успехом. Attachment copying допускает image/png, image/jpeg, text/plain, application/json, application/zip, video/webm; HTML и другие MIME получают unavailableReason. Path attachments должны быть canonical descendants cwd, body ограничен до записи; generated artifact IDs не берутся из имён файлов. Ничего не открывается автоматически. Native service повторно валидирует files/paths/limits независимо от JS.

## Passive import dialect

`parseImport(text,'testoritto'|'playwright'|'junit')` ничего не исполняет, не читает FS и не ходит в сеть. Testoritto v1 проверяется strict report schema. Playwright JSON поддерживает suites/specs/tests/results с test annotations, projectName, expectedStatus, retry/repeatEachIndex и text stdout/stderr; binary output отмечается omitted, внешние artifacts не разрешаются. Недостающие runId/executionId/source остаются null.

JUnit: root testsuites/testsuite, testcase name/file/time, failure/error/skipped, system-out/system-err и **testcase-level** `properties/property name="..." value="..."`. Stable metadata: `testoritto.caseId`, `testoritto.automationId`, `testoritto.project`, optional `testoritto.variantId=default`. Suite-level properties, title/classname inference и vendor-specific retry dialect не поддерживаются. DTD запрещён; saxes отклоняет malformed XML, duplicate attributes и неизвестные entities; только XML predefined/numeric escapes разрешены. Сеть/external entities не включаются. Nesting ограничен 64. Отсутствующий timestamp остаётся null; generic reports не получают выдуманный commit/run/execution ID. Неизвестные XML elements не исполняются.

`previewImport(parsed,{targetRunId,targetRevision,sourceHash,bindings,importedHashes,mapping?,existingExecutions?})` возвращает normalizerVersion=1, исходные revisions/hash, foreignRun/metadataMissing/duplicateImport/executionConflict и rows со status matched/unmatched/duplicate. SHA256 вычисляет вызывающая сторона по исходным bytes; pure parser не притворяется криптографическим verifier. Явный mapping использует decimal row index и полный key; title не связывает строки автоматически. Duplicate source/binding keys блокируют строки. Import identity — target run+sourceHash, повтор source hash — no-op; тот же external executionId с другим hash — conflict. Preview не записывает summary и не разрешает foreign source автоматически: native reviewed apply заново сверяет hash/revision и явный target choice.

## Verification

`pnpm automation:test` собирает bundles/declarations и запускает Node tests с настоящим установленным Playwright, без запуска browser. Временные fixtures создаются в repo `.cache/`, без изменения пользовательских repos. `pnpm automation:typecheck`. Evidence — `apps/desktop/evidence/automation-bridge.md`.

Источники API: [Reporter/preprocess](https://playwright.dev/docs/api/class-reporter), [TestRun.exclude](https://playwright.dev/docs/api/class-testrun), [TestResult](https://playwright.dev/docs/api/class-testresult), [CLI](https://playwright.dev/docs/test-cli), [saxes strict XML parser](https://github.com/lddubeau/saxes). Последний архивирован upstream; здесь используется уже зафиксированная версия 6.0.0 с fail-closed DTD policy и ограниченными input fixtures, без автоматического dependency upgrade.
