# Формы, валидация, локаль, ошибки API (Hub)

Эталон клиента: Zod + `useZodForm`. UI — `@codaa/ui`. Ошибки бэка — Problem Details → `resolveApiError`.

## Стек

| Слой | Пакет / файл | Роль |
|---|---|---|
| Правила | `zod@3` | схема, в т.ч. `superRefine` |
| Состояние | `src/shared/hooks/useZodForm.ts` | один store: values / errors / setFieldValue |
| Поле | `form.values` / `form.setFieldValue` / `form.errors` | путь `'name'` или `'managers[0].name'` |
| Виджеты | `BaseInput` / `BaseSelect` | `isError` + `errorMessage` |

`useZodForm` сам держит state и гоняет Zod. Не вводить Formik, react-hook-form `register` / `Controller` / `useFieldArray`, не плодить `useZodField` на каждое поле. Массив менять через `form.setFieldValue`.

Горизонтально тащить только `useZodForm`. Домен (массивы, кросс-правила) остаётся в `useXxxEditor` / `useXxxForm` сценария.

## Архитектура сложной формы

Эталон: `src/dev/contractor-group-form/` (роут `/dev/contractor-group-form`, только `HUB_ENV_DEV`). Копировать оттуда слои. Не прокидывать форму через Context и не передавать `form` в блоки.

Цель: правила тестируются без React; блоки тупые; страница и её хук оркестрируют. Проп-дриллинг значений и ошибок — норма.

```text
schema.ts + __tests__/schema.spec.ts     правила Zod, без React
types.ts                                 FormValue (store) + XxxView (пропы блока)
useXxxForm / useXxxEditor                один form, проекция во View, setFieldValue, add/remove
*Page.tsx                                тонкий сборщик: плоские поля с form.*, блоки — кусок + колбэк
ManagerBlock.tsx / EmployeeRow.tsx       презентация: props + on*, без form / путей / Zod
```

| Слой | Знает | Не знает |
|---|---|---|
| Схема | инварианты, `superRefine`, пути ошибок | React, i18n-инстанс (только уже переведённые `messages`) |
| Хук | `useZodForm`, `form.setFieldValue`, проекция `managerBlocks`, add/remove | вёрстка инпута |
| Страница | какой колбэк на какой setter, плоские поля группы | Zod, пути `'managers[0].name'` внутри блока |
| Блок | `name` / `nameError` / `onUpdateName` | `form`, Zod, индекс родителя в store |

Плоский админский редактор (имя + описание) биндит `form.values` прямо на странице — вложенных блоков нет, эталон тот же store.

### Почему так

- Схема — чистая функция. Тест: `safeParse` в `schema.spec.ts`, без `render`.
- Один store: `form.values` / `form.errors` / `form.setFieldValue`. Нет второго `useState` рядом с Zod.
- Блок не знает путь `'managers[i].employees[j].name'`. Индекс замыкает страница в обработчике.
- Хук тестируется отдельно: add/remove, `canAddManager`, проекция ошибок во View.

### Запрещено

- `useZodField` / `register` / `Controller` / `useFieldArray` в блоке или оркестраторе.
- React Context формы.
- Проп `form` в `ManagerBlock` / `EmployeeRow`.
- Formik и неконтролируемый инпут рядом со store.
- Смешивать отдельный `useState` + `if` на save с Zod на одном экране.

## Домен эталона

Модель: группа → `managers[]` → `employees[]`.

- обязательные `name` у группы / руководителя / сотрудника; `note` — пустая строка, не `optional()`
- минимум 1 руководитель, минимум 1 сотрудник в блоке
- тип `high` — максимум 2 руководителя (`superRefine` + дизейбл «+»)
- ФИО сотрудников уникальны по всей форме (trim, ignore case), ошибка на **обоих** полях

Пути ошибок store: `"managers[0].employees[0].name"`, массив целиком — `"managers"` / `"managers[0].employees"`.

Тесты правил: `src/dev/contractor-group-form/__tests__/schema.spec.ts`.

## Эталон: схема (`schema.ts`)

