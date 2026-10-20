import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Case, Run, RunRow } from '@/types';
import { buildDefectDraft } from '@/utils/defect';
import { addEvidenceFile, defectRel, loadDefect, saveDefect } from './defects';

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});

const repo = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'casewright-defect-'));
  cleanup.push(dir);
  return dir;
};

const kase: Case = {
  id: 'c1',
  displayId: 'RND-0002',
  title: 'Sequence Generator',
  status: 'active',
  tags: [],
  suite: 's',
  objective: 'Verify the generator.',
  systems: ['https://www.random.org/sequences/'],
  setup: [],
  steps: [{ text: 'Set "smallest value" to 1.', depth: 0 }],
  expected: ['A permutation is returned.'],
  modified: false,
};

const row: RunRow = {
  case_id: 'c1',
  display_id: 'RND-0002',
  title: 'Sequence Generator',
  result: 'fail',
  tester: 'jpatel',
  executed_at: '2026-10-20 15:49',
  notes: '',
  checks: { 'step:0': 'fail' },
  failNotes: { 'step:0': 'the field rejects 1' },
  file: '.casewright/runs/r1/001-RND-0002.md',
};

const run: Run = {
  id: '.casewright/runs/r1',
  name: 'Regression',
  file: '.casewright/runs/r1',
  created: '2026-10-20',
  testDate: '2026-10-20',
  status: 'open',
  scope: 'repo',
  rows: [row],
  summary: '',
  notes: '',
  testerApproval: null,
  reviewerApproval: null,
};

describe('defect snapshots', () => {
  it('saves a frozen markdown file and reads it back', async () => {
    const dir = await repo();
    const draft = buildDefectDraft(run, row, kase, {
      now: new Date('2026-10-20T15:52:00Z'),
      environment: 'Chrome 141 · Windows 11',
    });
    const rel = await saveDefect(dir, run, row, draft);
    expect(rel).toBe('.casewright/defects/r1/RND-0002.md');

    const raw = await readFile(join(dir, rel), 'utf8');
    expect(raw).toContain('schema_version: 1');
    expect(raw).toContain('# [RND-0002] Sequence Generator');
    expect(raw).toContain('  ✗ the field rejects 1');

    const loaded = await loadDefect(dir, run, row);
    expect(loaded?.displayId).toBe('RND-0002');
    expect(loaded?.summary).toBe(draft.summary);
    expect(loaded?.actual).toContain('the field rejects 1');
  });

  it('copies an evidence file into the snapshot folder', async () => {
    const dir = await repo();
    const source = join(dir, 'shot.png');
    await writeFile(source, 'not-really-a-png');

    const e = await addEvidenceFile(dir, run, row, source);
    expect(e.path).toBe('.casewright/defects/r1/RND-0002.evidence/001-shot.png');
    expect((await stat(join(dir, e.path))).isFile()).toBe(true);
  });

  it('names the defect file from the run + display id', () => {
    expect(defectRel(run, row)).toBe('.casewright/defects/r1/RND-0002.md');
  });
});
