import { useRef, useState } from 'react';
import type { GitStatus, GitSyncAction, GitSyncResult } from '../../api/contracts';
import { repositoryApi, type RepositoryApi, type RepositoryApiErrorCode } from '../../api/repositoryApi';
export type UseSyncGitArgs = { sessionId: string; status: GitStatus | undefined; blocked: boolean; onApplied: (result: GitSyncResult) => Promise<void>; refresh: () => void; api?: RepositoryApi };
export function useSyncGit({ sessionId, status, blocked, onApplied, refresh, api = repositoryApi }: UseSyncGitArgs) {
  const [confirming, setConfirming] = useState<{ action: GitSyncAction; token: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<RepositoryApiErrorCode | null>(null);
  const [result, setResult] = useState<GitSyncResult | null>(null);
  const flight = useRef(false);
  const conflict = Boolean(status?.abortToken || result?.outcome === 'conflict');
  const recovery = Boolean(status?.syncBlocked && !status.abortToken || result?.reloadRequired || errorCode === 'GIT_RECOVERY_REQUIRED' || errorCode === 'GIT_ABORT_FAILED');
  const canSync = !blocked && !pending && !conflict && !recovery && Boolean(status?.syncToken);
  const abortToken = status?.abortToken ?? (result?.outcome === 'conflict' ? result.abortToken : null);
  const prepare = (action: GitSyncAction) => {
    if (flight.current || blocked || (action === 'abort' ? !abortToken || recovery : !canSync)) return;
    const token = action === 'abort' ? abortToken : status?.syncToken;
    if (token) { setErrorCode(null); setConfirming({ action, token }); }
  };
  const execute = async () => {
    if (flight.current || !confirming || blocked) return;
    flight.current = true; setPending(true); setErrorCode(null);
    try {
      const applied = await api.gitSync(sessionId, confirming.token, confirming.action);
      setResult(applied); setConfirming(null);
      if (applied.outcome === 'pulled' || applied.outcome === 'aborted') await onApplied(applied);
      refresh();
    } catch (error: unknown) { setErrorCode(api.errorCodeFrom(error)); setConfirming(null); refresh(); }
    finally { flight.current = false; setPending(false); }
  };
  return { confirming, pending, errorCode, result, conflict, recovery, abortToken, canSync, prepare, execute, busy: pending || confirming !== null || conflict || recovery, cancel: () => { if (!flight.current) setConfirming(null); } };
}
export type UseSyncGitResult = ReturnType<typeof useSyncGit>;
