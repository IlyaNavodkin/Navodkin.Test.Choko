import { createHash, randomUUID } from 'node:crypto';
import { open, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LIMITS, ManifestSchema } from './contracts';
import type { AutomationReport, Manifest } from './contracts';
export async function readBounded(file: string, max = LIMITS.reportBytes): Promise<string> {
  const handle = await open(file, 'r');
  try {
    if ((await handle.stat()).size > max) throw new Error('LIMIT_EXCEEDED: file size');
    const buffer = Buffer.alloc(max + 1);
    let total = 0;
    while (total <= max) { const { bytesRead } = await handle.read(buffer, total, max + 1 - total, null); if (!bytesRead) break; total += bytesRead; }
    if (total > max) throw new Error('LIMIT_EXCEEDED: file size');
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, total));
  } finally { await handle.close(); }
}
export async function readManifest(file: string): Promise<Manifest> { return ManifestSchema.parse(JSON.parse(await readBounded(file))); }
export async function descendant(root: string, file: string): Promise<string> {
  const canonical = await realpath(file), relative = path.relative(await realpath(root), canonical);
  if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error('PATH_DENIED');
  return canonical;
}
export async function atomicJson(root: string, name: string, value: unknown): Promise<void> {
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) > LIMITS.reportBytes) throw new Error('LIMIT_EXCEEDED: report');
  const temporary = path.join(root, `${name}.${randomUUID()}.tmp`);
  await writeFile(temporary, text, { flag: 'wx', mode: 0o600 });
  await rename(temporary, path.join(root, name));
}
export const digest = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export async function fileDigest(file: string): Promise<string> { const size = (await stat(file)).size; if (size > 16 * 1024 * 1024) throw new Error('LIMIT_EXCEEDED: source'); return digest(await readFile(file)); }
export function baseReport(manifest: Manifest): AutomationReport {
  const { profile: _profile, outputRoot: _root, operation: _operation, ...metadata } = manifest;
  return { ...metadata, state: 'runner_error', reason: 'Runner did not complete', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), complete: true, tests: [], runnerErrors: [], logs: { stdout: '', stderr: '', truncated: false }, attachments: [] };
}
export function errorRecord(error: unknown) { const e = error instanceof Error ? error : new Error(String(error)); return { message: e.message.slice(0, 16_384), stack: e.stack?.slice(0, 32_768) ?? null }; }
export function consumeLog(report: AutomationReport, text: string, state: { remaining: number }): string {
  const bytes = Buffer.from(text), clipped = bytes.subarray(0, state.remaining);
  state.remaining -= clipped.length;
  if (bytes.length !== clipped.length) report.logs.truncated = true;
  // Decoding at a byte boundary must not create replacement bytes beyond the budget.
  return new TextDecoder('utf-8', { fatal: false }).decode(clipped, { stream: true });
}
