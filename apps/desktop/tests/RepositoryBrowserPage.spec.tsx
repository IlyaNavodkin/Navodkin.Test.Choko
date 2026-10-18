import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@codaa/ui';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/shared/i18n/i18n';
import type { WorkspaceCatalog } from '../src/repository/api/contracts';

const mocks = vi.hoisted(() => ({
  receive: vi.fn(), native: vi.fn(() => true), closeHandler: vi.fn(), destroy: vi.fn(),
  api: { prepareSuiteOperation: vi.fn(), applySuiteOperation: vi.fn(), createSuite: vi.fn(), refresh: vi.fn(), flush: vi.fn(), gitStatus: vi.fn(), gitDiff: vi.fn(), open: vi.fn(), openRecentRepository: vi.fn(), listRecentRepositories: vi.fn(), rememberWorkspace: vi.fn(), close: vi.fn(), initializeRepository: vi.fn(), createRun: vi.fn(), createCase: vi.fn(), organizeCase: vi.fn(), saveRunDetails: vi.fn(), saveRunCase: vi.fn(), saveCase: vi.fn(), catalogWorkspace: vi.fn(), readCase: vi.fn(), catalogRuns: vi.fn(), readRun: vi.fn(), errorCodeFrom: vi.fn((_error: unknown) => 'NATIVE_COMMAND_FAILED') },
}));
vi.mock('@tauri-apps/api/core', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tauri-apps/api/core')>()), isTauri: () => mocks.native() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async (_event: string, handler: (event: unknown) => void) => { mocks.receive.mockImplementation(handler); return () => {}; }) }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ destroy: mocks.destroy, onCloseRequested: async (handler: unknown) => { mocks.closeHandler.mockImplementation(handler as () => void); return () => {}; } }) }));
vi.mock('../src/repository/api/repositoryApi', () => ({
  repositoryApi: mocks.api,
  RepositoryApiError: class RepositoryApiError extends Error { constructor(readonly code: string) { super(code); } },
}));

import { RepositoryBrowserPage } from '../src/repository/useCases/browse-repository/RepositoryBrowserPage';

const session = '550e8400-e29b-41d4-a716-446655440000';
const folderId = '550e8400-e29b-41d4-a716-446655440001';
const caseId = '550e8400-e29b-41d4-a716-446655440002';
const caseResource2 = '550e8400-e29b-41d4-a716-446655440003';
const runId = '550e8400-e29b-41d4-a716-446655440004';

const opened = (sessionId: string, displayName = 'Fixture repo', preferredWorkspacePath?: string | null) => ({ sessionId, displayName, needsInitialization: false, workspaces: [{ path: '', name: 'Fixture repo', displayIdPrefix: 'T', description: '' }, { path: 'area', name: 'Area', displayIdPrefix: 'A', description: '' }], warnings: [], ...(preferredWorkspacePath !== undefined ? { preferredWorkspacePath } : {}) });
const recent = { recentId: '550e8400-e29b-41d4-a716-446655440020', displayName: 'Recent repo', lastOpenedAtMs: 1_797_000_000_000 };
const workspaceCatalog = (resourceId = caseId, title = 'Login works', displayId = 'T-1', workspacePath = '') => ({ workspacePath, entries: [
  { kind: 'folder' as const, metadata: { nodeId: folderId, path: 'suite', parentPath: '', parentResourceId: null, order: 0, name: 'Suite', displayIdPrefix: 'S', description: 'Folder note text' } },
  { kind: 'case' as const, metadata: { resourceId, path: 'suite/case.md', parentPath: 'suite', parentResourceId: folderId, order: 0, id: 'stable-case-id', displayId, title, status: 'active' as const, tags: ['auth'] } },
], warnings: [] });
const caseDocument = { model: { id: 'stable-case-id', displayId: 'T-1', title: 'Login works', slug: null, status: 'active' as const, tags: ['auth'], objective: 'Sign in safely.', systems: ['Web app'], setup: [{ name: 'Account', body: 'A test account exists.' }], steps: [{ text: 'Enter credentials', depth: 0 }], acceptanceCriteria: ['Dashboard is shown.'] }, warnings: [] };
const runsCatalog = { runs: [{ runId: 'run-dir', name: 'Release check', created: '2026-10-14', testDate: '2026-10-14', status: 'open' as const, scope: 'Web', detailsResourceId: runId, cases: [{ resourceId: '550e8400-e29b-41d4-a716-446655440005', path: 'run/case.md', caseId: 'stable-case-id', displayId: 'T-1', title: 'Login works', result: 'pass' as const }] }], warnings: [] };
const runDetails = { kind: 'details' as const, document: { model: { name: 'Release check', status: 'open' as const, created: '2026-10-14', testDate: '2026-10-14', scope: 'Web', testerApproval: null, reviewerApproval: null, summary: 'Release smoke run.', notes: 'No issues.' }, warnings: [] } };

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<I18nProvider language="ru"><QueryClientProvider client={client}><RepositoryBrowserPage /></QueryClientProvider></I18nProvider>);
}

