import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/shared/i18n/i18n';
import { RuntimeDiagnosticsPage } from '../src/desktop-platform/useCases/runtime-diagnostics/RuntimeDiagnosticsPage';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  isNativeRuntime: true,
  RuntimeApiError: class RuntimeApiError extends Error {
    constructor(readonly code: string) { super(code); }
  },
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => mocks.isNativeRuntime }));
vi.mock('../src/desktop-platform/api/runtimeDiagnosticsApi', () => ({
  RuntimeApiError: mocks.RuntimeApiError,
  runtimeDiagnosticsApi: { get: mocks.get },
}));

const diagnostics = {
  appVersion: '0.1.0',
  platform: 'windows',
  architecture: 'x86_64',
  nativeRuntime: true,
} as const;

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RuntimeDiagnosticsPage />
    </QueryClientProvider>,
  );
}

describe('RuntimeDiagnosticsPage', () => {
  beforeEach(() => {
    mocks.isNativeRuntime = true;
    mocks.get.mockReset();
  });

  afterEach(cleanup);

  it('shows an explicit unsupported state in a browser preview and no fake repo actions', () => {
    mocks.isNativeRuntime = false;
    renderPage();

    expect(screen.getByText('Откройте приложение Testoritto')).toBeTruthy();
    expect(screen.getByText(/не подключено/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /открыть|сохранить|git/i })).toBeNull();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('shows retry after a native error and renders validated diagnostics on success', async () => {
    mocks.get
      .mockRejectedValueOnce(new mocks.RuntimeApiError('UNAUTHORIZED_WEBVIEW'))
      .mockResolvedValueOnce(diagnostics);
    renderPage();

    const retry = await screen.findByRole('button', { name: 'Повторить проверку' });
    expect(screen.getByText('Запрос пришёл из неразрешённого окна приложения.')).toBeTruthy();
    expect(screen.queryByText('UNAUTHORIZED_WEBVIEW')).toBeNull();
    await userEvent.click(retry);

    expect(await screen.findByText('Native runtime отвечает')).toBeTruthy();
    expect(screen.getByText('0.1.0')).toBeTruthy();
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });
});
