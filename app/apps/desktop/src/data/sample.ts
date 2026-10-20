/* ============================================================
   Casewright — seed data (NOT app data)

   The running app reads real files from disk via the repo + git services; it no
   longer imports this module. This is the canonical seed for:
     • `scripts/make-fixture.mts` — materializes it into a real Git fixture repo
       (`.casewright/` layout: config.yaml + central runs/ + per-workspace casewright.yaml)
     • `services/format/*.test.ts` — serialize/parse round-trip tests
   The `conflict` export illustrates the merge model for the deferred 3-way engine.

   Theme: manual test cases for the public RANDOM.ORG web tools (https://www.random.org/).
   ============================================================ */
import type { Case, Conflict, Recent, Run, RunRow, TreeNode, Workspace } from '@/types';
import { runCaseFileName } from '@/services/format/filename';

export const recents: Recent[] = [
  {
    name: 'тесты-random-org',
    path: '~/work/qa/random-org-tests',
    branch: 'main',
    remote: 'ssh://git@github.com/acme-qa/random-org-tests.git',
    lastOpened: '2026-06-12T12:00:00.000Z',
    workspaces: 1,
    lastWorkspaceId: 'webtools',
  },
];

export const workspaces: Workspace[] = [
  {
    id: 'webtools',
    name: 'Веб-инструменты RANDOM.ORG',
    path: 'areas/web-tools',
    description: 'Ручные тест-кейсы для публичных веб-инструментов RANDOM.ORG (https://www.random.org/).',
    prefix: 'RND',
  },
];

