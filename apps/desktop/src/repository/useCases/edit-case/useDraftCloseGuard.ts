import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useRef, useState } from 'react';

export type UseDraftCloseGuardArgs = { blocked: boolean; flush?: () => Promise<void> };
export type UseDraftCloseGuardResult = { closeAttempted: boolean; protectionFailed: boolean; exitFailed: boolean; isExiting: boolean; cancelClose: () => void; confirmExit: () => Promise<void> };
export function useDraftCloseGuard({ blocked, flush }: UseDraftCloseGuardArgs): UseDraftCloseGuardResult {
  const flushCurrent = useRef(flush); flushCurrent.current = flush;
  const exiting = useRef(false);
  const [isExiting, setIsExiting] = useState(false);
  const exit = async (allowDirty: boolean) => {
    if (exiting.current) return;
    exiting.current = true; setIsExiting(true);
    try {
      await flushCurrent.current?.();
      if (!allowDirty && current.current) { setCloseAttempted(true); return; }
      await getCurrentWindow().destroy();
    } catch { setCloseAttempted(true); setExitFailed(true); }
    finally { exiting.current = false; setIsExiting(false); }
  };
  const exitCurrent = useRef(() => exit(false)); exitCurrent.current = () => exit(false);
  const current = useRef(blocked); current.current = blocked;
  const [closeAttempted, setCloseAttempted] = useState(false);
  const [protectionFailed, setProtectionFailed] = useState(false);
  const [exitFailed, setExitFailed] = useState(false);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (current.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    let disposed = false; let unlisten: (() => void) | undefined;
    if (isTauri()) {
      try {
        void getCurrentWindow().onCloseRequested((event) => { event.preventDefault(); if (current.current) { setCloseAttempted(true); } else { void exitCurrent.current(); } })
          .then((release) => { if (disposed) release(); else unlisten = release; })
          .catch(() => { if (!disposed) setProtectionFailed(true); });
      } catch { setProtectionFailed(true); }
    }
    return () => { disposed = true; window.removeEventListener('beforeunload', beforeUnload); unlisten?.(); };
  }, []);
  return { closeAttempted: (blocked || exitFailed) && closeAttempted, protectionFailed, exitFailed, isExiting,
    cancelClose: () => { if (!exiting.current) { setCloseAttempted(false); setExitFailed(false); } },
    confirmExit: () => exit(true),
  };
}
