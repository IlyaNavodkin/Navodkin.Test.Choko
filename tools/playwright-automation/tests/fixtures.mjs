export const key = { caseId: 'C1', automationId: 'A1', project: 'unit', variantId: 'default' };
export const attempt = (status = 'passed') => ({ retry: 0, repeatEachIndex: 0, status, startedAt: '2026-10-16T00:00:00.000Z', durationMs: 1, errors: [], stdout: '', stderr: '', attachments: [] });
export const manifest = () => ({ schemaVersion: 1, operation: 'run', runId: 'runs/example', executionId: 'a0000000-0000-4000-8000-000000000001', parentExecutionId: null, profileId: 'local', profileRevision: 'a'.repeat(64), catalogRevision: 'b'.repeat(64), createdAt: '2026-10-16T00:00:00.000Z', source: { commit: null, branch: null, dirty: false }, selection: [key], profile: { schemaVersion: 1, profileId: 'local', label: 'Local', cwd: '.', config: 'playwright.config.mjs', projects: ['unit'], timeoutMs: 60000, retries: 1, workers: 1 }, outputRoot: 'C:/temporary/execution' });
export const report = () => { const { outputRoot, profile, operation, ...correlation } = manifest(); return { ...correlation, state: 'completed', reason: null, startedAt: correlation.createdAt, finishedAt: correlation.createdAt, complete: true, tests: [{ ...key, title: 'Example', file: 'example.spec.mjs', expectedStatus: 'passed', outcome: 'expected', attempts: [attempt()] }], runnerErrors: [], logs: { stdout: '', stderr: '', truncated: false }, attachments: [] }; };
export const autotestV2 = (id, automationId, overrides = []) => ({
  schemaVersion: 2, id, title: `Автотест ${automationId}`, description: '', archived: false, revision: 'rev-1', profileId: 'local',
  selector: { automationId, project: 'unit', variantId: 'default' },
  argumentDefinitions: [{ key: 'baseUrl', label: 'Адрес стенда', description: '', required: true, type: 'string', format: 'url' }],
  defaults: Object.fromEntries(overrides),
});
export const environmentV2 = (id, baseUrl, revision = 'env-1') => ({ id, kind: 'environment', title: `Окружение ${revision}`, description: '', archived: false, revision, values: { baseUrl } });
export const invocationV2 = ({ invocationId, automationId = 'A1', caseId = `C-${automationId}`, autotestId = '11111111-1111-4111-8111-000000000001', baseUrl = 'https://stage.example', environmentId = '33333333-3333-4333-8333-000000000001' }) => ({
  schemaVersion: 2, invocationId, createdAt: '2026-10-18T00:00:00.000Z', caseRevision: 'case-rev-1',
  autotest: autotestV2(autotestId, automationId),
  binding: { schemaVersion: 2, id: '22222222-2222-4222-8222-000000000001', caseId, autotestId, revision: 'rev-1', enabled: true, argumentOverrides: { baseUrl: { kind: 'environment', entryId: environmentId, key: 'baseUrl' } } },
  runOverrides: {},
  environments: [environmentV2(environmentId, baseUrl)],
  resolvedArguments: { baseUrl },
  sources: [{ key: 'baseUrl', layer: 'binding', reference: { kind: 'environment', entryId: environmentId, key: 'baseUrl' }, revision: 'env-1' }],
});
export const manifestV2 = (invocations, catalogRevision) => { const { selection: _selection, ...base } = manifest(); return { ...base, schemaVersion: 2, catalogRevision, invocations, sourceKind: 'run' }; };