export const cases: Case[] = [
  /* ---- Генераторы чисел --------------------------------------------------- */
  {
    id: '3f9a1c7e20',
    displayId: 'RND-0001',
    suite: 'generators',
    title: 'Генератор целых чисел возвращает запрошенное количество в заданном диапазоне',
    status: 'active',
    tags: ['Генераторы', 'Смоук', 'Регресс'],
    objective:
      'Проверить, что [генератор целых чисел](https://www.random.org/integers/) возвращает ровно запрошенное количество чисел, каждое в заданном включительном диапазоне, полученных из атмосферного шума (истинно случайных), а не из программного ГПСЧ.',
    systems: ['Генератор целых чисел (random.org/integers)', 'Бэкенд атмосферного шума', 'Сервис квот'],
    setup: [
      {
        name: 'Браузерная сессия',
        body: 'Современный десктопный браузер с включённым JavaScript, открытый на https://www.random.org/.\nСтраница должна загружаться по **HTTPS** — убедитесь, что в адресной строке есть замок.',
      },
      {
        name: 'Положительная квота',
        body: 'Откройте [страницу квоты](https://www.random.org/quota/) и убедитесь, что **баланс битов** для вашего IP положительный.\nЕсли он равен нулю или меньше, дождитесь ежедневного пополнения перед запуском кейса.',
      },
      {
        name: 'Параметры формы',
        body: 'Используйте на форме генератора такие значения:\n- Сгенерировать: **20** чисел\n- Диапазон: от **1** до **100** (включительно)\n- Формат: **5** столбцов, основание **10**',
      },
    ],
    steps: [
      { text: 'Откройте https://www.random.org/integers/.', depth: 0 },
      { text: 'Заполните форму генератора.', depth: 0 },
      { text: 'Укажите в поле «Сгенерировать» 20 чисел.', depth: 1 },
      { text: 'Задайте диапазон от 1 (минимум) до 100 (максимум).', depth: 1 },
      { text: 'Оставьте основание 10 и 5 столбцов.', depth: 1 },
      { text: 'Нажмите «Get Numbers».', depth: 0 },
      { text: 'Прочитайте полученный набор и примечание о генерации под ним.', depth: 0 },
    ],
    expected: [
      'Возвращается ровно 20 целых чисел.',
      'Каждое значение от 1 до 100 включительно; повторы допустимы.',
      'В результате указано, что числа получены из атмосферного шума, с отметкой времени генерации.',
      'После запроса баланс битов на странице квоты уменьшается.',
    ],
    modified: false,
  },
  {
    id: 'b8d4e6017a',
    displayId: 'RND-0002',
    suite: 'generators',
    title: 'Генератор последовательностей возвращает полную перестановку без повторов',
    status: 'active',
    tags: ['Генераторы', 'Регресс'],
    objective:
      'Проверить, что [генератор последовательностей](https://www.random.org/sequences/) возвращает каждое целое число из запрошенного диапазона ровно один раз в случайном порядке — настоящее перемешивание, а не выборка с возвратом.',
    systems: ['Генератор последовательностей (random.org/sequences)', 'Бэкенд атмосферного шума'],
    setup: [
      {
        name: 'Браузерная сессия',
        body: 'Современный десктопный браузер на https://www.random.org/, загруженный по **HTTPS**.',
      },
      {
        name: 'Диапазон последовательности',
        body: 'Перемешайте диапазон от **1** до **50**, начиная с наименьшего значения.\nГенератор вернёт все 50 значений, каждое ровно один раз.',
      },
    ],
    steps: [
      { text: 'Откройте https://www.random.org/sequences/.', depth: 0 },
      { text: 'Введите диапазон для перестановки.', depth: 0 },
      { text: 'Установите «наименьшее значение» = 1.', depth: 1 },
      { text: 'Установите «наибольшее значение» = 50.', depth: 1 },
      { text: 'Нажмите «Get Sequence».', depth: 0 },
      { text: 'Скопируйте полученную последовательность и запустите генерацию ещё раз, чтобы сравнить порядок.', depth: 0 },
    ],
    expected: [
      'Последовательность содержит ровно 50 элементов.',
      'Каждое целое число от 1 до 50 встречается ровно один раз — ничего не пропало и не повторилось.',
      'Повторный запуск возвращает тот же набор в другом порядке.',
    ],
    modified: false,
  },

  /* ---- Генераторы чисел › Квоты и лимиты --------------------------------- */
  {
    id: 'd7c3e159b0',
    displayId: 'RND-0020',
    suite: 'quota',
    title: 'Дневная квота битов исчерпывается и блокирует дальнейшие истинно случайные запросы',
    status: 'active',
    tags: ['Квоты', 'Лимиты', 'Регресс'],
    objective:
      'Проверить, что после исчерпания IP бесплатной дневной квоты битов {{today}} RANDOM.ORG перестаёт обслуживать истинно случайные запросы до пополнения после полуночи UTC ({{today+1}}). Демонстрирует переменную даты {{today}}.',
    systems: ['Сервис квот (random.org/quota)', 'Генератор целых чисел (random.org/integers)', 'Бэкенд атмосферного шума'],
    setup: [
      {
        name: 'Браузерная сессия',
        body: 'Десктопный браузер на https://www.random.org/ по **HTTPS**, с одним IP-адресом на весь прогон (без переключения VPN, которое изменило бы бюджет на IP).',
      },
      {
        name: 'Начальная квота',
        body: '{{today}} откройте [страницу квоты](https://www.random.org/quota/) и запишите начальный баланс битов.\nБесплатный дневной лимит — **1 000 000 битов**, пополняется раз в сутки.',
      },
      {
        name: 'Способ исчерпания',
        body: 'Израсходуйте квоту большими запросами к генератору целых чисел:\n- Генерируйте по **10 000** чисел за запрос\n- Обновляйте страницу квоты между запросами\n- Повторяйте, пока баланс не станет **0** или меньше',
      },
    ],
    steps: [
      { text: '{{today}} запишите начальный баланс со страницы квоты.', depth: 0 },
      { text: 'Исчерпайте дневную квоту.', depth: 0 },
      { text: 'Запросите 10 000 целых чисел в генераторе.', depth: 1 },
      { text: 'Обновите страницу квоты и отметьте уменьшившийся баланс.', depth: 1 },
      { text: 'Повторяйте, пока баланс не достигнет 0 или не станет отрицательным.', depth: 1 },
      { text: 'Сделайте ещё один истинно случайный запрос после исчерпания квоты.', depth: 0 },
      { text: 'Проверьте страницу квоты после следующего ежедневного пополнения {{today+1}}.', depth: 0 },
    ],
    expected: [
      'Баланс битов уменьшается с каждым запросом.',
      'После исчерпания баланса дальнейшие истинно случайные запросы отклоняются (или ставятся в очередь) с сообщением о квоте.',
      'Баланс пополняется после ежедневного пополнения {{today+1}}, и запросы снова выполняются.',
    ],
    modified: false,
  },

  /* ---- Игры и рандомайзеры ----------------------------------------------- */
  {
    id: 'c217ab9043',
    displayId: 'RND-0010',
    suite: 'games',
    title: 'Бросок кубиков возвращает допустимое значение на каждой кости',
    status: 'active',
    tags: ['Игры', 'Смоук'],
    objective:
      'Проверить, что [бросок кубиков](https://www.random.org/dice/) бросает запрошенное количество стандартных шестигранных кубиков и показывает значение от 1 до 6 на каждой кости.',
    systems: ['Бросок кубиков (random.org/dice)', 'Бэкенд атмосферного шума'],
    setup: [
      {
        name: 'Браузерная сессия',
        body: 'Десктопный браузер на https://www.random.org/ по **HTTPS**.',
      },
      {
        name: 'Параметры броска',
        body: 'Бросьте **5** кубиков, у каждого **6** граней (стандартный d6).\nКубики анимируются, затем каждый останавливается на итоговой грани.',
      },
    ],
    steps: [
      { text: 'Откройте https://www.random.org/dice/.', depth: 0 },
      { text: 'Выберите кубики для броска.', depth: 0 },
      { text: 'Установите количество кубиков = 5.', depth: 1 },
      { text: 'Убедитесь, что у каждого кубика 6 граней.', depth: 1 },
      { text: 'Нажмите «Roll the Dice!».', depth: 0 },
      { text: 'Дождитесь завершения анимации и итогового результата.', depth: 0 },
    ],
    expected: [
      'Показано пять кубиков.',
      'На каждой кости выпадает целое значение от 1 до 6.',
      'Точки на грани соответствуют числовому значению.',
    ],
    modified: false,
  },
  {
    id: '5e0fa3c8d1',
    displayId: 'RND-0011',
    suite: 'games',
    title: 'Перемешивание карт раздаёт руку без повторяющихся карт',
    status: 'active',
    tags: ['Игры', 'Регресс'],
    objective:
      'Проверить, что [перемешивание игральных карт](https://www.random.org/playing-cards/) перемешивает одну стандартную колоду из 52 карт и раздаёт запрошенную руку без повторяющихся карт.',
    systems: ['Перемешивание карт (random.org/playing-cards)', 'Бэкенд атмосферного шума'],
    setup: [
      {
        name: 'Браузерная сессия',
        body: 'Десктопный браузер на https://www.random.org/ по **HTTPS**.',
      },
      {
        name: 'Колода и рука',
        body: 'Перемешайте **одну** стандартную колоду из 52 карт (без джокеров).\nРаздайте руку из **10** карт с верха перемешанной колоды.',
      },
    ],
    steps: [
      { text: 'Откройте https://www.random.org/playing-cards/.', depth: 0 },
      { text: 'Настройте перемешивание.', depth: 0 },
      { text: 'Установите количество колод = 1.', depth: 1 },
      { text: 'Исключите джокеров.', depth: 1 },
      { text: 'Установите количество карт для раздачи = 10.', depth: 1 },
      { text: 'Перемешайте колоду и раздайте руку.', depth: 0 },
      { text: 'Запишите розданные карты для проверки.', depth: 0 },
    ],
    expected: [
      'Раздано ровно 10 карт.',
      'Ни одна карта не встречается в руке дважды.',
      'Каждая карта имеет допустимый ранг и масть стандартной колоды.',
    ],
    modified: false,
  },
  {
    id: '9012bd4fae',
    displayId: 'RND-0012',
    suite: 'games',
    title: 'Рандомизатор списка перемешивает вставленный список и сохраняет все элементы',
    status: 'draft',
    tags: ['Игры', 'Рандомайзеры'],
    objective:
      'Проверить, что [рандомизатор списка](https://www.random.org/lists/) возвращает тот же набор элементов в случайном порядке, ничего не удаляя и не дублируя.',
    systems: ['Рандомизатор списка (random.org/lists)', 'Бэкенд атмосферного шума'],
    setup: [
      {
        name: 'Браузерная сессия',
        body: 'Десктопный браузер на https://www.random.org/ по **HTTPS**.',
      },
      {
        name: 'Входной список',
        body: 'Вставьте ровно эти шесть имён, по одному в строке, в поле списка:\n- Анна\n- Борис\n- Вера\n- Глеб\n- Дарья\n- Егор',
      },
    ],
    steps: [
      { text: 'Откройте https://www.random.org/lists/.', depth: 0 },
      { text: 'Вставьте шесть имён, по одному в строке, в поле списка.', depth: 0 },
      { text: 'Нажмите «Randomize List».', depth: 0 },
      { text: 'Сравните выходной список с входным.', depth: 0 },
    ],
    expected: [
      'Все шесть имён присутствуют в выводе.',
      'Ни одно имя не потеряно и не продублировано.',
      'Порядок вывода отличается от вставленного.',
    ],
    modified: false,
  },
];

