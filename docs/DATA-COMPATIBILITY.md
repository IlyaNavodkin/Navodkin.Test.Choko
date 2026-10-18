# Совместимость с Casewright

Обязательное требование пользователя. Описывает код предоставленного снимка 0.16.0, а не старый PRD.

## Фактическая структура

```text
repo/
  .casewright/
    config.yaml                  version, name, workspaces, optional root metadata
    .gitignore                   cache/
    runs/
      <date-run-name>/
        _run.md                  run metadata, Summary, Notes
        001-<case-id>.md          snapshot/results/checklists/notes
        002-<case-id>.md
        .order                   optional sidecar ordering
  areas/payments/                workspace declared in config.yaml
    PAY-0001-example.md           YAML frontmatter + structured Markdown
    Billing/                     suite folder
    Billing.md                   optional sibling folder note
    .order                       optional tree ordering
```

Посмотреть `repo-load.ts`, `format/config.ts`, `format/case.ts`, `format/run.ts`, `format/folder-note.ts`, `format/order.ts` и schemas. Старое `casewright.yaml` относится к legacy compatibility/migration, не основному рекомендуемому новому формату. Legacy support нужно проверять отдельными fixtures; при неподдерживаемом старом формате сообщать это вместо молчаливой конвертации.

## Сохраняемый контракт

- Stable case `id`; displayId/title/optional slug/status/tags и незнакомые frontmatter fields.
- Body sections Objective, Systems in Scope, Setup, Steps, Acceptance Criteria, extra content.
- Declared `workspaces` и root workspace metadata, paths/order/folder notes.
- Run `_run.md`: name, created, status, scope, optional date overrides, approvals, Summary/Notes.
- Per-case run sidecar: case_id, display_id, title, result, tester, executed_at, optional test_date; Setup/Steps/Acceptance checklists, fail notes, Notes и extra content.
- Существующие Markdown variables сохраняются как текст, даже если их UI/interpretation переносится позже.

## Режимы

1. Open/read: никаких writes, migrations или переименований. Сначала поддержка текущего snapshot format.
2. Edit/save: deterministic serializer меняет целевую сущность, сохраняет opaque fields/sections. Нельзя читать extras и терять их на уровне store.
3. Unsupported format: диагностика версии и read-only/failure вместо разрушительной записи.
4. Migration: отдельный change, backup, diff preview и явное действие. До согласования не включать.

## Проверка совместимости

На копиях настоящих repos и temp fixtures:

- SHA256 всех content/config files до и после открытия совпадает.
- No-op edit/save не создаёт бессмысленных diffs; intentional edit меняет только допустимые поля.
- Неизвестные YAML keys, Markdown секции, Unicode, `.order`, папки с пробелами и date/approval поля не теряются.
- Run snapshots читаются после удаления/rename исходного кейса и не перезаписываются обновлённым текстом.
- Проверить LF/CRLF на обеих ОС и регистронезависимые filename collisions на Windows/macOS; не вводить forced file rename при открытии.
- Не выполнять `repo-migration.ts` автоматически. Известные upstream тесты переносить, но они не заменяют новые end-to-end preservation tests.

`.testoritto/` сейчас не создаётся: имя продукта и совместимый data format независимы. Этот выбор для новых repos предлагается подтвердить до первого writer.

## Сохранение существующего кейса

`save_case` не принимает id или путь. Его expected revision — hash точных исходных bytes; stale revision отклоняется. Неизменённые поля не вызывают setters, а unknown YAML/Markdown и исходный LF/CRLF сохраняются source-backed writer. Правка известного Markdown убирает только внешние пустые строки/пробелы согласно семантике parser; indentation внутри Setup body сохраняется. Missing/invalid ID остаётся read-only. Новые config создаются только явной инициализацией отсутствующего `.casewright` и объявляют `.` первой областью. Существующий metadata каталог не мигрируется.

## Case operations

New cases используют UUID stable ID/filename и автоматически назначенный displayId. Duplicate сохраняет unknown source YAML/Markdown/CRLF и nested Steps, получает новые ID/displayId; исходник не меняется. Move сохраняет все bytes и ID, не заменяет существующий target. Confirmed delete касается единственного указанного case file. Runs snapshots не изменяются. `.order` и folder notes сохраняются побайтно; absent order keys пропускаются, новые children добавляются после явно ordered — по `casewright-main/apps/desktop/src/services/repo-load.ts`.

## New snapshot runs

Новые runs используют стандартные Markdown details/sidecars и `.order`, сохраняют stable case_id и checklist texts. Дополнительный `.source` хранит полный исходный Markdown побайтно; `source_snapshot`/`source_sha256` metadata добавляют ссылку/integrity check. Casewright loader не включает `.source` в rows. Existing runs остаются без миграции; unknown metadata/date/approvals не переписываются при чтении. Сторонний writer может удалить добавочные references; source files при этом не удаляются автоматически. API/проверки: [run creation](../apps/desktop/evidence/run-creation.md).

## Run execution update

Реализованы явное сохранение результатов, per-item отметок и пояснений, tester/time/date override и Notes sidecar, а также open/closed, Summary/Notes самого прогона с сохранением approvals/date/unknown metadata. Запись использует optimistic SHA256 и atomic replacement. Черновик удерживается при ошибке/внешнем изменении. Проверки и ограничения: [Run execution](../apps/desktop/evidence/run-execution.md). Native UI и macOS не объявлены проверенными.