Фабрика `createXxxSchema(messages)` — Zod. Сообщения не хардкодить: передавать уже переведённые строки (или коды).

```ts
const employeeSchema = (messages: ContractorGroupSchemaMessages) =>
    z.object({
        name: z.string().trim().min(1, messages.required),
        note: z.string(),
    });

const managerSchema = (messages: ContractorGroupSchemaMessages) =>
    z.object({
        name: z.string().trim().min(1, messages.required),
        note: z.string(),
        employees: z.array(employeeSchema(messages)).min(1, messages.minEmployees),
    });

export function createContractorGroupSchema(messages: ContractorGroupSchemaMessages) {
    return z
        .object({
            name: z.string().trim().min(1, messages.required),
            type: z.enum(CONTRACTOR_GROUP_TYPES),
            managers: z.array(managerSchema(messages)).min(1, messages.minManagers),
        })
        .superRefine((value, ctx) => {
            if (value.type === 'high' && value.managers.length > CONTRACTOR_GROUP_HIGH_MAX_MANAGERS) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['managers'],
                    message: messages.maxManagersHigh,
                });
            }

            const seen = new Map<string, [number, number]>();
            value.managers.forEach((manager, managerIndex) => {
                manager.employees.forEach((employee, employeeIndex) => {
                    const key = employee.name.trim().toLowerCase();
                    if (!key) {
                        return;
                    }

                    const previous = seen.get(key);
                    if (previous) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            path: ['managers', managerIndex, 'employees', employeeIndex, 'name'],
                            message: messages.employeeDuplicate,
                        });
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            path: ['managers', previous[0], 'employees', previous[1], 'name'],
                            message: messages.employeeDuplicate,
                        });
                        return;
                    }

                    seen.set(key, [managerIndex, employeeIndex]);
                });
            });
        });
}
```

Тип формы пишут руками (`XxxFormValue`) рядом со схемой: схема — фабрика под локаль, стабильной константы для `z.infer` нет. View блока (`EmployeeRowView`, `ManagerBlockView`) — отдельный тип пропов, не DTO.

## Эталон: оркестратор (`useContractorGroupForm.ts`)

Один `form`. Массивы — `form.setFieldValue`. Проекция `managerBlocks` отдаёт блокам уже значения + ошибки. `i18n.language` участвует в пересборке схемы (это делает `useZodForm`) и в `useMemo` заголовков.

```ts
const form = useZodForm<ContractorGroupFormValue>({
    schema: () =>
        createContractorGroupSchema({
            required: t('dev.contractorGroup.required'),
            minEmployees: t('dev.contractorGroup.minEmployees'),
            minManagers: t('dev.contractorGroup.minManagers'),
            maxManagersHigh: t('dev.contractorGroup.maxManagersHigh'),
            employeeDuplicate: t('dev.contractorGroup.employeeDuplicate'),
        }),
    initialValues: { name: '…', type: 'standard', managers: [/* 1 блок с 1 сотрудником */] },
    mode,
    invalidToast: () => t('dev.contractorGroup.validationToast'),
});

form.setFieldValue('managers', [...form.values.managers, emptyManager()]);
form.setFieldValue(`managers[${index}].employees`, [...current, emptyEmployee()]);
form.validateIfLive();
```

Смена `values` / `errors` ререндерит хук. Не держать копию values в отдельном `useState`. `mode: 'submit' | 'live'`. Invalid submit → `warningToast`.

## Эталон: страница

Тонкий сборщик. Плоские поля группы — с `form`. Вложенность — пропы из `managerBlocks`, колбэки на методы хука. Индекс только в `map` страницы.

```tsx
<BaseInput
    value={form.values.name}
    isError={!!form.errors.name}
    errorMessage={form.errors.name ?? ''}
    onChange={(value) => form.setFieldValue('name', String(value ?? ''))}
/>

{managerBlocks.map((block, index) => (
    <ManagerBlock
        key={index}
        title={block.title}
        name={block.name}
        note={block.note}
        nameError={block.nameError}
        employees={block.employees}
        onUpdateName={(value) => setManagerName(index, value)}
        onUpdateEmployeeName={(employeeIndex, value) =>
            setEmployeeName(index, employeeIndex, value)
        }
        onAddEmployee={() => addEmployee(index)}
        onRemove={() => removeManager(index)}
    />
))}
```

