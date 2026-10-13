# React frontend: слои и поток данных (Hub)

## Поток данных

```text
Page (useCases/<сценарий>/)
  -> page/editor hook (тот же каталог)
    -> useXxxApiData (TanStack Query + feature API)
      -> usersApi / groupsApi
        -> shared request<T>

Page
  -> presentational siblings (тот же каталог)
    -> props / on*
    -> DOM

DOM event
  -> callback prop
    -> hook command
      -> mutation
```

Не вызывать `fetch`, `usersApi` или `useMutation` из Page и из presentational-компонента.

Дерево слайса — [11-project-layout.md](11-project-layout.md). Контракт хука — [12-use-cases-and-composables.md](12-use-cases-and-composables.md).

## Структура feature (area → slice → useCases)

Product slice **не** содержит `view/`. Сценарии живут в `useCases/`:

```text
src/admin/users/
├─ index.ts
├─ constants/route.ts        # USERS_LIST_ROUTE_NAME, USERS_EDITOR_ROUTE_NAME
├─ routes/index.ts
├─ api/contracts.ts
├─ api/usersApi.ts
├─ queryKeys.ts
└─ useCases/
   ├─ users-list/
   │  ├─ UsersListPage.tsx
   │  ├─ UsersTable.tsx
   │  ├─ UsersToolbar.tsx
   │  ├─ UserFioCell.tsx
   │  ├─ useUsersPage.ts
   │  ├─ useUsersApiData.ts
   │  ├─ types.ts
   │  └─ utils/mapping.ts
   └─ user-editor/
      ├─ UserEditorPage.tsx
      ├─ useUserEditor.ts
      ├─ useUserEditorApiData.ts
      └─ toSelectOptions.ts
```

Аналогично: `src/admin/groups/useCases/groups-list`, `src/admin/groups/useCases/group-editor`.

Shared — по домену, технические папки ок: `src/shared/auth/view/AuthCallbackView.tsx`.

## Page: тонкий сборщик

Импорт хука и соседей **из той же папки**. HTTP нет. Хук возвращает значения, страница передаёт их в JSX.

```tsx
import { useTranslation } from 'react-i18next';

import { useHubPermissions } from '@/shared/auth/hooks/useHubPermissions';
import { CatalogTableBody } from '@/shared/ui/components/composite/table/CatalogTableBody';

import { useUsersPage } from './useUsersPage';
import { UsersTable } from './UsersTable';
import { UsersToolbar } from './UsersToolbar';

export default function UsersListPage() {
    const { t } = useTranslation();
    const { canSyncUsers } = useHubPermissions();
    const {
        searchInput,
        setSearchInput,
        statusFilter,
        users,
        totalItems,
        loadingStatus,
        loadError,
        goEdit,
        selectPage,
    } = useUsersPage();

    return (
        <>
            <UsersToolbar
                searchInput={searchInput}
                onSearchInputChange={setSearchInput}
                statusFilter={statusFilter}
            />
            <CatalogTableBody>
                <UsersTable
                    users={users}
                    loadingStatus={loadingStatus}
                    onEdit={goEdit}
                />
            </CatalogTableBody>
        </>
    );
}
```

## Три уровня хуков

Все три уровня живут **в папке use case** (кроме genuinely shared в `src/shared/`). У каждого — `UseXxxArgs` + `UseXxxResult`.

### 1. Page / editor orchestrator

UI-состояние, роутинг, dirty формы, сборка экрана. Не держит сырые `useQuery`/`useMutation`, если сценарий уже вырос.

```ts
import { USERS_EDITOR_ROUTE_NAME } from '@/admin/users/constants/route';
import { useAppNavigate } from '@/shared/routes/useAppNavigate';

export type UseUsersPageArgs = Record<string, never>;

export const useUsersPage = (_args: UseUsersPageArgs = {}): UseUsersPageResult => {
    const { push } = useAppNavigate();
    const [searchInput, setSearchInput] = useState('');
    const [pageNumber, setPageNumber] = useState(1);
    const api = useUsersApiData({ searchText, isActive, pageNumber, pageSize });
    const goEdit = (id: string) => {
        push({ name: USERS_EDITOR_ROUTE_NAME, params: { userId: id } });
    };
    return { searchInput, setSearchInput, pageNumber, setPageNumber, ...api, goEdit };
};
```

### 2. Api-data hook

Queries/mutations + feature API. Наружу отдаёт view-model, не сырой объект Query.

```ts
return {
    users: useMemo(
        () =>
            (usersQuery.data?.data ?? []).map((dto) =>
                mapUserShortInfoToListItem(dto, statusLabels, i18n.language)
            ),
        [usersQuery.data, statusLabels, i18n.language]
    ),
    loadingStatus: useMemo(
        () =>
            resolveCatalogListLoading({
                isPending: usersQuery.isPending,
                isFetching: usersQuery.isFetching,
                isError: usersQuery.isError,
                hasData: usersQuery.data !== undefined,
                itemCount: usersQuery.data?.data.length ?? 0,
            }),
        [usersQuery.isPending, usersQuery.isFetching, usersQuery.isError, usersQuery.data]
    ),
    loadError: usersQuery.isError
        ? getApiErrorMessage(usersQuery.error, t('admin.users.error'))
        : '',
    syncOne,
};
```

### 3. UI hook

Форма, поиск, picker — `useState` + `useMemo`. Пример: `src/admin/groups/useCases/group-editor/useGroupAddUsersModal.ts`. Возвращать объект с доменными именами, не позиционный tuple.

Когда раскладывать page vs api-data vs picker — [12-use-cases-and-composables.md](12-use-cases-and-composables.md). Loading и lookup-пагинация — [04-state-and-data.md](04-state-and-data.md).

## Компоненты

Управляемые снаружи через props и колбэки `on*`. Типы view-model — из `./types`. Именованный export.

```tsx
import type { UserListItem } from './types';

type UsersTableProps = {
    users: UserListItem[];
    loadingStatus: string;
    syncingIds: string[];
    onEdit: (id: string) => void;
    onSyncOne: (id: string) => void;
};

export function UsersTable({
    users,
    loadingStatus,
    syncingIds,
    onEdit,
    onSyncOne,
}: UsersTableProps) {
    // …
}
```

## Формы

Канон: [13-forms-validation-errors.md](13-forms-validation-errors.md).

- Новые и вложенные формы: слои и запреты — [13-forms-validation-errors.md](13-forms-validation-errors.md). Коротко: `useZodForm` + Zod; блоки тупые (пропы + колбэки); страница + хук оркестрируют. Без Formik, `register`, `Controller`, `useFieldArray`, Context формы, пропа `form` в блок.
- Админские create/edit: `mode: 'submit'`. Песочница / кросс-правила: опция `live`.
- Схема пересобирается от `i18n.language` внутри `useZodForm`.
- Уход с грязной формы — `useFormNavigation` (`useBlocker`).
- После API-ошибки: `resolveApiError` → лейбл и красный тост. Не затирать серверную ошибку локальной без явного UX.

## Providers

Подключать один раз в `src/app/providers.tsx` / `main.tsx`. Zustand без провайдера.

```tsx
<QueryClientProvider client={queryClient}>
    <I18nextProvider i18n={i18n}>
        <RouterProvider router={router} />
    </I18nextProvider>
</QueryClientProvider>
```

Порядок отражает зависимости: Query → i18n → router.
