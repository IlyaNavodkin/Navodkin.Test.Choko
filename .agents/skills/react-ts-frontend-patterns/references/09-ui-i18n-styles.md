# UI, i18n и стили (React)

Экраны фичи — в `useCases/<сценарий>/` (не `view/` у product slice). См. [11-project-layout.md](11-project-layout.md).

## I18n

Типизированные locale и ключи (`react-i18next`). Параметры вместо склейки строк в JSX. При новом ключе обновлять все locale. Не оставлять пользовательский текст хардкодом в feature-компоненте (кроме технического fallback).

Локализация API-ошибок — по `code` из Problem Details (`errors.ERR_*`), не по `detail`. Схема Zod и строки, собранные в хуке, зависят от `i18n.language`. Подробно — [13-forms-validation-errors.md](13-forms-validation-errors.md).

`fallbackLng` — `ru`. Нет ключа в EN → русская строка.

## Styles

- Feature UI: CSS Module рядом с компонентом (`ComponentName.module.css` / `.module.scss`).
- Примитивы — `@codaa/ui`, не дублировать Button/Input в `shared/ui`.
- Inline styles — только мелкие исключения / динамические значения (например цвет из данных).

## Shared UI

`src/shared/ui` — оболочка приложения и компоненты (атомы и составные). Примитивы — `@codaa/ui`, не дублировать Button/Input.

```text
src/shared/ui/
├─ layout/
│  ├─ shell/AppShell.tsx
│  ├─ header/                    # AppHeader, CurrentUserMenu, AccountDialog, …
│  ├─ sidebar/                   # AppSidebar, Sidebar*, sidebarModules
│  └─ overlay/                   # bootstrap/session overlay, watermark
└─ components/
   ├─ atoms/select-menu-item/SelectMenuItem.tsx
   └─ composite/table/           # CatalogTableBody, pageSize, catalogSort, …
```

Auth-экраны остаются в `src/shared/auth/view/`. Новый атом — подпапка в `components/atoms/`. Составной блок — `components/composite/<группа>/`.

Иконки — `BaseIcon` / `IconName` из `@codaa/ui`, не Unicode и не разрозненные импорты в feature.

## Toasts

Глобальный контейнер — `src/app/App.tsx`. Позиция **справа снизу** (`bottom` + `right`). Не ставить тосты сверху/слева и не дублировать контейнер в слайсе. `successToast` / `errorToast` / `warningToast` из `useToast()` без локального position. Ошибка поля формы — `isError` / `errorMessage` плюс красный `errorToast` по `title` после API ([13-forms-validation-errors.md](13-forms-validation-errors.md)).

```css
.toasts {
    position: fixed;
    bottom: 16px;
    right: 16px;
    z-index: 4000;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
}
```

## UI-состояния

Каждый интерактивный экран обязан показывать: loading, empty, error, disabled, pending по сущности (повторный клик). Куда ставить лоадер (таблица / `LoadingStateContainer` редактора / overlay / виджет lookup) — [04-state-and-data.md](04-state-and-data.md).
