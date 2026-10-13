# Navodkin.Testoritto

Десктопное приложение для ручных тест-кейсов и прогонов, где Git-репозиторий является хранилищем данных и способом совместной работы.

**Этап: подготовка к обсуждению и началу разработки. Новое приложение ещё не реализовано.**

Предложенный стек: **React 19 + TypeScript strict + Electron + Vite/electron-vite**. UI — локальный `@codaa/ui`, цвета — Citadelic. Windows и macOS; Git CLI и системные credentials. Совместимость с существующими данными Casewright обязательна.

Начать с [пакета обсуждения](docs/START-HERE.md), [ТЗ](docs/PRD.md) и [выбора стека](docs/adr/0001-desktop-stack.md).

## Подготовленная структура

```text
.agents/skills/       12 официальных навыков OpenSpec + навык фронтенда
openspec/            конфигурация и draft change add-testoritto-mvp
docs/                ТЗ, архитектура, аудит, вопросы и план старта
ui/                  предоставленный UI Kit @codaa/ui
casewright-main/     исходный снимок Casewright 0.16.0 для переноса
apps/desktop/        описание целевой структуры; реализация впереди
```

Снимок Casewright сохранён в этом репозитории как reference, но исключён из root pnpm workspace. Его NW.js приложение и маркетинговый сайт не являются кодом Testoritto.

## Проверить подготовку

Нужны Node.js >= 22.12 и pnpm 11.25.0. Версии фиксируются package.json и pnpm-lock.yaml.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm spec list
pnpm spec status --change add-testoritto-mvp
```

`pnpm check` проверяет OpenSpec и типы UI Kit. Команд запуска/сборки нового приложения пока нет; они входят в первую задачу после обсуждения. Описание будущих macOS/Windows сборок — [BUILD-AND-RELEASE.md](docs/BUILD-AND-RELEASE.md).

Готовый [CI-шаблон](docs/ci/preparation-checks.yml) проверяет подготовку на Windows/macOS/Linux. Он пока не активирован: текущей GitHub-авторизации не хватает `workflow` scope. [Проверки и инструкция активации](docs/VERIFICATION.md).

## Работа через OpenSpec

Explore → proposal/design/specs/tasks → apply → verify → archive. В Codex выбирать установленные навыки; CLI доступен локально через `pnpm spec`. [Инструкции и полный список](docs/OPEN-SPEC.md).

## Источники

Casewright предоставлен пользователем с разрешением автора; в снимке есть MIT License © 2026 Jim Buck. Она сохранена в `casewright-main/LICENSE`. При переносе кода сохраняется исходное уведомление. Лицензию собственного продукта нужно выбрать отдельно.
Авторский бренд, update endpoints и исходные CI не включаются в новый продукт автоматически. [Аудит и происхождение](docs/SOURCE-AUDIT.md).
