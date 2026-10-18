import { useEffect, useRef, useState } from 'react';
import { listenRepositoryChanges, type RepositoryChangeListener } from '../../api/repositoryEvents';
import type { RepositoryChange } from '../../api/contracts';
import type { RepositoryApiErrorCode } from '../../api/repositoryApi';

export type UseRepositoryChangesArgs = {
  sessionId: string; enabled: boolean; blocked: boolean;
  refresh: (sessionId: string, isCurrent: () => boolean) => Promise<void>;
  errorCodeFrom: (error: unknown) => RepositoryApiErrorCode;
  subscribe?: RepositoryChangeListener;
};
export type UseRepositoryChangesResult = { pending: boolean; healthFailed: boolean; errorCode: RepositoryApiErrorCode | null; retry: () => void };
export function useRepositoryChanges({ sessionId, enabled, blocked, refresh, errorCodeFrom, subscribe = listenRepositoryChanges }: UseRepositoryChangesArgs): UseRepositoryChangesResult {
  const [requested, setRequested] = useState(0);
  const [applied, setApplied] = useState(0);
  const [healthFailed, setHealthFailed] = useState(false);
  const [errorCode, setErrorCode] = useState<RepositoryApiErrorCode | null>(null);
  const latest = useRef({ sessionId, enabled, blocked, refresh, errorCodeFrom }); latest.current = { sessionId, enabled, blocked, refresh, errorCodeFrom };
  const generation = useRef(0);
  const flight = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const attempted = useRef(-1);
  const [completed, setCompleted] = useState(0);
  const listenerFailed = useRef(false);
  const lastEvent = useRef<RepositoryChange | null>(null);
  const lastEpoch = useRef(0);
  useEffect(() => {
    generation.current += 1;
    setRequested(0); setApplied(0); setErrorCode(null); setHealthFailed(listenerFailed.current); lastEpoch.current = 0; attempted.current = -1;
    const event = lastEvent.current;
    if (event?.sessionId === sessionId) { setHealthFailed(listenerFailed.current || Boolean(event.errorCode)); lastEpoch.current = event.epoch; setRequested(1); }
    return () => { generation.current += 1; };
  }, [sessionId]);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false; let release: (() => void) | undefined;
    // Register before a repository is picked. Keep one latest hint across the open IPC gap.
    void subscribe((event) => {
      if (disposed) return;
      lastEvent.current = event;
      if (event.sessionId !== latest.current.sessionId || event.epoch <= lastEpoch.current) return;
      lastEpoch.current = event.epoch;
      if (event.errorCode) setHealthFailed(true);
      setRequested((value) => value + 1);
    }, () => { if (!disposed) { listenerFailed.current = true; setHealthFailed(true); } }).then((unlisten) => {
      if (disposed) unlisten(); else release = unlisten;
    }).catch(() => { if (!disposed) { listenerFailed.current = true; setHealthFailed(true); } });
    return () => { disposed = true; release?.(); };
  }, [enabled, subscribe]);
  useEffect(() => {
    if (!enabled || !sessionId || blocked || requested === applied || flight.current || attempted.current === requested) return;
    const version = generation.current;
    const isCurrent = () => version === generation.current && latest.current.enabled && latest.current.sessionId === sessionId && !latest.current.blocked;
    const timer = setTimeout(() => {
      if (!isCurrent() || flight.current) return;
      flight.current = true; attempted.current = requested;
      void latest.current.refresh(sessionId, isCurrent).then(() => {
        if (isCurrent()) { setApplied(requested); setErrorCode(null); }
        else if (version === generation.current) attempted.current = -1;
      }).catch((error: unknown) => {
        if (isCurrent()) setErrorCode(latest.current.errorCodeFrom(error));
        else if (version === generation.current) attempted.current = -1;
      }).finally(() => { flight.current = false; if (alive.current) setCompleted((value) => value + 1); });
    }, 80);
    return () => clearTimeout(timer);
  }, [sessionId, enabled, blocked, requested, applied, completed]);
  return { pending: requested !== applied, healthFailed, errorCode, retry: () => setRequested((value) => value + 1) };
}
