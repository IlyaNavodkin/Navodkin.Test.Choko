import { describe, expect, it, vi } from 'vitest';
import { createRepositoryApi } from '../src/repository/api/repositoryApi';
const session = '550e8400-e29b-41d4-a716-446655440000';
const other = '550e8400-e29b-41d4-a716-446655440001';
const creation = { workspacePath: '', parentResourceId: null, title: 'New case', source: null };
function deferred() { let resolve!: (value: unknown) => void; let reject!: (reason: unknown) => void; const promise = new Promise<unknown>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const edit = { displayId: 'T-1', title: 'Saved title', slug: null, status: 'active' as const, tags: [], objective: '', systems: [], setup: [], steps: [], acceptanceCriteria: [] };
const saved = { revision: 'b'.repeat(64), warnings: [], model: { id: 'stable-case', ...edit } };
const commit = { head: 'a'.repeat(40), indexPublished: true, recoveryIndex: null };
describe('repository write barriers', () => {
  it('waits for two concurrently sent writes, then native flush before Git', async () => {
    const first = deferred(); const second = deferred(); let writes = 0;
    const invoke = vi.fn((command: string) => (command === 'save_case' || command === 'create_case') ? (++writes === 1 ? first.promise : second.promise) : Promise.resolve(command === 'flush_repository' ? null : commit));
    const api = createRepositoryApi({ invoke });
    const a = api.saveCase(session, other, 'a'.repeat(64), edit); const b = api.createCase(session, creation);
    const git = api.gitCommit(session, [other], 'saved');
    expect(invoke.mock.calls.map(([command]) => command)).toEqual(['save_case', 'create_case']);
    first.resolve(saved); await a;
    expect(invoke).toHaveBeenCalledTimes(2);
    second.resolve({ path: 'b.md' }); await b; await git;
    expect(invoke.mock.calls.map(([command]) => command)).toEqual(['save_case', 'create_case', 'flush_repository', 'git_commit']);
  });
  it('failed pending write prevents Git and close, but later retry is allowed', async () => {
    const write = deferred();
    const invoke = vi.fn((command: string) => command === 'create_case' ? write.promise : Promise.resolve(command === 'flush_repository' || command === 'close_repository' ? null : commit));
    const api = createRepositoryApi({ invoke });
    const save = api.createCase(session, creation);
    const git = api.gitCommit(session, [other], 'saved'); const close = api.close(session);
    const rejected = [expect(save).rejects.toMatchObject({ code: 'NATIVE_COMMAND_FAILED' }), expect(git).rejects.toMatchObject({ code: 'WRITE_FLUSH_FAILED' }), expect(close).rejects.toMatchObject({ code: 'WRITE_FLUSH_FAILED' })];
    write.reject(new Error('private path must not leak')); await Promise.all(rejected);
    expect(invoke).toHaveBeenCalledTimes(1);
    await api.gitCommit(session, [other], 'retry after discard');
    expect(invoke.mock.calls.map(([command]) => command)).toEqual(['create_case', 'flush_repository', 'git_commit']);
  });
  it('session isolation and no-op explicit flush validate the native reply', async () => {
    const write = deferred();
    const invoke = vi.fn((command: string) => command === 'create_case' ? write.promise : Promise.resolve(null));
    const api = createRepositoryApi({ invoke }); const save = api.createCase(session, creation);
    await api.close(other);
    expect(invoke.mock.calls.map(([command]) => command)).toEqual(['create_case', 'flush_repository', 'close_repository']);
    write.resolve({ path: 'a.md' }); await save; await api.flush(session);
    invoke.mockResolvedValueOnce({ secret: '/private' });
    await expect(api.flush(session)).rejects.toMatchObject({ code: 'INVALID_NATIVE_RESPONSE' });
  });
});
