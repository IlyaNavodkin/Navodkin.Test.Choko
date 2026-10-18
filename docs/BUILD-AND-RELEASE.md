# План сборок Tauri 2 для Windows/macOS

**16 октября 2026:** Windows x64 EXE и NSIS 0.1.0 успешно собраны; installer включает MIT NOTICE.md и использует стандартный WebView2 download bootstrapper. [Сборка, SHA256 и ограничения](../apps/desktop/evidence/windows-acceptance.md), [ручная приёмка](../apps/desktop/ACCEPTANCE.md). Установка и runtime нового artifact не запускались. macOS/private native CI/native E2E/signing остаются открытыми. Описания ранних стадий ниже исторические.

Основа Tauri 2 выбрана пользователем. `apps/desktop` содержит минимальное окно и сценарий runtime diagnostics; Windows x64 native build и окно проверены. macOS build/window, installers и полный repo workflow ещё не подтверждены. Preparation CI template `docs/ci/preparation-checks.yml` пока не активирован из-за отсутствующего GitHub workflow scope.

## Toolchains

Frontend: Node.js 22.23.1/pnpm 11.25.0/Vite. Native: Rust 1.98.1/Cargo и Tauri 2 CLI. JS и Rust dependencies фиксируются отдельно в pnpm-lock.yaml и Cargo.lock; версия Rust задана в корневом rust-toolchain.toml.
Windows: Microsoft C++ Build Tools и WebView2. macOS: Xcode tooling. Установочные prerequisites и minimum OS versions проверить по выбранной версии Tauri; системный Git диагностируется приложением.
На Windows установлен Microsoft C++ workload и Windows SDK для существующей Visual Studio 18. В MSVC x64 Developer Environment прошли `cargo check --locked`, clippy (`--all-targets -- -D warnings`), 4 Rust tests и `cargo fmt --check`; production `tauri build --no-bundle` завершился успешно и сгенерировал Windows x64 executable. В обычном desktop-процессе native окно показало runtime diagnostics `0.1.0 / Windows / x64`; generated ACL schema содержит разрешённый custom command. macOS arm64 build/run, installers и WKWebView остаются непроверенными. Полные команды и evidence: [Windows foundation evidence](../apps/desktop/evidence/windows-foundation.md).

## Targets

| Target | Native runner | Предложенный artifact | Проверка |
| --- | --- | --- | --- |
| Windows x64 | windows-latest | NSIS setup .exe; MSI отдельной опцией | Native window/build подтверждены; install/WebView2 и repo workflow ожидают проверки |
| macOS arm64 | macOS arm64 runner | .app + .dmg | Native window/build, затем WKWebView и repo workflow |

Минимальные версии ОС остаются открытыми и должны быть согласованы до release. Cross-compile не заменяет запуск native installer. Portable Windows zip не обещается на старте; deployment mode WebView2 выбирается в Tauri installer config.

## Future pipeline

1. Frozen pnpm install и закреплённый Rust toolchain; Cargo.lock commit, Rust checks с locked dependencies.
2. OpenSpec/TypeScript/Vitest и cargo fmt/clippy/test для Rust domain/services.
3. Frontend Vite build и Rust native binary через `pnpm desktop:build`. Tauri config связывает beforeDevCommand/beforeBuildCommand, devUrl и frontendDist.
4. Bundling Tauri CLI на каждой native ОС, загрузка private CI artifacts без release publishing.
5. Native WebdriverIO Tauri service smoke на обеих ОС; test-only driver plugins/features исключить из release, затем проверить установку обычного release artifact.
6. После согласования distribution — version/tag, signing/notarization, checksums и release assets.

Исходный snapshot, tooling и docs не входят в installer. Frontend скомпилирован, Rust владеет файлами/Git; отдельный Node runtime не поставляется.

## Native tests

WebdriverIO Tauri service поддерживает embedded WebDriver для Windows/macOS. Стандартный внешний tauri-driver ограничен Windows/Linux; macOS-проверку нельзя объявлять выполненной на его основании.
Browser UI tests/Vitest проверяют preview и mock IPC, но не заменяют native commands, installer и WKWebView/WebView2 smoke. Текущий desktop slice включает только runtime diagnostics; repo, editor, save, run и Git workflows не реализованы.
Embedded WebDriver/backend test access включать только в тестовой конфигурации. Release artifact должен быть проверен отдельно без этих расширений.

## Signing и private distribution

Для публичного macOS release предусмотреть signing/notarization и CI secrets; Windows signing — отдельная настройка сертификата/сервиса.
Unsigned internal build описывается как отдельный режим запуска; не считать его доказательством публичного release.
Private repo token не встраивается в приложение для updater. Tauri updater/endpoints и update-signing keys — отдельный future change; исходный Casewright updater не переносится.

## Primary sources

- [Prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Vite integration](https://v2.tauri.app/start/frontend/vite/)
- [Tauri distribution](https://v2.tauri.app/distribute/)
- [Windows installers](https://v2.tauri.app/distribute/windows-installer/)
- [macOS DMG](https://v2.tauri.app/distribute/dmg/)
- [Native WebDriver tests](https://v2.tauri.app/develop/tests/webdriver/)

14 октября: Windows x64 optimized `tauri build --no-bundle` для текущих case CRUD commands прошёл, CLI exit 0. Результат `apps/desktop/src-tauri/target/release/testoritto-desktop.exe`; размер/SHA256 и проверки в [case operations](../apps/desktop/evidence/case-operations.md). Новый executable не запускался; installer/native CRUD UI/macOS acceptance этим не подтверждены.

Windows release пересобран с `create_run`, snapshot DTO и no-clobber directory publication. CLI exit 0, optimized Rust build 42.19s; binary size/hash в [run creation](../apps/desktop/evidence/run-creation.md). Запуск нового окна/installer и macOS не проверялись.

## Run execution update

Реализованы явное сохранение результатов, per-item отметок и пояснений, tester/time/date override и Notes sidecar, а также open/closed, Summary/Notes самого прогона с сохранением approvals/date/unknown metadata. Запись использует optimistic SHA256 и atomic replacement. Черновик удерживается при ошибке/внешнем изменении. Проверки и ограничения: [Run execution](../apps/desktop/evidence/run-execution.md). Native UI и macOS не объявлены проверенными.

## Run workflow update

Добавлены таблица результатов с pagination/search/filter и пошаговое выполнение snapshot-кейсов. Failed save удерживает draft; переход к следующему pending кейсу выполняется только после успешной записи. Проверки и сценарий: [Run grid and guide](../apps/desktop/evidence/run-workflow.md). Native приёмка новых режимов остаётся открытой.

## Git inspection update

Добавлены readonly Git status/branch/upstream/ahead-behind и выбранный staged/unstaged diff через scoped typed IPC. Git index и история не изменяются; commit/pull/push/abort ещё не реализованы. Проверки, лимиты и setup: [Git inspection](../apps/desktop/evidence/git-inspection.md). Native приёмка новых сценариев остаётся открытой.
