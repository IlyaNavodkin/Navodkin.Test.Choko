# HTTP client и контракты (React)

DTO / query / command, нужные `api/` или нескольким use case, живут в `api/contracts.ts`. View-model одного экрана — в `useCases/<сценарий>/types.ts`. См. [11-project-layout.md](11-project-layout.md).

## Feature API

Скрывать URL, method и форму ответа за доменным методом:

```ts
// src/admin/users/api/usersApi.ts
import type { UserDto, UserShortInfoDto, UsersShortInfoQuery } from '@/admin/users/api/contracts';
import type { PagedResult } from '@/shared/contracts/pagedResult';
import { API_ENDPOINTS } from '@/shared/infrastructure/http/endpoints';
import { request } from '@/shared/infrastructure/http/request';

export const usersApi = {
    getShortInfo(query: UsersShortInfoQuery = {}): Promise<PagedResult<UserShortInfoDto>> {
        return request<PagedResult<UserShortInfoDto>>(API_ENDPOINTS.usersShortInfo, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(query),
        });
    },

    getById(id: string): Promise<UserDto> {
        return request<UserDto>(API_ENDPOINTS.userById(id));
    },
};
```

Тип результата = фактический JSON. Не объявлять `Promise<void>`, если сервер возвращает объект.

## Общий `request<T>`

Один клиент для network error, JSON и Problem Details:

```ts
export async function request<T>(
    input: RequestInfo | URL,
    init?: RequestInit,
    fallbackMessage = 'Не удалось выполнить запрос'
): Promise<T> {
    const response = await fetch(input, init).catch(() => {
        throw new ApiError('Сервис временно недоступен', 0);
    });
    const payload = await readPayload(response);

    if (!response.ok) {
        const problem = payload as ProblemDetails | undefined;
        throw new ApiError(
            problem?.detail ?? fallbackMessage,
            response.status,
            payload,
            problem?.code
        );
    }
    return payload as T;
}
```

Базовый URL — `env.apiBaseUrl` из `@/shared/config/env` (`VITE_API_BASE_URL`). Docker/CI: `https://ndha.apex-soft.ru` / `nsha` / `nha`. Пустой — Vite proxy `/api` или e2e/unit. Живой клиент: `@/shared/infrastructure/http/request.ts`.

Ошибки ответа: `ApiError` + Problem Details. Показ — [13-forms-validation-errors.md](13-forms-validation-errors.md): поля из `errors` на лейбл, иначе тост; `detail` с сервера не показывать.

## Константы

```ts
// src/shared/infrastructure/http/endpoints.ts
export const API_ENDPOINTS = {
    usersShortInfo: '/api/admin/users/queries/short-info',
    userById: (id: string) => `/api/admin/users/${id}`,
    usersSync: '/api/admin/sync/users',
    userSyncFromPortal: (id: string) => `/api/admin/users/${id}/actions/sync-from-portal`,
} as const;
```

Не разбрасывать URL и query keys по компонентам.

## Контракт ответа

- Коллекция: `PagedResult<T>` (`data` + `pagination`) в `@/shared/contracts/pagedResult.ts`. Догрузка lookup: `hasNextPage(pagination)`. `createPagedResult` — фикстуры, массив не режет.
- Lookup query: `includeIds` для выбранных id, которых нет на текущих страницах. UI-пагинация селекта — [04-state-and-data.md](04-state-and-data.md).
- Команда / сущность: сам DTO (`UserDto`, `UserSyncResultDto`)

Контракты слайса — `src/admin/users/api/contracts.ts` (`UserDto`, `UsersShortInfoQuery`). Общие обёртки — `src/shared/contracts/pagedResult.ts`. Не дублировать DTO в use-case `types.ts`.
