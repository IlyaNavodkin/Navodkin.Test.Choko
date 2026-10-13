# Архитектура React frontend (Hub)

## Стек

- React + React Router + Vite + TypeScript `strict`
- TanStack Query (`@tanstack/react-query`) для серверного состояния
- Zustand для глобального клиентского состояния
- CSS Modules; типизированный i18n (`react-i18next`)
- HTTP: `request<T>` в `src/shared/infrastructure/http/request.ts`

## Feature slices

Код режется **по фичам**. Area (`admin`, `home`) внутри делится на слайсы сущностей/сценариев.

| Уровень | Hub |
|---|---|
| Area | `src/admin`, `src/home` |
| Feature slice | `users`, `groups`, `roles`, `projects` |
| Презентация сценария | `useCases/<kebab-сценарий>/` — **никогда** не `view/` у product slice |
| Shared | `src/shared/{auth,i18n,ui,…}` — UI только в `src/shared/ui` |

Плоский `modules/users` не использовать. Для админки — **`admin/users`, `admin/groups`, `admin/roles`, `admin/projects`**.

`src/shared/auth/…` **может** содержать технические имена, включая `view/` (`src/shared/auth/view/AuthCallbackView.tsx`). Оболочка и UI-компоненты — только в `src/shared/ui`.

## Канонический layout

```text
src/
├─ app/                         # bootstrap
│  ├─ App.tsx
│  ├─ main.tsx
│  ├─ router.tsx                # склеивает homeRoutes + adminRoutes + /auth
│  ├─ providers.tsx
│  └─ queryClient.ts
├─ admin/                       # area админки
│  ├─ index.ts                  # export { default as adminRoutes } from './routes'
│  ├─ routes/index.ts           # concat слайсов
│  ├─ users/                    # entity feature slice
│  │  ├─ index.ts               # export { default as usersRoutes } from './routes'
│  │  ├─ routes/index.ts
│  │  ├─ api/contracts.ts
│  │  ├─ api/usersApi.ts
│  │  ├─ queryKeys.ts
│  │  └─ useCases/
│  │     ├─ users-list/
│  │     └─ user-editor/
│  ├─ groups/
│  ├─ roles/
│  ├─ projects/
│  └─ home/
├─ home/
│  ├─ index.ts
│  ├─ routes/index.ts
│  └─ useCases/home/HomeView.tsx
└─ shared/
   ├─ auth/                     # в т.ч. view/AuthCallbackView.tsx
   ├─ i18n/
   ├─ ui/
   │  ├─ layout/                # shell, header, sidebar, overlay
   │  └─ components/
   │     ├─ atoms/              # SelectMenuItem и др. атомы
   │     └─ composite/          # table и составные блоки
   ├─ routes/                   # routeNames.ts, useAppNavigate.ts
   ├─ infrastructure/http/request.ts
   └─ contracts/
```

Нет slice-root `hooks/`. Нет `datasource/`. HTTP — `api/` + TanStack Query. Zustand-стор не регистрируется в корне: его импортируют напрямую.

Соответствие бекенду: `Modules/Admin/Users` ↔ `admin/users`.

Подробное дерево слайса — [11-project-layout.md](11-project-layout.md). Хуки — [12-use-cases-and-composables.md](12-use-cases-and-composables.md).

## Эталонный поток

```text
src/admin/users/useCases/users-list/UsersListPage.tsx
  -> ./useUsersPage.ts
    -> ./useUsersApiData.ts
      -> @/admin/users/api/usersApi.ts
        -> request<T>()
          -> Hub API
```

Редактор группы (крупный сценарий):

```text
GroupEditorPage.tsx
  -> ./useGroupEditor.ts
    -> ./useGroupEditorApiData.ts
    -> ./useGroupAddUsersModal.ts
      -> groupsApi / usersApi
        -> request<T>()
```

## Выбор слоя

| Задача | Слой |
|---|---|
| Разметка / события | компонент `.tsx` в папке use case |
| UI-сценарий, форма, фильтр, dirty, роутинг | `useXxxPage` / `useXxxEditor` |
| TanStack Query + feature API | `useXxxApiData` |
| URL, method, JSON | `api/<slice>Api.ts` |
| DTO / query / command на несколько use case | `api/contracts.ts` |
| View-model одного сценария | `useCases/<сценарий>/types.ts` |
| Кэш сервера | TanStack Query |
| Глобальная сессия UI | Zustand |
| Локальный UI state | `useState` в хуке |

## Антипример

- `src/admin/users/view/…` для product slice.
- Slice-root `hooks/` или `types.ts`, где смешаны DTO и list-item.
- `fetch` / `usersApi` / `useMutation` в Page.
- Users и Roles в одной куче файлов без слайсов.
- File-based routes Next.js (`app/admin/users/page.tsx`) вместо таблицы `routes/index.ts`.
