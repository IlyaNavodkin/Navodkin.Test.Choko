import { describe, expect, it } from 'vitest';
import { RunCaseEditSchema, RunDetailsEditSchema, SaveRunDetailsRequestSchema, SaveRunCaseRequestSchema } from '../src/repository/api/contracts';

const edit = { result: 'fail', tester: 'QA', executedAt: '2026-10-14T12:00:00Z', testDate: null, notes: '${value}\nKeep variables', setup: [], steps: [{ key: 'step:0', state: 'fail', failNote: 'Actual differs' }], accept: [] };
describe('run execution IPC contract', () => {
  it('accepts all supported results and rejects identity or checklist text edits', () => {
    for (const result of ['not_run', 'in_progress', 'pass', 'fail', 'blocked', 'skipped']) expect(RunCaseEditSchema.safeParse({ ...edit, result }).success).toBe(true);
    expect(RunCaseEditSchema.safeParse({ ...edit, caseId: 'replacement' }).success).toBe(false);
    expect(RunCaseEditSchema.safeParse({ ...edit, steps: [{ ...edit.steps[0], text: 'replacement' }] }).success).toBe(false);
    expect(RunCaseEditSchema.safeParse({ ...edit, steps: [{ ...edit.steps[0], failNote: 'two\nlines' }] }).success).toBe(false);
  });
  it('restricts run metadata edits to status, Summary and Notes', () => {
    const details = { status: 'closed', summary: 'Done', notes: '${variable}' };
    expect(RunDetailsEditSchema.safeParse(details).success).toBe(true);
    expect(RunDetailsEditSchema.safeParse({ ...details, testerApproval: null }).success).toBe(false);
    expect(RunDetailsEditSchema.safeParse({ ...details, testDate: '2026-10-15' }).success).toBe(false);
    expect(RunDetailsEditSchema.safeParse({ ...details, status: 'archived' }).success).toBe(false);
    expect(RunDetailsEditSchema.safeParse({ ...details, notes: 'x'.repeat(1024 * 1024) }).success).toBe(false);
    expect(SaveRunDetailsRequestSchema.safeParse({ protocolVersion: 1, sessionId: '../repo', resourceId: '_run.md', expectedRevision: 'a'.repeat(64), edit: details }).success).toBe(false);
  });
  it('requires a revision and opaque v4 resource/session IDs', () => {
    const request = { protocolVersion: 1, sessionId: '550e8400-e29b-41d4-a716-446655440000', resourceId: '550e8400-e29b-41d4-a716-446655440001', expectedRevision: 'a'.repeat(64), edit };
    expect(SaveRunCaseRequestSchema.safeParse(request).success).toBe(true);
    expect(SaveRunCaseRequestSchema.safeParse({ ...request, expectedRevision: '' }).success).toBe(false);
    expect(SaveRunCaseRequestSchema.safeParse({ ...request, resourceId: '../case.md' }).success).toBe(false);
  });
});
