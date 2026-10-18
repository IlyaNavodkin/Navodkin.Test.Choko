import {
  RuntimeDiagnosticsRequestSchema,
  RuntimeDiagnosticsSchema,
  type RuntimeDiagnostics,
} from './contracts';
import {
  invokeNative,
  NativeInvokeError,
  type NativeInvoke,
} from '../../shared/infrastructure/tauri/nativeInvoke';

type RuntimeDiagnosticsApiOptions = {
  invoke: NativeInvoke;
};

export type RuntimeApiErrorCode =
  | 'NATIVE_RUNTIME_UNAVAILABLE'
  | 'INVALID_NATIVE_RESPONSE'
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED_WEBVIEW'
  | 'NATIVE_COMMAND_FAILED';

export class RuntimeApiError extends Error {
  constructor(readonly code: RuntimeApiErrorCode) {
    super(code);
    this.name = 'RuntimeApiError';
  }
}

export function createRuntimeDiagnosticsApi({
  invoke: invokeCommand,
}: RuntimeDiagnosticsApiOptions) {
  return {
    async get(): Promise<RuntimeDiagnostics> {
      const request = RuntimeDiagnosticsRequestSchema.parse({ protocolVersion: 1 });
      let response: unknown;
      try {
        response = await invokeCommand('get_runtime_diagnostics', { request });
      } catch (error: unknown) {
        if (error instanceof NativeInvokeError) {
          const code = error.code;
          throw new RuntimeApiError(
            code === 'NATIVE_RUNTIME_UNAVAILABLE' || code === 'INVALID_NATIVE_RESPONSE' ||
              code === 'INVALID_REQUEST' || code === 'UNAUTHORIZED_WEBVIEW' || code === 'NATIVE_COMMAND_FAILED'
              ? code
              : 'NATIVE_COMMAND_FAILED',
          );
        }
        throw new RuntimeApiError('NATIVE_COMMAND_FAILED');
      }

      const parsedResponse = RuntimeDiagnosticsSchema.safeParse(response);
      if (!parsedResponse.success) {
        throw new RuntimeApiError('INVALID_NATIVE_RESPONSE');
      }
      return parsedResponse.data;
    },
  };
}

export const runtimeDiagnosticsApi = createRuntimeDiagnosticsApi({
  invoke: invokeNative,
});
