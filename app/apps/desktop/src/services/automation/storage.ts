import { node } from '@/lib/node';
import {
  AUTOMATION_SCHEMA_VERSION,
  type ExecutionManifest,
  type ExecutionState,
} from '@/schemas/automation';

// ---------------------------------------------------------------------------
// Execution storage (`.testoritto/automation/executions/<id>/`): the manifest is written *before*
// the process starts and rewritten with the terminal state, so a crash still leaves a record that
// can be reconciled on the next open (spec "Observable execution lifecycle"). The report and logs
// sit beside it. This module never touches run data — results are copied into a run explicitly.
// ---------------------------------------------------------------------------

export const AUTOMATION_DIR = '.testoritto/automation';
export const EXECUTIONS_DIR = `${AUTOMATION_DIR}/executions`;

export const executionRel = (executionId: string): string => `${EXECUTIONS_DIR}/${executionId}`;

/** Whether a directory name is a safe execution id (it becomes a path segment). */
export const isSafeExecutionId = (id: string): boolean => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id);

/** Deterministic JSON: stable key order so diffs stay small and merges are predictable. */
export function stableStringify(value: unknown, indent = 2): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      const obj = v as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(obj)
          .filter((k) => obj[k] !== undefined)
          .sort()
          .map((k) => [k, sort(obj[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(sort(value), null, indent) + '\n';
}

let manifestSeq = 0;

/** Write (or rewrite) the manifest of one execution. */
export async function writeExecutionManifest(repoPath: string, manifest: ExecutionManifest): Promise<void> {
  if (!isSafeExecutionId(manifest.executionId)) throw new Error(`Not a usable execution id: ${manifest.executionId}`);
  const rel = `${executionRel(manifest.executionId)}/manifest.json`;
  const abs = node.path().join(repoPath, rel);
  await node.fsp().mkdir(node.path().dirname(abs), { recursive: true });
  // A unique temp per write: two state updates in the same millisecond must not collide.
  const temp = `${abs}.${process.pid}.${manifestSeq++}.tmp`;
  await node.fsp().writeFile(temp, stableStringify({ ...manifest, schemaVersion: AUTOMATION_SCHEMA_VERSION }));
  await node.fsp().rename(temp, abs);
}

/** Read one manifest; `null` when absent or unreadable (a broken execution is skipped, not fatal). */
export async function readExecutionManifest(repoPath: string, executionId: string): Promise<ExecutionManifest | null> {
  if (!isSafeExecutionId(executionId)) return null;
  try {
    const raw = await node.fsp().readFile(node.path().join(repoPath, executionRel(executionId), 'manifest.json'), 'utf8');
    const parsed = JSON.parse(raw) as ExecutionManifest;
    if (!parsed || typeof parsed !== 'object' || !parsed.executionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Every execution id present on disk, newest first (by id, which starts with a timestamp). */
export async function listExecutionIds(repoPath: string): Promise<string[]> {
  try {
    const entries = await node.fsp().readdir(node.path().join(repoPath, EXECUTIONS_DIR), { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && isSafeExecutionId(e.name))
      .map((e) => e.name)
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/** All readable manifests, newest first. */
export async function listExecutions(repoPath: string): Promise<ExecutionManifest[]> {
  const ids = await listExecutionIds(repoPath);
  const out: ExecutionManifest[] = [];
  for (const id of ids) {
    const m = await readExecutionManifest(repoPath, id);
    if (m) out.push(m);
  }
  return out;
}

const ACTIVE: readonly ExecutionState[] = ['queued', 'starting', 'running', 'finishing'];

/**
 * Reconcile executions left in a non-terminal state by a crash/quit: they are marked `interrupted`
 * so reopening never shows a phantom "running" (spec "Cancel and crash are distinct").
 */
export async function reconcileStaleExecutions(repoPath: string): Promise<ExecutionManifest[]> {
  const fixed: ExecutionManifest[] = [];
  for (const m of await listExecutions(repoPath)) {
    if (!ACTIVE.includes(m.state)) continue;
    const next: ExecutionManifest = { ...m, state: 'interrupted', error: m.error ?? 'The app closed before this run finished.' };
    await writeExecutionManifest(repoPath, next);
    fixed.push(next);
  }
  return fixed;
}
