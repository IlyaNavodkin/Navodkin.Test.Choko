import { useEffect, useRef, useState } from 'react';
import { GitCommitRequestSchema, type GitCommitResult, type GitStatus } from '../../api/contracts';
import { repositoryApi, type RepositoryApi, type RepositoryApiErrorCode } from '../../api/repositoryApi';
import { useZodForm } from '../../../shared/forms/useZodForm';
export type UseCommitGitArgs = { sessionId: string; status: GitStatus | undefined; blocked: boolean; invalidMessage: string; onBusyChange: (busy: boolean) => void; onPendingChange: (pending: boolean) => void; refresh: () => void; api?: RepositoryApi };
export function useCommitGit({ sessionId, status, blocked, invalidMessage, onBusyChange, onPendingChange, refresh, api = repositoryApi }: UseCommitGitArgs) {
  const form = useZodForm({ initialValues: { fileIds: [] as string[], message: '' }, schema: GitCommitRequestSchema.pick({ fileIds: true, message: true }), invalidMessage });
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<RepositoryApiErrorCode | null>(null);
  const [result, setResult] = useState<GitCommitResult | null>(null);
  const flight = useRef(false);
  const recovery = result?.indexPublished === false || errorCode === 'GIT_RECOVERY_REQUIRED';
  const busy = pending || confirming || form.values.message.length > 0 || form.values.fileIds.length > 0;
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  const clear = () => { if (flight.current || recovery) return; setConfirming(false); form.reset({ fileIds: [], message: '' }); setErrorCode(null); };
  const canCommit = !blocked && !pending && !recovery && Boolean(status) && !status?.detached && !status?.unborn && !status?.files.some((file) => file.unmerged);
  const prepare = () => { if (canCommit && form.validate()) { setResult(null); setErrorCode(null); setConfirming(true); } };
  const commit = async () => {
    if (flight.current || !canCommit || !confirming) return;
    const values = form.validate(); if (!values || !values.fileIds.every((id) => status?.files.some((file) => file.fileId === id && file.committable))) return;
    flight.current = true; setPending(true); onPendingChange(true); setErrorCode(null);
    try { const saved = await api.gitCommit(sessionId, values.fileIds, values.message); setResult(saved); setConfirming(false); form.reset({ fileIds: [], message: '' }); if (saved.indexPublished) refresh(); }
    catch (error: unknown) { setErrorCode(api.errorCodeFrom(error)); setConfirming(false); }
    finally { flight.current = false; setPending(false); onPendingChange(false); }
  };
  const select = (id: string, checked: boolean) => { if (!canCommit || confirming || !status?.files.some((file) => file.fileId === id && file.committable)) return; const ids = new Set(form.values.fileIds); if (checked) ids.add(id); else ids.delete(id); form.setFieldValue('fileIds', [...ids]); };
  return { form, confirming, pending, errorCode, result, recovery, busy, canCommit, prepare, commit, clear, select, cancel: () => { if (!flight.current) setConfirming(false); } };
}
export type UseCommitGitResult = ReturnType<typeof useCommitGit>;
