import { invoke, isTauri } from '@tauri-apps/api/core';
import { z } from 'zod';

const NativeCommandErrorSchema = z
  .object({
    code: z.enum([
      'AUTOMATION_UNTRUSTED', 'AUTOMATION_UNAVAILABLE', 'INVALID_REPORT', 'STALE_PROFILE', 'BUSY', 'CANCELLED', 'IO',
      'INITIALIZATION_UNAVAILABLE', 'INITIALIZATION_FAILED',
      'INVALID_RUN_EDIT', 'INVALID_RUN_CREATION', 'INVALID_CASE_EDIT', 'READ_ONLY_CASE', 'EXTERNAL_CHANGE', 'SAVE_FAILED', 'WRITE_QUEUE_FULL', 'WRITE_FLUSH_FAILED',
      'INVALID_REQUEST', 'UNAUTHORIZED_WEBVIEW', 'INVALID_SESSION', 'INVALID_RESOURCE', 'STALE_RESOURCE',
      'NOT_GIT_REPOSITORY', 'BARE_REPOSITORY', 'SELECTED_SUBDIRECTORY', 'INVALID_REPOSITORY',
      'UNSUPPORTED_VERSION', 'INVALID_CONFIG', 'UNSUPPORTED_LEGACY_FORMAT', 'GIT_FAILED', 'GIT_COMMIT_BLOCKED', 'GIT_SYNC_BLOCKED', 'GIT_DIRTY', 'GIT_NO_UPSTREAM', 'GIT_AUTH_FAILED', 'GIT_REMOTE_FAILED', 'GIT_NETWORK_FAILED', 'GIT_PUSH_REJECTED', 'GIT_ABORT_FAILED', 'GIT_IDENTITY_MISSING', 'GIT_RECOVERY_REQUIRED', 'GIT_OUTPUT_TOO_LARGE', 'GIT_UNAVAILABLE',
      'GIT_TIMED_OUT', 'INVALID_DOCUMENT', 'FILE_TOO_LARGE', 'INVALID_UTF8', 'PICKER_BUSY',
      'PICKER_FAILED', 'RECENT_HISTORY_UNAVAILABLE', 'RECENT_NOT_FOUND',
      'RECENT_REPOSITORY_MISSING', 'REPOSITORY_IO', 'INTERNAL',
    ]),
    message: z.string().min(1).max(240),
  })
  .strict();

export type NativeCommandErrorCode = z.infer<typeof NativeCommandErrorSchema>['code'];
export type NativeInvokeErrorCode = NativeCommandErrorCode | 'NATIVE_RUNTIME_UNAVAILABLE' | 'INVALID_NATIVE_RESPONSE' | 'NATIVE_COMMAND_FAILED';
export type NativeInvoke = (command: string, args: Record<string, unknown>) => Promise<unknown>;

export class NativeInvokeError extends Error {
  constructor(readonly code: NativeInvokeErrorCode) {
    super(code);
    this.name = 'NativeInvokeError';
  }
}

type NativeInvokeOptions = {
  isNativeRuntime: boolean;
  invoke: NativeInvoke;
};

export function createNativeInvoke({ isNativeRuntime, invoke: invokeCommand }: NativeInvokeOptions) {
  return async (command: string, args: Record<string, unknown> = {}): Promise<unknown> => {
    if (!isNativeRuntime) {
      throw new NativeInvokeError('NATIVE_RUNTIME_UNAVAILABLE');
    }

    try {
      return await invokeCommand(command, args);
    } catch (error: unknown) {
      const parsedError = NativeCommandErrorSchema.safeParse(error);
      throw new NativeInvokeError(
        parsedError.success ? parsedError.data.code : 'NATIVE_COMMAND_FAILED',
      );
    }
  };
}

const invokeCommand: NativeInvoke = (command, args) => invoke<unknown>(command, args);

export const invokeNative = createNativeInvoke({
  isNativeRuntime: isTauri(),
  invoke: invokeCommand,
});
