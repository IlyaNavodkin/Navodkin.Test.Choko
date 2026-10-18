import { useEffect, useRef, useState } from 'react';
import { SuiteOperationSchema, type SuiteOperation, type SuitePreview, type SuiteRecovery } from '../../api/contracts';
import { repositoryApi, type RepositoryApi, type RepositoryApiErrorCode } from '../../api/repositoryApi';
export type UseOrganizeSuiteArgs = { sessionId: string; onCompleted: (path: string | null) => void; onRecovery: (recovery: SuiteRecovery) => void; onPendingChange: (pending: boolean) => void; api?: RepositoryApi };
export type UseOrganizeSuiteResult = { preview: SuitePreview | null; recovery: SuiteRecovery | null; isPending: boolean; errorCode: RepositoryApiErrorCode | null; prepare: (operation: SuiteOperation) => Promise<void>; apply: () => Promise<void>; resetPreview: () => void };
export function useOrganizeSuite({ sessionId, onCompleted, onRecovery, onPendingChange, api = repositoryApi }: UseOrganizeSuiteArgs): UseOrganizeSuiteResult {
  const [preview, setPreview] = useState<SuitePreview | null>(null);
  const [recovery, setRecovery] = useState<SuiteRecovery | null>(null);
  const [isPending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<RepositoryApiErrorCode | null>(null);
  const flight = useRef(false); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; onPendingChange(false); }; }, [onPendingChange]);
  const run = async (action: () => Promise<void>) => {
    if (flight.current || recovery) return;
    flight.current = true; setPending(true); onPendingChange(true); setErrorCode(null);
    try { await action(); } catch (error: unknown) { if (mounted.current) { setErrorCode(api.errorCodeFrom(error)); setPreview(null); } }
    finally { flight.current = false; if (mounted.current) { setPending(false); onPendingChange(false); } }
  };
  const prepare = (operation: SuiteOperation) => run(async () => {
    const parsed = SuiteOperationSchema.safeParse(operation);
    if (!parsed.success) { setErrorCode('INVALID_SUITE_OPERATION'); return; }
    const result = await api.prepareSuiteOperation(sessionId, parsed.data);
    if (mounted.current) setPreview(result);
  });
  const apply = () => run(async () => {
    if (!preview) return;
    const result = await api.applySuiteOperation(sessionId, preview.confirmation);
    if (!mounted.current) return;
    if (result.outcome === 'recoveryRequired') { setRecovery(result.recovery); setPreview(null); onRecovery(result.recovery); }
    else { setPreview(null); onCompleted(result.path); }
  });
  return { preview, recovery, isPending, errorCode, prepare, apply, resetPreview: () => { if (!flight.current && !recovery) { setPreview(null); setErrorCode(null); } } };
}
