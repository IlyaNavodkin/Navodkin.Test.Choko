# UI Kit и палитра

Источник компонентов: `D:/repo/testoritto/ui`, package **@codaa/ui 0.2.0**, React >=19.
Источник палитры: `D:/repo/Navodkin.BIM.CDE.Citadelic/ui/theme/tokens.css`.

На 2026-10-13 локальный `ui/theme/tokens.css` и файл Citadelic **побайтно совпадают**:

```text
SHA256 7b0775ff8e3bb48e64288d66e062936d74f62e8e665879669bea19aea8d903ce
```

Поэтому повторная копия палитры не создавалась. Clone Testoritto самодостаточен: tokens уже находятся в tracked ui; absolute path Citadelic — только provenance, не build dependency.

## Использование в будущем React WebView

```tsx
import '@codaa/ui/theme/tokens.css';
import { Button, Input, FileTree, Table, StatusPill, ToastHost } from '@codaa/ui';
```

Продуктовые wrappers/layout — `apps/desktop/src/shared/ui/`; components — CSS Modules и `var(--app-*)`. Не менять Kit ради продуктового сценария, если достаточно composition.

## Основная палитра

| Назначение | Token | Значение |
| --- | --- | --- |
| App background | --app-bg | #141518 |
| Surface | --app-bg2 | #1a1b1e |
| Raised surface | --app-bg3 | #202124 |
| Primary foreground | --app-fg | #d9dad8 |
| Secondary foreground | --app-fg4 | #8b8c8a |
| Accent | --app-accent-bg | #5e7b96 |
| Danger | --app-danger | #c96f5f |
| Warning | --app-warning | #d9a55b |
| Success | --app-success | #85b294 |

Статус должен иметь текст/иконку, не только цвет. Контраст комбинаций проверяется на реальных компонентах; наличия token недостаточно для заявления о WCAG compliance.

## Соответствие сценариям

| Сценарий | Kit candidates |
| --- | --- |
| Repo/suite tree | FileTree, SearchInput, Menu, SplitPane |
| Case form | Input, Textarea, Select, Checkbox, Badge, ErrorLabel |
| Run grid | Table, StatusPill, SegmentedControl, Progress |
| Commit/conflict/error | Modal, ConfirmDialog, Alert, ToastHost |
| Empty/loading | EmptyState, Skeleton, LoadingState, Spinner |

Это mapping по public exports, не утверждение, что каждый компонент уже полностью подходит нужному workflow. Run grid editing и nested Steps потребуют composited controls.

## Frontend skill

Все справочники исходного `react-ts-frontend-patterns` установлены в `.agents/skills/react-ts-frontend-patterns/`.
Проектная адаптация: @codaa/ui вместо Apex Kit, domains вместо искусственного Hub admin, Tauri commands/invoke facade вместо обязательного HTTP, те же useCases/typed hooks/query/UI state patterns.
Предоставленная оригинальная папка остаётся локально; установленная копия tracked в GitHub. Проектные правила в AGENTS.md имеют приоритет над демонстрационными Hub путями.

## Проверка и известные ограничения

Добавлены только typecheck script, явная Vite devDependency (для уже указанного `vite/client`) и точная версия TypeScript в UI package.json. Компоненты и tokens не менялись.
`pnpm check:ui` проверяет весь Kit. В нём есть устаревшие @tsparticles 3.x dependencies; их миграция не выполнялась в этой подготовке. Необязательный promotional postinstall engine отключён явно в pnpm-workspace.yaml.
