# React: состояние и серверные данные

Query/mutation хуки живут в папке use case (`useUsersApiData.ts`), не в корне слайса. Ключи — `src/admin/<slice>/queryKeys.ts`. Контракт Args/Result — [12-use-cases-and-composables.md](12-use-cases-and-composables.md).

## Один источник истины

| Состояние | Инструмент | Пример |
|---|---|---|
| Ответ API, loading/error, кэш | TanStack Query | список пользователей |
| Глобальное клиентское | Zustand | сессия / тема |
| Локальное UI | `useState` | вкладка, поиск, поле формы |
| Производное | `useMemo` | отфильтрованный список |
| Техническое без render | `useRef` | DOM handle |

Не копировать серверные данные из Query в Zustand или локальный `useState`.

## Query keys и lifecycle

```ts
// src/admin/users/queryKeys.ts
export const USERS_QUERY_KEYS = {
    all: ['admin', 'users'] as const,
    item: (id: string) => [...USERS_QUERY_KEYS.all, 'item', id] as const,
    shortInfo: (query: {
        searchText: string;
        isActive: boolean | null;
        pageNumber: number;
        pageSize: number;
        sort?: { by: string; dir: 'asc' | 'desc' } | null;
    }) => [...USERS_QUERY_KEYS.all, 'short-info', query] as const,
    lookup: (query: {
        searchText: string;
        departmentId: string | null;
        jobPositionId: string | null;
        pageSize: number;
    }) => [...USERS_QUERY_KEYS.all, 'lookup', query] as const,
} as const;

const usersQuery = useQuery({
    queryKey: USERS_QUERY_KEYS.shortInfo({
        searchText,
        isActive,
        pageNumber,
        pageSize,
        sort,
    }),
    queryFn: () =>
        usersApi.getShortInfo({
            searchText: searchText || null,
            isActive,
            pageNumber,
            pageSize,
            sort,
        }),
});

const userQuery = useQuery({
    queryKey: USERS_QUERY_KEYS.item(userId),
    queryFn: () => usersApi.getById(userId),
    enabled: Boolean(userId),
});
```

`queryKey` — значение на рендере. Не оборачивать в `computed`. Смена `searchText` / `pageNumber` меняет ключ, потому что хук вызвался заново.

Различать:

- `isPending` / нет `data` — данных ещё нет;
- `isFetching` — запрос идёт (в т.ч. фон, та же query key);
- `isFetchingNextPage` — догрузка lookup;
- `isPending` у mutation — команда;
- `error` — ошибка последней операции.

## Loading: страница vs контейнер vs виджет

Не закрывать весь экран loader'ом, если пользователь уже видит каркас (шапка, тулбар, поля) или есть что оставить на экране.

| Что грузится | Куда лоадер | Не делать |
|---|---|---|
| Каталог (таблица) | `loadingStatus` на `BaseTableList` через `resolveCatalogListLoading` | `LoadingStateContainer` вместо всей страницы |
| Сущность редактора (`getById`) | `LoadingStateContainer` **вместо формы**, шапка Cancel/Save остаётся | лоадер на каждый селект отдельно от страницы |
| Долгая команда на весь экран (sync-all) | fixed overlay + `LoadingStateContainer` | тот же оверлей на смену страницы таблицы |
| Lookup / autocomplete | `isLoading` / `isLoadingMore` виджета (`LookupFilterSelect`, `LookupSearchPicker`) | page spinner |
| Старт приложения | `AppBrandOverlay` (`layout/overlay`) | дублировать в слайсе |

Эталоны: каталог — `UsersListPage` + `useUsersApiData`; редактор — `UserEditorPage` / `GroupEditorPage`; overlay — `UsersListPage` overlay; lookup — `UserAccessSelect`.

```ts
// src/shared/ui/components/composite/table/catalogListLoading.ts
const loadingStatus = useMemo(
    () =>
        resolveCatalogListLoading({
            isPending: usersQuery.isPending,
            isFetching: usersQuery.isFetching,
            isError: usersQuery.isError,
            hasData: usersQuery.data !== undefined,
            itemCount: usersQuery.data?.data.length ?? 0,
        }),
    [usersQuery.isPending, usersQuery.isFetching, usersQuery.isError, usersQuery.data]
);
```

Правила `resolveCatalogListLoading`:

- нет `data` и идёт fetch (первый заход **и** смена page/filter/sort) → `LOADING` в таблице;
- фоновый refetch **той же** query, `data` уже есть → `OK` / `EMPTY`, таблицу не мигать;
- ошибка без `data` → `ERROR` таблицы; ошибка при живых строках — строки оставить, тост/баннер отдельно;
- settled и 0 строк → `EMPTY`.

`CatalogTableBody` — только flex-обёртка (`min-height: 400px`), не лоадер. Состояние — в `BaseTableList` `loadingStatus`.

Редактор: `isLoading = !!id && query.isPending`. Create без id — форму сразу. `isLoading` → `LoadingStateContainer`, иначе поля.

## Серверный lookup (селект / autocomplete)

Каталог — `useQuery` + `pageNumber` в таблице. Выпадающий список — **не** тот же паттерн: не отдавать все строки каталога в `options`.

Эталон: `useUserEditorApiData` / `useGroupEditorApiData` / picker в `useGroupAddUsersModal`. UI: `LookupFilterSelect` (мульти/фильтр) или `LookupSearchPicker` (поиск + stage).

