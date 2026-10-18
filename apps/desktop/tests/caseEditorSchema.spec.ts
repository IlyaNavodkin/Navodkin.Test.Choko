import { describe, expect, it } from 'vitest';
import { CaseEditSchema, SaveCaseRequestSchema } from '../src/repository/api/contracts';
const edit = { displayId: 'T-1', title: 'Title', slug: null, status: 'active', tags: [], objective: '', systems: [], setup: [], steps: [], acceptanceCriteria: [] };
describe('case editor contract', () => {
  it('allows nested steps but rejects depth jumps and multiline rows', () => {
    expect(CaseEditSchema.safeParse({ ...edit, steps: [{ text: 'Parent', depth: 0 }, { text: 'Child', depth: 1 }] }).success).toBe(true);
    expect(CaseEditSchema.safeParse({ ...edit, steps: [{ text: 'Child', depth: 1 }] }).success).toBe(false);
    expect(CaseEditSchema.safeParse({ ...edit, steps: [{ text: 'Parent', depth: 0 }, { text: 'Child', depth: 3 }] }).success).toBe(false);
    expect(CaseEditSchema.safeParse({ ...edit, tags: ['x\ny'] }).success).toBe(false);
  });
  it('never accepts an identity or path in the save payload', () => {
    const request = { protocolVersion: 1, sessionId: '550e8400-e29b-41d4-a716-446655440000', resourceId: '550e8400-e29b-41d4-a716-446655440001', expectedRevision: 'a'.repeat(64), edit };
    expect(SaveCaseRequestSchema.safeParse(request).success).toBe(true);
    expect(SaveCaseRequestSchema.safeParse({ ...request, path: 'C:/outside' }).success).toBe(false);
    expect(SaveCaseRequestSchema.safeParse({ ...request, edit: { ...edit, id: 'replacement-id' } }).success).toBe(false);
    expect(SaveCaseRequestSchema.safeParse({ ...request, expectedRevision: 'BAD' }).success).toBe(false);
  });
  it('matches native UTF-8 byte limits for Cyrillic fields', () => {
    expect(CaseEditSchema.safeParse({ ...edit, title: 'я'.repeat(2048) }).success).toBe(true);
    expect(CaseEditSchema.safeParse({ ...edit, title: 'я'.repeat(2049) }).success).toBe(false);
    expect(CaseEditSchema.safeParse({ ...edit, displayId: 'я'.repeat(257) }).success).toBe(false);
  });
});
