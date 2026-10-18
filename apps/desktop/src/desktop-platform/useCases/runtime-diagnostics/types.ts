import type { RuntimeDiagnostics } from '../../api/contracts';
import type { RuntimeApiError } from '../../api/runtimeDiagnosticsApi';

export type UseRuntimeDiagnosticsArgs = Record<string, never>;

export type UseRuntimeDiagnosticsResult = {
  diagnostics: RuntimeDiagnostics | undefined;
  error: RuntimeApiError | null;
  isError: boolean;
  isLoading: boolean;
  isNativeRuntime: boolean;
  isRetrying: boolean;
  retry: () => void;
};
