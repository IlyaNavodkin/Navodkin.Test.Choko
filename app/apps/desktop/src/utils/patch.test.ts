import { describe, expect, it } from 'vitest';
import { parsePatch } from './patch';

const MODIFY = `diff --git a/suite/case.md b/suite/case.md
index 3f2a1b0..9c4d5e6 100644
--- a/suite/case.md
+++ b/suite/case.md
@@ -1,4 +1,4 @@
 ---
-title: Old title
+title: New title
 status: active
 ---
`;

const CREATE = `diff --git a/.casewright/runs/r1/_run.md b/.casewright/runs/r1/_run.md
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/.casewright/runs/r1/_run.md
@@ -0,0 +1,2 @@
+---
+name: Sprint 14
`;

const DELETE = `diff --git a/old.md b/old.md
deleted file mode 100644
index abc1234..0000000
--- a/old.md
+++ /dev/null
@@ -1,1 +0,0 @@
-gone
`;

describe('parsePatch', () => {
  it('parses a modification into typed lines and strips header noise', () => {
    const [f] = parsePatch(MODIFY);
    expect(f.path).toBe('suite/case.md');
    expect(f.created).toBe(false);
    expect(f.deleted).toBe(false);
    expect(f.lines.map((l) => l.t)).toEqual(['hunk', 'ctx', 'del', 'add', 'ctx', 'ctx']);
    expect(f.lines[2].text).toBe('-title: Old title');
    expect(f.lines[3].text).toBe('+title: New title');
    expect(f.lines.some((l) => l.text.startsWith('index '))).toBe(false);
  });

  it('flags created and deleted files and keeps the real path across /dev/null sides', () => {
    const [created] = parsePatch(CREATE);
    expect(created).toMatchObject({ path: '.casewright/runs/r1/_run.md', created: true, deleted: false });
    expect(created.lines.filter((l) => l.t === 'add')).toHaveLength(2);

    const [deleted] = parsePatch(DELETE);
    expect(deleted).toMatchObject({ path: 'old.md', created: false, deleted: true });
    expect(deleted.lines.filter((l) => l.t === 'del')).toHaveLength(1);
  });

  it('splits a multi-file patch into one entry per file', () => {
    const files = parsePatch(MODIFY + CREATE + DELETE);
    expect(files.map((f) => f.path)).toEqual(['suite/case.md', '.casewright/runs/r1/_run.md', 'old.md']);
  });

  it('returns an empty list for empty or headerless input', () => {
    expect(parsePatch('')).toEqual([]);
    expect(parsePatch('not a patch\nat all')).toEqual([]);
  });
});
