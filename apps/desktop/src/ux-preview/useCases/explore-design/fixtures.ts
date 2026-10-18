import type { CaseDraft, CaseFilters, DemoCase, DemoFile, DemoRun, ResultDraft } from './types';

export const repositories = [
  { name: 'PayFlow QA', path: 'D:/projects/payflow-qa', workspace: 'Платежи' },
  { name: 'Mobile Banking', path: 'D:/projects/mobile-banking', workspace: 'Мобильный банк' },
];
export const demoCases: DemoCase[] = [
  { id: 'case-9f3c-0042', displayId: 'PAY-042', title: 'Успешная оплата картой', folder: 'Оплата картой', status: 'active', tags: ['smoke', 'checkout'], objective: 'Проверить оплату заказа банковской картой и доступность [СБП](../../.testoritto/glossary/00000000-0000-4000-8000-000000000002.md).', setup: 'Пользователь вошёл в аккаунт. В корзине есть товар. Доступна тестовая карта 4242 4242 4242 4242.', steps: ['Открыть оформление заказа', 'Выбрать оплату картой', 'Ввести данные тестовой карты и подтвердить оплату'], expected: 'Заказ оплачен. Отображается номер заказа. В истории появляется платёж со статусом «Успешно».' },
  { id: 'case-9f3c-0041', displayId: 'PAY-041', title: 'Оплата через СБП', folder: 'Оплата картой', status: 'active', tags: ['checkout'], objective: 'Проверить переход к оплате через СБП.', setup: 'В корзине есть товар. Банк поддерживает СБП.', steps: ['Выбрать оплату через СБП', 'Отсканировать QR-код', 'Подтвердить платёж в приложении банка'], expected: 'Оформленный заказ отображается как оплаченный.' },
  { id: 'case-9f3c-0043', displayId: 'PAY-043', title: 'Отклонённая карта', folder: 'Оплата картой', status: 'active', tags: ['negative', 'checkout'], objective: 'Проверить сообщение об отклонённой оплате.', setup: 'Используется тестовая карта с недостаточным балансом.', steps: ['Открыть оформление заказа', 'Ввести данные карты с недостаточным балансом', 'Подтвердить оплату'], expected: 'Отображается понятная ошибка. Заказ не оплачен, повторная попытка доступна.' },
  { id: 'case-9f3c-0044', displayId: 'PAY-044', title: 'Возврат платежа', folder: 'Возвраты', status: 'draft', tags: ['refund'], objective: 'Проверить полный возврат средств за заказ.', setup: 'Есть оплаченный заказ, доступный для возврата.', steps: ['Открыть заказ', 'Выбрать возврат и указать причину', 'Подтвердить полный возврат'], expected: 'Сумма возвращена. Статус заказа изменён на «Возвращён».' },
  { id: 'case-9f3c-0045', displayId: 'PAY-045', title: 'Частичный возврат', folder: 'Возвраты', status: 'active', tags: ['refund', 'regression'], objective: 'Проверить возврат за один товар из заказа.', setup: 'Заказ с двумя товарами оплачен.', steps: ['Открыть заказ', 'Выбрать один товар', 'Подтвердить возврат'], expected: 'Возвращена стоимость выбранного товара.' },
  { id: 'case-9f3c-0030', displayId: 'PAY-030', title: 'Оплата старым виджетом', folder: 'Архив', status: 'deprecated', tags: ['legacy'], objective: 'Историческая проверка старого платёжного виджета.', setup: 'Архивная версия приложения.', steps: ['Открыть старую форму', 'Провести оплату'], expected: 'Платёж зарегистрирован.' },
];
export function caseDraft(value: DemoCase): CaseDraft {
  return { title: value.title, status: value.status, tags: [...value.tags], systems: value.systems ?? 'Checkout / Web', objective: value.objective, setup: value.setup, steps: [...value.steps], expected: value.expected };
}
export function emptyResult(value: DemoCase): ResultDraft { return { result: 'not_run', tester: 'Анна Морозова', notes: '', checks: value.steps.map(() => 'none'), failNotes: value.steps.map(() => '') }; }
export function createDemoRuns(): DemoRun[] {
  const snapshots = structuredClone(demoCases.slice(0, 5));
  return [
    { id: 'run-42', name: 'Релиз 2.8 · Smoke', date: '2026-10-16', closed: false, summary: 'Проверка критического пути оплаты перед релизом 2.8.', notes: 'Стенд: staging · Chrome / Windows 11', snapshots, results: snapshots.map((item, i) => ({ ...emptyResult(item), result: i === 0 ? 'pass' : i === 1 ? 'fail' : 'not_run', notes: i === 1 ? 'QR-код не загружается на стенде.' : '' })) },
    { id: 'run-41', name: 'Возвраты · Регрессия', date: '2026-10-15', closed: true, summary: 'Проверка возвратов после обновления платёжного шлюза.', notes: 'Стенд: staging', snapshots: structuredClone(snapshots.slice(3)), results: snapshots.slice(3).map((item) => ({ ...emptyResult(item), result: 'pass' })) },
  ];
}
export function filterCases(cases: DemoCase[], filters: CaseFilters): DemoCase[] {
  const query = filters.search.trim().toLocaleLowerCase('ru');
  return cases.filter((item) => (!query || `${item.displayId} ${item.title} ${item.tags.join(' ')}`.toLocaleLowerCase('ru').includes(query)) && (!filters.status || item.status === filters.status) && (!filters.tag || item.tags.includes(filters.tag)) && (!filters.folder || item.folder === filters.folder));
}
export function nextPendingIndex(results: ResultDraft[], current: number): number | null {
  for (let offset = 1; offset <= results.length; offset++) { const index = (current + offset) % results.length; if (results[index].result === 'not_run' || results[index].result === 'in_progress') return index; }
  return null;
}
export const demoFiles: DemoFile[] = [
  { path: 'cases/Оплата картой/PAY-042.md', kind: 'modified', before: ['# Успешная оплата картой', '## Steps', '1. Открыть оформление заказа', '2. Подтвердить оплату'], after: ['# Успешная оплата картой', '## Steps', '1. Открыть оформление заказа', '2. Выбрать оплату картой', '3. Ввести данные тестовой карты и подтвердить оплату'] },
  { path: '.casewright/runs/release-2.8/001-PAY-042.md', kind: 'modified', before: ['result: not_run', 'tester: ""'], after: ['result: pass', 'tester: Анна Морозова'] },
  { path: 'cases/Возвраты/PAY-044.md', kind: 'untracked', before: [], after: ['id: case-9f3c-0044', 'status: draft', '# Возврат платежа', 'Проверить полный возврат средств за заказ.'] },
];
