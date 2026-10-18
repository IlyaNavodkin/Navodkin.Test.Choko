import { isTauri } from '@tauri-apps/api/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { useRepositoryChanges } from './useRepositoryChanges';
import { RepositoryApiError, repositoryApi } from '../../api/repositoryApi';
import type { RepositoryApiErrorCode } from '../../api/repositoryApi';
import type { CaseDocument, OpenRepository, RunResource } from '../../api/contracts';
import type { RepositorySelection, UseBrowseRepositoryArgs, UseBrowseRepositoryResult } from './types';

const ROOT = ['repository'] as const;
const RECENTS_KEY = [...ROOT, 'recents'] as const;
const WORKSPACE_KEY = (sessionId: string, path: string | null, epoch: number) => [...ROOT, sessionId, 'workspace', path, epoch] as const;
const RUNS_KEY = (sessionId: string, epoch: number) => [...ROOT, sessionId, 'runs', epoch] as const;
const DOC_KEY = (sessionId: string, kind: string, resourceId: string) => [...ROOT, sessionId, 'document', kind, resourceId] as const;

type OpenRequest = { source: 'picker' } | { source: 'recent'; recentId: string } | { source: 'initialize'; sessionId: string };
type ActionError = { code: RepositoryApiErrorCode; source: 'picker' | 'recent' | 'close' | 'initialize'; recentId?: string };

