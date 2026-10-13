---
name: react-ts-frontend-patterns
description: >
  React + TypeScript patterns for a Hub-style client: useCases folders (never
  view/ for product slices), typed hooks (UseXxxArgs / UseXxxResult),
  TanStack Query, Zustand, react-i18next, request<T>, Zod forms (useZodForm,
  dumb nested blocks, page+hook orchestration, schema.spec.ts),
  locale-aware validation, Problem Details field labels vs toasts, catalog vs
  editor vs lookup loading, infinite select pagination (server and in-memory).
  Use when scaffolding or extending React slices, pages, hooks, feature APIs,
  catalog/editor screens, forms, lookups, or API error mapping in
  src/admin/* or src/home. Not for the Vue webclient.
---

# React + TypeScript frontend patterns (Testoritto adaptation)

> Testoritto: применять AGENTS.md. UI Kit — @codaa/ui из ui/. Hub admin/auth/HTTP являются примерами, а не требованиями продукта. Транспорт repository API — typed preload IPC, не HTTP server. useCases, typed hooks, state separation и strict TypeScript сохраняются. Справочники ниже описывают исходные Hub patterns.

Паттерны React-клиента с тем же каноном слайсов, что у Hub: React + Vite + TypeScript `strict`. Backend здесь не описывается — только клиент. Не переносить это в `apex.hub.webclient` (там Vue).

## Канон слайса (обязательно)

| Что | Hub |
|---|---|
| Презентация фичи | `src/admin/<slice>/useCases/<сценарий>/` — **не** `view/` |
| Shared по домену | `src/shared/{auth,i18n,ui}/…`. UI: `ui/layout`, `ui/components/atoms`, `ui/components/composite` |
| HTTP | `api/` + TanStack Query. Слой `datasource/` **не** вводить |
| Хуки | внутри папки use case, **не** в корне слайса |
| Типы сценария | `useCases/<сценарий>/types.ts` |
| DTO / query / command | `api/contracts.ts`, если тип нужен API или нескольким use case |
| Hook API | каждый хук экспортирует `UseXxxArgs` + `UseXxxResult` |

Эталон дерева: [11-project-layout.md](references/11-project-layout.md). Правила хуков: [12-use-cases-and-composables.md](references/12-use-cases-and-composables.md).

Стиль декомпозиции (page vs api-data vs picker) можно сверять с portal-app (`task-templates`, `contract-step`, `project-list`). **Имя папки — `useCases/`, не portal `view/`.**

## Приоритет правил

1. Семантика React / React Router / Vite.
2. Корректность, безопасность, поддерживаемость.
3. Conventions текущего React-клиента.
4. Этот skill.
5. Не копировать Vue SFC (`script setup`, `ref` в JSX, `emit`, `v-model`) и не тащить portal-app `view/` как целевой layout. Не переходить на Next.js file-based routing.

## Порядок работы

1. Bounded context и слои — [01-architecture.md](references/01-architecture.md).
2. Layout слайса — [11-project-layout.md](references/11-project-layout.md).
3. Use cases и хуки — [12-use-cases-and-composables.md](references/12-use-cases-and-composables.md).
4. Остальное по необходимости:
   - имена/типы — [02-conventions.md](references/02-conventions.md);
   - страница / компоненты / поток данных — [03-frontend.md](references/03-frontend.md);
   - TanStack Query, Zustand, loading, lookup-пагинация — [04-state-and-data.md](references/04-state-and-data.md);
   - HTTP client и контракты — [05-http-and-contracts.md](references/05-http-and-contracts.md);
   - формы, Zod, локаль, лейбл vs тост — [13-forms-validation-errors.md](references/13-forms-validation-errors.md);
   - UI / i18n / стили — [09-ui-i18n-styles.md](references/09-ui-i18n-styles.md);
   - чек-лист фичи — [10-feature-checklist.md](references/10-feature-checklist.md).
5. Направление зависимостей: Page → `useXxxPage` / `useXxxEditor` → `useXxxApiData` → feature API → `request<T>`. Компонент не знает HTTP.
6. В результате показать минимум один контракт (`api/contracts.ts` или use-case `types.ts`) и один вызов API.

## Обязательные ограничения

- TypeScript `strict`. Не вводить `any`.
- Route-файл тонкий (`routes/index.ts`); feature-код в area/slice (`src/admin/users`, …). Barrel слайса: `export { default as usersRoutes } from './routes'`.
- Делить клиент по пользовательским сценариям (`users-list`, `user-editor`), не по плоским `hooks/` / `view/` в корне слайса.
- Page — тонкий сборщик: хук и presentational-соседи из **той же** папки use case. HTTP в компоненте страницы нет.
- Каждый хук: `export type UseXxxArgs`, `export type UseXxxResult`, функция типизирована. Пустые args = `Record<string, never>` + default `{}`. Result — обычные значения и сеттеры, не `Ref`.
- Имена роутов — константы (`constants/route.ts`, `shared/routes/routeNames.ts`). Навигация через `useAppNavigate().push({ name, params })`, не литерал пути и не `navigate('/admin/users/' + id)`.
- Тосты — глобально справа снизу в `App.tsx`.
- Если хук смешивает queries + mutations + UI + pickers — декомпозировать (см. [12](references/12-use-cases-and-composables.md)).
- Примитивы UI — `@codaa/ui`. Обёртки — `src/shared/ui` (`layout/`, `components/atoms/`, `components/composite/`).
- Серверное состояние — TanStack Query; глобальное клиентское — Zustand; локальное — `useState` в хуке. Фильтры каталога — `usePersistedViewState` ([04](references/04-state-and-data.md)).
- Не дублировать ответ API в Zustand.
- Loading / empty / error / disabled / повторный клик обязательны. Каталог — `loadingStatus` таблицы; редактор сущности — `LoadingStateContainer` вместо формы; lookup — `isLoading` виджета ([04](references/04-state-and-data.md)).
- Селект с сервера — `useInfiniteQuery` + `LookupFilterSelect`. Справочник уже в памяти — `useInfiniteOptionsLoader` + `paginateSelectOptions`. Не класть весь каталог в `options`.
- Пользовательский текст — через типизированный i18n. Схема Zod пересобирается от `i18n.language` (см. [13](references/13-forms-validation-errors.md)).
- Формы create/edit — `useZodForm`. Один store: `form.values` / `form.setFieldValue` / `form.errors`. Без Formik, `register`, `Controller`, `useFieldArray`, пропа `form` и React Context формы. Вложенные блоки тупые (кусок + колбэк); оркестрация — страница + `useXxxEditor` / `useXxxForm`. Сложная валидация — `src/dev/contractor-group-form/` ([13](references/13-forms-validation-errors.md)). Правила Zod тестировать в `schema.spec.ts` без React.
- Ошибка API: `resolveApiError` → поле (`applyFormFieldErrors` / `applyBoundFieldErrors`) и красный `errorToast` по `title`. Не показывать серверный `detail`.
- Не создавать абстракцию ради одного вызова.

## Проверка

`npm run build` (или `tsc -b && vite build`). Проверить happy path и один error path (Problem Details → лейбл поля и красный тост, см. [13](references/13-forms-validation-errors.md)). Не утверждать, что тесты прошли, если их нет.
