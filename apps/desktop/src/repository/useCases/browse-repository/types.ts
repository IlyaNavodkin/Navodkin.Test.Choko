import type { RepositoryApiErrorCode } from '../../api/repositoryApi';
import type { CatalogEntry, OpenRepository, RecentRepository, RunResource, WorkspaceCatalog, RunsCatalog, CaseDocument } from '../../api/contracts';

export type UseBrowseRepositoryArgs = { api?: import('../../api/repositoryApi').RepositoryApi; isNavigationBlocked?: boolean; isExternalRefreshBlocked?: boolean };
export type RepositorySelection = { kind: 'folder'; resourceId: string } | { kind: 'case'; resourceId: string } | { kind: 'run-details' | 'run-case'; resourceId: string } | null;
export type UseBrowseRepositoryResult = {
  externalChanges: import('./useRepositoryChanges').UseRepositoryChangesResult;
  repository: OpenRepository | null; workspacePath: string | null; setWorkspacePath: (path: string) => void;
  recentRepositories: RecentRepository[] | undefined; isRecentsLoading: boolean;
  workspaceCatalog: WorkspaceCatalog | undefined; runsCatalog: RunsCatalog | undefined;
  selection: RepositorySelection; select: (selection: RepositorySelection) => void;
  caseDocument: CaseDocument | undefined; runDocument: RunResource | undefined;
  applyGitResult: (result: import('../../api/contracts').GitSyncResult) => Promise<void>;
  updateRunDocument: (document: RunResource) => void;
  updateCaseDocument: (document: CaseDocument) => void;
  isNativeRuntime: boolean; isOpening: boolean; isClosing: boolean; isWorkspaceLoading: boolean; isRunsLoading: boolean; isDocumentLoading: boolean;
  isBusy: boolean; errorCode: RepositoryApiErrorCode | null; errorSource: 'picker' | 'recent' | 'close' | 'initialize' | null; recentErrorCode: RepositoryApiErrorCode | null; preferenceErrorCode: RepositoryApiErrorCode | null; workspaceErrorCode: RepositoryApiErrorCode | null; runsErrorCode: RepositoryApiErrorCode | null; documentErrorCode: RepositoryApiErrorCode | null;
  flush: () => Promise<void>;
  initialize: () => void; open: () => void; openRecent: (recentId: string) => void; retryActionError: () => void; retryRecents: () => void; retryPreference: () => void; close: () => void; refreshWorkspace: (revealPath?: string, revealKind?: 'case' | 'folder') => void; refreshRuns: (revealRunId?: string) => void; retryDocument: () => void;
};
export type BrowseTreeEntry = CatalogEntry;
