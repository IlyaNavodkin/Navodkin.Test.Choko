# Design

Статус: проект архитектуры для обсуждения. Решения, не подтверждённые пользователем, — рекомендации, а не выполненная реализация.

## Context

See proposal.md — Why. Reference Casewright 0.16.0 использует NW.js renderer с Node bridge. `services/repo-load.ts` читает declared workspaces и Markdown run directories. README/старый PRD описывают прежние форматы, поэтому контракт переноса определяется кодом и fixtures/tests.
Kit пользователя — @codaa/ui с CSS Modules; tokens побайтно совпадают с Citadelic (SHA256 в docs/UI-KIT.md). React, Windows/macOS, Git и существующие data repos обязательны.

## Goals / Non-Goals

**Goals:** повторно использовать чистые format/domain части, разделить OS services и UI, сохранить совместимость и данные, обеспечить воспроизводимые native builds.

**Non-Goals:** прямой renderer fs/Node, собственный server/DB как источник данных, rewrite формата ради бренда, автоматическое наследование updater/CI исходника. Полный продуктовый scope и вопросы — proposal.md и docs/DISCUSSION.md.

## Decisions

1. **Предлагается Electron**, React 19/TS strict/electron-vite; обоснование и альтернативы в docs/adr/0001-desktop-stack.md. NW.js дешевле для прямого fork, но текущие Node privileges и отсутствующий macOS pipeline нужно переработать. Tauri потребует переписывания Node layer/sidecar; на старте это увеличивает объём переноса.
2. Main владеет repo sessions, native picker, fs, watcher, recents и Git queue. Sandboxed renderer без Node; preload экспортирует конкретные typed API. Schema validation, sender checking и realpath scope выполняются main. Не экспортировать ipcRenderer/require/raw shell execution. Контракт — serialized Result/Problem, без secrets/Node objects.
3. Product features организованы по useCases и typed hooks из предоставленного skill; @codaa/ui заменяет Apex Kit. HTTP facade в Hub адаптируется в IPC facade. TanStack Query — repo snapshots/invalidation; Zustand — UI state; drafts — локальный editor hook.
4. `.casewright/config.yaml` и текущие Markdown formats сохраняются. При открытии нет записи/migration. Extras хранятся в parse result и проходят через store/write без потери. Writer атомарный; pending flush перед close/commit; conflicting external edits не затирают draft.
5. Git CLI/simple-git в main с credential helper/SSH. Repo-scoped serial queue, args arrays, явный selection файлов; чужой index не коммитится автоматически. Pull при dirty state требует сохранённой стратегии без reset/clean. Конкретные UX-команды для stash/branches согласовать до реализации зависимых шагов.
6. Конфликты: spec требует сохранения и явного разрешения; этот draft предлагает внешний инструмент + recheck/abort для MVP. Structured merge — отдельный scope decision до выполнения задачи Git UI.
7. Native per-OS builds electron-builder, publish never для первых internal artifacts; Windows x64 и macOS arm64/x64 предлагаются как baseline. Signing/notarization и updater отдельным change, без private repo token внутри app.

## Risks / Trade-offs

- Stale docs и разные форматы → fixtures по фактическому parser/writer; no-write hashes; unsupported version diagnosis.
- Extras читаются upstream, но могут теряться дальше → end-to-end round-trip tests до включения writer.
- NW runtime bridge глубоко связан со store → переносить слой за слоем; не выключать sandbox ради совместимости.
- Git hook/credential/helper behavior → явная repo trust model и temp repo integration tests; renderer isolation не изолирует Git.
- Private distribution и macOS signing → сначала internal artifacts; не обещать публичный install без signing smoke.
- Large repo/watch storm → измерения на согласованном fixture, debounced invalidation, bounded queries; без выдуманного SLA.
- Kit particles 3.x deprecated → сохранить на старте; миграцию необязательных animations вынести отдельно после usage audit.

## Migration Plan

Сначала runtime + Kit smoke; затем pure formats/tests; read-only repository load; один безопасный writer; остальные cases/runs; Git collaboration; native packaging.
Testoritto открывает копии реальных repos в QA. Production repos не мигрируются при открытии. Rollback — предыдущий app build и обычная Git history; destructive reset/clean не используются как автоматическая recovery.
Отдельная будущая migration содержит backup, preview, format version и явное подтверждение. Если stack/scope изменятся на обсуждении, artifacts обновляются до apply.

## References

Локальный audit: `docs/SOURCE-AUDIT.md`; формат: `docs/DATA-COMPATIBILITY.md`; границы: `docs/ARCHITECTURE.md`; builds: `docs/BUILD-AND-RELEASE.md`.
[Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [electron-vite guide](https://electron-vite.org/guide/), [Tauri frontend](https://tauri.app/start/frontend/), [electron-builder architecture](https://www.electron.build/docs/architecture/).
