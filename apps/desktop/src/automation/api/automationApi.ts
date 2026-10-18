import { z } from 'zod';
import { invokeNative, NativeInvokeError, type NativeInvoke, type NativeInvokeErrorCode } from '../../shared/infrastructure/tauri/nativeInvoke';
import {
  ApplyImportRequestSchema, ArchiveAutotestRequestSchema, AutomationViewSchema, AutotestRequestSchema, BindingRequestSchema, CancelRequestSchema,
  DeleteAutotestRequestSchema, EnvironmentsRequestSchema, ExecutionSummarySchema, ImportPreviewSchema, ImportRequestSchema, PollRequestSchema, PollSchema,
  PreviewRequestSchema, PreviewSchema, ProfileRequestSchema, RemoveBindingRequestSchema, ReportsRequestSchema, SavedReportSchema, SessionRequestSchema,
  StartRequestSchema, TrustRequestSchema,
  type AutomationPoll, type AutomationPreview, type AutomationStart, type AutomationView, type ExecutionSummary, type ImportPreview,
  type InvocationRequest, type SavedReport,
} from './contracts';
import type { Autotest, CaseAutotestBinding, EnvironmentEntry } from '@testoritto/playwright-automation';
import type { AutomationProfile } from '@testoritto/playwright-automation';

export class AutomationApiError extends Error {
  constructor(readonly code: NativeInvokeErrorCode) { super(code); this.name = 'AutomationApiError'; }
}
export function createAutomationApi({ invoke }: { invoke: NativeInvoke }) {
  async function call<T>(command: string, request: Record<string, unknown>, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
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
    saveAutotest: (sessionId: string, expectedRevision: string, revision: string, autotest: Autotest): Promise<AutomationView> => call('save_automation_autotest', AutotestRequestSchema.parse({ ...session(sessionId), expectedRevision, revision, autotest }), AutomationViewSchema),
    archiveAutotest: (sessionId: string, expectedRevision: string, revision: string, autotestId: string, archived: boolean): Promise<AutomationView> => call('archive_automation_autotest', ArchiveAutotestRequestSchema.parse({ ...session(sessionId), expectedRevision, revision, autotestId, archived }), AutomationViewSchema),
    deleteAutotest: (sessionId: string, expectedRevision: string, autotestId: string): Promise<AutomationView> => call('delete_automation_autotest', DeleteAutotestRequestSchema.parse({ ...session(sessionId), expectedRevision, autotestId }), AutomationViewSchema),
    saveBinding: (sessionId: string, expectedRevision: string, revision: string, binding: CaseAutotestBinding): Promise<AutomationView> => call('save_automation_binding', BindingRequestSchema.parse({ ...session(sessionId), expectedRevision, revision, binding }), AutomationViewSchema),
    removeBinding: (sessionId: string, expectedRevision: string, bindingId: string): Promise<AutomationView> => call('remove_automation_binding', RemoveBindingRequestSchema.parse({ ...session(sessionId), expectedRevision, bindingId }), AutomationViewSchema),
    saveEnvironments: (sessionId: string, expectedRevision: string, environments: EnvironmentEntry[]): Promise<AutomationView> => call('save_automation_environments', EnvironmentsRequestSchema.parse({ ...session(sessionId), expectedRevision, environments }), AutomationViewSchema),
    setTrust: (sessionId: string, profileId: string, expectedRevision: string, grant: boolean): Promise<AutomationView> => call('set_automation_trust', TrustRequestSchema.parse({ ...session(sessionId), profileId, expectedRevision, grant }), AutomationViewSchema),
    previewInvocations: (sessionId: string, runId: string, invocations: InvocationRequest[]): Promise<AutomationPreview> => call('preview_automation_invocations', PreviewRequestSchema.parse({ ...session(sessionId), runId, invocations }), PreviewSchema),
    discover: (sessionId: string, start: AutomationStart): Promise<ExecutionSummary> => call('discover_automation', StartRequestSchema.parse({ ...session(sessionId), start: { ...start, operation: 'discover', invocations: [] } }), ExecutionSummarySchema),
    start: (sessionId: string, start: AutomationStart): Promise<ExecutionSummary> => call('start_automation', StartRequestSchema.parse({ ...session(sessionId), start }), ExecutionSummarySchema),
    poll: async (sessionId: string, runId: string, executionId: string, cursor = 0): Promise<AutomationPoll> => {
      const result = await call('poll_automation', PollRequestSchema.parse({ ...session(sessionId), runId, executionId, cursor }), PollSchema);
      if (result.execution.runId !== runId || result.execution.executionId !== executionId || result.cursor !== cursor || (result.nextCursor !== null && result.nextCursor <= cursor) || result.catalog && result.catalog.executionId !== executionId) throw new AutomationApiError('INVALID_NATIVE_RESPONSE');
      return result;
    },
    cancel: (sessionId: string, executionId: string): Promise<null> => call('cancel_automation', CancelRequestSchema.parse({ ...session(sessionId), executionId }), z.null()),
    saveReports: (sessionId: string, runId: string, executionId: string): Promise<SavedReport[]> => call('save_automation_reports', ReportsRequestSchema.parse({ ...session(sessionId), runId, executionId }), z.array(SavedReportSchema).max(2)),
    previewImport: (sessionId: string, runId: string, source: string): Promise<ImportPreview> => call('preview_automation_import', ImportRequestSchema.parse({ ...session(sessionId), runId, source }), ImportPreviewSchema),
    applyImport: (sessionId: string, runId: string, source: string, expectedRevision: string): Promise<ExecutionSummary> => call('apply_automation_import', ApplyImportRequestSchema.parse({ ...session(sessionId), runId, source, expectedRevision }), ExecutionSummarySchema),
  };
}
export type AutomationApi = ReturnType<typeof createAutomationApi>;
export const automationApi = createAutomationApi({ invoke: invokeNative });
