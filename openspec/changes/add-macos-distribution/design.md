# Design

## Context

См. proposal.md. Windows-упаковка существует: `scripts/package-win.mjs` (staging манифеста + flat `node_modules` только для `simple-git`, `gray-matter`, `papaparse`, затем `nw-builder` и zip), установщик — Inno Setup в `build-resources/` (имя скрипта и имена установщика ещё содержат старое имя продукта). Workflow и release-скрипты удалены, `.releaserc.json` остался без pipeline. Окно frameless с кастомным TitleBar и Windows-кнопками; геометрия окна хранится в OS data dir (`services/window-state.ts`). Апдейтер: `services/updater.ts` (GitHub API, внешний репозиторий и Windows-установщик, `isInstalledBuild`), слайс `updates-slice.ts`.

## Goals / Non-Goals

**Goals:** воспроизводимая macOS arm64 сборка на нативном раннере, запуск и основной workflow на macOS, корректное платформенное поведение окна и апдейтера, работающий pipeline в текущей структуре репозитория, единое имя продукта.

**Non-Goals:** подпись/нотаризация, авто-апдейт на macOS, Intel/universal, Mac App Store, изменения формата данных.

## Decisions

1. **Pipeline в корне.** Workflow создаются в `<root>/.github/workflows/` с `defaults.run.working-directory: app` (рабочий монорепо-корень — `app/`, там pnpm-workspace). Публикация и имена артефактов — собственные; внешние release/update endpoints не используются.
2. **macOS-джоба.** Runner `macos-14` (arm64; фактический label подтверждается при реализации). Шаги: frozen install только desktop-графа, typecheck/test, `vite build`, staging манифеста (общий код выделяется из win-скрипта), `npm install` runtime-зависимостей, `nw-builder` platform `osx` arch `arm64`, упаковка `.app`.
3. **DMG.** `hdiutil create -format UDZO` (доступен на раннере) с symlink на `/Applications`; имя `Testoritto-<version>-mac-arm64.dmg`; portable zip с `.app` — вторым артефактом. Проверка артефактов — fail, если файла нет.
4. **Иконка.** `icon.icns` собирается на macOS из одного 1024×1024 PNG бренда: `sips` (ресайзы) + `iconutil` (iconset). PNG-исходник уже умеет генерировать `make-icon.mjs`; артефакт CI, но локальный скрипт `make-icns` документируется.
5. **Окно и клавиши.** На macOS окно создаётся с native frame (нативные traffic lights), внутренний TitleBar перестаёт рисовать кнопки окна и оставляет меню; на Windows поведение не меняется. Акселераторы — Cmd на macOS (правки в местах, где сейчас зашит Ctrl); закрытие с pending save ведёт себя как на Windows.
6. **Апдейтер.** Выбор ассета по платформе: Windows — установщик как сейчас; macOS — только открытие release page со статусом `unsupported` (никаких `.exe`). Windows-специфичные проверки установленной сборки не выполняются на macOS. Если release-источник не настроен, статус честно сообщает об этом.
7. **Идентичность продукта.** Видимые имена (title окна, About, установщик, имена артефактов, update endpoint) приводятся к Testoritto; внутренние имена путей/файлов переименовываются по мере необходимости (installer-скрипт, артефакты). Это осознанная задача этого change, а не побочный эффект.
8. **Unsigned-режим.** DMG без подписи открывается через `xattr -dr com.apple.quarantine` / правый клик → Open; ограничение документируется в README и в доказательствах приёмки. Gatekeeper-предупреждение — ожидаемое поведение этой итерации.
9. **Приёмка.** Компиляция и зелёный CI не считаются выполнением: нужен запуск DMG на реальной arm64-машине (open repo → edit → save → commit), проверка picker, Cmd-шорткатов, путей с пробелами и кириллицей.

## Risks / Trade-offs

- Runner arm64 и конкретный label могут измениться → задача фиксирует фактические labels и версию.
- Unsigned DMG → пользователь видит предупреждение; это явно записано.
- Pipeline создаётся с нуля → нет истории сборок; первая задача — доказать, что workflow реально исполняется.
- Платформенные ветки в TitleBar/updater → проверять обе ОС, чтобы не сломать Windows.
- Переименование видимых строк может задеть существующие ссылки в документации → делать явной задачей с проверкой.

## Migration Plan

Порядок: root pipeline → macOS packaging и DMG → платформенные ветки окна/апдейтера → имена продукта → приёмка на arm64. Существующие сборки/скрипты не удаляются до подтверждённой работы новых.

## References

- `app/apps/desktop/scripts/package-win.mjs`, `build-resources/*.iss`, `package.json` (`main`, `window.frame`).
- `app/apps/desktop/src/components/chrome/TitleBar.tsx`, `src/services/updater.ts`, `src/store/slices/updates-slice.ts`, `src/lib/nwjs.ts`, `src/services/window-state.ts`.
- NW.js `frame`/`package.json` и `nw-builder` platform/arch — проверить по актуальной документации при реализации.
