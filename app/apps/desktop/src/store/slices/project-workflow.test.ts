import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { useAppStore } from '../app-store';

let base = '';
afterEach(async () => {
  if (useAppStore.getState().repoPath) await useAppStore.getState().refreshStatus();
  useAppStore.getState().goHome();
  if (base) await rm(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  base = '';
});
describe('first project workflow', () => {
  it('opens a created project and saves its first case in the root workspace', async () => {
    base = await mkdtemp(join(tmpdir(), 'choko-first-project-'));
    useAppStore.setState({ refDirty: false, repoPath: '', loading: false, error: null, screen: 'launcher' });
    expect(await useAppStore.getState().createProject({ name: 'My tests', parentPath: base })).toBe(true);
    let state = useAppStore.getState();
    expect(state.screen).toBe('main');
    expect(state.workspace?.path).toBe('');
    expect(state.cases).toEqual([]);
    state.createCase(null);
    state = useAppStore.getState();
    expect(state.cases).toHaveLength(1);
    const kase = state.cases[0];
    expect(kase.suite).toBe(state.workspace?.id);
    expect(kase.displayId).toBe('QA-0001');
    const file = join(state.repoPath, state.casePath(kase));
    await vi.waitFor(async () => { expect(await readFile(file, 'utf8')).toContain('QA-0001'); });
  });
  it('surfaces setup errors without leaving the launcher loading forever', async () => {
    useAppStore.setState({ refDirty: false, repoPath: '', screen: 'launcher' });
    expect(await useAppStore.getState().createProject({ name: '../bad', parentPath: 'C:\\invalid' })).toBe(false);
    expect(useAppStore.getState().loading).toBe(false);
    expect(useAppStore.getState().error).toBeTruthy();
  });
});
