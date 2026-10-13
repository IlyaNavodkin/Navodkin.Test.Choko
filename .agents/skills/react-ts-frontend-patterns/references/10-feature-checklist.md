# Чек-лист новой frontend-функции (React / Hub)

1. Preflight: router tables, existing slices, `@codaa/ui`, `request<T>`, env API base.
2. Layout: сценарий в `useCases/<kebab>/`, **не** в `view/`. Shared UI — `src/shared/ui` (`layout`, `components/atoms`, `components/composite`).
3. DTO в `api/contracts.ts`, если тип нужен API или нескольким use case (`UserDto`, `GroupDto`, `RoleDto`). View-model сценария (`UserListItem`, `GroupListItem`, `UserStatusFilter`) — в `useCases/<сценарий>/types.ts`. Slice-root `types.ts` не заводить.
4. `API_ENDPOINTS` + `<SLICE>_QUERY_KEYS` (`queryKeys.ts` слайса) + error code mapping.
5. Метод feature API через `request<T>` в `api/<slice>Api.ts`.
6. Хук оркестратора в папке use case (`useUsersPage` / `useUserEditor`). Если внутри queries + mutations + UI + picker — декомпозировать: `useXxxApiData` (+ extra UI hook).
7. У **каждого** хука: `export type UseXxxArgs`, `export type UseXxxResult`, типизированная сигнатура. Пустые args = `Record<string, never>` + default `{}`. Result — значения и сеттеры, не `Ref`.
8. UI hook при необходимости (форма/фильтр/picker) — тоже в папке use case, тоже Args+Result.
9. Components с typed props и колбэками `on*` в той же папке; примитивы из `@codaa/ui`.
10. Собрать тонкий `*ListPage.tsx` / `*EditorPage.tsx` (импорт `./useXxxPage` и соседей) + `routes/index.ts`. HTTP в странице нет. `name` роута — константа из `constants/route.ts`; переход — `useAppNavigate().push({ name, params })`.
11. i18n ключи для всех locale.
12. Loading / empty / error / disabled / pending ids. Каталог — `loadingStatus` таблицы; редактор — `LoadingStateContainer` вместо формы; lookup — лоадер виджета ([04-state-and-data.md](04-state-and-data.md)). Тосты — только через `useToast()`, контейнер справа снизу в `App.tsx`. Форма: Zod + `useZodForm`; вложенные блоки тупые; оркестрация на странице / хуке; правила — `schema.spec.ts` ([13-forms-validation-errors.md](13-forms-validation-errors.md)). API-ошибка — лейбл и красный тост. Селект: сервер — `useInfiniteQuery`; справочник в памяти — `useInfiniteOptionsLoader`.
13. `npm run build`; happy path + один Problem Details error path.

Минимальный вертикальный пример на клиенте (`src/admin/users/api/usersApi.ts`):

```ts
syncOne(id: string): Promise<UserDto> {
    return request<UserDto>(API_ENDPOINTS.userSyncFromPortal(id), {
        method: 'POST',
    });
}

// useUsersApiData — mutation
useMutation({
    mutationFn: (id: string) => usersApi.syncOne(id),
    onSuccess: () => {
        successToast(t('admin.users.syncOneSuccess'));
        return queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEYS.all });
    },
});
```
