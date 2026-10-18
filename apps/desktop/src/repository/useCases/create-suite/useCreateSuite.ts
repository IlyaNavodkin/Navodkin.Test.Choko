import { useEffect, useRef, useState } from 'react';
import { SuiteCreationSchema } from '../../api/contracts';
import { repositoryApi, type RepositoryApiErrorCode } from '../../api/repositoryApi';
import { useZodForm } from '../../../shared/forms/useZodForm';
export type UseCreateSuiteArgs = { sessionId: string; initialParent: string | null; invalidMessage: string; onCreated: (path: string) => void; onPendingChange: (pending: boolean) => void };
export function useCreateSuite({ sessionId, initialParent, invalidMessage, onCreated, onPendingChange }: UseCreateSuiteArgs): UseCreateSuiteResult {
  const form = useZodForm({ initialValues: { name: '', parentResourceId: initialParent }, schema: SuiteCreationSchema.pick({ name: true, parentResourceId: true }), invalidMessage });
  const [isPending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<RepositoryApiErrorCode | null>(null);
  const flight = useRef(false); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; onPendingChange(false); }; }, [onPendingChange]);
  const create = async (workspacePath: string): Promise<boolean> => {
    if (flight.current) return false;
    const values = form.validate(); if (!values) return false;
    flight.current = true; setPending(true); onPendingChange(true); setErrorCode(null);
    try {
      const result = await repositoryApi.createSuite(sessionId, { workspacePath, ...values });
      if (!mounted.current) return false;
      onCreated(result.path); return true;
    } catch (error: unknown) { if (mounted.current) setErrorCode(repositoryApi.errorCodeFrom(error)); return false; }
    finally { flight.current = false; if (mounted.current) { setPending(false); onPendingChange(false); } }
  };
  return { form, create, isPending, errorCode };
}
export type UseCreateSuiteResult = { form: ReturnType<typeof useZodForm<{ name: string; parentResourceId: string | null }>>; create: (workspacePath: string) => Promise<boolean>; isPending: boolean; errorCode: RepositoryApiErrorCode | null };
