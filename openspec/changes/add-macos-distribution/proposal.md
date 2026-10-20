# Proposal

Статус: draft для обсуждения, 2026-10-18. База — текущее приложение `app/` (NW.js + React + TypeScript).

## Why

Приложение сейчас собирается только для Windows. Пользователю нужен macOS-билд. Фактическое состояние на момент обсуждения:

1. CI/release pipeline в репозитории отсутствует (удалён). GitHub Actions читает только `.github/workflows` в корне репозитория, поэтому сборки нужно создавать там.
2. Апдейтер жёстко ссылается на внешний GitHub-репозиторий и Windows-установщик (`services/updater.ts`), а окно нарисовано под Windows-кнопки (`TitleBar.tsx`, `frame: false`).
3. Видимые имена (окно, About, установщик, имена артефактов) всё ещё используют старое имя приложения.

## What Changes

- Создать pipeline в корне репозитория (`working-directory: app`): Windows-сборка сохраняется, добавляется macOS-джоба на нативном раннере arm64.
- macOS-артефакты: `nw-builder` (platform `osx`, arch `arm64`) → `.app`, упакованный в `Testoritto-<version>-mac-arm64.dmg` + portable zip; иконка `.icns` генерируется на macOS-раннере из брендового PNG.
- Платформенные конвенции: на macOS — нативные traffic lights и Cmd-акселераторы; Windows-кнопки окна скрываются.
- Обновление на macOS: честный путь «открыть страницу релиза»; `.exe` на macOS не скачивается и не запускается. Если release-источник ещё не определён, апдейтер сообщает это явно, а не показывает ложную доступность.
- Видимые имена продукта приводятся к Testoritto (окно, About, установщик, артефакты, update endpoint).
- Первая поставка — **unsigned** DMG с документированным обходом Gatekeeper; подпись Developer ID и нотаризация — отдельный change.
- Вне объёма: Intel/universal сборка, Mac App Store, авто-апдейт на macOS, публичный релиз с подписью.

## Capabilities

### New Capabilities

- `desktop-distribution`: сборка, упаковка и платформенное поведение desktop-приложения на Windows и macOS.

### Modified Capabilities

Нет.

## Impact

Новые `.github/workflows/*` в корне репозитория, `apps/desktop/scripts/package-mac.mjs` и общий staging-модуль, генерация `.icns` в `make-icon.mjs`, правки `components/chrome/TitleBar.tsx`, `services/updater.ts`, `store/slices/updates-slice.ts` и видимых строк имени продукта, README по сборке.