/** Per-workspace suite/case subtree, keyed by workspace id (materialized under each workspace path). */
export const trees: Record<string, TreeNode[]> = {
  webtools: [
    {
      type: 'suite',
      id: 'generators',
      name: 'Генераторы чисел',
      path: 'Генераторы-чисел',
      children: [
        { type: 'case', id: '3f9a1c7e20' },
        { type: 'case', id: 'b8d4e6017a' },
        {
          type: 'suite',
          id: 'quota',
          name: 'Квоты и лимиты',
          path: 'Генераторы-чисел/Квоты-и-лимиты',
          // A suite-level prefix override + description → this suite gets a folder note,
          // and new cases under it are numbered QTA-NNNN (inheritance demo).
          prefix: 'QTA',
          description: 'Ограничения квоты битов на IP и ежедневное пополнение.',
          children: [{ type: 'case', id: 'd7c3e159b0' }],
        },
      ],
    },
    {
      type: 'suite',
      id: 'games',
      name: 'Игры и рандомайзеры',
      path: 'Игры-и-рандомайзеры',
      children: [
        { type: 'case', id: 'c217ab9043' },
        { type: 'case', id: '5e0fa3c8d1' },
        { type: 'case', id: '9012bd4fae' },
      ],
    },
  ],
};

/** A run row before the run-folder fields (checks/file) are filled in below. */
type SeedRow = Pick<RunRow, 'case_id' | 'display_id' | 'title' | 'result' | 'tester' | 'executed_at' | 'notes'>;

