import { RunDetailsEditSchema, type RunDetailsResource, type RunDetailsEdit } from '../../api/contracts';
import { RepositoryApiError } from '../../api/repositoryApi';
import { useEditRunResource, type RunEditAdapter, type UseEditRunResourceArgs } from './useEditRunResource';
const adapter: RunEditAdapter<RunDetailsResource, RunDetailsEdit> = {
  schema: RunDetailsEditSchema,
  toEdit: ({ document: { model } }) => ({ status: model.status, summary: model.summary, notes: model.notes }),
  canEdit: () => true,
  read: async (api, sessionId, resourceId) => { const next = await api.readRun(sessionId, resourceId); if (next.kind !== 'details') throw new RepositoryApiError('INVALID_NATIVE_RESPONSE'); return next; },
  save: (api, sessionId, resourceId, revision, edit) => api.saveRunDetails(sessionId, resourceId, revision, edit),
};
export type UseEditRunDetailsArgs = Omit<UseEditRunResourceArgs<RunDetailsResource, RunDetailsEdit>, 'adapter'>;
export function useEditRunDetails(args: UseEditRunDetailsArgs) { return useEditRunResource({ ...args, adapter }); }
export type UseEditRunDetailsResult = ReturnType<typeof useEditRunDetails>;
