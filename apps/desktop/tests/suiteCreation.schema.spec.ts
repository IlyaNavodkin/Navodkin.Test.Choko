import { describe, expect, it, vi } from 'vitest';
import { CaseFilenameSchema, PortableNameSchema, SuiteCreationSchema } from '../src/repository/api/contracts';
import { createRepositoryApi } from '../src/repository/api/repositoryApi';

describe('portable suite and filename contracts', () => {
  it('rejects paths, reserved components and invalid Markdown filenames before invoking native code', async () => {
    const invoke = vi.fn();
    const api = createRepositoryApi({ invoke });
    for (const name of ['', '../escape', '.git', 'CON', 'LPT².txt', 'stream:name', 'trailing.', ' space', 'a/b']) {
      expect(PortableNameSchema.safeParse(name).success).toBe(false);
      await expect(api.createSuite('550e8400-e29b-41d4-a716-446655440000', { workspacePath: '', parentResourceId: null, name })).rejects.toBeDefined();
    }
    for (const name of ['_suite.md', '_run.md', 'case.MD', 'file.txt', 'a .md']) expect(CaseFilenameSchema.safeParse(name).success).toBe(false);
    expect(PortableNameSchema.safeParse('Платежи smoke').success).toBe(true);
    expect(CaseFilenameSchema.safeParse('PAY-1-payment.md').success).toBe(true);
    expect(SuiteCreationSchema.safeParse({ workspacePath: '', parentResourceId: null, name: 'Safe', absolutePath: '/secret' }).success).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
});
