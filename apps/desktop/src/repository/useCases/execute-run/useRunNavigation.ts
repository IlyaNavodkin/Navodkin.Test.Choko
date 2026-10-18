import { useEffect, useState } from 'react';
import type { RepositorySelection } from '../browse-repository/types';
import { nextPendingCase, type RunCatalogEntry } from './runWorkflow';
export type UseRunNavigationArgs = { sessionId: string | undefined; run: RunCatalogEntry | undefined; selection: RepositorySelection; blocked: boolean; select: (selection: RepositorySelection) => void };
type Scope = { sessionId: string; runId: string };
export function useRunNavigation({ sessionId, run, selection, blocked, select }: UseRunNavigationArgs) {
  const [active, setActive] = useState<Scope | null>(null);
  const [advance, setAdvance] = useState<(Scope & { resourceId: string }) | null>(null);
  const isGuide = Boolean(run && active?.sessionId === sessionId && active?.runId === run.runId && selection?.kind === 'run-case');
  const index = run?.cases.findIndex((row) => row.resourceId === selection?.resourceId) ?? -1;
  // save() resolves before React flushes dirty/saving state. Wait for the clean render before navigating.
  useEffect(() => {
    if (!advance) return;
    if (advance.sessionId !== sessionId || advance.runId !== run?.runId || advance.resourceId !== selection?.resourceId) { setAdvance(null); return; }
    if (blocked) return;
    setAdvance(null);
    const next = nextPendingCase(run.cases, advance.resourceId);
    if (next) select({ kind: 'run-case', resourceId: next.resourceId });
    else { setActive(null); if (run.detailsResourceId) select({ kind: 'run-details', resourceId: run.detailsResourceId }); }
  }, [advance, blocked, sessionId, run, selection, select]);
  return {
    isGuide, index,
    begin: (resourceId?: string) => {
      if (blocked || !sessionId || !run) return;
      const row = resourceId ? run.cases.find((row) => row.resourceId === resourceId) : nextPendingCase(run.cases) ?? run.cases[0];
      if (!row) return;
      setActive({ sessionId, runId: run.runId }); select({ kind: 'run-case', resourceId: row.resourceId });
    },
    move: (offset: -1 | 1) => { const row = run?.cases[index + offset]; if (!blocked && row) select({ kind: 'run-case', resourceId: row.resourceId }); },
    exit: () => { if (!blocked && run) { setActive(null); if (run.detailsResourceId) select({ kind: 'run-details', resourceId: run.detailsResourceId }); } },
    saved: () => { if (sessionId && run && selection?.kind === 'run-case') setAdvance({ sessionId, runId: run.runId, resourceId: selection.resourceId }); },
  };
}
export type UseRunNavigationResult = ReturnType<typeof useRunNavigation>;