/** Build a sample `Run` (folder model): seed rows get empty checks + a sidecar path. */
function sampleRun(
  meta: { id: string; name: string; created: string; status: 'open' | 'closed'; scope: string },
  seedRows: SeedRow[],
): Run {
  const file = `.casewright/runs/${meta.id}`;
  return {
    id: file,
    file,
    name: meta.name,
    created: meta.created,
    status: meta.status,
    scope: meta.scope,
    summary: '',
    notes: '',
    testerApproval: null,
    reviewerApproval: null,
    rows: seedRows.map((r, i) => ({
      ...r,
      checks: {},
      failNotes: {},
      itemText: {},
      file: `${file}/${runCaseFileName(i, r)}`,
    })),
  };
}

export const runs: Run[] = [
  sampleRun(
    { id: '2026-06-12-smoke', name: 'Смоук — веб-инструменты', created: '2026-06-12', status: 'open', scope: 'tag: Смоук' },
    [
      { case_id: '3f9a1c7e20', display_id: 'RND-0001', title: 'Генератор целых чисел возвращает запрошенное количество в заданном диапазоне', result: 'pass', tester: 'Анна', executed_at: '2026-06-12 09:08', notes: '' },
      { case_id: 'c217ab9043', display_id: 'RND-0010', title: 'Бросок кубиков возвращает допустимое значение на каждой кости', result: 'pass', tester: 'Анна', executed_at: '2026-06-12 09:21', notes: '' },
      { case_id: '5e0fa3c8d1', display_id: 'RND-0011', title: 'Перемешивание карт раздаёт руку без повторяющихся карт', result: 'not_run', tester: '', executed_at: '', notes: '' },
    ],
  ),
  sampleRun(
    { id: '2026-06-10-regression', name: 'Регресс — случайность', created: '2026-06-10', status: 'open', scope: 'tag: Регресс' },
    [
      { case_id: '3f9a1c7e20', display_id: 'RND-0001', title: 'Генератор целых чисел возвращает запрошенное количество в заданном диапазоне', result: 'pass', tester: 'Анна', executed_at: '2026-06-10 14:02', notes: '' },
      { case_id: 'b8d4e6017a', display_id: 'RND-0002', title: 'Генератор последовательностей возвращает полную перестановку без повторов', result: 'fail', tester: 'Иван', executed_at: '2026-06-10 14:19', notes: 'BUG-118 — при одном прогоне в последовательности отсутствовало значение 37' },
      { case_id: '5e0fa3c8d1', display_id: 'RND-0011', title: 'Перемешивание карт раздаёт руку без повторяющихся карт', result: 'blocked', tester: 'Иван', executed_at: '2026-06-10 14:33', notes: 'страница перемешивания карт вернула 503' },
      { case_id: 'd7c3e159b0', display_id: 'RND-0020', title: 'Дневная квота битов исчерпывается и блокирует дальнейшие истинно случайные запросы', result: 'not_run', tester: '', executed_at: '', notes: '' },
    ],
  ),
  sampleRun(
    { id: '2026-05-28-smoke', name: 'Смоук — предрелиз', created: '2026-05-28', status: 'closed', scope: 'tag: Смоук' },
    [
      { case_id: '3f9a1c7e20', display_id: 'RND-0001', title: 'Генератор целых чисел возвращает запрошенное количество в заданном диапазоне', result: 'pass', tester: 'Ольга', executed_at: '2026-05-28 16:40', notes: '' },
      { case_id: 'c217ab9043', display_id: 'RND-0010', title: 'Бросок кубиков возвращает допустимое значение на каждой кости', result: 'pass', tester: 'Ольга', executed_at: '2026-05-28 16:52', notes: '' },
    ],
  ),
];

