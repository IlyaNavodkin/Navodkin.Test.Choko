import type { ArgumentDefinition, ArgumentValue, Attempt, AutomationReport, Autotest, CaseAutotestBinding, EnvironmentEntry, InvocationSnapshot, PrimitiveValue, TestRecord } from '@testoritto/playwright-automation';

export type { ArgumentDefinition, ArgumentValue, Attempt, AutomationReport, Autotest, CaseAutotestBinding, EnvironmentEntry, InvocationSnapshot, PrimitiveValue, TestRecord };

/** Demo execution state, mirroring the v1 report terminal states. */
export type ExecutionState = 'running' | 'completed' | 'runner_error' | 'interrupted' | 'timed_out';
export type DemoExecution = {
  executionId: string; parentExecutionId: string | null; profileId: string; state: ExecutionState; reason: string | null;
  createdAt: string; startedAt: string; finishedAt: string | null; started: StableKey[];
  snapshots: InvocationSnapshot[]; records: TestRecord[];
  logs: { stdout: string; stderr: string; truncated: boolean };
  runnerErrors: { message: string; stack: string | null }[];
  attachmentCount: number;
  /** Present only for a completed execution: the bridge accepts no other state as a valid final report. */
  report: AutomationReport | null;
  importSourceHash?: string; importFormat?: ImportFormat;
  /** True when two invocations shared one stable key: the v1 report contract rejects such a selection. */
  duplicateSelection?: boolean;
};
export type StableKey = { caseId: string; automationId: string; project: string; variantId: string };
export type DiscoveryTest = { key: StableKey; title: string; file: string; expectedStatus: 'passed' | 'failed' | 'skipped' };
export type DiscoveryCatalog = { catalogRevision: string; tests: DiscoveryTest[]; dependencies: string[] };
export type ReportArtifact = { id: string; name: string; relativePath: string; contentType: string; size: number; sha256: string | null; saved: boolean };
export type DemoExecutionReport = { report: string | null; junit: string | null };

/** Demo layout states of this section; the real backend errors are typed codes. */
export const automationStates = ['normal', 'untrusted', 'unsupportedVersion', 'discoveryFailed', 'runnerError', 'saveFailed'] as const;
export type AutomationState = typeof automationStates[number];

export type ArgumentRow = {
  key: string; label: string; description: string; required: boolean;
  type: ArgumentDefinition['type']; format: '' | 'url' | 'ip';
  defaultValue: string; options: string; min: string; max: string;
};
export type AutotestDraft = { title: string; description: string; profileId: string; automationId: string; project: string; variantId: string; rows: ArgumentRow[] };
export type ArgumentOverridesDraft = Record<string, { source: 'inherit' | 'literal' | 'environment'; literal: string; entryId: string; key: string }>;
export type BindingDraft = { autotestId: string; enabled: boolean; overrides: ArgumentOverridesDraft };
export type ImportFormat = 'testoritto' | 'playwright' | 'junit';
export type ImportRowView = { index: number; status: 'matched' | 'duplicate' | 'unmatched'; outcome: string; title: string; file: string; identity: StableKey | null };
export type ImportPreviewView = { format: ImportFormat; foreignRun: boolean; metadataMissing: boolean; duplicateImport: boolean; executionConflict: boolean; rows: ImportRowView[]; sourceHash: string; parsed: unknown };
export type AttemptPlan = 'passed' | 'failed' | 'timedOut' | 'skipped';
