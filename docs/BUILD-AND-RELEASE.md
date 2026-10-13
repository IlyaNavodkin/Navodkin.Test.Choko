# План сборок Tauri 2 для Windows/macOS

Основа Tauri 2 выбрана пользователем. Application package и installers ещё не созданы. Preparation CI template `docs/ci/preparation-checks.yml` пока не активирован из-за отсутствующего GitHub workflow scope; Rust/build jobs добавляются при реализации.

## Toolchains

Frontend: Node.js/pnpm/Vite. Native: Rust stable/Cargo и Tauri 2 CLI. JS и Rust dependencies фиксировать отдельно в pnpm-lock.yaml и Cargo.lock; Rust toolchain закрепить при создании приложения.
Windows: Microsoft C++ Build Tools и WebView2. macOS: Xcode tooling. Установочные prerequisites и minimum OS versions проверить по выбранной версии Tauri; системный Git диагностируется приложением.
Rust/Tauri dependencies в данном шаге не устанавливались.

## Targets

| Target | Native runner | Предложенный artifact | Проверка |
| --- | --- | --- | --- |
| Windows x64 | windows-latest | NSIS setup .exe; MSI отдельной опцией | Install/WebView2/start/open/edit/save/commit |
| macOS arm64 | macOS arm64 runner | .app + .dmg | WKWebView, Cmd shortcuts, picker, repo workflow |
| macOS x64 | macOS Intel runner | .app + .dmg | Отдельный Intel smoke |

Конкретные labels и OS baseline согласовать при реализации. Cross-compile не заменяет запуск native installer. Portable Windows zip не обещается на старте; deployment mode WebView2 выбирается в Tauri installer config.

## Future pipeline

1. Frozen pnpm install и закреплённый Rust toolchain; Cargo.lock commit, Rust checks с locked dependencies.
2. OpenSpec/TypeScript/Vitest и cargo fmt/clippy/test для Rust domain/services.
3. Frontend Vite build и Rust native binary через `pnpm tauri build` из будущего desktop package. Tauri config связывает beforeDevCommand/beforeBuildCommand, devUrl и frontendDist.
4. Bundling Tauri CLI на каждой native ОС, загрузка private CI artifacts без release publishing.
5. Native WebdriverIO Tauri service smoke на обеих ОС; test-only driver plugins/features исключить из release, затем проверить установку обычного release artifact.
6. После согласования distribution — version/tag, signing/notarization, checksums и release assets.

Исходный snapshot, tooling и docs не входят в installer. Frontend скомпилирован, Rust владеет файлами/Git; отдельный Node runtime не поставляется.

## Native tests

WebdriverIO Tauri service поддерживает embedded WebDriver для Windows/macOS. Стандартный внешний tauri-driver ограничен Windows/Linux; macOS-проверку нельзя объявлять выполненной на его основании.
Browser UI тесты допускают mock invoke и Playwright/Vitest, но не заменяют native commands, installer и WKWebView/WebView2 smoke.
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
