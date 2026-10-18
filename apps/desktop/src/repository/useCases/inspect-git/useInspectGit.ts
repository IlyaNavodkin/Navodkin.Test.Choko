import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { repositoryApi, RepositoryApiError, type RepositoryApi } from '../../api/repositoryApi';
export type UseInspectGitArgs = { sessionId: string; api?: RepositoryApi };
export function useInspectGit({ sessionId, api = repositoryApi }: UseInspectGitArgs) {
  const client = useQueryClient();
  const [epoch, setEpoch] = useState(0);
  const [fileId, setFileId] = useState<string | null>(null);
  const root = ['repository', sessionId, 'git'] as const;
  const status = useQuery({ queryKey: [...root, 'status', epoch], queryFn: () => api.gitStatus(sessionId), staleTime: Infinity, refetchOnMount: 'always', refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false });
  const selectedPath = useRef<string | null>(null);
  useEffect(() => {
    if (!status.data || status.isFetching) return;
    const current = status.data.files.find((file) => file.fileId === fileId);
    if (current) selectedPath.current = current.path;
    else if (selectedPath.current) {
      setFileId(status.data.files.find((file) => file.path === selectedPath.current)?.fileId ?? null);
    }
  }, [status.data, status.isFetching, fileId]);
  const diff = useQuery({ queryKey: [...root, 'diff', epoch, fileId], queryFn: async () => { const expected = status.data?.files.find((file) => file.fileId === fileId); if (!expected) throw new RepositoryApiError('INVALID_RESOURCE'); const result = await api.gitDiff(sessionId, expected.fileId); if (result.path !== expected.path) throw new RepositoryApiError('INVALID_NATIVE_RESPONSE'); return result; }, enabled: Boolean(fileId) && !status.isFetching && !status.error, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false });
  return { status: status.data, diff: diff.data, fileId, isLoading: status.isFetching, isDiffLoading: diff.isFetching,
    errorCode: status.error ? api.errorCodeFrom(status.error) : null, diffErrorCode: diff.error ? api.errorCodeFrom(diff.error) : null,
    select: (id: string) => { if (!status.isFetching && status.data?.files.some((file) => file.fileId === id)) setFileId(id); },
    refresh: () => { if (status.isFetching) return; selectedPath.current = null; setFileId(null); void client.cancelQueries({ queryKey: root }); client.removeQueries({ queryKey: root }); setEpoch((value) => value + 1); },
    retryDiff: () => { void diff.refetch(); },
  };
}
export type UseInspectGitResult = ReturnType<typeof useInspectGit>;
