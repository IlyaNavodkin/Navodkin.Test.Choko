import { RunCaseEditSchema, type RunCaseResource, type RunCaseEdit } from '../../api/contracts';
import { RepositoryApiError } from '../../api/repositoryApi';
import { useEditRunResource, type RunEditAdapter, type UseEditRunResourceArgs } from '../edit-run/useEditRunResource';
const adapter: RunEditAdapter<RunCaseResource, RunCaseEdit> = {
  schema: RunCaseEditSchema,
  toEdit: ({ document: { model } }) => {
    const checks = (items: typeof model.steps) => items.map(({ text: _text, ...edit }) => edit);
    return { result: model.result, tester: model.tester, executedAt: model.executedAt, testDate: model.testDate, notes: model.notes, setup: checks(model.setup), steps: checks(model.steps), accept: checks(model.accept) };
  },
  canEdit: (resource) => Boolean(resource.document.model.caseId),
  read: async (api, sessionId, resourceId) => { const next = await api.readRun(sessionId, resourceId); if (next.kind !== 'case') throw new RepositoryApiError('INVALID_NATIVE_RESPONSE'); return next; },
  save: (api, sessionId, resourceId, revision, edit) => api.saveRunCase(sessionId, resourceId, revision, edit),
};
export type UseEditRunCaseArgs = Omit<UseEditRunResourceArgs<RunCaseResource, RunCaseEdit>, 'adapter'>;
export function useEditRunCase(args: UseEditRunCaseArgs) { return useEditRunResource({ ...args, adapter }); }
export type UseEditRunCaseResult = ReturnType<typeof useEditRunCase>;
