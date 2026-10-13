# Канонический layout (React Hub client)

Презентация product-сценария — **`useCases/`**. Не `view/` у `src/admin/*` и `src/home`. `src/shared/auth/` может иметь технические имена, включая `view/`. Оболочка и UI-компоненты — только `src/shared/ui`.

```text
src/
├─ app/
│  ├─ App.tsx
│  ├─ main.tsx
│  ├─ router.tsx             # /auth + ...homeRoutes + ...adminRoutes
│  ├─ providers.tsx
│  └─ queryClient.ts
├─ admin/
│  ├─ index.ts               # export { default as adminRoutes } from './routes'
│  ├─ routes/index.ts
│  └─ users/
│     ├─ index.ts            # export { default as usersRoutes } from './routes'
│     ├─ constants/route.ts  # USERS_LIST_ROUTE_NAME, USERS_EDITOR_ROUTE_NAME
│     ├─ routes/index.ts
│     ├─ api/contracts.ts    # DTO / query / command: несколько use case или api/
│     ├─ api/usersApi.ts
│     ├─ queryKeys.ts
│     └─ useCases/
│        ├─ users-list/
│        │  ├─ UsersListPage.tsx
│        │  ├─ UsersTable.tsx
│        │  ├─ UsersToolbar.tsx
│        │  ├─ UserFioCell.tsx
│        │  ├─ useUsersPage.ts
│        │  ├─ useUsersApiData.ts
│        │  ├─ types.ts
│        │  └─ utils/mapping.ts
│        └─ user-editor/
│           ├─ UserEditorPage.tsx
│           ├─ useUserEditor.ts
│           ├─ useUserEditorApiData.ts
│           └─ toSelectOptions.ts
├─ home/
│  ├─ index.ts
│  ├─ routes/index.ts
│  └─ useCases/home/HomeView.tsx
└─ shared/
   ├─ auth/view/AuthCallbackView.tsx
   ├─ i18n/
   ├─ ui/
   │  ├─ layout/             # shell, header, sidebar, overlay
   │  └─ components/
   │     ├─ atoms/           # select-menu-item/SelectMenuItem.tsx
   │     └─ composite/table/
   ├─ routes/
   │  ├─ routeNames.ts       # HOME_ROUTE_NAME, AUTH_CALLBACK_ROUTE_NAME
   │  └─ useAppNavigate.ts   # push({ name, params }) → path
   └─ infrastructure/http/request.ts
```

Тот же шаблон для `src/admin/groups` (`useCases/groups-list`, `useCases/group-editor`), `roles`, `projects`.

`src/shared/ui` — только layout и компоненты. Не класть компоненты в корень `ui/`. Новый атом — `components/atoms/<kebab>/Component.tsx`. Составной блок — `components/composite/<группа>/`. Layout — по зонам `shell` / `header` / `sidebar` / `overlay`.

## Правила слайса

- Area (`admin`) = модуль продукта; внутри — feature slices по сущностям.
- Сценарии — папки в `useCases/<kebab>/`. Хуки **внутри** этой папки.
- **Нет** slice-root `hooks/`.
- **Нет** `view/` у product slice. `view/` только в shared, если это техническое имя (`src/shared/auth/view/…`).
- HTTP: `api/` + TanStack Query. Не добавлять `datasource/`.
- Типы сценария — `useCases/<сценарий>/types.ts`. DTO на несколько use case — `api/contracts.ts`. Не держать смешанный slice-root `types.ts`.
- Barrel слайса экспортирует **только** routes, не api и не хуки.
- Route-файл тонкий; `name` берётся из `constants/route.ts` и кладётся в `handle.name`. Lazy-страница — default export.
- Корневой `src/app/router.tsx` только склеивает таблицы и держит app-level `/auth`. Не file-based routing.
- Зеркало бекенда: `Modules/Admin/Users` ↔ `admin/users`.

## Routes

```ts
// src/admin/users/constants/route.ts
export const USERS_LIST_ROUTE_NAME = 'admin-users';
export const USERS_EDITOR_ROUTE_NAME = 'admin-users-editor';

// src/admin/users/routes/index.ts
const usersRoutes: RouteObject[] = [
    {
        path: '/admin/users',
        handle: { name: USERS_LIST_ROUTE_NAME, permission: HUB_PERMISSIONS.usersView },
        lazy: () =>
            import('@/admin/users/useCases/users-list/UsersListPage').then((module) => ({
                Component: module.default,
            })),
    },
    {
        path: '/admin/users/:userId',
        handle: { name: USERS_EDITOR_ROUTE_NAME, permission: HUB_PERMISSIONS.usersView },
        lazy: () =>
            import('@/admin/users/useCases/user-editor/UserEditorPage').then((module) => ({
                Component: module.default,
            })),
    },
];
export default usersRoutes;
```

`useAppNavigate` резолвит `name` + `params` в `path` через таблицу роутов (`generatePath`). Вызов: `push({ name: USERS_EDITOR_ROUTE_NAME, params: { userId: id } })`.

Имена кросс-срезов (`home`, `auth-callback`) — `src/shared/routes/routeNames.ts`. Не дублировать строковые литералы `name` в хуке / guard / тесте.

Пути абсолютные (`/admin/users`, …), без вложенного Admin layout. Chrome — глобальный `AppShell`.

Хуки и Args/Result — [12-use-cases-and-composables.md](12-use-cases-and-composables.md).