export function useBrowseRepository({ api = repositoryApi, isNavigationBlocked = false, isExternalRefreshBlocked = false }: UseBrowseRepositoryArgs = {}): UseBrowseRepositoryResult {
  const native = isTauri();
  const queryClient = useQueryClient();
  const [repository, setRepository] = useState<OpenRepository | null>(null);
  const [workspacePath, setWorkspacePathState] = useState<string | null>(null);
  const [selection, setSelection] = useState<RepositorySelection>(null);
  const [reveal, setReveal] = useState<{ sessionId: string; workspacePath: string; path: string; kind: 'case' | 'folder' } | null>(null);
  const [workspaceEpoch, setWorkspaceEpoch] = useState(0);
  const [revealRun, setRevealRun] = useState<{ sessionId: string; runId: string } | null>(null);
  const [runsEpoch, setRunsEpoch] = useState(0);
  const [actionError, setActionError] = useState<ActionError | null>(null);
  const [preferenceError, setPreferenceError] = useState<{ code: RepositoryApiErrorCode; path: string } | null>(null);
  const repositoryRef = useRef<OpenRepository | null>(null);
  const workspaceRef = useRef<string | null>(null);
  const activeSessionRef = useRef<string | null>(null);
  const openFlight = useRef(false);
  const closeFlight = useRef(false);
  const preferenceQueues = useRef(new Map<string, Promise<void>>());

  const recentQuery = useQuery({
    queryKey: RECENTS_KEY,
    queryFn: api.listRecentRepositories,
    enabled: native,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  const clearWorkspaceResources = useCallback(async (sessionId: string, path: string | null, epoch: number) => {
    await queryClient.cancelQueries({ queryKey: WORKSPACE_KEY(sessionId, path, epoch) });
    queryClient.removeQueries({ queryKey: WORKSPACE_KEY(sessionId, path, epoch) });
    await queryClient.cancelQueries({ queryKey: [...ROOT, sessionId, 'document'] });
    queryClient.removeQueries({ queryKey: [...ROOT, sessionId, 'document'] });
  }, [queryClient]);

  const openMutation = useMutation({
    mutationFn: (request: OpenRequest) => request.source === 'picker' ? api.open() : request.source === 'recent' ? api.openRecentRepository(request.recentId) : api.initializeRepository(request.sessionId),
    onSuccess: async (next) => {
      setActionError(null);
      if (next === null) return;
      const previous = repositoryRef.current;
      const newSession = previous?.sessionId !== next.sessionId;
      const currentPath = workspaceRef.current;
      const selectedPath = next.preferredWorkspacePath !== undefined
        ? next.preferredWorkspacePath
        : newSession ? next.workspaces[0]?.path ?? null : currentPath;

      if (previous && (newSession || selectedPath !== currentPath)) {
        await clearWorkspaceResources(previous.sessionId, currentPath, workspaceEpoch);
      }
      if (newSession) {
        setSelection(null);
        setWorkspaceEpoch((epoch) => epoch + 1);
        setRunsEpoch((epoch) => epoch + 1);
        if (previous && previous.sessionId !== next.sessionId) {
          await queryClient.cancelQueries({ queryKey: [...ROOT, previous.sessionId] });
          queryClient.removeQueries({ queryKey: [...ROOT, previous.sessionId] });
        }
      } else if (selectedPath !== currentPath) {
        setSelection(null);
        setWorkspaceEpoch((epoch) => epoch + 1);
      }
      repositoryRef.current = next;
      activeSessionRef.current = next.sessionId;
      workspaceRef.current = selectedPath;
      setRepository(next);
      setWorkspacePathState(selectedPath);
      setPreferenceError(null);
      void queryClient.invalidateQueries({ queryKey: RECENTS_KEY });

      if (previous && previous.sessionId !== next.sessionId) {
        try { await api.close(previous.sessionId); } catch { /* The new repository remains active. */ }
      }
    },
    onError: (error: unknown, request) => {
      setActionError({
        code: api.errorCodeFrom(error),
        source: request.source,
        ...(request.source === 'recent' ? { recentId: request.recentId } : {}),
      });
    },
    onSettled: () => { openFlight.current = false; },
  });

  const closeMutation = useMutation({
    mutationFn: (sessionId: string) => api.close(sessionId),
    onSuccess: async (_result, sessionId) => {
      await queryClient.cancelQueries({ queryKey: [...ROOT, sessionId] });
      queryClient.removeQueries({ queryKey: [...ROOT, sessionId] });
      if (repositoryRef.current?.sessionId === sessionId) {
        repositoryRef.current = null;
        activeSessionRef.current = null;
        workspaceRef.current = null;
        setRepository(null);
        setSelection(null);
        setWorkspacePathState(null);
        setActionError(null);
        setPreferenceError(null);
      }
    },
    onError: (error: unknown) => setActionError({ code: api.errorCodeFrom(error), source: 'close' }),
    onSettled: () => { closeFlight.current = false; },
  });

  const requestOpen = useCallback((request: OpenRequest) => {
    if (isNavigationBlocked) return;
    if (openFlight.current || closeFlight.current) return;
    openFlight.current = true;
    setActionError(null);
    openMutation.mutate(request);
  }, [openMutation, isNavigationBlocked]);

  const open = useCallback(() => requestOpen({ source: 'picker' }), [requestOpen]);
  const openRecent = useCallback((recentId: string) => requestOpen({ source: 'recent', recentId }), [requestOpen]);
  const initialize = useCallback(() => {
    const current = repositoryRef.current;
    if (current?.needsInitialization) requestOpen({ source: 'initialize', sessionId: current.sessionId });
  }, [requestOpen]);

  const retryActionError = useCallback(() => {
    if (isNavigationBlocked) return;
    if (actionError?.source === 'initialize') {
      initialize();
    } else if (actionError?.source === 'recent' && actionError.recentId) {
      openRecent(actionError.recentId);
    } else if (actionError?.source === 'close') {
      const sessionId = repositoryRef.current?.sessionId;
      if (sessionId && !closeFlight.current && !openFlight.current) {
        closeFlight.current = true;
        setActionError(null);
        closeMutation.mutate(sessionId);
      }
    } else {
      open();
    }
  }, [actionError, closeMutation, open, openRecent, initialize, isNavigationBlocked]);

  const close = useCallback(() => {
    if (isNavigationBlocked) return;
    const sessionId = repositoryRef.current?.sessionId;
    if (!sessionId || closeFlight.current || openFlight.current) return;
    closeFlight.current = true;
    setActionError(null);
    closeMutation.mutate(sessionId);
  }, [closeMutation, isNavigationBlocked]);

  const enqueuePreference = useCallback((sessionId: string, path: string) => {
    const previous = preferenceQueues.current.get(sessionId) ?? Promise.resolve();
    let operation: Promise<void>;
    operation = previous
      .then(() => api.rememberWorkspace(sessionId, path))
      .then(
        () => {
          if (activeSessionRef.current === sessionId && workspaceRef.current === path) setPreferenceError(null);
        },
        (error: unknown) => {
          if (activeSessionRef.current === sessionId && workspaceRef.current === path) {
            setPreferenceError({ code: api.errorCodeFrom(error), path });
          }
        },
      )
      .finally(() => {
        if (preferenceQueues.current.get(sessionId) === operation) preferenceQueues.current.delete(sessionId);
      });
    preferenceQueues.current.set(sessionId, operation);
  }, [api]);

  const setWorkspacePath = useCallback((path: string) => {
    if (isNavigationBlocked) return;
    const activeRepository = repositoryRef.current;
    if (!activeRepository || activeRepository.needsInitialization || !activeRepository.workspaces.some((item) => item.path === path)) return;
    const previousPath = workspaceRef.current;
    if (path === previousPath) return;
    const sessionId = activeRepository.sessionId;
    const previousEpoch = workspaceEpoch;
    workspaceRef.current = path;
    setWorkspacePathState(path);
    setSelection(null);
    setPreferenceError(null);
    setActionError(null);
    if (previousPath !== null) void clearWorkspaceResources(sessionId, previousPath, previousEpoch);
    else {
      void queryClient.cancelQueries({ queryKey: [...ROOT, sessionId, 'document'] });
      queryClient.removeQueries({ queryKey: [...ROOT, sessionId, 'document'] });
    }
    setWorkspaceEpoch((epoch) => epoch + 1);
    enqueuePreference(sessionId, path);
  }, [clearWorkspaceResources, enqueuePreference, queryClient, workspaceEpoch, isNavigationBlocked]);

  const sessionId = repository?.sessionId ?? '';
  const refreshExternal = useCallback(async (id: string, isCurrent: () => boolean) => {
    const next = await api.refresh(id);
    if (!isCurrent()) return;
    const previousPath = workspaceRef.current;
    const path = next.workspaces.some((workspace) => workspace.path === previousPath) ? previousPath : next.workspaces[0]?.path ?? null;
    repositoryRef.current = next; workspaceRef.current = path;
    setRepository(next); setWorkspacePathState(path);
    if (path !== previousPath) setSelection(null);
    await queryClient.invalidateQueries({ queryKey: [...ROOT, id], refetchType: 'active' });
  }, [api, queryClient]);
  const externalChanges = useRepositoryChanges({ sessionId, enabled: native, blocked: isNavigationBlocked || isExternalRefreshBlocked || openMutation.isPending || closeMutation.isPending, refresh: refreshExternal, errorCodeFrom: api.errorCodeFrom });

  const workspaceQuery = useQuery({
    queryKey: WORKSPACE_KEY(sessionId, workspacePath, workspaceEpoch),
    queryFn: () => api.catalogWorkspace(sessionId, workspacePath ?? ''),
    enabled: native && Boolean(repository) && !repository?.needsInitialization && workspacePath !== null && Boolean(repository?.workspaces.some((item) => item.path === workspacePath)),
    staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false,
  });
  const runsQuery = useQuery({
    queryKey: RUNS_KEY(sessionId, runsEpoch), queryFn: () => api.catalogRuns(sessionId),
    enabled: native && Boolean(repository) && !repository?.needsInitialization, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false,
  });
  const selectedKind = selection?.kind ?? '';
  const selectedId = selection?.resourceId ?? '';
  const documentQuery = useQuery({
    queryKey: DOC_KEY(sessionId, selectedKind, selectedId),
    queryFn: async (): Promise<CaseDocument | RunResource> => {
      if (selection === null || selection.kind === 'folder') throw new RepositoryApiError('INVALID_REQUEST');
      if (selection.kind === 'case') return api.readCase(sessionId, selectedId);
      const result = await api.readRun(sessionId, selectedId);
      const expectedKind = selection.kind === 'run-details' ? 'details' : 'case';
      if (result.kind !== expectedKind) throw new RepositoryApiError('INVALID_NATIVE_RESPONSE');
      return result;
    },
    enabled: native && Boolean(repository) && selection !== null && selection.kind !== 'folder',
    staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false,
  });

  const select = useCallback((next: RepositorySelection) => {
    if (isNavigationBlocked) return;
    setActionError(null);
    setSelection(next);
  }, [isNavigationBlocked]);
  const refreshWorkspace = useCallback((revealPath?: string, revealKind: 'case' | 'folder' = 'case') => {
    if (isNavigationBlocked) return;
    if (workspacePath === null) return;
    setSelection(null);
    setActionError(null);
    void queryClient.cancelQueries({ queryKey: [...ROOT, sessionId, 'workspace'] });
    queryClient.removeQueries({ queryKey: [...ROOT, sessionId, 'workspace'] });
    void queryClient.cancelQueries({ queryKey: [...ROOT, sessionId, 'document'] });
    queryClient.removeQueries({ queryKey: [...ROOT, sessionId, 'document'] });
    if (revealPath && sessionId && workspacePath !== null) setReveal({ sessionId, workspacePath, path: revealPath, kind: revealKind });
    setWorkspaceEpoch((epoch) => epoch + 1);
  }, [queryClient, sessionId, workspacePath, isNavigationBlocked]);
  const refreshRuns = useCallback((revealRunId?: string) => {
    if (isNavigationBlocked) return;
    setSelection((current) => revealRunId ? null : current?.kind === 'case' ? current : null);
    setActionError(null);
    void queryClient.cancelQueries({ queryKey: [...ROOT, sessionId, 'runs'] });
    queryClient.removeQueries({ queryKey: [...ROOT, sessionId, 'runs'] });
    void queryClient.cancelQueries({ queryKey: [...ROOT, sessionId, 'document', 'run-details'] });
    void queryClient.cancelQueries({ queryKey: [...ROOT, sessionId, 'document', 'run-case'] });
    queryClient.removeQueries({ queryKey: [...ROOT, sessionId, 'document', 'run-details'] });
    queryClient.removeQueries({ queryKey: [...ROOT, sessionId, 'document', 'run-case'] });
    if (revealRunId && sessionId) setRevealRun({ sessionId, runId: revealRunId });
    setRunsEpoch((epoch) => epoch + 1);
  }, [queryClient, sessionId, isNavigationBlocked]);
  const retryDocument = useCallback(() => {
    if (!selection || selection.kind === 'folder') return;
    void queryClient.invalidateQueries({ queryKey: DOC_KEY(sessionId, selection.kind, selection.resourceId), refetchType: 'active' });
  }, [queryClient, selection, sessionId]);
  const retryRecents = useCallback(() => { void recentQuery.refetch(); }, [recentQuery.refetch]);
  const retryPreference = useCallback(() => {
    const sessionId = activeSessionRef.current;
    const path = workspaceRef.current;
    if (sessionId !== null && path !== null) {
      setPreferenceError(null);
      enqueuePreference(sessionId, path);
    }
  }, [enqueuePreference]);

  const applyGitResult = useCallback(async (result: import('../../api/contracts').GitSyncResult) => {
    const current = repositoryRef.current;
    if (!current) return;
    await queryClient.cancelQueries({ queryKey: [...ROOT, current.sessionId] });
    queryClient.removeQueries({ queryKey: [...ROOT, current.sessionId] });
    const next = result.repository ?? { ...current, workspaces: [] };
    const path = next.workspaces.some((workspace) => workspace.path === workspaceRef.current) ? workspaceRef.current : next.workspaces[0]?.path ?? null;
    repositoryRef.current = next; workspaceRef.current = path;
    setRepository(next); setWorkspacePathState(path); setSelection(null); setReveal(null); setRevealRun(null);
    setWorkspaceEpoch((epoch) => epoch + 1); setRunsEpoch((epoch) => epoch + 1);
  }, [queryClient]);
  const workspaceCatalog = workspacePath === null ? undefined : workspaceQuery.data;
  const updateRunDocument = useCallback((document: RunResource) => {
    if (selection?.kind !== 'run-case' && selection?.kind !== 'run-details') return;
    queryClient.setQueryData(DOC_KEY(sessionId, selection.kind, selection.resourceId), document);
    queryClient.setQueryData<import('../../api/contracts').RunsCatalog>(RUNS_KEY(sessionId, runsEpoch), (catalog) => catalog ? {
      ...catalog, runs: catalog.runs.map((run) => document.kind === 'case' ? { ...run, cases: run.cases.map((item) => item.resourceId === selection.resourceId ? { ...item, result: document.document.model.result } : item) } : run.detailsResourceId === selection.resourceId ? { ...run, status: document.document.model.status } : run),
    } : catalog);
  }, [queryClient, selection, sessionId, runsEpoch]);
  const updateCaseDocument = useCallback((document: CaseDocument) => {
    if (selection?.kind !== 'case') return;
    queryClient.setQueryData(DOC_KEY(sessionId, 'case', selection.resourceId), document);
    queryClient.setQueryData<import('../../api/contracts').WorkspaceCatalog>(WORKSPACE_KEY(sessionId, workspacePath, workspaceEpoch), (catalog) => catalog ? {
      ...catalog, entries: catalog.entries.map((entry) => entry.kind === 'case' && entry.metadata.resourceId === selection.resourceId ? {
        ...entry, metadata: { ...entry.metadata, id: document.model.id, title: document.model.title, displayId: document.model.displayId, status: document.model.status, tags: document.model.tags, revision: document.revision },
      } : entry),
    } : catalog);
  }, [queryClient, selection, sessionId, workspacePath, workspaceEpoch]);
  useEffect(() => {
    if (!reveal) return;
    if (reveal.sessionId !== sessionId || reveal.workspacePath !== workspacePath) { setReveal(null); return; }
    const entry = workspaceCatalog?.entries.find((item) => item.kind === reveal.kind && item.metadata.path === reveal.path);
    if (entry) { setSelection(entry.kind === 'case' ? { kind: 'case', resourceId: entry.metadata.resourceId } : { kind: 'folder', resourceId: entry.metadata.nodeId }); setReveal(null); }
  }, [reveal, sessionId, workspacePath, workspaceCatalog]);
  const runsCatalog = runsQuery.data;
  useEffect(() => {
    if (!revealRun) return;
    if (revealRun.sessionId !== sessionId) { setRevealRun(null); return; }
    const run = runsCatalog?.runs.find((run) => run.runId === revealRun.runId);
    if (run?.detailsResourceId) { setSelection({ kind: 'run-details', resourceId: run.detailsResourceId }); setRevealRun(null); }
  }, [revealRun, sessionId, runsCatalog]);
  const typedDocument = documentQuery.data;
  const flush = useCallback(async () => {
    const session = activeSessionRef.current;
    if (session) await api.flush(session);
  }, [api]);
  const isBusy = openMutation.isPending || closeMutation.isPending || isNavigationBlocked;
  return useMemo(() => ({
    repository, externalChanges, flush, applyGitResult, workspacePath, setWorkspacePath, recentRepositories: recentQuery.data,
    isRecentsLoading: recentQuery.isPending && recentQuery.fetchStatus !== 'idle',
    recentErrorCode: recentQuery.error ? api.errorCodeFrom(recentQuery.error) : null,
    workspaceCatalog, runsCatalog, selection, select, updateCaseDocument, updateRunDocument,
    caseDocument: selection?.kind === 'case' && typedDocument && 'model' in typedDocument ? typedDocument : undefined,
    runDocument: selection && (selection.kind === 'run-details' || selection.kind === 'run-case') && typedDocument && 'kind' in typedDocument ? typedDocument : undefined,
    isNativeRuntime: native, isOpening: openMutation.isPending, isClosing: closeMutation.isPending,
    isBusy, errorCode: actionError?.code ?? null, errorSource: actionError?.source ?? null,
    preferenceErrorCode: preferenceError?.code ?? null,
    isWorkspaceLoading: workspaceQuery.isPending && workspaceQuery.fetchStatus !== 'idle',
    isRunsLoading: runsQuery.isPending && runsQuery.fetchStatus !== 'idle',
    isDocumentLoading: documentQuery.isPending && documentQuery.fetchStatus !== 'idle',
    workspaceErrorCode: workspaceQuery.error ? api.errorCodeFrom(workspaceQuery.error) : null,
    runsErrorCode: runsQuery.error ? api.errorCodeFrom(runsQuery.error) : null,
    documentErrorCode: documentQuery.error ? api.errorCodeFrom(documentQuery.error) : null,
    open, openRecent, initialize, retryActionError, retryRecents, retryPreference, close,
    refreshWorkspace, refreshRuns, retryDocument,
  }), [repository, externalChanges, flush, applyGitResult, workspacePath, setWorkspacePath, recentQuery.data, recentQuery.isPending, recentQuery.fetchStatus, recentQuery.error,
    workspaceCatalog, runsCatalog, selection, select, updateCaseDocument, updateRunDocument, typedDocument, native, openMutation.isPending, closeMutation.isPending,
    isBusy, actionError, preferenceError, api, workspaceQuery.isPending, workspaceQuery.fetchStatus, workspaceQuery.error,
    runsQuery.isPending, runsQuery.fetchStatus, runsQuery.error, documentQuery.isPending, documentQuery.fetchStatus,
    documentQuery.error, open, openRecent, initialize, retryActionError, retryRecents, retryPreference, close, refreshWorkspace, refreshRuns, retryDocument]);
}
