import { existsSync } from 'node:fs';
import { findpath } from 'nw';

/** Resolve the native executable before starting Vite: the nw CLI can exit silently when its runtime is missing. */
export async function resolveDevRuntime(findExecutable = findpath, exists = existsSync) {
  const executable = await findExecutable();
  if (!exists(executable)) {
    throw new Error(`NW.js runtime is missing: ${executable}\nRun "pnpm --filter @choko/desktop rebuild nw", then retry "pnpm dev".`);
  }
  return executable;
}