Ошибка «нет руководителей» — контейнер **под** списком (`form.errors.managers`), не на инпуте блока.

`value` / `onChange` — API `@codaa/ui`. Не двусторонний биндинг и не `register`.

## Эталон: тупой блок (`ManagerBlock.tsx` / `EmployeeRow.tsx`)

Нет `form`, нет путей, нет `index` родителя в store. Заголовок — готовая строка `title`. «Можно удалить сотрудника» — `employees.length > 1` внутри блока.

```ts
type ManagerBlockProps = {
    title: string;
    name: string;
    note: string;
    nameError: string;
    noteError: string;
    employeesError: string;
    employees: EmployeeRowView[];
    onRemove: () => void;
    onUpdateName: (value: string) => void;
    onUpdateNote: (value: string) => void;
    onAddEmployee: () => void;
    onRemoveEmployee: (index: number) => void;
    onUpdateEmployeeName: (index: number, value: string) => void;
    onUpdateEmployeeNote: (index: number, value: string) => void;
};
```

`EmployeeRow`: `name` / `note` / ошибки, колбэки `onUpdateName` / `onUpdateNote` / `onRemove`. Индекс сотрудника в колбэке нужен родителю блока, чтобы страница вызвала `setEmployeeName(managerIndex, employeeIndex, value)`.

## Тесты

| Что | Где | Зачем |
|---|---|---|
| Правила Zod (`superRefine`, min, unique) | `schema.spec.ts` | без React, быстрый регресс инвариантов |
| Проекция / add-remove (по необходимости) | `__tests__/useXxxForm.spec.ts` | store и View без монтирования блоков |
| Блоки | не обязательны | нет логики, только пропы |

Не дублировать правила схемы в тестах компонентов.

## Клиентская валидация

1. Фабрика схемы `createXxxSchema(messages)` — Zod.
2. `useZodForm({ schema: () => createXxxSchema({ required: t('...') }), initialValues, mode, invalidToast })`.
3. Админские create/edit по умолчанию: `mode: 'submit'` — проверка на Save / «Проверить».
4. `mode: 'live'` — `form.setFieldValue` сам валидирует; после add/remove — `form.validateIfLive()`. Для кросс-правил (уникальность между блоками).
5. После успешного save — `markSaved()` / уход. Клиентский invalid submit — `warningToast`, не `errorToast`.

Админские редакторы (`useGroupEditor`, `useRoleEditor`, `useUserEditor`) и вложенные формы — `useZodForm`.

Dirty / уход — `useFormNavigation` (`useBlocker`), отдельно от Zod.

## Локаль

`useTranslation().t` ререндерит компонент при смене языка, но схема, собранная один раз, остаётся со старыми строками.

Обязательно пересобирать схему от `i18n.language` внутри `useZodForm`:

```ts
const language = i18n.language;
const validationSchema = useMemo(() => {
    void language;
    return args.schema();
}, [language, args.schema]);
```

Иначе в EN остаётся «Обязательное поле»: `t()` замкнулся на русском в первом рендере, а memo схемы не зависит от языка.

Лейблы в JSX (`t('...')` прямо в разметке) живут сами. Ошибки Zod, `errorsJson`, заголовки `managerTitle` в хуке — нет, пока `useMemo` читает `i18n.language`.

После смены локали `useZodForm` вызывает `validate()`, если режим `live` или уже есть ошибки.

Надёжный прод-вариант: в Zod класть коды (`ERR_VALIDATION_REQUIRED`), `t('errors.' + code)` только при показе.

`fallbackLng` — `ru`. Нет ключа в EN → русская строка.

## Ошибки бэка

Контракт: RFC7807 Problem Details. Клиент **не показывает** `detail`/`message` с сервера (часто английский). Текст только из i18n по `code` / `errorCode`.

