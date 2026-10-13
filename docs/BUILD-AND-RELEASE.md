# План сборок Windows/macOS

Статус: предложенная инфраструктура для будущего Electron приложения. Сейчас новый application package и installers ещё не созданы. CI-шаблон для спецификаций и UI Kit находится в `docs/ci/preparation-checks.yml`; пока не активирован из-за отсутствующего GitHub workflow scope.

## Targets

| Target | Native runner | Предложенный artifact | Проверка |
| --- | --- | --- | --- |
| Windows x64 | windows-latest | NSIS .exe + portable .zip | Install/run/open/edit/save/commit |
| macOS arm64 | macOS arm64 runner | .dmg + .zip | Launch, Cmd shortcuts, picker, repo workflow |
| macOS x64 | macOS Intel runner | .dmg + .zip | Отдельный smoke на Intel |

Конкретные runner labels и минимальные OS versions выбираются при реализации по доступности GitHub runners и выбранной Electron версии. Cross-compile не заменяет проверку native installer.

## Future pipeline

1. Frozen pnpm install по application lockfile. Разрешить только необходимые install scripts (Electron/runtime build tools) после проверки.
2. OpenSpec validation + typecheck + format/service tests на PR.
3. Build main/preload/renderer через electron-vite.
4. Package electron-builder на каждой native ОС с `publish: never` для MVP, загрузить private CI artifacts.
5. Smoke запуск packaged app и отдельно установка; никакой публикации или автообновления на каждый push.
6. После подтверждения release policy — tag/version, signing/notarization, checksums и release assets.

В package runtime dependencies входят необходимые parsers/Git wrapper; workspace UI компилируется в renderer. Исходный repo snapshot, docs и development tools в installer не включаются.

## Signing и private distribution

macOS signed public release требует Apple Developer signing identity и notarization credentials. Windows signing использует подходящий сертификат/сервис. Хранятся в CI secrets, не в git или renderer.
Unsigned internal builds — самостоятельный режим с описанным запуском; не заявлять, что они эквивалентны signed release. Публичная поддержка/macOS installation приёмка обсуждается отдельно.
Для private GitHub нельзя встраивать repo token в app ради автообновления. Updater/distribution endpoint проектируется отдельным change; upstream Casewright updater не переносится.

## Primary sources

- [electron-builder architecture and multi-arch](https://www.electron.build/docs/architecture/)
- [electron-builder v26 macOS targets/signing](https://www.electron.build/v26/docs/mac/)
- [Electron signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- [electron-vite](https://electron-vite.org/guide/)
