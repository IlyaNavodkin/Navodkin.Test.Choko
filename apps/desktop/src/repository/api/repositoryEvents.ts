import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { RepositoryChangeSchema, type RepositoryChange } from './contracts';

export type RepositoryChangeListener = (receive: (event: RepositoryChange) => void, invalid: () => void) => Promise<UnlistenFn>;
export const listenRepositoryChanges: RepositoryChangeListener = (receive, invalid) => listen<unknown>('repository-changed', ({ payload }) => {
  const parsed = RepositoryChangeSchema.safeParse(payload);
  if (parsed.success) receive(parsed.data); else invalid();
});
