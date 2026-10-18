import { I18nProvider } from '@codaa/ui';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/shared/i18n/i18n';
import { SuiteApplyResultSchema, SuiteOperationSchema, SuitePreviewSchema } from '../src/repository/api/contracts';
const mocks = vi.hoisted(() => ({ prepareSuiteOperation: vi.fn(), applySuiteOperation: vi.fn(), errorCodeFrom: vi.fn() }));
vi.mock('../src/repository/api/repositoryApi', () => ({ repositoryApi: mocks }));
import { OrganizeSuiteDialog, type SuiteMode } from '../src/repository/useCases/organize-suite/OrganizeSuiteDialog';
const session = '550e8400-e29b-41d4-a716-446655440000';
const folder = '550e8400-e29b-41d4-a716-446655440001';
const preview = { confirmation: session, sourcePath: 'suite', destinationPath: null, permanentDelete: true, totalBytes: 3, entries: [{ path: 'suite', kind: 'directory', revision: 'a'.repeat(64), size: 0 }, { path: 'suite/unknown.bin', kind: 'unknown', revision: 'b'.repeat(64), size: 3 }] };
function show(mode: SuiteMode = 'delete') {
  const onCancel = vi.fn(), onCompleted = vi.fn(), onRecovery = vi.fn(), onPendingChange = vi.fn();
  render(<I18nProvider language="ru"><OrganizeSuiteDialog mode={mode} sessionId={session} workspacePath="" resourceId={folder} path="suite" initialParent={null} folders={[]} onCancel={onCancel} onCompleted={onCompleted} onRecovery={onRecovery} onPendingChange={onPendingChange} /></I18nProvider>);
  return { onCancel, onCompleted, onRecovery, onPendingChange };
}
describe('suite confirmation flow', () => {
  afterEach(cleanup);
  beforeEach(() => { vi.resetAllMocks(); mocks.prepareSuiteOperation.mockResolvedValue(preview); mocks.errorCodeFrom.mockReturnValue('EXTERNAL_CHANGE'); });
  it('lists unknown contents and cancels a preview without apply', async () => {
    const callbacks = show();
    expect(mocks.prepareSuiteOperation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Проверить содержимое' }));
    expect(await screen.findByText('suite/unknown.bin')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Затронутое содержимое' })).getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(callbacks.onCancel).toHaveBeenCalledOnce();
    expect(mocks.applySuiteOperation).not.toHaveBeenCalled();
  });
  it('retains rename input and requires a fresh preview after a stale confirmation', async () => {
    mocks.prepareSuiteOperation.mockResolvedValue({ ...preview, destinationPath: 'renamed', permanentDelete: false });
    mocks.applySuiteOperation.mockRejectedValueOnce({ code: 'EXTERNAL_CHANGE' }).mockResolvedValueOnce({ outcome: 'applied', path: 'renamed', recovery: null });
    const callbacks = show('rename');
    fireEvent.change(screen.getByRole('textbox', { name: 'Имя папки' }), { target: { value: 'renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить содержимое' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Подтвердить операцию' }));
    expect(await screen.findByRole('textbox', { name: 'Имя папки' })).toHaveProperty('value', 'renamed');
    expect(screen.queryByRole('button', { name: 'Подтвердить операцию' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Проверить содержимое' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Подтвердить операцию' }));
    await waitFor(() => expect(callbacks.onCompleted).toHaveBeenCalledWith('renamed'));
    expect(mocks.prepareSuiteOperation).toHaveBeenCalledTimes(2);
    expect(mocks.applySuiteOperation).toHaveBeenCalledWith(session, session);
  });
  it('shows exact partial-delete recovery instead of reporting unchanged files or allowing retry', async () => {
    const recovery = { transactionPath: `.testoritto-suite-${session}`, removedPaths: ['suite/unknown.bin'], remainingPaths: ['suite', `.testoritto-suite-${session}/journal.json`] };
    mocks.applySuiteOperation.mockResolvedValue({ outcome: 'recoveryRequired', path: null, recovery });
    const callbacks = show();
    fireEvent.click(screen.getByRole('button', { name: 'Проверить содержимое' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Окончательно удалить перечисленное' }));
    expect(await screen.findByText('Уже удалены')).toBeTruthy();
    expect(screen.getByText('suite/unknown.bin')).toBeTruthy();
    expect(screen.getByText(recovery.transactionPath)).toBeTruthy();
    expect(callbacks.onRecovery).toHaveBeenCalledWith(recovery);
    expect(screen.getByText('Закрыть', { selector: 'button' })).toBeTruthy();
    expect(screen.queryByText(/Переносятся также/)).toBeNull();
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Проверить содержимое' })).toBeNull();
    expect(screen.queryByText(/Файл не изменён/)).toBeNull();
  });
  it('validates portable input before preparing and coalesces pending clicks', async () => {
    let resolve!: (value: typeof preview) => void;
    mocks.prepareSuiteOperation.mockImplementation(() => new Promise((done) => { resolve = done; }));
    show('duplicate');
    fireEvent.change(screen.getByRole('textbox', { name: 'Имя папки' }), { target: { value: '../bad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить содержимое' }));
    expect(mocks.prepareSuiteOperation).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Имя папки' }), { target: { value: 'Copy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить содержимое' }));
    fireEvent.click(screen.getByRole('button', { name: 'Проверить содержимое' }));
    expect(mocks.prepareSuiteOperation).toHaveBeenCalledOnce();
    expect(mocks.prepareSuiteOperation).toHaveBeenCalledWith(session, { workspacePath: '', resourceId: folder, action: { kind: 'duplicate', name: 'Copy', parentResourceId: null } });
    resolve(preview);
    await screen.findByText('suite/unknown.bin');
  });
  it('rejects foreign, inconsistent, overlong and extra contract data', () => {
    expect(SuitePreviewSchema.safeParse(preview).success).toBe(true);
    expect(SuitePreviewSchema.safeParse({ ...preview, totalBytes: 4 }).success).toBe(false);
    expect(SuitePreviewSchema.safeParse({ ...preview, entries: [...preview.entries, { ...preview.entries[1], path: 'foreign.bin', size: 0 }] }).success).toBe(false);
    expect(SuitePreviewSchema.safeParse({ ...preview, destinationPath: 'é'.repeat(600), permanentDelete: false }).success).toBe(false);
    expect(SuiteOperationSchema.safeParse({ workspacePath: '', resourceId: folder, action: { kind: 'delete', absolutePath: 'D:/private' } }).success).toBe(false);
    expect(SuiteApplyResultSchema.safeParse({ outcome: 'recoveryRequired', path: null, recovery: null }).success).toBe(false);
  });
});
