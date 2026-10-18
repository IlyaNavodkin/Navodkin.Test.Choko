import { describe, expect, it } from 'vitest';
import { createAutomationApi } from '../src/automation/api/automationApi';
import { NativeInvokeError } from '../src/shared/infrastructure/tauri/nativeInvoke';
const sessionId = 'a0000000-0000-4000-8000-000000000001';
const executionId = 'a0000000-0000-4000-8000-000000000002';
const summary = { executionId, runId: '.casewright/runs/example', profileId: 'local', operation: 'run', state: 'running', reason: null, createdAt: '2026-10-18T00:00:00.000Z' };
const autotest = {
  schemaVersion: 2, id: '11111111-1111-4111-8111-000000000001', title: 'Оплата картой', description: '', archived: false, revision: 'rev-1', profileId: 'local',
  selector: { automationId: 'A1', project: 'unit', variantId: 'default' },
  argumentDefinitions: [{ key: 'baseUrl', label: 'Адрес стенда', description: '', required: true, type: 'string', format: 'url' }], defaults: {},
};
const binding = { schemaVersion: 2, id: '22222222-2222-4222-8222-000000000001', caseId: 'C1', autotestId: autotest.id, revision: 'rev-1', enabled: true, argumentOverrides: {} };
describe('automation native facade', () => {
  it('проверяет session до invoke и отклоняет лишние поля ответа', async () => {
    let calls = 0;
    const api = createAutomationApi({ invoke: async () => { calls++; return { revision: 'a'.repeat(64), profiles: [], autotests: [], bindings: [], environments: [], history: [], shell: true }; } });
    expect(() => api.read('../escape')).toThrow();
    expect(calls).toBe(0);
    await expect(api.read(sessionId)).rejects.toMatchObject({ code: 'INVALID_NATIVE_RESPONSE' });
  });
  it('сохраняет typed native trust error', async () => {
    const api = createAutomationApi({ invoke: async () => { throw new NativeInvokeError('AUTOMATION_UNTRUSTED'); } });
    await expect(api.read(sessionId)).rejects.toMatchObject({ code: 'AUTOMATION_UNTRUSTED' });
  });
  it('проверяет execution/run/cursor correlation в version 2 ответе', async () => {
    const api = createAutomationApi({ invoke: async () => ({ execution: { ...summary, executionId: sessionId }, cursor: 0, nextCursor: null, tests: [], invocations: [], catalog: null, report: null, detailsTruncated: false }) });
    await expect(api.poll(sessionId, summary.runId, executionId)).rejects.toMatchObject({ code: 'INVALID_NATIVE_RESPONSE' });
  });
  it('отмена использует отдельную команду без ожидания pending read', async () => {
    const commands: string[] = [];
    const api = createAutomationApi({ invoke: async (command) => { commands.push(command); if (command === 'read_automation') return new Promise(() => {}); return null; } });
    void api.read(sessionId);
    await expect(api.cancel(sessionId, executionId)).resolves.toBeNull();
    expect(commands).toEqual(['read_automation', 'cancel_automation']);
  });
  it('публикует preview invocation с диагностиками и отчёты папки прогона', async () => {
    const commands: string[] = [];
    const api = createAutomationApi({
      invoke: async (command) => {
        commands.push(command);
        if (command === 'preview_automation_invocations') return { snapshots: [], issues: [{ bindingId: binding.id, code: 'REQUIRED', key: 'baseUrl' }] };
        if (command === 'save_automation_reports') return [{ name: 'report.json', relativePath: `${summary.runId}/automation/${executionId}/report.json`, size: 10, sha256: 'c'.repeat(64) }];
        throw new NativeInvokeError('NATIVE_COMMAND_FAILED');
      },
    });
    const preview = await api.previewInvocations(sessionId, summary.runId, [{ bindingId: binding.id }]);
    expect(preview.issues[0]).toMatchObject({ code: 'REQUIRED', key: 'baseUrl' });
    const saved = await api.saveReports(sessionId, summary.runId, executionId);
    expect(saved[0]?.name).toBe('report.json');
    expect(commands).toEqual(['preview_automation_invocations', 'save_automation_reports']);
  });
  it('передаёт v2-аргументы запуска, импорт с revision и отвергает невалидный payload', async () => {
    const requests: { command: string; args: unknown }[] = [];
    const api = createAutomationApi({
      invoke: async (command, args) => {
        requests.push({ command, args });
        if (command === 'start_automation') return summary;
        if (command === 'preview_automation_import') return { sourceHash: 'd'.repeat(64), schemaVersion: 1, sourceRunId: summary.runId, foreignRun: false, duplicateImport: false, matched: 1, rows: [] };
        if (command === 'apply_automation_import') return summary;
        throw new NativeInvokeError('NATIVE_COMMAND_FAILED');
      },
    });
    await api.start(sessionId, { profileId: 'local', profileRevision: 'a'.repeat(64), runId: summary.runId, operation: 'run', catalogExecutionId: executionId, catalogRevision: 'b'.repeat(64), invocations: [{ bindingId: binding.id, runOverrides: {} }], parentExecutionId: null, preview: [] });
    const started = requests[0]?.args as { request: { start: { invocations: unknown[] } } };
    expect(started.request.start.invocations).toEqual([{ bindingId: binding.id, runOverrides: {} }]);
    await api.previewImport(sessionId, summary.runId, '{"schemaVersion":1}');
    await api.applyImport(sessionId, summary.runId, '{"schemaVersion":1}', 'a'.repeat(64));
    expect(requests.map((item) => item.command)).toEqual(['start_automation', 'preview_automation_import', 'apply_automation_import']);
    expect(() => api.saveAutotest(sessionId, 'a'.repeat(64), 'rev-1', { ...autotest, selector: { ...autotest.selector, automationId: '' } } as never)).toThrow();
    expect(() => api.saveBinding(sessionId, 'a'.repeat(64), 'rev-1', { ...binding, caseId: '' } as never)).toThrow();
  });
});
