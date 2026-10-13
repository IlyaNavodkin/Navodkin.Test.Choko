# Проверка подготовки

2026-10-13, Windows, Node 22.23.1, pnpm 11.25.0.

## Выполнено локально

- `pnpm install --frozen-lockfile` — успешно после явного запрета необязательного promotional postinstall @tsparticles/engine.
- `pnpm check` — успешно: strict OpenSpec validation (1 change passed, 0 failed) и полный `tsc --noEmit` UI Kit.
- `openspec status` — все четыре planning artifacts созданы. Его `isComplete` относится к artifacts, а не к implementation; все 15 application tasks unchecked.
- 13 skill directories: 12 официальных OpenSpec и react-ts-frontend-patterns с 10 reference files.
- Local Markdown links в новых docs/openspec/app preparation — корректны.
- Tokens UI/Citadelic совпадают по SHA256, значение зафиксировано в UI-KIT.md.
- Secret scan известных token/private-key patterns — совпадений нет. Это не абсолютная гарантия отсутствия любых возможных секретов.
- Git diff проверен. Исходный UI snapshot содержит лишнюю пустую строку EOF в SectionButton.module.css; компоненты ради этого не изменялись.

## Ограничения

### Обновление основы на Tauri 2

По прямому указанию пользователя 2026-10-13 основа изменена на Tauri 2 + React/Vite + Rust. Согласованы между собой ADR, ТЗ, архитектура, packaging/testing план, frontend skill и proposal/design/tasks/desktop spec; формат и Git collaboration requirements сохранены.
После изменений `pnpm check` прошёл: OpenSpec strict validation — 1 passed/0 failed, UI typecheck — успешно. Все 15 implementation tasks остаются unchecked. Rust/Cargo/Tauri runtime и application code на этом этапе не устанавливались и не собирались.

### Общие ограничения

Не выполнялись runtime tests, сборка или установка нового приложения: application code ещё не реализован. Тесты исходного NW.js приложения не запускались, статистика его README не принимается за результат Testoritto.
GitHub отказал в push активного `.github/workflows/preparation-checks.yml`: OAuth token не имеет `workflow` scope. Workflow сохранён как готовый template в `docs/ci/preparation-checks.yml`, без запуска CI. Остальная подготовка загружается в private repo.
UI зависимости @tsparticles 3.x помечены deprecated; миграция не входит в текущую подготовку.

## Активация CI

После авторизации workflow scope (может потребовать входа владельца аккаунта):

```sh
gh auth refresh --hostname github.com --scopes workflow
```

Скопировать `docs/ci/preparation-checks.yml` в `.github/workflows/preparation-checks.yml`, затем commit/push и проверить три matrix jobs. На Windows:

```powershell
New-Item -ItemType Directory -Force .github/workflows | Out-Null
Copy-Item docs/ci/preparation-checks.yml .github/workflows/preparation-checks.yml
git add .github/workflows/preparation-checks.yml
git commit -m 'ci: activate preparation checks'
git push
```

В шаблоне нет deployment/publishing и secrets: только frozen install, OpenSpec и UI typecheck на ubuntu/windows/macos.
