# Windows acceptance build

16 октября 2026, Windows x64. Собраны Testoritto 0.1.0 EXE и NSIS; установка и запуск не выполнялись.

## Artifacts

| Artifact | Bytes | SHA256 |
| --- | ---: | --- |
| `src-tauri/target/release/testoritto-desktop.exe` | 13265920 | `1d48ae5ada7a85766cf4f17a1ac695935d1051ec93a60538a8082324ecff0b12` |
| `src-tauri/target/release/bundle/nsis/Testoritto_0.1.0_x64-setup.exe` | 3036059 | `0afd4bf420f7a07f92297fd034bf3c3826c239020ff99d7a7c5ff673571d019a` |

Version resources обоих файлов: Product `Testoritto`, Version `0.1.0`. Authenticode установщика: `NotSigned`.

## Build and checks

В VS18 amd64 Developer Environment с `CARGO_NET_OFFLINE=true` выполнены:

```text
cargo +1.98.1 test --locked --offline --manifest-path apps/desktop/src-tauri/Cargo.toml
pnpm --filter @testoritto/desktop tauri:build --bundles nsis
```

Обе команды завершились с exit 0. Rust: **196/196**, 19.27 s. Optimized Rust build: 46.16 s. Frontend typecheck и Vite production build прошли. В Vite остаются предупреждения `MODULE_LEVEL_DIRECTIVE` об исходных `use client` в UI Kit; сборка успешна.

После добавления существующего `NOTICE.md` в `bundle.resources` выполнена отдельная поддерживаемая CLI команда `pnpm --filter @testoritto/desktop tauri bundle --bundles nsis --ci` — exit 0. Runtime EXE не изменился, NSIS перепакован. Generated `target/release/nsis/x64/installer.nsi` содержит установку `NOTICE.md` в `$INSTDIR`; MIT notice включён в installer. Bundler скачал официальные NSIS 3.11 и nsis-tauri-utils 0.5.3 с проверкой hashes. Существующая default WebView2 policy закреплённого Tauri — `downloadBootstrapper`, silent; при отсутствии runtime установке потребуется сеть.

Перед сборкой проверены minimal native exit routing diff и fmt; check/clippy `--all-targets -D warnings` и Vitest **95/95** прошли в exit-guard срезе. Подробности: [exit guard](exit-guard.md). App/browser TypeScript, UI Kit и OpenSpec strict **2/2** ранее прошли на тех же продуктовых исходниках. Production `dist` не содержит `__TESTORITTO_MOCK__`, `wdio` или `webdriver`; test-only WebDriver plugins не добавлены.

Логи: `.cache/windows-acceptance-build.log`, `.cache/windows-acceptance-bundle-final.log`, `.cache/suite-operations-rust-review.log`, `.cache/suite-operations-vitest-review-final.log`, `.cache/suite-operations-browser-review.log`, `.cache/suite-operations-browser-recovery-final.log`. Последний browser review: **41 PASS**, recovery упал из-за уже исправляемого ambiguous selector; отдельный повтор на окончательном селекторе **1/1 PASS**. Остальные browser-файлы и продуктовый код между прогонами не менялись.

## Acceptance fixture

Создан новый app-owned `.cache/acceptance-20261016-b725b58e-93fb-49f1-9b9f-66f2acf05a1d` с bare `origin.git`, `repo-a`, `repo-b`, `READY.json` и начальными hashes. Git init/clone/локальные fixture commits/push успешны, оба клона clean и имеют upstream. Изменены только новые тестовые репозитории; project index/история, `casewright-main` и пользовательские data repos не изменялись. Fixture не открывался через native приложение.

## Limitations

Инструкция: [ACCEPTANCE.md](../ACCEPTANCE.md). Native GUI, установка/удаление, Windows quit и macOS Cmd+Q этой сборки не проверены. macOS bundle/runtime, native WebdriverIO E2E и large-fixture performance остаются открытыми. Signing/publishing не выполнялись. Задачи 6.1/6.2/7.1/7.2 остаются незавершёнными; change не архивирован.
