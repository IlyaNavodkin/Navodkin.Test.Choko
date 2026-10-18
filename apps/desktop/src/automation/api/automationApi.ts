import { z } from 'zod';
import { invokeNative, NativeInvokeError, type NativeInvoke, type NativeInvokeErrorCode } from '../../shared/infrastructure/tauri/nativeInvoke';
import { AutomationViewSchema, ExecutionSummarySchema, PollSchema, SessionRequestSchema, ProfileRequestSchema, BindingsRequestSchema, TrustRequestSchema, StartRequestSchema, PollRequestSchema, CancelRequestSchema, type AutomationStart, type AutomationView, type AutomationPoll, type ExecutionSummary, type AutomationProfile } from './contracts';
import type { z as Zod } from 'zod';
import type { BindingSchema } from '@testoritto/playwright-automation';
export class AutomationApiError extends Error {
  constructor(readonly code: NativeInvokeErrorCode) { super(code); this.name = 'AutomationApiError'; }
}
export function createAutomationApi({ invoke }: { invoke: NativeInvoke }) {
  async function call<T>(command: string, request: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    let raw: unknown;
    try { raw = await invoke(command, { request }); }
    catch (error: unknown) { throw new AutomationApiError(error instanceof NativeInvokeError ? error.code : 'NATIVE_COMMAND_FAILED'); }
    const result = schema.safeParse(raw);
    if (!result.success) throw new AutomationApiError('INVALID_NATIVE_RESPONSE');
    return result.data;
  }
  const session = (sessionId: string) => ({ protocolVersion: 1 as const, sessionId });
  return {
    read: (sessionId: string): Promise<AutomationView> => call('read_automation', SessionRequestSchema.parse(session(sessionId)), AutomationViewSchema),
    saveProfile: (sessionId: string, expectedRevision: string, profile: AutomationProfile, nodePath: string): Promise<AutomationView> => call('save_automation_profile', ProfileRequestSchema.parse({ ...session(sessionId), expectedRevision, profile, nodePath }), AutomationViewSchema),
    saveBindings: (sessionId: string, expectedRevision: string, bindings: Zod.infer<typeof BindingSchema>[]): Promise<AutomationView> => call('save_automation_bindings', BindingsRequestSchema.parse({ ...session(sessionId), expectedRevision, bindings }), AutomationViewSchema),
    setTrust: (sessionId: string, profileId: string, expectedRevision: string, grant: boolean): Promise<AutomationView> => call('set_automation_trust', TrustRequestSchema.parse({ ...session(sessionId), profileId, expectedRevision, grant }), AutomationViewSchema),
    discover: (sessionId: string, start: AutomationStart): Promise<ExecutionSummary> => call('discover_automation', StartRequestSchema.parse({ ...session(sessionId), start: { ...start, operation: 'discover' } }), ExecutionSummarySchema),
    start: (sessionId: string, start: AutomationStart): Promise<ExecutionSummary> => call('start_automation', StartRequestSchema.parse({ ...session(sessionId), start }), ExecutionSummarySchema),
    poll: async (sessionId: string, runId: string, executionId: string, cursor = 0): Promise<AutomationPoll> => {
      const result = await call('poll_automation', PollRequestSchema.parse({ ...session(sessionId), runId, executionId, cursor }), PollSchema);
      if (result.execution.runId !== runId || result.execution.executionId !== executionId || result.cursor !== cursor || (result.nextCursor !== null && result.nextCursor <= cursor) || result.catalog && result.catalog.executionId !== executionId) throw new AutomationApiError('INVALID_NATIVE_RESPONSE');
      return result;
    },
    cancel: (sessionId: string, executionId: string): Promise<null> => call('cancel_automation', CancelRequestSchema.parse({ ...session(sessionId), executionId }), z.null()),
  };
}
export type AutomationApi = ReturnType<typeof createAutomationApi>;
export const automationApi = createAutomationApi({ invoke: invokeNative });
