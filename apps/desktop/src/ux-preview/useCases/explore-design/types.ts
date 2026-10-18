export type PreviewSection = 'cases' | 'runs' | 'automation' | 'git' | 'glossary';
export type CaseStatus = 'active' | 'draft' | 'deprecated';
export type ResultState = 'not_run' | 'in_progress' | 'pass' | 'fail' | 'blocked' | 'skipped';
export type CheckState = 'none' | 'pass' | 'fail';
export type DemoCase = {
  id: string; displayId: string; title: string; folder: string; status: CaseStatus;
  tags: string[]; systems?: string; filename?: string; objective: string; setup: string; steps: string[]; expected: string;
};
export type CaseDraft = Pick<DemoCase, 'title' | 'status' | 'tags' | 'objective' | 'setup' | 'steps' | 'expected'> & { systems: string };
export type ResultDraft = { result: ResultState; tester: string; notes: string; checks: CheckState[]; failNotes: string[] };
export type DemoRun = { id: string; name: string; date: string; closed: boolean; summary: string; notes: string; snapshots: DemoCase[]; results: ResultDraft[] };
export type DemoFile = { path: string; kind: 'modified' | 'untracked' | 'staged'; before: string[]; after: string[] };
export type CaseFilters = { search: string; status: string; tag: string; folder: string };
