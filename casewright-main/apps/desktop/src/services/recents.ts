import { node } from '@/lib/node';
import { appDataPath } from '@/lib/nwjs';
import type { Recent } from '@/types';

const FILE = 'recents.json';
const MAX = 12;

/** Path to the recents file in the OS data dir (PRD §5.1 — not in the repo). Null outside NW.js. */
function recentsFile(): string | null {
  const dir = appDataPath();
  return dir ? node.path().join(dir, FILE) : null;
}

export async function listRecents(): Promise<Recent[]> {
  const file = recentsFile();
  if (!file) return [];
  try {
    const parsed = JSON.parse(await node.fsp().readFile(file, 'utf8'));
    return Array.isArray(parsed) ? (parsed as Recent[]) : [];
  } catch {
    return [];
  }
}

async function write(list: Recent[]): Promise<void> {
  const file = recentsFile();
  if (!file) return;
  // The OS data dir may not exist yet (fresh install / portable mode).
  await node.fsp().mkdir(node.path().dirname(file), { recursive: true });
  await node.fsp().writeFile(file, JSON.stringify(list, null, 2) + '\n');
}

/** Record (or bump) a repository in the recents list, most-recent first. */
export async function addRecent(entry: Recent): Promise<Recent[]> {
  const list = await listRecents();
  const next = [entry, ...list.filter((r) => r.path !== entry.path)].slice(0, MAX);
  await write(next);
  return next;
}

export async function removeRecent(path: string): Promise<Recent[]> {
  const next = (await listRecents()).filter((r) => r.path !== path);
  await write(next);
  return next;
}