describe('repository browser read-only flows', () => {
  beforeAll(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as typeof ResizeObserver;
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.native.mockReturnValue(true);
    mocks.api.errorCodeFrom.mockImplementation((error: unknown) => typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'NATIVE_COMMAND_FAILED');
    mocks.api.refresh.mockResolvedValue(opened(session));
    mocks.api.open.mockResolvedValue(opened(session));
    mocks.api.openRecentRepository.mockResolvedValue(opened(session));
    mocks.api.listRecentRepositories.mockResolvedValue([]);
    mocks.api.rememberWorkspace.mockResolvedValue(undefined);
    mocks.api.close.mockResolvedValue(undefined);
    mocks.api.catalogWorkspace.mockImplementation((_session: string, path: string) => Promise.resolve(workspaceCatalog(caseId, 'Login works', 'T-1', path)));
    mocks.api.readCase.mockResolvedValue(caseDocument);
    mocks.api.catalogRuns.mockResolvedValue(runsCatalog);
    mocks.api.readRun.mockResolvedValue(runDetails);
  });

  it('preserves the current selection on picker cancel and clears stale resource reads on refresh', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    await screen.findByRole('heading', { name: 'Fixture repo' });
    const caseRow = await screen.findByRole('treeitem', { name: /T-1 · Login works/ });
    fireEvent.click(caseRow);
    await screen.findByText('Sign in safely.');

    mocks.api.open.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    await waitFor(() => expect(mocks.api.open).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Sign in safely.')).toBeTruthy();
    expect(mocks.api.close).not.toHaveBeenCalled();

    mocks.api.open.mockRejectedValueOnce(new Error('picker failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    await screen.findByText('Не удалось открыть репозиторий');
    expect(screen.getByText('Sign in safely.')).toBeTruthy();

    mocks.api.catalogWorkspace.mockResolvedValueOnce(workspaceCatalog(caseResource2));
    fireEvent.click(screen.getAllByRole('button', { name: 'Обновить' })[1]);
    await screen.findByRole('treeitem', { name: /T-1 · Login works/ });
    expect(screen.queryByText('Sign in safely.')).toBeNull();
    expect(mocks.api.readCase).not.toHaveBeenCalledWith(session, caseResource2);
  });

  it('reads case and run documents only after selecting listed resources', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    const caseRow = await screen.findByRole('treeitem', { name: /T-1 · Login works/ });
    fireEvent.click(caseRow);
    await screen.findByText('Dashboard is shown.');
    expect(mocks.api.readCase).toHaveBeenCalledWith(session, caseId);

    fireEvent.click(screen.getByRole('button', { name: 'Прогоны' }));
    const runButton = await screen.findByRole('button', { name: /Release check/ });
    fireEvent.click(runButton);
    await screen.findByText('Release smoke run.');
    expect(mocks.api.readRun).toHaveBeenCalledWith(session, runId);
    const sidecarId = runsCatalog.runs[0].cases[0].resourceId;
    mocks.api.readRun.mockResolvedValueOnce({ kind: 'case', document: { model: { caseId: 'stable-case-id', displayId: 'T-1', title: 'Login works', result: 'pass', tester: 'QA', executedAt: '10:00', testDate: '2026-10-14', notes: 'Sidecar note.', setup: [], steps: [], accept: [] }, warnings: [] } });
    fireEvent.click(screen.getByRole('button', { name: /T-1 · Login works/ }));
    await screen.findByText('Sidecar note.');
    expect(mocks.api.readRun).toHaveBeenLastCalledWith(session, sidecarId);
  });

  it('switches workspace with fresh catalog IDs and retries a failed document read', async () => {
    mocks.api.readCase.mockRejectedValueOnce(new Error('transient read failure')).mockResolvedValueOnce(caseDocument);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    const row = await screen.findByRole('treeitem', { name: /T-1 · Login works/ });
    fireEvent.click(row);
    await screen.findByText('Нативная команда завершилась ошибкой.');
    fireEvent.click(screen.getByRole('button', { name: 'Повторить проверку' }));
    await screen.findByText('Sign in safely.');

    fireEvent.click(screen.getByRole('combobox', { name: 'Рабочая область' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Area' }));
    await waitFor(() => expect(mocks.api.catalogWorkspace).toHaveBeenCalledWith(session, 'area'));
    expect(screen.queryByText('Sign in safely.')).toBeNull();
  });

  it('does not let a late prior-session catalog appear after switching repository', async () => {
    let resolveOld: ((value: ReturnType<typeof workspaceCatalog>) => void) | undefined;
    mocks.api.catalogWorkspace.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    mocks.api.catalogWorkspace.mockResolvedValueOnce(workspaceCatalog(caseResource2, 'Second case', 'T-2'));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    await waitFor(() => expect(mocks.api.catalogWorkspace).toHaveBeenCalledWith(session, ''));
    mocks.api.open.mockResolvedValueOnce(opened('550e8400-e29b-41d4-a716-446655440099', 'Second repo'));
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    await screen.findByText('Second repo');
    expect(mocks.api.close).toHaveBeenCalledWith(session);
    resolveOld?.(workspaceCatalog());
    await screen.findByRole('treeitem', { name: /T-2 · Second case/ });
    expect(screen.queryByRole('treeitem', { name: /T-1 · Login works/ })).toBeNull();
    expect(mocks.api.readCase).not.toHaveBeenCalled();
    expect(within(screen.getByRole('main')).getByText('Second repo')).toBeTruthy();
  });

  it('shows browser-only access and keeps the native picker disabled in preview', () => {
    mocks.native.mockReturnValue(false);
    renderPage();
    expect(screen.getByText('Предпросмотр в браузере не имеет доступа к репозиторию.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Открыть репозиторий' }).hasAttribute('disabled')).toBe(true);
    expect(mocks.api.open).not.toHaveBeenCalled();
  });

  it('does not initialize a repository with missing configuration', async () => {
    mocks.api.open.mockResolvedValueOnce({ ...opened(session), needsInitialization: true, workspaces: [] });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    expect(await screen.findAllByText(/Автоматическая инициализация не выполняется/)).toHaveLength(2);
    expect(mocks.api.catalogWorkspace).not.toHaveBeenCalled();
    expect(screen.queryByRole('navigation')).toBeNull();
  });
  it('initializes only after explicit confirmation and cancellation never invokes IPC', async () => {
    mocks.api.open.mockResolvedValueOnce({ ...opened(session), needsInitialization: true, workspaces: [] });
    mocks.api.initializeRepository.mockResolvedValueOnce(opened(session, 'Initialized repo', ''));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Инициализировать репозиторий' }));
    expect(screen.getByText('.casewright/config.yaml')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(mocks.api.initializeRepository).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Инициализировать репозиторий' }));
    fireEvent.click(screen.getByRole('button', { name: 'Создать структуру' }));
    await screen.findByRole('heading', { name: 'Initialized repo' });
    await waitFor(() => expect(mocks.api.catalogWorkspace).toHaveBeenCalledWith(session, ''));
    expect(mocks.api.initializeRepository).toHaveBeenCalledOnce();
    expect(mocks.api.initializeRepository).toHaveBeenCalledWith(session);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('uses a localized fallback when a case has no title', async () => {
    mocks.api.catalogWorkspace.mockResolvedValueOnce(workspaceCatalog(caseId, '   '));
    mocks.api.readCase.mockResolvedValueOnce({ ...caseDocument, model: { ...caseDocument.model, title: '' } });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    fireEvent.click(await screen.findByRole('treeitem', { name: /T-1 · Без названия/ }));
    expect(await screen.findByRole('heading', { name: 'T-1 · Без названия' })).toBeTruthy();
  });

  it('opens a recent repository and restores its preferred declared workspace, including the root path', async () => {
    mocks.api.listRecentRepositories.mockResolvedValueOnce([recent]);
    mocks.api.openRecentRepository.mockResolvedValueOnce(opened('550e8400-e29b-41d4-a716-446655440099', 'Restored repo', ''));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Recent repo/ }));
    await screen.findByRole('heading', { name: 'Restored repo' });
    await waitFor(() => expect(mocks.api.catalogWorkspace).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440099', ''));
    expect(mocks.api.openRecentRepository).toHaveBeenCalledWith(recent.recentId);
    expect(mocks.api.open).not.toHaveBeenCalled();
  });

  it('updates workspace and selection when a recent entry reopens the current session', async () => {
    mocks.api.listRecentRepositories.mockResolvedValue([recent]);
    mocks.api.openRecentRepository.mockResolvedValueOnce(opened(session, 'Fixture repo', 'area'));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    fireEvent.click(await screen.findByRole('treeitem', { name: /T-1 · Login works/ }));
    await screen.findByText('Sign in safely.');
    fireEvent.click(await screen.findByRole('button', { name: /Recent repo/ }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Рабочая область' }).textContent).toContain('Area'));
    await waitFor(() => expect(mocks.api.catalogWorkspace).toHaveBeenCalledWith(session, 'area'));
    expect(screen.queryByText('Sign in safely.')).toBeNull();
    expect(mocks.api.close).not.toHaveBeenCalled();
  });

  it('keeps the current reader on recent-open failure and retries that recent entry', async () => {
    mocks.api.listRecentRepositories.mockResolvedValue([recent]);
    mocks.api.openRecentRepository.mockRejectedValueOnce(new Error('first attempt')).mockResolvedValueOnce(opened('550e8400-e29b-41d4-a716-446655440099', 'Recovered repo', 'area'));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    fireEvent.click(await screen.findByRole('treeitem', { name: /T-1 · Login works/ }));
    await screen.findByText('Sign in safely.');
    fireEvent.click(await screen.findByRole('button', { name: /Recent repo/ }));
    await screen.findByText('Не удалось открыть недавний репозиторий');
    expect(screen.getByText('Sign in safely.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить проверку' }));
    await screen.findByRole('heading', { name: 'Recovered repo' });
    await waitFor(() => expect(mocks.api.catalogWorkspace).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440099', 'area'));
    expect(mocks.api.openRecentRepository).toHaveBeenCalledTimes(2);
    expect(mocks.api.open).toHaveBeenCalledTimes(1);
  });

  it('keeps the picker available when history fails and preserves a null preferred workspace', async () => {
    mocks.api.listRecentRepositories.mockRejectedValueOnce(new Error('history unavailable'));
    mocks.api.open.mockResolvedValueOnce(opened(session, 'No available area', null));
    renderPage();
    await screen.findByText('Не удалось загрузить историю');
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    await screen.findByRole('heading', { name: 'No available area' });
    expect(mocks.api.catalogWorkspace).not.toHaveBeenCalled();
    const selector = screen.getByRole('combobox', { name: 'Рабочая область' }) as HTMLButtonElement;
    expect(selector.disabled).toBe(true);
    expect(selector.textContent).not.toContain('Fixture repo');
    expect(screen.getAllByText('Нет доступной рабочей области.').length).toBeGreaterThan(0);
  });

  it('keeps the selected workspace readable when preference persistence fails and can retry it', async () => {
    mocks.api.rememberWorkspace.mockRejectedValueOnce(new Error('preference unavailable')).mockResolvedValueOnce(undefined);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    await screen.findByRole('treeitem', { name: /T-1 · Login works/ });
    fireEvent.click(screen.getByRole('combobox', { name: 'Рабочая область' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Area' }));
    await screen.findByText('Рабочая область выбрана, но её не удалось сохранить для следующего открытия.');
    expect(await screen.findByRole('treeitem', { name: /T-1 · Login works/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить сохранение области' }));
    await waitFor(() => expect(mocks.api.rememberWorkspace).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Рабочая область выбрана, но её не удалось сохранить для следующего открытия.')).toBeNull());
  });

  it('serializes rapid workspace preference changes in selection order', async () => {
    let finishFirst: (() => void) | undefined;
    mocks.api.rememberWorkspace.mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve; })).mockResolvedValueOnce(undefined);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    const selector = await screen.findByRole('combobox', { name: 'Рабочая область' });
    fireEvent.click(selector);
    fireEvent.click(await screen.findByRole('option', { name: 'Area' }));
    await waitFor(() => expect(mocks.api.rememberWorkspace).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('combobox', { name: 'Рабочая область' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Fixture repo' }));
    expect(mocks.api.rememberWorkspace).toHaveBeenCalledTimes(1);
    finishFirst?.();
    await waitFor(() => expect(mocks.api.rememberWorkspace).toHaveBeenCalledTimes(2));
    expect(mocks.api.rememberWorkspace.mock.calls.map((call) => call[1])).toEqual(['area', '']);
  });

  it('does not surface an old session preference failure after opening another repository', async () => {
    let rejectOld: ((error: Error) => void) | undefined;
    mocks.api.rememberWorkspace.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectOld = reject; }));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    fireEvent.click(await screen.findByRole('combobox', { name: 'Рабочая область' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Area' }));
    await waitFor(() => expect(mocks.api.rememberWorkspace).toHaveBeenCalledTimes(1));
    mocks.api.open.mockResolvedValueOnce(opened('550e8400-e29b-41d4-a716-446655440099', 'Second repo', 'area'));
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    await screen.findByRole('heading', { name: 'Second repo' });
    rejectOld?.(new Error('late preference error from closed session'));
    await waitFor(() => expect(mocks.api.close).toHaveBeenCalledWith(session));
    expect(screen.queryByText('Рабочая область выбрана, но её не удалось сохранить для следующего открытия.')).toBeNull();
  });

  it('renders an out-of-range recent timestamp without crashing', async () => {
    mocks.api.listRecentRepositories.mockResolvedValueOnce([{ ...recent, lastOpenedAtMs: Number.MAX_SAFE_INTEGER }]);
    renderPage();
    await screen.findByRole('button', { name: /Recent repo/ });
    expect(screen.getByText('Дата неизвестна')).toBeTruthy();
  });

  it('opens Git on demand, keeps diff readonly and clears selected IDs on refresh', async () => {
    const fileId = '550e8400-e29b-41d4-a716-446655440030';
    const status = { syncToken: null, abortToken: null, syncBlocked: false, branch: 'main', head: 'a'.repeat(40), unborn: false, detached: false, upstream: 'origin/main', ahead: 2, behind: 1, filtersDisabled: false, files: [{ fileId, path: 'case [one].md', originalPath: null, index: 'M', worktree: 'M', unmerged: false, submodule: false }] };
    mocks.api.gitStatus.mockResolvedValueOnce(status).mockResolvedValueOnce({ ...status, files: [] });
    mocks.api.gitDiff.mockResolvedValue({ path: 'case [one].md', staged: '+staged', workingTree: '+working', untrackedContent: null, binary: false, unmerged: false, filtersDisabled: false });
    renderPage(); fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    await screen.findByRole('heading', { name: 'Fixture repo' }); expect(mocks.api.gitStatus).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Git' }));
    fireEvent.click(await screen.findByRole('button', { name: 'case [one].md' }));
    await screen.findByText('+staged'); await screen.findByText('+working');
    expect(mocks.api.gitDiff).toHaveBeenCalledWith(session, fileId);
    fireEvent.click(screen.getByRole('button', { name: 'Обновить Git' }));
    await screen.findByText('Нет локальных изменений');
    expect(screen.queryByText('+staged')).toBeNull(); expect(mocks.api.saveCase).not.toHaveBeenCalled();
  });

  it('retains failed run details on native close and closes only after a successful retry', async () => {
    const original = { ...runDetails, document: { ...runDetails.document, revision: 'a'.repeat(64) } };
    const next = { ...original, document: { ...original.document, revision: 'b'.repeat(64), model: { ...original.document.model, notes: 'Execution notes' } } };
    mocks.api.readRun.mockResolvedValue(original);
    mocks.api.saveRunDetails.mockRejectedValueOnce({ code: 'SAVE_FAILED' }).mockResolvedValueOnce(next);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    await screen.findByRole('heading', { name: 'Fixture repo' });
    fireEvent.click(screen.getByRole('button', { name: 'Прогоны' }));
    fireEvent.click(await screen.findByRole('button', { name: /Release check/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Редактировать прогон' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Заметки' }), { target: { value: 'Execution notes' } });
    const preventDefault = vi.fn(); act(() => mocks.closeHandler({ preventDefault }));
    expect(preventDefault).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить и выйти' }));
    await screen.findByText('Не удалось сохранить файл; черновик остаётся в редакторе.');
    expect(mocks.destroy).not.toHaveBeenCalled();
    expect((screen.getByRole('textbox', { name: 'Заметки' }) as HTMLTextAreaElement).value).toBe('Execution notes');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Сохранить и выйти' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить и выйти' }));
    await waitFor(() => expect(mocks.destroy).toHaveBeenCalledTimes(1));
    expect(mocks.api.saveRunDetails.mock.calls[1]![2]).toBe('a'.repeat(64));
    expect(mocks.api.saveRunDetails.mock.calls[1]![3]).toEqual({ status: 'open', summary: 'Release smoke run.', notes: 'Execution notes' });
  });

  it('retains failed run execution draft and saves only mutable execution fields', async () => {
    const document: import('../src/repository/api/contracts').RunCaseResource = { kind: 'case', document: { revision: 'a'.repeat(64), warnings: [], model: { caseId: 'stable-case-id', displayId: 'T-1', title: 'Login works', result: 'not_run', tester: '', executedAt: '', testDate: null, notes: '${value}', setup: [], steps: [{ key: 'step:0', text: 'Frozen step', state: 'none', failNote: '' }], accept: [] } } };
    const next = { ...document, document: { ...document.document, revision: 'b'.repeat(64), model: { ...document.document.model, notes: 'Saved execution' } } };
    mocks.api.readRun.mockResolvedValue(document);
    mocks.api.saveRunCase.mockRejectedValueOnce({ code: 'SAVE_FAILED' }).mockResolvedValueOnce(next);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    await screen.findByRole('heading', { name: 'Fixture repo' });
    fireEvent.click(screen.getByRole('button', { name: 'Прогоны' }));
    fireEvent.click(await screen.findByRole('button', { name: /T-1 · Login works/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Записать результат' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Заметки' }), { target: { value: 'Saved execution' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить результат' }));
    await screen.findByText('Не удалось сохранить файл; черновик остаётся в редакторе.');
    expect((screen.getByRole('textbox', { name: 'Заметки' }) as HTMLTextAreaElement).value).toBe('Saved execution');
    const preventDefault = vi.fn(); act(() => mocks.closeHandler({ preventDefault }));
    expect(preventDefault).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить и выйти' }));
    await waitFor(() => expect(mocks.destroy).toHaveBeenCalledTimes(1));
    expect(mocks.api.saveRunCase).toHaveBeenCalledTimes(2);
    const [, , revision, edit] = mocks.api.saveRunCase.mock.calls[1]!;
    expect(revision).toBe('a'.repeat(64)); expect(edit.notes).toBe('Saved execution');
    expect(edit).not.toHaveProperty('caseId'); expect(edit.steps[0]).not.toHaveProperty('text');
  });

  it('retains the draft on save failure, blocks navigation and retries with the original revision', async () => {
    const revision = 'a'.repeat(64);
    mocks.api.readCase.mockResolvedValue({ ...caseDocument, revision });
    const next = { ...caseDocument, revision: 'b'.repeat(64), model: { ...caseDocument.model, title: 'Edited case' } };
    mocks.api.saveCase.mockRejectedValueOnce({ code: 'SAVE_FAILED' }).mockResolvedValueOnce(next);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    fireEvent.click(await screen.findByRole('treeitem', { name: /T-1 · Login works/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Редактировать кейс' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название кейса' }), { target: { value: 'Edited case' } });
    expect(screen.getByRole('button', { name: 'Закрыть' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить кейс' }));
    await screen.findByText('Не удалось сохранить файл; черновик остаётся в редакторе.');
    expect((screen.getByRole('textbox', { name: 'Название кейса' }) as HTMLInputElement).value).toBe('Edited case');
    expect(screen.getByText('Есть несохранённые изменения')).toBeTruthy();
    const preventDefault = vi.fn();
    act(() => mocks.closeHandler({ preventDefault }));
    expect(preventDefault).toHaveBeenCalled();
    await screen.findByText('Закрытие остановлено: сохраните изменения или отмените изменения.');
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить редактирование' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить кейс' }));
    await screen.findByText('Сохранено');
    expect(mocks.api.saveCase).toHaveBeenCalledTimes(2);
    const [savedSession, savedResource, expected, edit] = mocks.api.saveCase.mock.calls[1]!;
    expect([savedSession, savedResource, expected]).toEqual([session, caseId, revision]);
    expect(edit).not.toHaveProperty('id');
    expect(screen.getByRole('treeitem', { name: /T-1 · Edited case/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Просмотр' }));
    expect(screen.getByRole('heading', { name: 'T-1 · Edited case' })).toBeTruthy();
  });

  it('keeps the window and draft on close-save failure and exits only after retry succeeds', async () => {
    const source = { ...caseDocument, revision: 'a'.repeat(64) };
    mocks.api.readCase.mockResolvedValue(source);
    let finishSave: ((document: typeof source) => void) | undefined;
    mocks.api.saveCase.mockRejectedValueOnce({ code: 'SAVE_FAILED' })
      .mockImplementationOnce(() => new Promise((resolve) => { finishSave = resolve; }));
    mocks.destroy.mockRejectedValueOnce(new Error('window refuses destroy'));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    fireEvent.click(await screen.findByRole('treeitem', { name: /T-1 · Login works/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Редактировать кейс' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название кейса' }), { target: { value: 'Close draft' } });
    act(() => mocks.closeHandler({ preventDefault: vi.fn() }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить и выйти' }));
    await screen.findByText('Не удалось сохранить файл; черновик остаётся в редакторе.');
    expect(mocks.destroy).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Название кейса' }) as HTMLInputElement).value).toBe('Close draft');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Сохранить и выйти' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить и выйти' }));
    await waitFor(() => expect(mocks.api.saveCase).toHaveBeenCalledTimes(2));
    expect(mocks.destroy).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Выйти без сохранения' }).hasAttribute('disabled')).toBe(true);
    await act(async () => { finishSave?.({ ...source, revision: 'b'.repeat(64), model: { ...source.model, title: 'Close draft' } }); });
    await waitFor(() => expect(mocks.destroy).toHaveBeenCalledOnce());
    expect(screen.getByText('Не удалось закрыть окно. Черновик остаётся в приложении.')).toBeTruthy();
    expect(screen.getByText('Сохранено')).toBeTruthy();
  });

  it('combines search, status and tag filters while retaining folders and the current reader', async () => {
    const catalog = workspaceCatalog();
    const entry = catalog.entries.find((item) => item.kind === 'case')!;
    mocks.api.catalogWorkspace.mockResolvedValue({ ...catalog, entries: [...catalog.entries,
      { ...entry, metadata: { ...entry.metadata, resourceId: caseResource2, title: 'Logout works', displayId: 'T-2', status: 'draft', tags: ['session'] } },
    ] });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    fireEvent.click(await screen.findByRole('treeitem', { name: /T-1 · Login works/ }));
    await screen.findByRole('heading', { name: 'T-1 · Login works' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Поиск кейсов' }), { target: { value: ' T-2 ' } });
    expect(screen.queryByRole('treeitem', { name: /T-1 · Login works/ })).toBeNull();
    expect(screen.getByRole('treeitem', { name: /T-2 · Logout works/ })).toBeTruthy();
    expect(screen.getByRole('treeitem', { name: /Suite/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'T-1 · Login works' })).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Теги' }), { target: { value: ' AUTH ' } });
    expect(screen.getByText('Кейсы не найдены')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Статус' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Черновик' }));
    expect(screen.queryByRole('treeitem', { name: /T-1 · Login works/ })).toBeNull();
    expect(screen.getByRole('treeitem', { name: /T-2 · Logout works/ })).toBeTruthy();
    expect(mocks.api.catalogWorkspace).toHaveBeenCalledOnce();
    expect(mocks.api.readCase).toHaveBeenCalledOnce();
  });

  it('creates only after confirmation, retains failed input and reveals the new catalog resource', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    await screen.findByRole('treeitem', { name: /T-1 · Login works/ });
    fireEvent.click(screen.getByRole('button', { name: 'Создать кейс' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(mocks.api.createCase).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Создать кейс' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Название кейса' }), { target: { value: 'New case' } });
    mocks.api.createCase.mockRejectedValueOnce({ code: 'SAVE_FAILED' }).mockResolvedValueOnce({ path: 'suite/case.md' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Создать кейс' }));
    await screen.findByText('Не удалось сохранить файл; черновик остаётся в редакторе.');
    expect((within(dialog).getByRole('textbox', { name: 'Название кейса' }) as HTMLInputElement).value).toBe('New case');
    mocks.api.catalogWorkspace.mockResolvedValueOnce(workspaceCatalog(caseResource2, 'New case'));
    mocks.api.readCase.mockResolvedValueOnce({ ...caseDocument, model: { ...caseDocument.model, title: 'New case' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Создать кейс' }));
    await screen.findByRole('heading', { name: 'T-1 · New case' });
    expect(mocks.api.createCase.mock.calls[1]).toEqual([session, { workspacePath: '', parentResourceId: null, title: 'New case', source: null }]);
    expect(mocks.api.readCase).toHaveBeenCalledWith(session, caseResource2);
  });

  it('duplicates with the selected revision and blocks duplicate while the editor is dirty', async () => {
    const revision = 'a'.repeat(64);
    mocks.api.readCase.mockResolvedValue({ ...caseDocument, revision });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    fireEvent.click(await screen.findByRole('treeitem', { name: /T-1 · Login works/ }));
    const duplicate = await screen.findByRole('button', { name: 'Дублировать кейс' });
    await waitFor(() => expect(duplicate.hasAttribute('disabled')).toBe(false));
    fireEvent.click(duplicate);
    expect((within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Название кейса' }) as HTMLInputElement).value).toBe('Копия: Login works');
    mocks.api.createCase.mockRejectedValueOnce({ code: 'EXTERNAL_CHANGE' });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Дублировать кейс' }));
    await screen.findByText('Файл изменён извне. Черновик не записан поверх новой версии.');
    expect(mocks.api.createCase.mock.calls[0]).toEqual([session, { workspacePath: '', parentResourceId: folderId, title: 'Копия: Login works', source: { resourceId: caseId, expectedRevision: revision } }]);
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать кейс' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название кейса' }), { target: { value: 'Dirty' } });
    expect(screen.getByRole('button', { name: 'Дублировать кейс' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Создать кейс' }).hasAttribute('disabled')).toBe(true);
  });

  it('protects an unsubmitted new-case form on window close', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    await screen.findByRole('treeitem', { name: /T-1 · Login works/ });
    fireEvent.click(screen.getByRole('button', { name: 'Создать кейс' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название кейса' }), { target: { value: 'Unsubmitted input' } });
    const preventDefault = vi.fn();
    act(() => mocks.closeHandler({ preventDefault }));
    expect(preventDefault).toHaveBeenCalled();
    await screen.findByText('Кейс ещё не создан. Вернитесь к форме или явно выйдите без сохранения введённых данных.');
    expect(screen.queryByRole('button', { name: 'Сохранить и выйти' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить редактирование' }));
    expect((screen.getByRole('textbox', { name: 'Название кейса' }) as HTMLInputElement).value).toBe('Unsubmitted input');
    expect(mocks.api.createCase).not.toHaveBeenCalled();
    expect(mocks.destroy).not.toHaveBeenCalled();
  });

  it('moves the selected case to a folder only after confirmation and opens the new resource', async () => {
    const revision = 'a'.repeat(64);
    mocks.api.readCase.mockResolvedValue({ ...caseDocument, revision });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    fireEvent.click(await screen.findByRole('treeitem', { name: /T-1 · Login works/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Переместить кейс' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Переместить кейс' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(mocks.api.organizeCase).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Переместить кейс' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('combobox', { name: 'Папка назначения' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Корень рабочей области' }));
    mocks.api.organizeCase.mockResolvedValueOnce({ path: 'case.md' });
    const catalog = workspaceCatalog(caseResource2);
    mocks.api.catalogWorkspace.mockResolvedValueOnce({ ...catalog, entries: catalog.entries.map((entry) => entry.kind === 'case' ? { ...entry, metadata: { ...entry.metadata, path: 'case.md', parentPath: '', parentResourceId: null } } : entry) });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Переместить кейс' }));
    await waitFor(() => expect(mocks.api.readCase).toHaveBeenCalledWith(session, caseResource2));
    expect(mocks.api.organizeCase).toHaveBeenCalledWith(session, { workspacePath: '', resourceId: caseId, expectedRevision: revision, action: { kind: 'move', parentResourceId: null } });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('heading', { name: 'T-1 · Login works' })).toBeTruthy();
  });

  it('lists the exact deletion target, preserves selection on cancel/failure and clears it after success', async () => {
    mocks.api.readCase.mockResolvedValue({ ...caseDocument, revision: 'a'.repeat(64) });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    fireEvent.click(await screen.findByRole('treeitem', { name: /T-1 · Login works/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Удалить кейс' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить кейс' }));
    expect(within(screen.getByRole('dialog')).getByText('suite/case.md')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(mocks.api.organizeCase).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'T-1 · Login works' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Удалить кейс' }));
    mocks.api.organizeCase.mockRejectedValueOnce({ code: 'SAVE_FAILED' }).mockResolvedValueOnce({ path: null });
    fireEvent.click(screen.getByRole('button', { name: 'Удалить файл кейса' }));
    await screen.findByText('Не удалось выполнить операцию. Файл не изменён.');
    expect(screen.getByRole('heading', { name: 'T-1 · Login works' })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Удалить файл кейса' }).hasAttribute('disabled')).toBe(false));
    mocks.api.catalogWorkspace.mockResolvedValueOnce({ workspacePath: '', entries: [], warnings: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Удалить файл кейса' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'T-1 · Login works' })).toBeNull());
    expect(mocks.api.organizeCase.mock.calls[1]).toEqual([session, { workspacePath: '', resourceId: caseId, expectedRevision: 'a'.repeat(64), action: { kind: 'delete' } }]);
  });

  it('creates a selected snapshot run only after confirmation and opens its details after retry', async () => {
    const revision = 'a'.repeat(64);
    const catalog = workspaceCatalog();
    mocks.api.catalogWorkspace.mockResolvedValue({ ...catalog, entries: catalog.entries.map((entry) => entry.kind === 'case' ? { ...entry, metadata: { ...entry.metadata, revision } } : entry) });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    await screen.findByRole('treeitem', { name: /T-1 · Login works/ });
    fireEvent.click(screen.getByRole('button', { name: 'Создать прогон' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(mocks.api.createRun).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Создать прогон' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Название прогона' }), { target: { value: 'Snapshot run' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /T-1 · Login works/ }));
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Область' }), { target: { value: '😀'.repeat(1025) } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Создать прогон' }));
    expect(screen.getByText('Текст области слишком длинный.')).toBeTruthy();
    expect(mocks.api.createRun).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Область' }), { target: { value: '' } });
    const id = '.casewright/runs/2026-10-14-550e8400-e29b-41d4-a716-446655440000';
    mocks.api.createRun.mockRejectedValueOnce({ code: 'SAVE_FAILED' }).mockResolvedValueOnce({ runId: id });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Создать прогон' }));
    await screen.findByText('Не удалось создать прогон. Ввод сохранён, частичный прогон не опубликован.');
    expect((within(dialog).getByRole('textbox', { name: 'Название прогона' }) as HTMLInputElement).value).toBe('Snapshot run');
    expect((within(dialog).getByRole('checkbox', { name: /T-1 · Login works/ }) as HTMLInputElement).checked).toBe(true);
    mocks.api.catalogRuns.mockResolvedValue({ ...runsCatalog, runs: [{ ...runsCatalog.runs[0], runId: id, name: 'Snapshot run' }] });
    mocks.api.readRun.mockResolvedValue({ ...runDetails, document: { ...runDetails.document, model: { ...runDetails.document.model, name: 'Snapshot run' } } });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Создать прогон' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Создать прогон' }));
    await screen.findByRole('heading', { name: 'Snapshot run' });
    const creation = mocks.api.createRun.mock.calls[1]![1];
    expect(creation.name).toBe('Snapshot run');
    expect(creation.cases).toEqual([{ resourceId: caseId, expectedRevision: revision }]);
    expect(mocks.api.readRun).toHaveBeenCalledWith(session, runId);
  });

  it('requires a case selection and protects an unsubmitted run form from window close', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    await screen.findByRole('treeitem', { name: /T-1 · Login works/ });
    fireEvent.click(screen.getByRole('button', { name: 'Создать прогон' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Создать прогон' }));
    expect(mocks.api.createRun).not.toHaveBeenCalled();
    expect(screen.getAllByText('Проверьте поле: нужны название, корректная дата и от 1 до 500 кейсов.').length).toBeGreaterThan(0);
    const preventDefault = vi.fn(); act(() => mocks.closeHandler({ preventDefault }));
    expect(preventDefault).toHaveBeenCalled();
    await screen.findByText('Прогон ещё не создан. Вернитесь к форме или явно выйдите без сохранения ввода.');
    expect(screen.queryByRole('button', { name: 'Сохранить и выйти' })).toBeNull();
  });

  it('rejects an empty title without invoking native save', async () => {
    mocks.api.readCase.mockResolvedValue({ ...caseDocument, revision: 'a'.repeat(64) });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    fireEvent.click(await screen.findByRole('treeitem', { name: /T-1 · Login works/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Редактировать кейс' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название кейса' }), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить кейс' }));
    await screen.findByText('Проверьте значение поля и вложенность шагов.');
    expect(mocks.api.saveCase).not.toHaveBeenCalled();
  });
  it('saves with Ctrl+S and prevents exiting while the native save is pending', async () => {
    const source = { ...caseDocument, revision: 'a'.repeat(64) };
    mocks.api.readCase.mockResolvedValue(source);
    let finishSave: ((document: typeof source) => void) | undefined;
    mocks.api.saveCase.mockImplementationOnce(() => new Promise((resolve) => { finishSave = resolve; }));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    fireEvent.click(await screen.findByRole('treeitem', { name: /T-1 · Login works/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Редактировать кейс' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название кейса' }), { target: { value: 'Shortcut save' } });
    fireEvent.keyDown(window, { code: 'KeyS', ctrlKey: true });
    await waitFor(() => expect(mocks.api.saveCase).toHaveBeenCalledOnce());
    fireEvent.keyDown(window, { code: 'KeyS', metaKey: true });
    const preventDefault = vi.fn();
    act(() => mocks.closeHandler({ preventDefault }));
    expect(preventDefault).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Выйти без сохранения' }).hasAttribute('disabled')).toBe(true);
    expect(mocks.api.saveCase).toHaveBeenCalledOnce();
    await act(async () => { finishSave?.({ ...source, revision: 'b'.repeat(64), model: { ...source.model, title: 'Shortcut save' } }); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Сохранено')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Закрыть' }).hasAttribute('disabled')).toBe(false);
  });

  it('detects an external dirty edit and requires explicit discard before loading it', async () => {
    mocks.api.readCase.mockResolvedValue({ ...caseDocument, revision: 'a'.repeat(64) });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    fireEvent.click(await screen.findByRole('treeitem', { name: /T-1 · Login works/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Редактировать кейс' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название кейса' }), { target: { value: 'My draft' } });
    mocks.api.readCase.mockResolvedValue({ ...caseDocument, revision: 'b'.repeat(64), model: { ...caseDocument.model, title: 'External case' } });
    await screen.findByText(/Файл изменён извне. Черновик сохранён/, {}, { timeout: 3500 });
    expect((screen.getByRole('textbox', { name: 'Название кейса' }) as HTMLInputElement).value).toBe('My draft');
    expect(screen.getByText(/Файл изменён извне. Черновик сохранён/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Сохранить кейс' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить версию с диска' }));
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить редактирование' }));
    expect((screen.getByRole('textbox', { name: 'Название кейса' }) as HTMLInputElement).value).toBe('My draft');
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить версию с диска' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Отказаться и загрузить файл' })); });
    expect(screen.getByRole('heading', { name: 'T-1 · External case' })).toBeTruthy();
    expect(mocks.api.saveCase).not.toHaveBeenCalled();
  });
  it('preserves a new dirty draft when delayed metadata would remove its workspace', async () => {
    mocks.api.readCase.mockResolvedValue({ ...caseDocument, revision: 'a'.repeat(64) });
    let finish: ((value: unknown) => void) | undefined;
    mocks.api.refresh.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    renderPage(); fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    fireEvent.click(await screen.findByRole('treeitem', { name: /T-1 · Login works/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Редактировать кейс' }));
    act(() => mocks.receive({ payload: { sessionId: session, epoch: 1, kind: 'metadata', errorCode: null } }));
    await waitFor(() => expect(mocks.api.refresh).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByRole('textbox', { name: 'Название кейса' }), { target: { value: 'Preserved draft' } });
    await act(async () => finish?.({ ...opened(session), workspaces: [] }));
    expect((screen.getByRole('textbox', { name: 'Название кейса' }) as HTMLInputElement).value).toBe('Preserved draft');
    expect(screen.getByRole('treeitem', { name: /T-1 · Login works/ })).toBeTruthy();
    expect(screen.getByText(/Обнаружены внешние изменения/)).toBeTruthy();
    expect(mocks.api.catalogWorkspace).toHaveBeenCalledOnce();
  });
  it('reloads a clean selected case from native events without losing its selection', async () => {
    mocks.api.readCase.mockResolvedValue({ ...caseDocument, revision: 'a'.repeat(64) });
    renderPage(); fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    fireEvent.click(await screen.findByRole('treeitem', { name: /T-1 · Login works/ }));
    await screen.findByText('Sign in safely.');
    mocks.api.readCase.mockResolvedValue({ ...caseDocument, model: { ...caseDocument.model, title: 'External clean version' }, revision: 'b'.repeat(64) });
    mocks.api.catalogWorkspace.mockResolvedValue(workspaceCatalog(caseId, 'External clean version'));
    act(() => mocks.receive({ payload: { sessionId: session, epoch: 1, kind: 'content', errorCode: null } }));
    await screen.findByRole('heading', { name: 'T-1 · External clean version' });
    expect(mocks.api.readCase).toHaveBeenLastCalledWith(session, caseId);
  });

  it('keeps a new dirty editor mounted when a delayed catalog removes its case', async () => {
    mocks.api.readCase.mockResolvedValue({ ...caseDocument, revision: 'a'.repeat(64) });
    renderPage(); fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    fireEvent.click(await screen.findByRole('treeitem', { name: /T-1 · Login works/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Редактировать кейс' }));
    let finish: ((value: unknown) => void) | undefined;
    mocks.api.catalogWorkspace.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    act(() => mocks.receive({ payload: { sessionId: session, epoch: 1, kind: 'content', errorCode: null } }));
    await waitFor(() => expect(mocks.api.catalogWorkspace).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название кейса' }), { target: { value: 'Draft after refresh started' } });
    await act(async () => finish?.({ workspacePath: '', entries: [], warnings: [] }));
    expect((screen.getByRole('textbox', { name: 'Название кейса' }) as HTMLInputElement).value).toBe('Draft after refresh started');
    expect(screen.getByText(/Обнаружены внешние изменения/)).toBeTruthy();
    expect(mocks.api.saveCase).not.toHaveBeenCalled();
  });

  it('creates a suite after retry, reveals its folder and protects unsubmitted input on close', async () => {
    mocks.api.createSuite.mockRejectedValueOnce({ code: 'SAVE_FAILED' }).mockResolvedValueOnce({ path: 'suite/New folder' });
    renderPage(); fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    fireEvent.click(await screen.findByRole('treeitem', { name: /Suite/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Создать папку' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Имя папки' }), { target: { value: 'New folder' } });
    await act(async () => { mocks.closeHandler({ preventDefault: vi.fn() }); });
    expect(screen.getByText(/Папка ещё не создана/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить редактирование' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Создать папку' }));
    await screen.findByText('Не удалось сохранить файл; черновик остаётся в редакторе.');
    expect((within(dialog).getByRole('textbox', { name: 'Имя папки' }) as HTMLInputElement).value).toBe('New folder');
    const next: WorkspaceCatalog = workspaceCatalog();
    next.entries.push({ kind: 'folder', metadata: { nodeId: caseResource2, path: 'suite/New folder', parentPath: 'suite', parentResourceId: folderId, order: 1, name: 'New folder', displayIdPrefix: '', description: '' } });
    mocks.api.catalogWorkspace.mockResolvedValue(next);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Создать папку' }));
    await screen.findByRole('heading', { name: 'New folder' });
    expect(mocks.api.createSuite).toHaveBeenLastCalledWith(session, { workspacePath: '', parentResourceId: folderId, name: 'New folder' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('renames only after confirmation and keeps the failed filename for retry', async () => {
    mocks.api.readCase.mockResolvedValue({ ...caseDocument, revision: 'a'.repeat(64) });
    mocks.api.organizeCase.mockRejectedValueOnce({ code: 'SAVE_FAILED' }).mockResolvedValueOnce({ path: 'suite/renamed.md' });
    renderPage(); fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    fireEvent.click(await screen.findByRole('treeitem', { name: /T-1 · Login works/ }));
    await screen.findByRole('button', { name: 'Редактировать кейс' });
    fireEvent.click(screen.getByRole('button', { name: 'Переименовать файл' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Отмена' }));
    expect(mocks.api.organizeCase).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Переименовать файл' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Имя файла кейса' }), { target: { value: 'renamed.md' } });
    expect(within(dialog).getByText('suite/renamed.md')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Переименовать файл' }));
    await screen.findByText('Не удалось выполнить операцию. Файл не изменён.');
    expect((within(dialog).getByRole('textbox', { name: 'Имя файла кейса' }) as HTMLInputElement).value).toBe('renamed.md');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Переименовать файл' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mocks.api.organizeCase).toHaveBeenLastCalledWith(session, { workspacePath: '', resourceId: caseId, expectedRevision: 'a'.repeat(64), action: { kind: 'rename', filename: 'renamed.md' } });
    expect(mocks.api.saveCase).not.toHaveBeenCalled();
  });

  it('reveals a renamed suite and holds external refresh while its preview is open', async () => {
    const preview = { confirmation: session, sourcePath: 'suite', destinationPath: 'Renamed', permanentDelete: false, entries: [{ path: 'suite', kind: 'directory', revision: 'a'.repeat(64), size: 0 }], totalBytes: 0 };
    mocks.api.prepareSuiteOperation.mockResolvedValue(preview);
    mocks.api.applySuiteOperation.mockImplementation(async () => {
      const catalog = workspaceCatalog();
      catalog.entries = catalog.entries.map((entry) => entry.kind === 'folder' ? { ...entry, metadata: { ...entry.metadata, path: 'Renamed' } } : { ...entry, metadata: { ...entry.metadata, path: 'Renamed/case.md', parentPath: 'Renamed' } });
      mocks.api.catalogWorkspace.mockResolvedValue(catalog);
      return { outcome: 'applied', path: 'Renamed', recovery: null };
    });
    renderPage(); fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    fireEvent.click(await screen.findByRole('treeitem', { name: /Suite/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Переименовать папку' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Имя папки' }), { target: { value: 'Renamed' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Проверить содержимое' }));
    await within(dialog).findByRole('button', { name: 'Подтвердить операцию' });
    const refreshCount = mocks.api.refresh.mock.calls.length;
    act(() => mocks.receive({ payload: { sessionId: session, epoch: 10, kind: 'content', errorCode: null } }));
    await screen.findByText(/Обнаружены внешние изменения/);
    expect(mocks.api.refresh.mock.calls.length).toBe(refreshCount);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Подтвердить операцию' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await screen.findByRole('heading', { name: 'Suite' });
    expect(screen.getByText('Renamed', { selector: 'code' })).toBeTruthy();
    expect(mocks.api.applySuiteOperation).toHaveBeenCalledWith(session, session);
  });
  it('blocks edits and Git after suite recovery while allowing repository reopen', async () => {
    mocks.api.prepareSuiteOperation.mockResolvedValue({ confirmation: session, sourcePath: 'suite', destinationPath: null, permanentDelete: true, entries: [{ path: 'suite', kind: 'directory', revision: 'a'.repeat(64), size: 0 }], totalBytes: 0 });
    mocks.api.gitStatus.mockResolvedValue({ syncToken: session, abortToken: null, syncBlocked: false, branch: 'main', head: 'a'.repeat(40), unborn: false, detached: false, upstream: 'origin/main', ahead: 0, behind: 0, filtersDisabled: false, files: [] });
    mocks.api.applySuiteOperation.mockResolvedValue({ outcome: 'recoveryRequired', path: null, recovery: { transactionPath: `.testoritto-suite-${session}`, removedPaths: ['suite/case.md'], remainingPaths: ['suite'] } });
    renderPage(); fireEvent.click(screen.getByRole('button', { name: 'Открыть репозиторий' }));
    fireEvent.click(await screen.findByRole('treeitem', { name: /Suite/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить папку' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Проверить содержимое' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Окончательно удалить перечисленное' }));
    await within(dialog).findByText('Уже удалены');
    fireEvent.click(within(dialog).getByText('Закрыть', { selector: 'button' }));
    expect(screen.getByRole('button', { name: 'Создать папку' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Открыть репозиторий' })).toHaveProperty('disabled', false);
    fireEvent.click(screen.getByRole('treeitem', { name: /T-1 · Login works/ }));
    await screen.findByText('Sign in safely.');
    expect(screen.queryByRole('button', { name: 'Редактировать кейс' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Git' }));
    await screen.findByRole('heading', { name: 'Git' });
    expect(await screen.findByRole('button', { name: 'Создать commit…' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Получить изменения…' })).toHaveProperty('disabled', true);
  });

});