```ts
const resolved = resolveApiError(error, t, t('admin.groups.saveFailed'));
applyFormFieldErrors(form.setFieldError, resolved.fields, ['name', 'description']);
errorToast(resolved.title);
```

Файлы: `src/shared/infrastructure/http/apiError.ts`, `errorMessage.ts`. Эталон UI: `src/dev/error-sandbox/useErrorSandbox.ts` (`applyBoundFieldErrors` для таргетов песочницы). Zod-редакторы пишут ошибки через `applyFormFieldErrors` → `form.setFieldError`.

`ResolvedApiError`: `{ code?, title, fields }`.

- `fields` — карта `имяПоля → локализованная строка` из `problem.errors`.
- `title` — `errors.<CODE>` или `errors.http.<status>` / `errors.network`.

`applyFormFieldErrors` / `applyBoundFieldErrors` пишут только **известные** ключи (`name`, `description`, …). Вложенные пути `managers[0].name` текущий биндер не понимает — для вложенной Zod-формы маппить отдельно или расширять биндер.

### Лейбл vs тост

| Куда | Когда |
|---|---|
| Лейбл поля (`BaseInput` `isError` / `errorMessage`) | В `errors` есть ключ, который есть в `targets`. Пользователь чинит конкретное поле. |
| Тост (`errorToast`) | Любая ошибка API после запроса: и когда поля замаплены (пользователь видит, что save упал), и когда нет (403/404/409/500, сеть). Текст — `resolved.title`, не текст поля. |
| `warningToast` | Клиентский invalid submit (`useZodForm` `invalidToast`). Не путать с API `errorToast`. |

Поле и тост вместе: лейбл — конкретная причина (`ERR_ALREADY_EXISTS`), тост — заголовок (`ERR_VALIDATION` / HTTP). Не дублировать один и тот же текст поля в тосте. Песочница: `errorToast(resolved.title)` всегда.

Контейнер тостов — `App.tsx`, справа снизу. `successToast` / `errorToast` / `warningToast` из `useToast()`.

### Валидация бэка vs остальные ошибки

Валидация (обычно 400, `ERR_VALIDATION` / `ERR_VALIDATION_REQUIRED` / `ERR_VALIDATION_LENGTH`):

- Богатый payload: `errors: { name: [{ code, params? }] }`.
- `code` на поле → `t('errors.ERR_VALIDATION_REQUIRED')`, params `{min,max}` для length.
- `title` часто «Проверьте заполнение формы» — красный тост после запроса; на поле остаётся код из `errors`.
- Английский `detail` / `message` игнорировать.

Прочие (404 `ERR_NOT_FOUND`, 409 `ERR_SYNC_IN_PROGRESS` / `ERR_ALREADY_EXISTS`, 500 `ERR_INTERNAL`, status 0 сеть):

- Payload бедный: `errorCode` + опционально `detail`, **без** карты полей (`fields: {}`).
- Показать только `title` тостом (или inline error списка, не поле формы).
- `ERR_ALREADY_EXISTS` может прийти и как поле (`errors.name`) — тогда лейбл + тост `title`; без карты полей — только тост.

Коды без записи в `KNOWN_ERROR_CODES` не переводятся — уйдёт HTTP-fallback.

## Чек-лист формы

- [ ] Схема Zod + `useZodForm`; `i18n.language` в `useMemo` схемы (не выкидывать).
- [ ] Один store: `form.values` / `form.setFieldValue` / `form.errors`. Без Formik, `register`, `useFieldArray`.
- [ ] Вложенные блоки тупые (кусок данных + колбэк). Оркестрация — страница + `useXxxForm`. Не Context, не проп `form`.
- [ ] Правила схемы покрыты `schema.spec.ts` без React.
- [ ] Ключи i18n в `ru.ts` и `en.ts`.
- [ ] Save: Zod → API → `resolveApiError` → лейбл и `errorToast(title)`.
- [ ] Грязная форма — `useFormNavigation`.
- [ ] Не затирать серверную ошибку поля новым вводом без явного UX.
