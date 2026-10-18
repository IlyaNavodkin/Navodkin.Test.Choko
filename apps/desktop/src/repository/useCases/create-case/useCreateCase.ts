import { useEffect, useRef, useState } from 'react';
import { CaseCreationSchema, type CaseCreation } from '../../api/contracts';
import { repositoryApi, type RepositoryApiErrorCode } from '../../api/repositoryApi';

export type UseCreateCaseArgs = { sessionId: string; onCreated: (path: string) => void; onPendingChange: (pending: boolean) => void };
export function useCreateCase({ sessionId, onCreated, onPendingChange }: UseCreateCaseArgs) {
  const [isPending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<RepositoryApiErrorCode | null>(null);
  const flight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; onPendingChange(false); }; }, [onPendingChange]);
  const create = async (creation: CaseCreation): Promise<boolean> => {
    if (flight.current) return false;
    const parsed = CaseCreationSchema.safeParse(creation);
    if (!parsed.success) { setErrorCode('INVALID_CASE_EDIT'); return false; }
    flight.current = true; setPending(true); onPendingChange(true); setErrorCode(null);
    try {
      const result = await repositoryApi.createCase(sessionId, parsed.data);
      if (!mounted.current) return false;
      onCreated(result.path);
      return true;
    } catch (error: unknown) { if (mounted.current) setErrorCode(repositoryApi.errorCodeFrom(error)); return false; }
    finally { flight.current = false; if (mounted.current) { setPending(false); onPendingChange(false); } }
  };
  return { create, isPending, errorCode };
}
export type UseCreateCaseResult = ReturnType<typeof useCreateCase>;