```ts
const lookupParams = useMemo(
    () => ({
        searchText: search,
        pageSize: DEFAULT_LOOKUP_PAGE_SIZE,
    }),
    [search]
);

const rolesQuery = useInfiniteQuery({
    queryKey: ROLES_QUERY_KEYS.lookup(lookupParams),
    queryFn: ({ pageParam }) =>
        rolesApi.getShortInfo({
            searchText: lookupParams.searchText || null,
            pageNumber: pageParam,
            pageSize: lookupParams.pageSize,
        }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
        hasNextPage(lastPage.pagination) ? lastPage.pagination.currentPage + 1 : undefined,
    enabled: isOpen, // модалка: не ходить, пока закрыта
});
```

Ключи: `lookup({ searchText, pageSize, …фильтры })` — **без** `pageNumber` (он `pageParam`). Отдельно `includeIds(sortedIds)` для выбранных, которых нет в загруженных страницах.

Контракт в UI (как у `UserAccessSelect`):

| Проп | Источник |
|---|---|
| `options` | `pages.flatMap(p => p.data)` → `toSelectOptions` |
| `selectedOptions` | `pickSelectedOptions(ids, options, includeIdsOptions)` |
| `searchString` | debounce 300 мс в оркестраторе (`useDebounce`), в query — уже trimmed |
| `hasMore` | `hasNextPage` query |
| `isLoading` | `isPending && !data` |
| `isLoadingMore` | `isFetchingNextPage` |
| `loadError` | `getApiErrorMessage`, не сырой `detail` |
| `onLoadMore` | `fetchNextPage()` |

`hasNextPage` — `@/shared/contracts/pagedResult.ts`. Размер страницы lookup — `DEFAULT_LOOKUP_PAGE_SIZE` из `@codaa/ui`, не `DEFAULT_PAGE_SIZE` таблицы (10/25/50).

Не копировать infinite-страницы в Zustand/`useState`. Не `useInfiniteQuery` на каталог с номерами страниц в футере.

## Lookup в памяти

Когда API отдаёт **весь** справочник одним массивом (отделы, должности) — один `useQuery`, резать на клиенте. Тот же `LookupFilterSelect`, без второго HTTP на search/scroll.

Эталон: фильтры в `useGroupAddUsersModal`.

```ts
const departmentsQuery = useQuery({
    queryKey: USERS_QUERY_KEYS.departments(),
    queryFn: () => usersApi.getDepartments(),
    enabled: isOpen,
});

const departmentItems = useMemo(
    () => toNamedOptions(departmentsQuery.data),
    [departmentsQuery.data]
);

const departmentLoader = useInfiniteOptionsLoader({
    search: departmentSearch,
    enabled: isOpen && departmentsQuery.isSuccess,
    loadPage: async (query) => paginateSelectOptions(departmentItems, query),
});

useEffect(() => {
    if (isOpen && departmentsQuery.isSuccess) {
        departmentLoader.reload();
    }
}, [departmentItems, isOpen, departmentsQuery.isSuccess]);
```

`useInfiniteOptionsLoader` + `paginateSelectOptions` — `@codaa/ui`. В JSX: `departmentLoader.options` / `hasMore` / `isLoading` / `isLoadingMore` / `loadMore`.

Не использовать `useInfiniteQuery` против массива в памяти. Не писать свой `slice`/`filter` в компоненте страницы.

`createPagedResult(data, page, size)` **не** режет массив — только вешает `pagination` (фикстуры/тесты). Для UI-lookup не годится.

## Defaults

```ts
// src/app/queryClient.ts
export const createQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 30_000,
                retry: 1,
                refetchOnWindowFocus: false,
            },
        },
    });
```

Не использовать `useEffect` + `fetch` для серверного состояния.

## Mutation и кэш

```ts
const queryClient = useQueryClient();

const syncAllMutation = useMutation({
    mutationFn: () => usersApi.syncAll(),
    onSuccess: () => {
        successToast(t('admin.users.syncSuccess'));
        return queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEYS.all });
    },
});
```

Optimistic update — только с явным rollback. Параллельные delete по строкам — через `deletingIds` в `useState<string[]>`.

## Ошибки

Собирать query/mutation errors в `useXxxApiData` / editor hook → отдавать строку через `getApiErrorMessage` / код Problem Details (`ERR_SYNC_IN_PROGRESS` → `t('admin.users.syncInProgress')`), не по сырому тексту сервера.

## Zustand

Только независимое глобальное клиентское состояние. Провайдер не нужен.

```ts
// src/shared/auth/currentUserStore.ts
export const useCurrentUserStore = create<CurrentUserState>()(() => ({
    user: emptyUser(),
    isLoaded: false,
}));
```

Не класть в Zustand: ответы API, loading/error запросов, поле одной формы, вкладку одного экрана, методы feature API.

## Состояние каталога (фильтры / сорт / pageSize)

Поиск, фильтр, сортировка и `pageSize` списка — `usePersistedViewState` (`src/shared/view-state/`). Ключ `apex.hub.view.{userId}.{screen}`, конверт `{ version, payload }`. Zod `.strict()` + bump `version` → весь blob стирается, без миграций. `pageNumber` и диалоги не сохранять. Logout чистит префикс `apex.hub.view.`.

Эталон схемы: `src/admin/users/useCases/users-list/viewState.ts`.
