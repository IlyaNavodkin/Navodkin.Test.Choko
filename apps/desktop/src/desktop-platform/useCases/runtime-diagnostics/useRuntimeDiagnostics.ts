import { isTauri } from '@tauri-apps/api/core';
import { useQuery } from '@tanstack/react-query';
import { runtimeDiagnosticsApi, RuntimeApiError } from '../../api/runtimeDiagnosticsApi';
import type { UseRuntimeDiagnosticsArgs, UseRuntimeDiagnosticsResult } from './types';

const RUNTIME_DIAGNOSTICS_QUERY_KEY = ['desktop-platform', 'runtime-diagnostics'] as const;

export function useRuntimeDiagnostics(
  _args: UseRuntimeDiagnosticsArgs = {},
): UseRuntimeDiagnosticsResult {
  const query = useQuery({
    queryKey: RUNTIME_DIAGNOSTICS_QUERY_KEY,
    queryFn: runtimeDiagnosticsApi.get,
    enabled: isTauri(),
    retry: false,
  });

  return {
    diagnostics: query.data,
    error: query.error instanceof RuntimeApiError ? query.error : null,
    isError: query.isError,
    isLoading: query.isPending && isTauri(),
    isNativeRuntime: isTauri(),
    isRetrying: query.isFetching,
    retry: () => void query.refetch(),
  };
}
