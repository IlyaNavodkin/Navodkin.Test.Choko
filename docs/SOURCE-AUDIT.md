# Аудит исходника Casewright

Источник: `D:/repo/testoritto/casewright-main`, root package version **0.16.0**. Дата аудита: 2026-10-13. Git metadata upstream в переданной папке отсутствует, поэтому commit SHA неизвестен. Разрешение автора сообщено пользователем; в копии присутствует MIT License © 2026 Jim Buck.

Это статический аудит исходников, не runtime-проверка и не подтверждение числа проходящих тестов из README.

## Наблюдения по коду

| Область | Найдено | Решение по переносу |
| --- | --- | --- |
| Runtime | NW.js + React/TS; Vite; `lib/node.ts` runtime require; `lib/nwjs.ts` OS/window helpers | React/domain reuse; NW bridge заменить main/preload |
| UI | Tailwind v4, Radix/shadcn-style primitives, исходная brand palette | Сценарии/композицию изучить; UI переписать на @codaa/ui/CSS Modules |
| Formats | `services/format/` cases, run cases/details, workspace, config, folder notes, `.order` | Самый полезный кандидат на перенос с тестами; сохранение unknown content требует аудита end-to-end |
| Repo | `repo-load.ts`, `repo-fs.ts`, `repo-metadata.ts`, `repo-paths.ts`, `repo-migration.ts` | Перенести с main-process ownership; migration по умолчанию отключить |
| Config | `serializeConfigYaml`, `openRepo` читают declared `workspaces:` | Не полагаться на README про auto-discovery как главный формат |
| Runs | `loadRuns` читает directories с `_run.md` и case `.md` | CSV из старого README не является текущим форматом |
| Git | `services/git.ts` — status/info/diff/commit/fetch/pull/push, stash/discard | Переиспользовать после проверки scope/staging/errors и IPC boundary |
| Watch/save | watch.ts, persist.ts, repo-self-write.ts | Проверить shutdown/dirty reload/races, затем переносить |
| State | Большой `store/app-store.ts` связывает UI и disk/Git | Не переносить целиком в renderer; разделить query state и UI state |
| Merge | MergeResolver UI есть; app-store явно содержит deferred structured engine | Не заявлять о готовом merge; проектировать отдельный scope |
| Native shell | Sidebar содержит toast-заглушки `nw.Shell.showItemInFolder/openItem` | Реализовать через Electron shell после проверки разрешённых paths |
| Reports/variables | Сервисы HTML reports, run snapshots, checks, date overrides и approvals | Сохранение данных обязательно; UI scope обсудить |
| Updater | Исходный NW.js updater и его tests | Не включать upstream endpoints/исполнители в новый продукт |
| Distribution | Windows portable/installer pipeline; macOS описан как next step | Новый packaging и per-OS CI, без наследования upstream publish |

## Несогласованность документации

1. `.docs/prd.md` v0.7 описывает прежний `casewright.json` и CSV runs.
2. `apps/desktop/README.md` описывает `.casewright/`, но ещё говорит о CSV и self-declaring workspace walk.
3. Текущий `repo-load.ts` и `format/config.ts` читают `config.yaml` с declared workspace paths; runs — Markdown directories.
4. Domain model содержит Setup, in_progress, approvals/check states/date overrides, отсутствующие в раннем ТЗ.

При переносе порядок доверия: действующий parser/writer + fixtures/tests → актуальные schemas/types → документация после сверки. Не включать migration лишь потому, что она есть в upstream.

## Порядок переноса

1. Создать Electron runtime и typed IPC без доступа renderer к Node.
2. Перенести чистые parsers/serializers и применимые format tests с MIT notice.
3. Read-only загрузка реального repo; зафиксировать file hashes до/после.
4. Сохранение по одному use case; unknown fields/content не теряются.
5. Repo/Git services и temp-remote integration tests.
6. UI workflows на предоставленном Kit, then native OS and packaging smoke.

## Происхождение и snapshot

Снимок хранится в `casewright-main/` без изменения исходных файлов. Его nested `.github/` не является root CI Testoritto.
Нельзя собирать новый installer с именем/иконкой Casewright или с update URL автора автоматически. Сохранять `casewright-main/LICENSE` и notices в будущих переносах/distributions. Лицензия собственных файлов Testoritto пока не выбрана.
