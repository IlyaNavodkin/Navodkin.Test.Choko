# Use cases и хуки (Hub)

Канон React-клиента. Стиль декомпозиции можно сверять с portal-app (`task-templates`, `contract-step`, `project-list`), но **папка сценария — `useCases/`, не `view/`**.

Дерево слайса — [11-project-layout.md](11-project-layout.md).

## 1. Папка сценария — `useCases/`

Для product slices (`src/admin/*`, `src/home`) презентация живёт в `useCases/`. **`view/` запрещён.**

```text
src/admin/groups/useCases/groups-list
src/admin/users/useCases/user-editor
```

`src/shared/auth/…` режется по домену, затем технические папки (`src/shared/auth/view/AuthCallbackView.tsx` — нормально). Оболочка и UI-компоненты — `src/shared/ui`.

## 2. Где живут хуки

Внутри папки use case. Slice-root `hooks/` не создавать.

| Файл | Роль |
|---|---|
| `useUsersPage.ts` / `useGroupEditor.ts` | оркестратор: UI state, routing, dirty, сборка экрана |
| `useUsersApiData.ts` / `useGroupEditorApiData.ts` | TanStack Query + feature API |
| `useGroupAddUsersModal.ts` | отдельный UI-сценарий, когда picker разросся |

Эталонные пути:

- `src/admin/users/useCases/users-list/useUsersPage.ts` + `useUsersApiData.ts`
- `src/admin/groups/useCases/group-editor/useGroupEditor.ts` + `useGroupEditorApiData.ts` + `useGroupAddUsersModal.ts`

## 3. Типы

- Только этот экран: `useCases/<сценарий>/types.ts` — `UserListItem`, `UserStatusFilter`, `GroupListItem`.
- API + несколько use case: `api/contracts.ts` — `UserDto`, `GroupDto`, `RoleDto`, query/command.
- Не держать slice-root `types.ts`, где смешаны оба мира.

```ts
// src/admin/users/useCases/users-list/types.ts
export type UserStatusFilter = 'all' | 'active' | 'blocked';

export type UserListItem = {
    id: string;
    fio: string;
    avatarPath: string | null;
    login: string;
    email: string;
    department: string;
    jobPosition: string;
    statusLabel: string;
    createdAt: string;
    updatedAt: string;
};

// src/admin/groups/useCases/groups-list/types.ts
export type GroupListItem = {
    id: string;
    name: string;
    description: string;
    userCount: number;
    roleNames: string[];
};

// src/admin/users/api/contracts.ts — DTO для api/ и редактора
export type UserDto = {
    id: string;
    login: string;
    email: string;
    fio: string;
    groupIds: string[];
    roleIds: string[];
};
```

Маппинг DTO → list-item: `useCases/users-list/utils/mapping.ts` (`mapUserShortInfoToListItem`).

## 4. Каждый хук: Args + Result

Обязательный экспорт `UseXxxArgs` и `UseXxxResult`. Функция типизирована. Нетипизированного `options` нет.

Result — значения и функции. Не `Ref` / `Dispatch` без доменного имени сеттера (`setSearchInput`, не сырой tuple `useState`).

Пустые args — `Record<string, never>` и default `{}`:

```ts
import { useMemo, useState } from 'react';
import { USERS_EDITOR_ROUTE_NAME } from '@/admin/users/constants/route';
import { useAppNavigate } from '@/shared/routes/useAppNavigate';
import type { UserListItem, UserStatusFilter } from './types';
import { useUsersApiData } from './useUsersApiData';

export type UseUsersPageArgs = Record<string, never>;

export type UseUsersPageResult = {
    searchInput: string;
    setSearchInput: (value: string) => void;
    statusFilter: UserStatusFilter;
    setStatusFilter: (value: UserStatusFilter) => void;
    pageNumber: number;
    pageSize: number;
    users: UserListItem[];
    totalItems: number;
    loadingStatus: LoadingStatus;
    loadError: string;
    isSyncingAll: boolean;
    requestSyncAll: () => void;
    syncOne: (id: string) => Promise<void>;
    goEdit: (id: string) => void;
    selectPage: (page: number) => void;
    setPageSize: (size: number | undefined) => void;
};

export const useUsersPage = (_args: UseUsersPageArgs = {}): UseUsersPageResult => {
    const { push } = useAppNavigate();
    const [searchInput, setSearchInput] = useState('');
    const [searchText, setSearchText] = useState('');
    const [statusFilter, setStatusFilter] = useState<UserStatusFilter>('all');
    const [pageNumber, setPageNumber] = useState(1);
    const [pageSize, setPageSizeState] = useState(DEFAULT_PAGE_SIZE);
    const isActive = useMemo(() => {
        if (statusFilter === 'active') return true;
        if (statusFilter === 'blocked') return false;
        return null;
    }, [statusFilter]);

    const listParams = useMemo(
        () => ({
            searchText,
            isActive,
            pageNumber,
            pageSize,
            sort: toCatalogSort(sorting, USER_SORT_FIELDS),
        }),
        [searchText, isActive, pageNumber, pageSize, sorting]
    );

    const api = useUsersApiData({ listParams });

    const goEdit = (id: string) => {
        push({ name: USERS_EDITOR_ROUTE_NAME, params: { userId: id } });
    };

    return {
        searchInput,
        setSearchInput,
        statusFilter,
        setStatusFilter,
        pageNumber,
        pageSize,
        goEdit,
        // api + commands
    };
};
```

