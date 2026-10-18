import { useEffect, useRef, useState } from 'react';
import { CaseOperationSchema, type CaseOperation } from '../../api/contracts';
import { repositoryApi, type RepositoryApiErrorCode } from '../../api/repositoryApi';
export type UseOrganizeCaseArgs = { sessionId: string; onCompleted: (path: string | null) => void; onPendingChange: (pending: boolean) => void };
export function useOrganizeCase({ sessionId, onCompleted, onPendingChange }: UseOrganizeCaseArgs) {
  const [isPending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<RepositoryApiErrorCode | null>(null);
  const flight = useRef(false); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; onPendingChange(false); }; }, [onPendingChange]);
  const organize = async (operation: CaseOperation): Promise<boolean> => {
    if (flight.current) return false;
    const parsed = CaseOperationSchema.safeParse(operation);
    if (!parsed.success) { setErrorCode('INVALID_REQUEST'); return false; }
    flight.current = true; setPending(true); onPendingChange(true); setErrorCode(null);
    try {
      const result = await repositoryApi.organizeCase(sessionId, parsed.data);
      if (!mounted.current) return false;
      onCompleted(result.path); return true;
    } catch (error: unknown) { if (mounted.current) setErrorCode(repositoryApi.errorCodeFrom(error)); return false; }
    finally { flight.current = false; if (mounted.current) { setPending(false); onPendingChange(false); } }
  };
  return { organize, isPending, errorCode };
}
export type UseOrganizeCaseResult = ReturnType<typeof useOrganizeCase>;
