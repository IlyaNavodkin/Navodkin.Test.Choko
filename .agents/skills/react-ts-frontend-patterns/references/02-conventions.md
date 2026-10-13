# TypeScript и соглашения (React / Hub)

## Имена

- Компоненты: `PascalCase.tsx` — `UsersListPage.tsx`, `UsersTable.tsx`, `UserFioCell.tsx`
- Страница сценария: `*ListPage.tsx` / `*EditorPage.tsx` (landing: `HomeView.tsx`, `AdminHomeView.tsx`). Default export — только страница (цель lazy-роута)
- Папка use case: kebab-case сценария — `users-list`, `user-editor`, `groups-list`, `group-editor`
- Хуки: `use` + сценарий — `useUsersPage`, `useUsersApiData`, `useGroupEditor`, `useGroupAddUsersModal`. Файл `.ts`, если хук не возвращает JSX
- Args/Result: `UseXxxArgs`, `UseXxxResult` — **обязательны** у каждого хука
- API-объект: `<feature>Api` (`usersApi`); query keys: `<SLICE>_QUERY_KEYS`
- Имена роутов: `src/admin/<slice>/constants/route.ts` (`USERS_LIST_ROUTE_NAME`). Кросс-срезы (`home`, `auth-callback`) — `src/shared/routes/routeNames.ts`. Навигация — `useAppNavigate().push({ name, params })`, не `navigate('/admin/users/' + id)` и не литерал имени
- CSS Module: рядом с компонентом `ComponentName.module.css` или `ComponentName.module.scss`
- Интерфейс зависимости: префикс `I`

Не называть папку product-сценария `view/`. В `src/shared/auth/` технические имена, включая `view/`, допустимы. Оболочка и компоненты — `src/shared/ui`.

## Хук: Args + Result

Каждый хук экспортирует типы и типизирован на сигнатуре. Не оставлять нетипизированный `options`.

Result — обычные значения и функции. React не разворачивает `Ref`: не возвращать `Ref<T>` / `ComputedRef<T>`. То, что страница пишет, отдавать парой значение + сеттер.

Пустые аргументы:

```ts
export type UseUsersPageArgs = Record<string, never>;

export type UseUsersPageResult = {
    searchInput: string;
    setSearchInput: (value: string) => void;
    goEdit: (id: string) => void;
    // …
};

export const useUsersPage = (_args: UseUsersPageArgs = {}): UseUsersPageResult => {
    // …
};
```

Реальные аргументы — обязательный параметр (без default `{}`, если они нужны). Между хуками передавать значение, не ref: родительский ререндер заново вызывает дочерний хук.

```ts
export type UseUsersApiDataArgs = {
    searchText: string;
    isActive: boolean | null;
    pageNumber: number;
    pageSize: number;
};

export const useUsersApiData = (args: UseUsersApiDataArgs): UseUsersApiDataResult => {
    // …
};
```

Shared-навигация формы: тип аргументов — `UseFormNavigationArgs` (не `UseFormNavigationOptions`).

Полные правила и примеры — [12-use-cases-and-composables.md](12-use-cases-and-composables.md).

## Типы: куда класть

| Что | Куда |
|---|---|
| View-model одного сценария (`UserListItem`, `UserStatusFilter`, `GroupListItem`) | `useCases/<сценарий>/types.ts` |
| DTO / query / command, нужные API или нескольким use case (`UserDto`, `GroupDto`, `RoleDto`) | `api/contracts.ts` |
| Смешанный slice-root `types.ts` | **запрещён** |

```ts
// src/admin/users/useCases/users-list/types.ts
export type UserStatusFilter = 'all' | 'active' | 'blocked';

export type UserListItem = {
    id: string;
    fio: string;
    login: string;
    email: string;
    statusLabel: string;
};

// src/admin/users/api/contracts.ts
export type UserStatusDto = 'active' | 'blocked';
export type UserDto = { id: string; login: string; groupIds: string[]; roleIds: string[] };
```

Использовать `import type` для type-only импортов. Указывать возвращаемый тип публичных методов API и `UseXxxResult` на границах.

## Импорты

- Path aliases `@/` (`@/admin/users/…`, `@/shared/…`).
- Внутри use case — относительные импорты соседей: `./useUsersPage`, `./UsersTable`.
- Навигация только через константы имён роутов, не литералы:

```ts
import { USERS_EDITOR_ROUTE_NAME } from '@/admin/users/constants/route';
import { useAppNavigate } from '@/shared/routes/useAppNavigate';

const { push } = useAppNavigate();
push({ name: USERS_EDITOR_ROUTE_NAME, params: { userId: id } });
```

- Именованный export для feature-компонентов (кроме страницы) и хуков; default — route tables и Page (цель `lazy`).

## Форматирование

Одно смысловое действие на строку. Не продолжать сжатый однострочный стиль. Кавычки и отступ — как в текущем файле слайса (single quotes, 4 spaces).