// ============================================================
// Conflict scenario — produced by a Pull. Mix of auto-merged
// elements (one-sided) and true conflicts (changed on both sides).
// Drives the structured merge resolver.
// ============================================================
export const conflict: Conflict = {
  branch: 'main',
  behind: 3,
  ahead: 1,
  files: [
    {
      kind: 'case',
      path: 'areas/web-tools/Number-Generators/integer-generator-returns-the-requested-count.md',
      displayId: 'RND-0001',
      caseId: '3f9a1c7e20',
      title: 'Integer Generator returns the requested count within an inclusive range',
      elements: [
        {
          key: 'title',
          label: 'Title',
          kind: 'field',
          base: 'Integer Generator returns the requested count within an inclusive range',
          ours: 'Integer Generator returns the requested count within an inclusive range',
          theirs: 'Integer Generator returns the requested quantity within an inclusive range',
          auto: 'theirs',
          reason: 'Changed only on incoming (theirs).',
        },
        { key: 'status', label: 'Status', kind: 'field', base: 'active', ours: 'active', theirs: 'active', auto: 'same' },
        {
          key: 'tags',
          label: 'Tags',
          kind: 'tags',
          base: ['Generators', 'Smoke', 'Regression'],
          ours: ['Generators', 'Smoke', 'Regression', 'P1'],
          theirs: ['Generators', 'Smoke', 'Regression', 'Atmospheric'],
          auto: 'merge',
          merged: ['Generators', 'Smoke', 'Regression', 'P1', 'Atmospheric'],
          reason: 'Set merge: both additions kept (P1 + Atmospheric).',
        },
        {
          key: 'objective',
          label: 'Objective',
          kind: 'prose',
          conflict: true,
          base: 'Verify the Integer Generator returns exactly the requested quantity of integers, each within the inclusive range you specify, drawn from atmospheric noise (true random) rather than a software PRNG.',
          ours: 'Verify the Integer Generator returns exactly the requested quantity of integers, each within the inclusive range you specify, drawn from **atmospheric noise** (true random) rather than a software PRNG.',
          theirs: 'Verify the Integer Generator returns exactly the requested count of integers, each within the inclusive range, sourced from atmospheric noise rather than a pseudo-random generator.',
          reason: 'Changed on both sides — choose one or edit.',
        },
        {
          key: 'systems',
          label: 'Systems in Scope',
          kind: 'list',
          base: ['Integer Generator (random.org/integers)', 'Atmospheric-noise RNG backend'],
          ours: ['Integer Generator (random.org/integers)', 'Atmospheric-noise RNG backend'],
          theirs: ['Integer Generator (random.org/integers)', 'Atmospheric-noise RNG backend', 'Bit quota service'],
          auto: 'theirs',
          reason: 'Changed only on incoming (added Bit quota service).',
        },
        {
          key: 'steps',
          label: 'Steps',
          kind: 'steps',
          conflict: true,
          base: [
            { text: 'Open https://www.random.org/integers/.', depth: 0 },
            { text: 'Fill in the generator form.', depth: 0 },
            { text: 'Press "Get Numbers".', depth: 0 },
          ],
          ours: [
            { text: 'Open https://www.random.org/integers/.', depth: 0 },
            { text: 'Fill in the generator form.', depth: 0 },
            { text: 'Set "Generate" to 20 numbers.', depth: 1 },
            { text: 'Press "Get Numbers".', depth: 0 },
          ],
          theirs: [
            { text: 'Navigate to the Integer Generator.', depth: 0 },
            { text: 'Enter the count and range.', depth: 0 },
            { text: 'Submit the form to get numbers.', depth: 0 },
          ],
          reason: 'Changed on both sides — choose one or edit.',
        },
        {
          key: 'expected',
          label: 'Acceptance Criteria',
          kind: 'list',
          base: ['Exactly 20 integers are returned.', 'Every value is between 1 and 100 inclusive; duplicates are allowed.'],
          ours: ['Exactly 20 integers are returned.', 'Every value is between 1 and 100 inclusive; duplicates are allowed.'],
          theirs: ['Exactly 20 integers are returned.', 'Every value is between 1 and 100 inclusive; duplicates are allowed.'],
          auto: 'same',
        },
      ],
    },
    {
      kind: 'case',
      path: 'areas/web-tools/Number-Generators/sequence-generator-no-repeats.md',
      displayId: 'RND-0002',
      caseId: 'b8d4e6017a',
      title: 'Sequence Generator returns a complete permutation with no repeats',
      elements: [
        { key: 'title', label: 'Title', kind: 'field', base: 'Sequence Generator returns a complete permutation with no repeats', ours: 'Sequence Generator returns a complete permutation with no repeats', theirs: 'Sequence Generator returns a complete permutation with no repeats', auto: 'same' },
        { key: 'displayId', label: 'Display ID', kind: 'field', base: 'RND-0002', ours: 'RND-0002', theirs: 'RND-0002', auto: 'same' },
        { key: 'status', label: 'Status', kind: 'field', base: 'draft', ours: 'active', theirs: 'draft', auto: 'ours', reason: 'Changed only locally (ours) to active.' },
        {
          key: 'expected',
          label: 'Acceptance Criteria',
          kind: 'list',
          conflict: true,
          base: ['The sequence contains exactly 50 entries.', 'Each integer from 1 to 50 appears exactly once.', 'A second run returns a different order.'],
          ours: ['The sequence contains exactly 50 entries.', 'Each integer from 1 to 50 appears exactly once — none missing, none repeated.', 'A second run returns a different order.'],
          theirs: ['The sequence contains exactly 50 entries.', 'Each integer from 1 to 50 appears exactly once.', 'A second run returns the same set in a different order.', 'The page notes the result is true random.'],
          reason: 'Changed on both sides — choose one or edit.',
        },
      ],
    },
    {
      kind: 'run',
      path: '.casewright/runs/2026-06-10-regression.csv',
      title: 'Regression — randomness suite',
      rows: [
        { case_id: '3f9a1c7e20', display_id: 'RND-0001', auto: 'same', value: { result: 'pass', tester: 'amartin', notes: '' } },
        { case_id: 'c217ab9043', display_id: 'RND-0010', auto: 'theirs', reason: 'Result recorded only on incoming.', value: { result: 'pass', tester: 'okeefe', notes: '' } },
        {
          case_id: 'b8d4e6017a',
          display_id: 'RND-0002',
          conflict: true,
          base: { result: 'not_run', tester: '', notes: '' },
          ours: { result: 'fail', tester: 'jpatel', notes: 'BUG-118 — value 37 missing from the returned sequence on one run' },
          theirs: { result: 'blocked', tester: 'okeefe', notes: 'sequences page timed out' },
          reason: 'Result recorded differently on both sides.',
        },
      ],
    },
  ],
};
