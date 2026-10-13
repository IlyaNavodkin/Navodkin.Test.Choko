# OpenSpec в Testoritto

Установлен **@fission-ai/openspec 1.14.1**, локальный CLI `pnpm spec`. Конфигурация — `openspec/config.yaml`, схема spec-driven. Артефакты по-русски, структурные заголовки и SHALL/MUST по-английски.

## Установленные навыки

Официальный CLI сгенерировал все 12 workflows в `.agents/skills/`:

| Skill | Назначение |
| --- | --- |
| openspec-explore | Исследовать и обсуждать |
| openspec-propose | Создать полный planning package |
| openspec-new-change | Начать change |
| openspec-continue-change | Создать следующий artifact |
| openspec-ff-change | Быстро подготовить artifacts |
| openspec-update-change | Обновить change |
| openspec-apply-change | Реализовать согласованные задачи |
| openspec-verify-change | Проверить implementation against artifacts |
| openspec-sync-specs | Синхронизировать deltas и living specs |
| openspec-archive-change | Архивировать completed change |
| openspec-bulk-archive-change | Архивировать несколько changes |
| openspec-onboard | Объяснить/пройти workflow |

Также установлен `react-ts-frontend-patterns` с references и адаптацией к @codaa/ui и IPC.
Для Codex навыки находятся в `.agents/skills`, отдельных slash-command файлов CLI не создаёт. Новый проектный skill может потребовать нового чата/обновления списка Skills для discovery интерфейсом; файлы доступны агенту непосредственно уже сейчас.

## Команды

```sh
pnpm spec list
pnpm spec context --json
pnpm spec status --change add-testoritto-mvp
pnpm spec validate --all --strict --no-interactive
```

Draft `add-testoritto-mvp`: proposal → design → capability deltas → tasks. Планирование завершено, реализация ещё не началась. Пустой `openspec/specs/` на старте допустим: proposed capabilities находятся в change, а living specs не объявляют продукт уже существующим.

## Обновление полного набора без глобальных изменений

OpenSpec update использует глобальный профиль; обычный default core содержит только шесть workflows. Для полного набора использовать **локально изолированную конфигурацию**, затем выполнить init/update. Она хранится под ignored `.cache/`, не изменяет профиль других проектов.

PowerShell из корня:

```powershell
$env:OPENSPEC_TELEMETRY = '0'
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.cache/openspec-config'
pnpm spec config set profile custom
pnpm spec config set delivery skills
pnpm spec config set workflows '["propose","explore","apply","update","sync","archive","new","continue","ff","bulk-archive","verify","onboard"]'
pnpm spec init . --tools codex --profile custom --no-animation
```

macOS shell из корня:

```sh
export OPENSPEC_TELEMETRY=0
export XDG_CONFIG_HOME="$PWD/.cache/openspec-config"
pnpm spec config set profile custom
pnpm spec config set delivery skills
pnpm spec config set workflows '["propose","explore","apply","update","sync","archive","new","continue","ff","bulk-archive","verify","onboard"]'
pnpm spec init . --tools codex --profile custom --no-animation
```

`react-ts-frontend-patterns` CLI не генерирует и не обновляет. Обновления этого навыка оформлять отдельно с сохранением проектной адаптации.
Версию OpenSpec обновлять отдельным tooling change с lockfile и повторной валидацией.

## Official documentation

- [OpenSpec CLI](https://github.com/Fission-AI/OpenSpec/blob/main/docs/cli.md)
- [Supported tools](https://github.com/Fission-AI/OpenSpec/blob/main/docs/supported-tools.md)

Команды проверены через установленный CLI 1.14.1; online main может содержать изменения более новых версий.
