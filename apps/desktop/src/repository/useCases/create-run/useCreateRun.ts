import { useEffect, useRef, useState } from 'react';
import { RunCreationSchema, type RunCreation } from '../../api/contracts';
import { repositoryApi, type RepositoryApiErrorCode } from '../../api/repositoryApi';
import { useZodForm } from '../../../shared/forms/useZodForm';
export type UseCreateRunArgs = { sessionId: string; initialValues: RunCreation; invalidMessage: string; onCreated: (runId: string) => void; onPendingChange: (pending: boolean) => void };
export function useCreateRun({ sessionId, initialValues, invalidMessage, onCreated, onPendingChange }: UseCreateRunArgs) {
  const form = useZodForm({ initialValues, schema: RunCreationSchema, invalidMessage });
  const [isPending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<RepositoryApiErrorCode | null>(null);
  const mounted = useRef(true); const flight = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; onPendingChange(false); }; }, [onPendingChange]);
  const create = async () => {
    if (flight.current) return;
    const creation = form.validate(); if (!creation) return;
    flight.current = true; setPending(true); onPendingChange(true); setErrorCode(null);
    try { const result = await repositoryApi.createRun(sessionId, creation); if (mounted.current) onCreated(result.runId); }
    catch (error: unknown) { if (mounted.current) setErrorCode(repositoryApi.errorCodeFrom(error)); }
    finally { flight.current = false; if (mounted.current) { setPending(false); onPendingChange(false); } }
  };
  return { form, create, isPending, errorCode };
}
export type UseCreateRunResult = ReturnType<typeof useCreateRun>;
