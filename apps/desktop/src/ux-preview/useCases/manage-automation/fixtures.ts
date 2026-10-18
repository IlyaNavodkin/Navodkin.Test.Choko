import type { Autotest, CaseAutotestBinding } from '@testoritto/playwright-automation';
import type { AutomationProfile } from '@testoritto/playwright-automation';
import type { AttemptPlan, DiscoveryCatalog, DiscoveryTest } from './types';

export const demoProfile: AutomationProfile = {
  schemaVersion: 1, profileId: 'playwright-web', label: 'Веб-приложение (Playwright)',
  cwd: '.', config: 'playwright.config.ts', projects: ['chromium', 'firefox'],
  timeoutMs: 600_000, retries: 1, workers: 2,
};

const IDS = {
  autotests: ['11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000002', '11111111-1111-4111-8111-000000000003', '11111111-1111-4111-8111-000000000004', '11111111-1111-4111-8111-000000000005'],
  bindings: ['22222222-2222-4222-8222-000000000001', '22222222-2222-4222-8222-000000000002', '22222222-2222-4222-8222-000000000003', '22222222-2222-4222-8222-000000000004', '22222222-2222-4222-8222-000000000005', '22222222-2222-4222-8222-000000000006'],
} as const;

export const autotestIds = IDS.autotests;

export function demoAutotests(): Autotest[] {
  const base = { schemaVersion: 2 as const, archived: false, revision: 'rev-1' };
  return [
    { ...base, id: IDS.autotests[0], title: 'Оплата картой (e2e)', description: 'Сквозная оплата картой на выбранном стенде.', profileId: demoProfile.profileId,
      selector: { automationId: 'PAY-042-auto', project: 'chromium', variantId: 'default' },
      argumentDefinitions: [
        { key: 'baseUrl', label: 'Адрес стенда', description: 'База приложения', type: 'string', format: 'url', required: true },
        { key: 'cardNumber', label: 'Номер карты', description: 'Тестовая карта', type: 'string', required: true, default: '4242 4242 4242 4242' },
        { key: 'timeoutMs', label: 'Таймаут шага', description: 'Ожидание ответа шлюза', type: 'number', required: false, min: 1000, max: 60_000, default: 15_000 },
        { key: 'browser', label: 'Браузер', description: 'Проект Playwright', type: 'enum', required: false, options: ['chromium', 'firefox'], default: 'chromium' },
      ],
      defaults: { timeoutMs: { kind: 'literal', value: 15_000 } } },
    { ...base, id: IDS.autotests[1], title: 'Оплата через СБП', description: 'Переход к оплате по QR-коду и подтверждение в банке.', profileId: demoProfile.profileId,
      selector: { automationId: 'PAY-041-auto', project: 'chromium', variantId: 'default' },
      argumentDefinitions: [
        { key: 'baseUrl', label: 'Адрес стенда', description: 'База приложения', type: 'string', format: 'url', required: true },
        { key: 'bankHost', label: 'Хост банка', description: 'Адрес тестового банка', type: 'string', format: 'ip', required: false },
        { key: 'retries', label: 'Повторы на шаг', description: 'Сколько раз повторять шаг', type: 'number', required: false, min: 0, max: 5 },
      ],
      defaults: {} },
    { ...base, id: IDS.autotests[2], title: 'Отклонённая карта (ожидаемая ошибка)', description: 'Тест ожидает статус failed: проверяется сообщение об отказе.', profileId: demoProfile.profileId,
      selector: { automationId: 'PAY-043-auto', project: 'chromium', variantId: 'default' },
      argumentDefinitions: [
        { key: 'baseUrl', label: 'Адрес стенда', description: '', type: 'string', format: 'url', required: true },
        { key: 'expectMessage', label: 'Текст ошибки', description: '', type: 'string', required: false, default: 'Недостаточно средств' },
      ],
      defaults: {} },
    { ...base, id: IDS.autotests[3], title: 'Возврат платежа', description: 'Полный возврат средств за оплаченный заказ.', profileId: demoProfile.profileId,
      selector: { automationId: 'PAY-044-auto', project: 'firefox', variantId: 'default' },
      argumentDefinitions: [
        { key: 'baseUrl', label: 'Адрес стенда', description: '', type: 'string', format: 'url', required: true },
        { key: 'reason', label: 'Причина возврата', description: '', type: 'string', required: false },
      ],
      defaults: {} },
    { ...base, id: IDS.autotests[4], title: 'Оплата старым виджетом', description: 'Архивный тест: новые запуски запрещены, исторические результаты читаемы.', archived: true, profileId: demoProfile.profileId,
      selector: { automationId: 'PAY-030-auto', project: 'chromium', variantId: 'legacy' },
      argumentDefinitions: [{ key: 'baseUrl', label: 'Адрес стенда', description: '', type: 'string', format: 'url', required: true }],
      defaults: {} },
  ];
}

