import { node } from '@/lib/node';
import { runtimeVersions } from '@/lib/nwjs';
import type { Case, Run, RunRow } from '@/types';
import { parseDefectFile, serializeDefectFile, type DefectDraft, type DefectEvidence } from '@/utils/defect';
import { markWrite } from './repo-self-write';
import { readMaybe, resolveRepoWritePath, writeFileAtomic } from './repo-fs';

// ---------------------------------------------------------------------------
// Defect snapshot storage.
//
// One frozen Markdown file per (run, case), plus a sibling evidence folder:
//
//   .ch/defects/<run-stem>/<display-id>.md
//   .ch/defects/<run-stem>/<display-id>.evidence/001-screenshot.png
//
// The file is the snapshot: reopening it never reads the live case again. Writes go through
// the guarded repo helpers so a defect can never land outside the repository.
// ---------------------------------------------------------------------------

export const DEFECTS_DIR = '.ch/defects';

/**
 * Default environment line for a new snapshot: the app/runtime versions plus any HTTP(S)
 * systems from the case. The tester can edit it in the composer.
 */
export function environmentFor(kase?: Case): string {
  const parts: string[] = [];
  if (typeof __APP_VERSION__ === 'string' && __APP_VERSION__) parts.push(`Choko ${__APP_VERSION__}`);
  try {
    const os = node.os();
    parts.push(`${os.type()} ${os.release()}`);
  } catch {
    /* plain browser / tests without Node — skip the OS line */
  }
  const v = runtimeVersions();
  if (v.nw) parts.push(`NW.js ${v.nw}${v.chromium ? ` · Chromium ${v.chromium}` : ''}`);
  const urls = (kase?.systems ?? []).map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s));
  parts.push(...urls);
  return parts.join(' · ');
}

/** Filesystem-safe fragment for a display id / evidence filename. */
const safeName = (s: string): string => s.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'defect';

/** The run folder's basename (`2026-10-20-regression`), never the whole path. */
export function runStem(run: Run): string {
  return node.path().basename(run.file.replace(/\\/g, '/'));
}

export function defectDirRel(run: Run): string {
  return `${DEFECTS_DIR}/${safeName(runStem(run))}`;
}

export function defectRel(run: Run, row: RunRow): string {
  return `${defectDirRel(run)}/${safeName(row.display_id)}.md`;
}

export function evidenceDirRel(run: Run, row: RunRow): string {
  return `${defectDirRel(run)}/${safeName(row.display_id)}.evidence`;
}

/** Read a saved snapshot, or null when it has not been created yet. */
export async function loadDefect(repoPath: string, run: Run, row: RunRow): Promise<DefectDraft | null> {
  const raw = await readMaybe(node.path().join(repoPath, defectRel(run, row)));
  return raw ? parseDefectFile(raw) : null;
}

/** Write (or overwrite) the snapshot. Returns its repo-relative path. */
export async function saveDefect(repoPath: string, run: Run, row: RunRow, draft: DefectDraft): Promise<string> {
  const rel = defectRel(run, row);
  const next = { ...draft, updatedAt: new Date().toISOString() };
  await writeFileAtomic(repoPath, rel, serializeDefectFile(next));
  return rel;
}

/** Copy one picked file into the defect's evidence folder; returns the new reference. */
export async function addEvidenceFile(
  repoPath: string,
  run: Run,
  row: RunRow,
  sourceAbs: string,
): Promise<DefectEvidence> {
  const path = node.path();
  const fsp = node.fsp();
  const base = safeName(path.basename(sourceAbs));
  const dir = evidenceDirRel(run, row);

  let n = 1;
  try {
    const names = await fsp.readdir(path.join(repoPath, dir));
    n =
      names.reduce((max, name) => {
        const m = /^(\d+)-/.exec(name);
        return m ? Math.max(max, Number(m[1])) : max;
      }, 0) + 1;
  } catch {
    /* folder does not exist yet — start at 001 */
  }

  const name = `${String(n).padStart(3, '0')}-${base}`;
  const rel = `${dir}/${name}`;
  const target = await resolveRepoWritePath(repoPath, rel);
  markWrite(rel);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.copyFile(sourceAbs, target);
  return { path: rel, name };
}
