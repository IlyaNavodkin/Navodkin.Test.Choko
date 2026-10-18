// ---------------------------------------------------------------------------
// Minimal unified-diff (git patch) parser for the commit window's diff view.
// Turns raw `git diff` output into one entry per file with typed display lines;
// it only needs to *render* a patch, so file headers (index/mode/similarity)
// are folded away and everything else is passed through verbatim.
// ---------------------------------------------------------------------------

export type PatchLineType = 'add' | 'del' | 'ctx' | 'hunk';

export interface PatchLine {
  t: PatchLineType;
  /** The raw line including its leading `+` / `-` / space / `@@` marker. */
  text: string;
}

export interface FilePatch {
  /** Repo-relative path (the `b/` side; the `a/` side for a deletion). */
  path: string;
  /** True when the patch creates / deletes the whole file. */
  created: boolean;
  deleted: boolean;
  lines: PatchLine[];
}

const FILE_HEADER = /^diff --git (?:"?a\/(.+?)"?) (?:"?b\/(.+?)"?)$/;
/** Header noise between `diff --git` and the first hunk that the view never shows. */
const META =
  /^(index |old mode |new mode |similarity index |rename (from|to) |copy (from|to) |Binary files |\\ No newline)/;

/**
 * Parse `git diff` text into per-file display models. Tolerant by construction:
 * unrecognized lines inside a file are kept as context so nothing is silently lost.
 */
export function parsePatch(text: string): FilePatch[] {
  const files: FilePatch[] = [];
  let cur: FilePatch | null = null;

  for (const line of (text ?? '').split('\n')) {
    const head = FILE_HEADER.exec(line);
    if (head) {
      cur = { path: head[2] || head[1], created: false, deleted: false, lines: [] };
      files.push(cur);
      continue;
    }
    if (!cur) continue; // preamble before any file header
    if (line.startsWith('new file mode')) {
      cur.created = true;
      continue;
    }
    if (line.startsWith('deleted file mode')) {
      cur.deleted = true;
      continue;
    }
    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      // Prefer the `+++ b/…` path (it survives renames); `/dev/null` marks create/delete.
      const m = /^\+\+\+ "?b\/(.+?)"?$/.exec(line);
      if (m) cur.path = m[1];
      continue;
    }
    if (META.test(line)) continue;
    if (line.startsWith('@@')) cur.lines.push({ t: 'hunk', text: line });
    else if (line.startsWith('+')) cur.lines.push({ t: 'add', text: line });
    else if (line.startsWith('-')) cur.lines.push({ t: 'del', text: line });
    else if (line !== '' || cur.lines.length) cur.lines.push({ t: 'ctx', text: line });
  }

  // A trailing blank context line is just the split() artifact of the final newline.
  for (const f of files) {
    while (f.lines.length && f.lines[f.lines.length - 1].t === 'ctx' && f.lines[f.lines.length - 1].text === '')
      f.lines.pop();
  }
  return files;
}