/** Bindings spread over the demo cases: several per case, one autotest reused in two cases, blocked and disabled rows. */
export function demoBindings(): CaseAutotestBinding[] {
  const base = { schemaVersion: 2 as const, revision: 'rev-1' };
  // Environment ids of the glossary fixtures: 5 = Prod, 6 = Stage.
  const prod = '00000000-0000-4000-8000-000000000005';
  const stage = '00000000-0000-4000-8000-000000000006';
  return [
    { ...base, id: IDS.bindings[0], caseId: 'case-9f3c-0042', autotestId: IDS.autotests[0], enabled: true, argumentOverrides: { baseUrl: { kind: 'environment', entryId: stage, key: 'baseUrl' }, cardNumber: { kind: 'literal', value: '4000 0000 0000 0002' } } },
    { ...base, id: IDS.bindings[1], caseId: 'case-9f3c-0042', autotestId: IDS.autotests[1], enabled: true, argumentOverrides: { baseUrl: { kind: 'environment', entryId: stage, key: 'baseUrl' } } },
    { ...base, id: IDS.bindings[2], caseId: 'case-9f3c-0041', autotestId: IDS.autotests[1], enabled: true, argumentOverrides: { baseUrl: { kind: 'environment', entryId: prod, key: 'baseUrl' }, bankHost: { kind: 'environment', entryId: prod, key: 'host' }, retries: { kind: 'literal', value: 2 } } },
    { ...base, id: IDS.bindings[3], caseId: 'case-9f3c-0043', autotestId: IDS.autotests[2], enabled: true, argumentOverrides: { baseUrl: { kind: 'literal', value: 'https://stage.pay.example.com' } } },
    // Disabled on purpose: the missing required baseUrl stays visible as a diagnostic instead of a broken run.
    { ...base, id: IDS.bindings[4], caseId: 'case-9f3c-0044', autotestId: IDS.autotests[3], enabled: false, argumentOverrides: { reason: { kind: 'literal', value: 'Проверка частичного возврата' } } },
    { ...base, id: IDS.bindings[5], caseId: 'case-9f3c-0030', autotestId: IDS.autotests[4], enabled: true, argumentOverrides: {} },
  ];
}

/** Trusted discovery result of the demo profile: one test is not in the catalog yet. */
export function demoDiscovery(): DiscoveryCatalog {
  const caseIds: Record<string, string> = {
    'PAY-042-auto': 'case-9f3c-0042', 'PAY-041-auto': 'case-9f3c-0041', 'PAY-043-auto': 'case-9f3c-0043',
    'PAY-044-auto': 'case-9f3c-0044', 'PAY-045-auto': 'case-9f3c-0045', 'PAY-030-auto': 'case-9f3c-0030',
  };
  const key = (automationId: string, project: string, variantId = 'default') => ({ caseId: caseIds[automationId] ?? automationId, automationId, project, variantId });
  const tests: DiscoveryTest[] = [
    { key: key('PAY-042-auto', 'chromium'), title: 'Оплата картой', file: 'tests/pay/card.spec.ts', expectedStatus: 'passed' },
    { key: key('PAY-042-auto', 'firefox'), title: 'Оплата картой', file: 'tests/pay/card.spec.ts', expectedStatus: 'passed' },
    { key: key('PAY-041-auto', 'chromium'), title: 'Оплата через СБП', file: 'tests/pay/sbp.spec.ts', expectedStatus: 'passed' },
    { key: key('PAY-043-auto', 'chromium'), title: 'Отклонённая карта', file: 'tests/pay/declined.spec.ts', expectedStatus: 'failed' },
    { key: key('PAY-044-auto', 'firefox'), title: 'Возврат платежа', file: 'tests/refund/full.spec.ts', expectedStatus: 'passed' },
    { key: key('PAY-045-auto', 'chromium'), title: 'Частичный возврат', file: 'tests/refund/partial.spec.ts', expectedStatus: 'passed' },
    { key: key('PAY-030-auto', 'chromium', 'legacy'), title: 'Оплата старым виджетом', file: 'tests/legacy/widget.spec.ts', expectedStatus: 'passed' },
  ];
  return { catalogRevision: 'catalog-9f3c2a71', tests, dependencies: ['setup:auth'] };
}

/** Deterministic simulated outcomes: flaky repeats, an unexpected fail, a timeout and a skip. */
export const demoScript: Record<string, AttemptPlan[]> = {
  'PAY-042-auto:default': ['passed'],
  'PAY-041-auto:default': ['failed', 'passed'],
  'PAY-043-auto:default': ['failed'],
  'PAY-044-auto:default': ['timedOut'],
  'PAY-045-auto:default': ['skipped'],
  'PAY-030-auto:legacy': ['passed'],
};

export const demoAttachmentNames = ['trace.zip', 'screenshot.png', 'console.html'];

/** Deterministic 64-hex digest for demo revisions (the contracts require a real hash shape). */
export function demoHash(seed: string): string {
  let state = 0x811c9dc5;
  let out = '';
  for (let block = 0; block < 8; block++) {
    for (const char of `${seed}:${block}`) { state ^= char.codePointAt(0) ?? 0; state = Math.imul(state, 0x01000193) >>> 0; }
    out += state.toString(16).padStart(8, '0');
  }
  return out.slice(0, 64);
}
export const demoRunId = '.casewright/runs/release-2.8';
export const demoSource = { commit: demoHash('commit:release-2.8'), branch: 'main', dirty: true };