Реальные args — обязательный параметр функции. Дочерний хук получает значение: при смене `listParams` родитель ререндерится и Query видит новый `queryKey`.

```ts
export type UsersListParams = {
    searchText: string;
    isActive: boolean | null;
    pageNumber: number;
    pageSize: number;
    sort: CatalogSort<UserSortField> | null;
};

export type UseUsersApiDataArgs = {
    listParams: UsersListParams;
};

export type UseUsersApiDataResult = {
    users: UserListItem[];
    totalItems: number;
    loadingStatus: LoadingStatus;
    loadError: string;
    isSyncingAll: boolean;
    syncingIds: string[];
    syncAll: () => void;
    syncOne: (id: string) => Promise<void>;
};

export const useUsersApiData = ({ listParams }: UseUsersApiDataArgs): UseUsersApiDataResult => {
    const usersQuery = useQuery({
        queryKey: USERS_QUERY_KEYS.shortInfo(listParams),
        queryFn: () =>
            usersApi.getShortInfo({
                searchText: listParams.searchText || null,
                isActive: listParams.isActive,
                pageNumber: listParams.pageNumber,
                pageSize: listParams.pageSize,
                sort: listParams.sort,
            }),
    });
    // mutations: usersApi.syncAll / usersApi.syncOne → invalidate USERS_QUERY_KEYS.all
    // loadingStatus: resolveCatalogListLoading — см. 04-state-and-data.md
};
```

Shared-форма: `UseFormNavigationArgs` (не `UseFormNavigationOptions`):

```ts
export type UseFormNavigationArgs<T> = {
    defaultRoute?: { name: string; params?: Record<string, string> };
    isSaved?: () => boolean;
    initialFormData?: T;
};

export const useFormNavigation = <T>(
    args: UseFormNavigationArgs<T> = {}
): UseFormNavigationResult<T> => {
    // useBlocker, пока форма грязная
};
```

Вызов из редактора: `useFormNavigation<UserFormSnapshot>({ defaultRoute: { name: USERS_LIST_ROUTE_NAME } })`.

## 5. Когда декомпозировать

Если в одном файле смешались queries + mutations + UI-state + picker — резать как portal-app `task-templates` / `contract-step` / `project-list`:

| Хук | Держит | Не держит |
|---|---|---|
| `useXxxPage` / `useXxxEditor` | фильтры, пагинация, dirty, confirm, `push({ name })` | сырые `useQuery` / `useMutation`, если они уже вынесены |
| `useXxxApiData` | TanStack Query, `*Api`, invalidate, map DTO → view-model | роутинг, диалоги, локальный поиск тулбара |
| extra UI (`useGroupAddUsersModal`) | поиск/фильтры пикера, stage id, in-memory loader справочника | save mutation всей формы |

`useGroupEditor` оркестрирует форму группы; `useGroupEditorApiData` — `groupsApi` / `rolesApi` / `usersApi`; `useGroupAddUsersModal` — выбор участников. Lookup-пагинация (сервер / память) — [04-state-and-data.md](04-state-and-data.md).

Вложенная форма (массивы, `superRefine`): схема отдельно и покрыта тестом; хук держит `useZodForm` и проекцию во View; соседи-компоненты тупые. Эталон и запреты — [13-forms-validation-errors.md](13-forms-validation-errors.md). Песочница: `src/dev/contractor-group-form/`.

Маленький экран (landing `AdminHomeView`) может обойтись без `useXxxApiData`. Каталог и редактор с запросами — нет: HTTP не в странице.

## 6. Page — тонкий сборщик

```tsx
import { useUsersPage } from './useUsersPage';
import { UsersTable } from './UsersTable';
import { UsersToolbar } from './UsersToolbar';

export default function UsersListPage() {
    const { searchInput, setSearchInput, statusFilter, users, goEdit } = useUsersPage();
    return (
        <>
            <UsersToolbar searchInput={searchInput} onSearchInputChange={setSearchInput} />
            <UsersTable users={users} onEdit={goEdit} />
        </>
    );
}
```

- Хук — `./useUsersPage`, не `@/admin/users/hooks/…`.
- Соседи — из той же папки (`UsersTable.tsx`, `UsersToolbar.tsx`).
- Shared — `@/shared/…` (`CatalogTableBody` из `ui/components/composite/table`, `useHubPermissions`).
- Нет `usersApi`, `useQuery`, `useMutation` в странице.
- Вложенная форма: блок не знает HTTP и не знает `form` — только пропы и колбэки ([13](13-forms-validation-errors.md)).

## 7. Запрещено

- `src/admin/users/view/…` как папка product-сценария.
- Slice-root `hooks/`.
- Slice-root `types.ts`, смешивающий `UserDto` и `UserListItem`.
- Хук без `UseXxxArgs` / `UseXxxResult`.
- Result из `Ref` или позиционного tuple `useState`.
- `push({ name: 'admin-users-editor' })` и `navigate('/admin/users/' + id)` — только константы из `constants/route.ts` / `shared/routes/routeNames.ts`.
- Добавлять `datasource/`. Клиент остаётся на `api/` + TanStack Query.
- Formik / `register` / `Controller` / `useFieldArray` / проп `form` во вложенный блок — канон в [13-forms-validation-errors.md](13-forms-validation-errors.md).
