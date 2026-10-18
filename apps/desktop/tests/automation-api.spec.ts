import { describe, expect, it } from 'vitest';
import { createAutomationApi } from '../src/automation/api/automationApi';
import { NativeInvokeError } from '../src/shared/infrastructure/tauri/nativeInvoke';
const sessionId = 'a0000000-0000-4000-8000-000000000001';
const executionId = 'a0000000-0000-4000-8000-000000000002';
const summary = { executionId, runId: '.casewright/runs/example', profileId: 'local', operation: 'run', state: 'running', reason: null, createdAt: '2026-10-16T00:00:00.000Z' };
describe('automation native facade', () => {
  it('проверяет session до invoke и отклоняет лишние поля ответа', async () => {
    let calls = 0;
    const api = createAutomationApi({ invoke: async () => { calls++; return { revision: 'a'.repeat(64), profiles: [], bindings: [], history: [], shell: true }; } });
    expect(() => api.read('../escape')).toThrow();
    expect(calls).toBe(0);
    await expect(api.read(sessionId)).rejects.toMatchObject({ code: 'INVALID_NATIVE_RESPONSE' });
  });
  it('сохраняет typed native trust error', async () => {
    const api = createAutomationApi({ invoke: async () => { throw new NativeInvokeError('AUTOMATION_UNTRUSTED'); } });
    await expect(api.read(sessionId)).rejects.toMatchObject({ code: 'AUTOMATION_UNTRUSTED' });
  });
  it('проверяет execution/run/cursor correlation', async () => {
    const api = createAutomationApi({ invoke: async () => ({ execution: { ...summary, executionId: sessionId }, cursor: 0, nextCursor: null, tests: [], catalog: null, report: null, detailsTruncated: false }) });
    await expect(api.poll(sessionId, summary.runId, executionId)).rejects.toMatchObject({ code: 'INVALID_NATIVE_RESPONSE' });
  });
  it('отмена использует отдельную команду без ожидания pending read', async () => {
    const commands: string[] = [];
    const api = createAutomationApi({ invoke: async (command) => { commands.push(command); if (command === 'read_automation') return new Promise(() => {}); return null; } });
    void api.read(sessionId);
    await expect(api.cancel(sessionId, executionId)).resolves.toBeNull();
    expect(commands).toEqual(['read_automation', 'cancel_automation']);
  });
  it('получает явный флаг усечения при bounded test details', async () => {
    const page = { execution: summary, cursor: 0, nextCursor: null, tests: [], catalog: null, report: null, detailsTruncated: true };
    const api = createAutomationApi({ invoke: async () => page });
    expect((await api.poll(sessionId, summary.runId, executionId)).detailsTruncated).toBe(true);
  });
});

