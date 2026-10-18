# Automation native core checkpoint

Дата: 2026-10-17. Это промежуточный **v1** backend/API checkpoint. Уточнённые Autotest/Invocation/arguments/glossary/report-export v2, native import и product UI здесь не реализованы. Задачи 2.x и 5.x не отмечены завершёнными.

Реализованы strict serde/Zod DTO, profiles/bindings, локальное доверие, fixed Node bridge process, discovery/start/poll/cancel, namespaced execution history и app-data output. Нормальный exit проверяет shutdown до разрешения выхода; при ошибке сохраняется отказ закрытия с диагностикой. Native обработчики проверяют caller/protocol/session; команды перечислены в AppManifest/main capability. Общее FIFO используется для admission и terminal publication, отмена идёт отдельно. Casewright summary автоматически не изменяется, Git staging отсутствует.

Доверие связывает canonical repo root, config/profile, Node binary, установленный package/CLI и lockfiles; изменение отзывается перед новым запуском. Это разрешение локальному коду с правами пользователя, **не sandbox**. Windows job назначается до START handshake, использует kill-on-close. Unix process-group ветка скомпилирована только условно и здесь не выполнялась; crash containment macOS не подтверждён.

## Verification

Независимая проверка основным агентом 2026-10-17: прочитаны contracts/facade, process containment/lifecycle, storage и polling projection; повторно выполнены frontend `tsc --noEmit`, пять `automation-api.spec.ts` тестов и шесть `services::automation::tests` с `--test-threads=1`, все прошли. Rust fixtures исполняют настоящий Node с фиксированным protocol bridge, не сквозной Playwright. Валидация пяти OpenSpec changes прошла после уточнения v2. Это проверка v1 checkpoint; новый каталог/аргументы/окружения и UI не подтверждены.

Окружение: Windows x64, Node v22.23.1, Cargo/Rust toolchain 1.98.1, VS18 amd64 Developer Environment. Для native atomic checks временные файлы размещались в разрешённом workspace: `TEMP=TMP=D:\repo\testoritto\.cache\automation-temp`, `CARGO_NET_OFFLINE=true`. Обычный temp в профиле пользователя отклонялся sandbox при ancestor-lock `C:\Users\ilyas`; защиту writer не ослабляли.

Из корня:

```powershell
cargo +1.98.1 fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --all -- --check
cargo +1.98.1 clippy --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo +1.98.1 test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Результат: fmt/clippy PASS; **202 Rust tests PASS**, в том числе 6 automation tests. Лог: `.cache/automation-core-rust-checkpoint-final.log`. Проверены shared report fixture/Unicode/correlation, readonly open/untrusted discovery/revocation, настоящий Node с фиксированным fixture bridge, persistence/poll truncation/index preservation, timeout и cancel/session cleanup descendants. Тест descendants сначала ждёт готовности потомка, затем после cancel/join открывает latch; оставшийся живым потомок записал бы запрещённый marker. Предыдущий таймерный вариант выявил медленный BUSY check; ранний BUSY admission исправлен.

Из `apps/desktop`:

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run tests/automation-api.spec.ts tests/repositoryApi.spec.ts tests/runtimeDiagnosticsApi.spec.ts
```

Результат: typecheck PASS; **25 API tests PASS** (5 новых automation). Прямые installed CLI использованы, поскольку pnpm пытался получить отсутствующую supply-chain metadata из registry; policy не менялась. Добавлены только workspace dependency/link, новые внешние зависимости не устанавливались.

## API checkpoint

`src/automation/api/automationApi.ts`: `read(sessionId)`, `saveProfile(sessionId, expectedRevision, profile, nodePath)`, `saveBindings(sessionId, expectedRevision, bindings)`, `setTrust(sessionId, profileId, expectedRevision, grant)`, `discover(sessionId, start)`, `start(sessionId, start)`, `poll(sessionId, runId, executionId, cursor=0)`, `cancel(sessionId, executionId)`.

Discovery/start возвращают execution summary. Poll возвращает cursor/nextCursor, страницу tests/catalog и report overview; ограничение 256 KiB, явные detailsTruncated. Все статусы/retry/repeatEach попыток сохраняются при усечении пассивных details. Абсолютных artifact paths в ответе нет. Схемы и типы — соседний `contracts.ts`; этот контракт является v1 baseline, не новой продуктовой моделью v2.

## Remaining limitations

- Rust service в этих тестах запускает настоящий Node **с фиксированным fixture bridge**, не настоящий Playwright. Реальный Playwright stage 1 проверен отдельно; их сквозное соединение через Rust пока требует отдельного integration test.
- Desktop UI/IPC runtime, installation/bundling и macOS не запускались. Exit failure dialog/восстановление окна скомпилированы, но native приёмка не выполнена.
- Native import/preview/apply и reviewed summary apply отсутствуют. V2 CRUD/arguments/glossary/export отсутствуют.
- Полные bounded details/artifact viewing/export ещё требуют отдельных команд. При принудительном kill промежуточные reporter events пока не восстанавливаются в attempts; сохраняется terminal execution status. Это не завершение всего lifecycle requirement.
- Portable settings этого промежуточного среза хранят profiles и bindings вместе в `profiles.json`; дальнейшая storage-модель требует согласования с v2. Retention/cleanup app-data output пока не реализованы.
- Нет отдельного теста spawn-assignment failure, завершения процесса приложения/crash, всех FIFO/error/write-failure сценариев автоматизации и всех hostile report/path перестановок. Существующий repository safe atomic writer переиспользован; его regression tests проходят.
