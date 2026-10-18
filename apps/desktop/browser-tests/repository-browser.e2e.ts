import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { SuiteOperation, SuitePreview, SuiteCreation, WorkspaceCatalog, RunCreation, CaseOperation, CaseCreation, CaseEdit, RunCaseEdit, RunDetailsEdit, RunResource, RunDetailsResource, CaseDocument, RunsCatalog, GitStatus, GitDiff } from '../src/repository/api/contracts';

const tauriConfigSchema = z.object({
  app: z.object({ security: z.object({ csp: z.string() }) }),
});
const tauriConfig = tauriConfigSchema.parse(JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8')));
const captureEvidence = (page: Page, name: string) => page.screenshot({
  path: fileURLToPath(new URL(`../evidence/browser/${name}`, import.meta.url)),
  fullPage: true, animations: 'disabled',
});

const sessionA = '550e8400-e29b-41d4-a716-446655440000';
const sessionB = '550e8400-e29b-41d4-a716-446655440010';
const folderResource = '550e8400-e29b-41d4-a716-446655440001';
const caseResourceA = '550e8400-e29b-41d4-a716-446655440002';
const caseResourceB = '550e8400-e29b-41d4-a716-446655440012';
const runDetailsResource = '550e8400-e29b-41d4-a716-446655440004';
const runCaseResource = '550e8400-e29b-41d4-a716-446655440005';
const recentId = '550e8400-e29b-41d4-a716-446655440020';
const recentRepository = { recentId, displayName: 'Недавний репозиторий', lastOpenedAtMs: 1_797_000_000_000 };
const validCase: CaseDocument & { revision: string } = {
  revision: 'a'.repeat(64),
  model: {
    id: 'case-stable-id', displayId: 'PAY-7', title: 'Платёж проходит', slug: 'payment-pass', status: 'active',
    tags: ['billing', 'smoke'], objective: 'Проверить успешную оплату.', systems: ['Платёжный шлюз'],
    setup: [{ name: 'Аккаунт', body: 'У пользователя есть карта.' }],
    steps: [{ text: 'Открыть оплату', depth: 0 }, { text: 'Подтвердить транзакцию', depth: 1 }],
    acceptanceCriteria: ['Показан чек.'],
  }, warnings: [],
};
const workspace = (resourceId = caseResourceA, title = 'Платёж проходит'): WorkspaceCatalog => ({
  workspacePath: '', warnings: [], entries: [
    { kind: 'folder', metadata: { nodeId: folderResource, path: 'Payments QA', parentPath: '', parentResourceId: null, order: 0, name: 'Payments QA', displayIdPrefix: 'PAY', description: 'Папка: Billing.' } },
    { kind: 'case', metadata: { resourceId, path: `Payments QA/${resourceId}.md`, parentPath: 'Payments QA', parentResourceId: folderResource, order: 0, id: 'case-stable-id', displayId: 'PAY-7', title, status: 'active', tags: ['billing', 'smoke'], revision: 'a'.repeat(64) } },
  ],
});
const runs: RunsCatalog = {
  warnings: [], runs: [{ runId: '2026-10-14-release', name: 'Регрессия оплаты', created: '2026-10-14T10:00:00Z', testDate: '2026-10-14', status: 'open', scope: 'Платёжный шлюз', detailsResourceId: runDetailsResource,
    cases: [{ resourceId: runCaseResource, path: 'runs/release/PAY-7.md', caseId: 'case-stable-id', displayId: 'PAY-7', title: 'Платёж проходит', result: 'fail' }] }],
};
const runDetails: RunDetailsResource = { kind: 'details', document: { revision: 'a'.repeat(64), model: { name: 'Регрессия оплаты', status: 'open', created: '', testDate: '', scope: '', testerApproval: { name: 'Ирина', at: '2026-10-14' }, reviewerApproval: null, summary: 'Кандидат в релиз.', notes: 'См. журнал проверки.' }, warnings: [] } };
const runCase: import('../src/repository/api/contracts').RunCaseResource = { kind: 'case', document: { revision: 'a'.repeat(64), model: { caseId: 'case-stable-id', displayId: 'PAY-7', title: 'Платёж проходит', result: 'fail', tester: 'Ирина', executedAt: '10:20', testDate: null, notes: 'Отказ банка !! ответ 91', setup: [{ key: 'setup:0', text: 'Аккаунт активен', state: 'pass', failNote: '' }], steps: [{ key: 'step:0', text: 'Оплата подтверждена', state: 'fail', failNote: 'временный лимит' }], accept: [] }, warnings: [] } };

type MockCommand = 'prepare_suite_operation' | 'apply_suite_operation' | 'create_suite' | 'git_sync' | 'git_commit' | 'git_status' | 'git_diff' | 'get_runtime_diagnostics' | 'pick_repository' | 'list_recent_repositories' | 'open_recent_repository' | 'remember_workspace' | 'initialize_repository' | 'close_repository' | 'refresh_repository' | 'flush_repository' | 'catalog_workspace' | 'read_case' | 'save_run_details' | 'save_run_case' | 'save_case' | 'create_case' | 'create_run' | 'organize_case' | 'catalog_runs' | 'read_run';
type MockReply = unknown | { __reject: { code: string; message: string } } | { __delayMs: number; value: unknown };
type MockSeed = { folderName?: string; queues?: Partial<Record<MockCommand, MockReply[]>>; invalidEnvelope?: boolean; gitStatus?: GitStatus; gitDiffs?: Record<string, GitDiff>; runs?: RunsCatalog; resources?: Record<string, RunResource> };
type MockCall = { command: MockCommand; args: Record<string, unknown> };
type TestMock = { emitChange: (payload: unknown) => void; calls: MockCall[]; enqueue: (command: MockCommand, reply: MockReply) => void; resolve: (token: string, reply: unknown) => void; setRunDetails: (document: typeof runDetails) => void; setRunCase: (document: typeof runCase) => void; setCase: (document: typeof validCase) => void };
type MockFixtures = { open: ReturnType<typeof defaultOpen>; recent: typeof recentRepository; workspace: ReturnType<typeof workspace>; workspaceB: ReturnType<typeof workspace>; caseDocument: typeof validCase; runs: typeof runs; runDetails: typeof runDetails; runCase: typeof runCase; sessionB: string; runDetailsResource: string };
type TestWindow = Window & {
  isTauri?: boolean;
  __TAURI_INTERNALS__?: { invoke: (command: string, args: Record<string, unknown>) => Promise<unknown>; metadata: {currentWindow: {label: string}; currentWebview: {label: string}}; transformCallback: (callback: unknown) => number };
  __TAURI_EVENT_PLUGIN_INTERNALS__?: {unregisterListener: (event: string, id: number) => void};
  __TESTORITTO_MOCK__?: TestMock;
};

const defaultOpen = (sessionId = sessionA, displayName = 'Fixture repo', preferredWorkspacePath?: string | null) => ({
  sessionId, displayName, needsInitialization: false,
  workspaces: [{ path: '', name: 'Fixture repo', displayIdPrefix: 'PAY', description: '' }, { path: 'area', name: 'Area', displayIdPrefix: 'AREA', description: '' }], warnings: [],
  ...(preferredWorkspacePath !== undefined ? { preferredWorkspacePath } : {}),
});
const workflowResources = ['550e8400-e29b-41d4-a716-446655440006', runCaseResource, '550e8400-e29b-41d4-a716-446655440007'];
function workflowFixtures() {
  const titles = ['Первый снимок', 'Уже пройденный снимок', 'Последний снимок'];
  const rows = workflowResources.map((resourceId, index) => ({ resourceId, path: `run/${index}.md`, caseId: `frozen-${index}`, displayId: `RUN-${index + 1}`, title: titles[index]!, result: index === 1 ? 'pass' as const : 'not_run' as const }));
  const catalog: RunsCatalog = { ...runs, runs: [{ ...runs.runs[0]!, cases: rows }] };
  const resources: Record<string, RunResource> = {};
  rows.forEach((row, index) => {
    const snapshot = { ...validCase, model: { ...validCase.model, id: row.caseId, title: row.title, displayId: row.displayId, objective: `Цель из сохранённого снимка ${index + 1}`, setup: [{ name: 'Подготовить аккаунт', body: 'Сохранённое описание подготовки' }] } };
    const checks = (texts: string[], prefix: string) => texts.map((text, i) => ({ key: `${prefix}:${i}`, text, state: 'none' as const, failNote: '' }));
    resources[row.resourceId] = { kind: 'case', document: { revision: 'a'.repeat(64), warnings: [], snapshot, model: { ...runCase.document.model, caseId: row.caseId, displayId: row.displayId, title: row.title, result: row.result, tester: '', executedAt: '', notes: '', setup: checks(snapshot.model.setup.map((item) => item.name), 'setup'), steps: checks(snapshot.model.steps.map((item) => item.text), 'step'), accept: checks(snapshot.model.acceptanceCriteria, 'accept') } } };
  });
  return { runs: catalog, resources };
}

const mockFixtures: MockFixtures = { open: defaultOpen(), recent: recentRepository, workspace: workspace(), workspaceB: workspace(caseResourceB, 'Второй кейс'), caseDocument: validCase, runs, runDetails, runCase, sessionB, runDetailsResource };

async function installMock(page: Page, seed: MockSeed = {}) {
  await page.addInitScript((input: { seed: MockSeed; fixtures: MockFixtures }) => {
    const { seed: initial, fixtures } = input;
    const mockWindow = window as TestWindow;
    const namedFolder = fixtures.workspace.entries.find((entry) => entry.kind === 'folder');
    if (initial.folderName && namedFolder?.kind === 'folder') namedFolder.metadata.name = initial.folderName;
    const queues = { ...(initial.queues ?? {}) } as Partial<Record<MockCommand, MockReply[]>>;
    const calls: MockCall[] = [];
    let currentRunDetails = structuredClone(fixtures.runDetails);
    let currentRunCase = structuredClone(fixtures.runCase);
    let currentCase = structuredClone(fixtures.caseDocument);
    let currentRuns = structuredClone(initial.runs ?? fixtures.runs);
    const createdRunResources = new Map<string, RunResource>(Object.entries(initial.resources ?? {}));
    const callbacks = new Map<number, (event: unknown) => void>();
    const listeners = new Map<number, { event: string; handler: number }>();
    let callbackId = 0;
    const pending = new Map<string, (value: unknown) => void>();
    const validateEnvelope = (command: MockCommand, args: Record<string, unknown>): void => {
      const request = args.request;
      if (initial.invalidEnvelope || typeof request !== 'object' || request === null || Object.keys(request).some((key) => !['protocolVersion', 'sessionId', 'workspacePath', 'resourceId', 'recentId', 'expectedRevision', 'edit', 'creation', 'operation', 'fileId', 'fileIds', 'message', 'confirmation', 'action'].includes(key))) {
        throw { code: 'INVALID_REQUEST', message: 'secret path D:/private' };
      }
      const value = request as Record<string, unknown>;
      const expectedKeys = command === 'prepare_suite_operation' ? ['protocolVersion', 'sessionId', 'operation'] : command === 'apply_suite_operation' ? ['protocolVersion', 'sessionId', 'confirmation'] : command === 'git_sync' ? ['protocolVersion', 'sessionId', 'confirmation', 'action'] : command === 'git_commit' ? ['protocolVersion', 'sessionId', 'fileIds', 'message'] : command === 'git_diff' ? ['protocolVersion', 'sessionId', 'fileId'] : command === 'pick_repository' || command === 'get_runtime_diagnostics' || command === 'list_recent_repositories' ? ['protocolVersion']
        : command === 'create_run' ? ['protocolVersion', 'sessionId', 'creation']
        : command === 'organize_case' ? ['protocolVersion', 'sessionId', 'operation']
        : (command === 'create_case' || command === 'create_suite') ? ['protocolVersion', 'sessionId', 'creation']
        : (command === 'save_case' || command === 'save_run_case' || command === 'save_run_details') ? ['protocolVersion', 'sessionId', 'resourceId', 'expectedRevision', 'edit']
        : command === 'catalog_workspace' ? ['protocolVersion', 'sessionId', 'workspacePath']
          : command === 'open_recent_repository' ? ['protocolVersion', 'recentId']
            : command === 'remember_workspace' ? ['protocolVersion', 'sessionId', 'workspacePath']
          : command === 'read_case' || command === 'read_run' ? ['protocolVersion', 'sessionId', 'resourceId']
            : ['protocolVersion', 'sessionId'];
      if (value.protocolVersion !== 1 || Object.keys(value).length !== expectedKeys.length || expectedKeys.some((key) => !(key in value))) {
        throw { code: 'INVALID_REQUEST', message: 'secret path D:/private' };
      }
      if (expectedKeys.includes('sessionId') && value.sessionId !== fixtures.open.sessionId && value.sessionId !== fixtures.sessionB) {
        throw { code: 'INVALID_SESSION', message: 'secret path D:/private' };
      }
    };
    let suitePlan: { operation: SuiteOperation; preview: SuitePreview } | null = null;
    const replies = (command: MockCommand, args: Record<string, unknown>): unknown => {
      const value = args.request as Record<string, unknown>;
      if (command === 'git_commit') return { head: 'b'.repeat(40), indexPublished: true, recoveryIndex: null };
      if (command === 'git_status') return initial.gitStatus ?? { syncToken: null, abortToken: null, syncBlocked: false, branch: 'main', head: 'a'.repeat(40), unborn: false, detached: false, upstream: null, ahead: null, behind: null, filtersDisabled: false, files: [] };
      if (command === 'git_diff') { const diff = initial.gitDiffs?.[String(value.fileId)]; if (!diff) throw { code: 'INVALID_RESOURCE', message: 'private path' }; return diff; }
      if (command === 'refresh_repository') return value.sessionId === fixtures.sessionB ? { ...fixtures.open, sessionId: fixtures.sessionB } : fixtures.open;
      if (command === 'pick_repository') return fixtures.open;
      if (command === 'list_recent_repositories') return [fixtures.recent];
      if (command === 'open_recent_repository') return fixtures.open;
      if (command === 'remember_workspace') return null;
      if (command === 'initialize_repository') return { ...fixtures.open, preferredWorkspacePath: '' };
      if (command === 'close_repository' || command === 'flush_repository') return null;
      if (command === 'get_runtime_diagnostics') return { appVersion: '0.1.0', platform: 'windows', architecture: 'x86_64', nativeRuntime: true };
      if (command === 'catalog_workspace') return { ...(value.sessionId === fixtures.sessionB ? fixtures.workspaceB : fixtures.workspace), workspacePath: value.workspacePath };
      if (command === 'read_case') return currentCase;
      if (command === 'save_case') {
        if (value.expectedRevision !== currentCase.revision) throw { code: 'EXTERNAL_CHANGE', message: 'private path' };
        const edit = value.edit as CaseEdit;
        if ('id' in edit) throw { code: 'INVALID_REQUEST', message: 'identity must not be changed' };
        currentCase = { ...currentCase, model: { ...edit, id: currentCase.model.id, slug: edit.slug ?? '' }, revision: 'b'.repeat(64) };
        return currentCase;
      }
      if (command === 'save_run_details') {
        const resourceId = String(value.resourceId);
        const previous = createdRunResources.get(resourceId) ?? currentRunDetails;
        if (previous.kind !== 'details' || value.expectedRevision !== previous.document.revision) throw { code: 'EXTERNAL_CHANGE', message: 'private path' };
        const edit = value.edit as RunDetailsEdit;
        const saved = { ...previous, document: { ...previous.document, revision: previous.document.revision === 'b'.repeat(64) ? 'c'.repeat(64) : 'b'.repeat(64), model: { ...previous.document.model, ...edit } } };
        if (createdRunResources.has(resourceId)) createdRunResources.set(resourceId, saved); else currentRunDetails = saved;
        currentRuns.runs = currentRuns.runs.map((run) => run.detailsResourceId === resourceId ? { ...run, status: edit.status } : run);
        return saved;
      }
      if (command === 'save_run_case') {
        const resourceId = String(value.resourceId);
        const previous = createdRunResources.get(resourceId) ?? currentRunCase;
        if (previous.kind !== 'case' || value.expectedRevision !== previous.document.revision) throw { code: 'EXTERNAL_CHANGE', message: 'private path' };
        const edit = value.edit as RunCaseEdit;
        const checks = (items: typeof previous.document.model.steps, updates: RunCaseEdit['steps']) => items.map((item, index) => ({ ...item, ...updates[index] }));
        const model = previous.document.model;
        const saved = { ...previous, document: { ...previous.document, revision: 'b'.repeat(64), model: { ...model, ...edit, setup: checks(model.setup, edit.setup), steps: checks(model.steps, edit.steps), accept: checks(model.accept, edit.accept) } } };
        if (createdRunResources.has(resourceId)) createdRunResources.set(resourceId, saved); else currentRunCase = saved;
        currentRuns.runs = currentRuns.runs.map((run) => ({ ...run, cases: run.cases.map((item) => item.resourceId === resourceId ? { ...item, result: edit.result } : item) }));
        return saved;
      }

      if (command === 'prepare_suite_operation') {
        const operation = value.operation as SuiteOperation;
        const source = fixtures.workspace.entries.find((entry) => entry.kind === 'folder' && entry.metadata.nodeId === operation.resourceId);
        if (!source || source.kind !== 'folder') throw { code: 'INVALID_RESOURCE', message: 'private path' };
        const action = operation.action;
        const parentId = action.kind === 'duplicate' || action.kind === 'move' ? action.parentResourceId : source.metadata.parentResourceId;
        const parent = fixtures.workspace.entries.find((entry) => entry.kind === 'folder' && entry.metadata.nodeId === parentId);
        const parentPath = parent?.metadata.path ?? '';
        const name = action.kind === 'duplicate' || action.kind === 'rename' ? action.name : source.metadata.path.split('/').at(-1)!;
        const destinationPath = action.kind === 'delete' ? null : parentPath ? `${parentPath}/${name}` : name;
        const preview: SuitePreview = { confirmation: fixtures.open.sessionId, sourcePath: source.metadata.path, destinationPath, permanentDelete: action.kind === 'delete', entries: [{ path: source.metadata.path, kind: 'directory', revision: 'a'.repeat(64), size: 0 }, { path: `${source.metadata.path}/unknown.bin`, kind: 'unknown', revision: 'a'.repeat(64), size: 3 }, { path: `${source.metadata.path}.md`, kind: 'note', revision: 'a'.repeat(64), size: 2 }], totalBytes: 5 };
        suitePlan = { operation, preview }; return preview;
      }
      if (command === 'apply_suite_operation') {
        if (!suitePlan || value.confirmation !== suitePlan.preview.confirmation) throw { code: 'STALE_RESOURCE', message: 'private path' };
        const { operation, preview } = suitePlan; suitePlan = null;
        const sourceEntries = fixtures.workspace.entries.filter((entry) => entry.metadata.path === preview.sourcePath || entry.metadata.path.startsWith(`${preview.sourcePath}/`));
        const action = operation.action;
        if (action.kind === 'delete') { fixtures.workspace.entries = fixtures.workspace.entries.filter((entry) => !sourceEntries.includes(entry)); return { outcome: 'applied', path: null, recovery: null }; }
        const parentResourceId = action.kind === 'duplicate' || action.kind === 'move' ? action.parentResourceId : sourceEntries.find((entry) => entry.kind === 'folder')?.metadata.parentResourceId ?? null;
        const copiedRoot = '550e8400-e29b-41d4-a716-446655440070';
        const updated = sourceEntries.map((entry) => {
          const path = `${preview.destinationPath}${entry.metadata.path.slice(preview.sourcePath.length)}`;
          const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
          const root = entry.metadata.path === preview.sourcePath;
          if (entry.kind === 'folder') return { ...entry, metadata: { ...entry.metadata, path, parentPath, nodeId: action.kind === 'duplicate' ? copiedRoot : entry.metadata.nodeId, parentResourceId: root ? parentResourceId : action.kind === 'duplicate' ? copiedRoot : entry.metadata.parentResourceId } };
          return { ...entry, metadata: { ...entry.metadata, path, parentPath, ...(action.kind === 'duplicate' ? { resourceId: '550e8400-e29b-41d4-a716-446655440071', id: 'copied-stable-id', parentResourceId: copiedRoot } : {}) } };
        });
        fixtures.workspace.entries = [...fixtures.workspace.entries.filter((entry) => action.kind === 'duplicate' || !sourceEntries.includes(entry)), ...updated];
        return { outcome: 'applied', path: preview.destinationPath, recovery: null };
      }
      if (command === 'create_suite') {
        const creation = value.creation as SuiteCreation;
        const parent = fixtures.workspace.entries.find((entry) => entry.kind === 'folder' && entry.metadata.nodeId === creation.parentResourceId);
        const parentPath = parent?.metadata.path ?? '';
        const path = parentPath ? `${parentPath}/${creation.name}` : creation.name;
        fixtures.workspace.entries.push({ kind: 'folder', metadata: { nodeId: '550e8400-e29b-41d4-a716-446655440066', path, parentPath, parentResourceId: creation.parentResourceId, order: 3, name: creation.name, displayIdPrefix: '', description: '' } });
        return { path };
      }
      if (command === 'create_case') {
        const creation = value.creation as CaseCreation;
        if (creation.source && creation.source.expectedRevision !== currentCase.revision) throw { code: 'EXTERNAL_CHANGE', message: 'private source path' };
        const path = 'Payments QA/new.md';
        currentCase = { ...currentCase, revision: 'd'.repeat(64), model: { ...currentCase.model, id: 'new-stable-case-id', displayId: 'PAY-0008', title: creation.title,
          ...(!creation.source ? { status: 'draft', tags: [], objective: '', systems: [], setup: [], steps: [], acceptanceCriteria: [], slug: '' } : {}),
        } };
        fixtures.workspace.entries.push({ kind: 'case', metadata: { resourceId: '550e8400-e29b-41d4-a716-446655440012', path, parentPath: 'Payments QA', parentResourceId: fixtures.workspace.entries.find((entry) => entry.kind === 'folder')?.metadata.nodeId ?? '', order: 1, id: 'new-stable-case-id', displayId: currentCase.model.displayId, title: currentCase.model.title, status: currentCase.model.status, tags: currentCase.model.tags, revision: currentCase.revision } });
        return { path };
      }
      if (command === 'organize_case') {
        const operation = value.operation as CaseOperation;
        if (operation.expectedRevision !== currentCase.revision) throw { code: 'EXTERNAL_CHANGE', message: 'private path' };
        const entry = fixtures.workspace.entries.find((entry) => entry.kind === 'case' && entry.metadata.resourceId === operation.resourceId);
        if (!entry || entry.kind !== 'case') throw { code: 'INVALID_RESOURCE', message: 'unknown resource' };
        if (operation.action.kind === 'delete') {
          fixtures.workspace.entries = fixtures.workspace.entries.filter((entry) => entry.kind !== 'case' || entry.metadata.resourceId !== operation.resourceId);
          return { path: null };
        }
        entry.metadata.path = operation.action.kind === 'rename' ? `${entry.metadata.parentPath}/${operation.action.filename}` : 'moved.md';
        entry.metadata.resourceId = '550e8400-e29b-41d4-a716-446655440012';
        return { path: entry.metadata.path };
      }
      if (command === 'create_run') {
        const creation = value.creation as RunCreation;
        if (creation.cases.some((item) => item.expectedRevision !== currentCase.revision)) throw { code: 'EXTERNAL_CHANGE', message: 'private source path' };
        const runId = '.casewright/runs/2026-10-14-550e8400-e29b-41d4-a716-446655440040';
        const detailsResourceId = '550e8400-e29b-41d4-a716-446655440041';
        createdRunResources.set(detailsResourceId, { kind: 'details', document: { revision: 'a'.repeat(64), model: { name: creation.name, status: 'open', created: '2026-10-14T12:00:00Z', testDate: creation.testDate, scope: creation.scope, testerApproval: null, reviewerApproval: null, summary: '', notes: '' }, warnings: [] } });
        const cases = creation.cases.map((_item, index) => {
          const resourceId = `550e8400-e29b-41d4-a716-${String(446655440050 + index)}`;
          const snapshot = structuredClone(currentCase);
          const checks = (texts: string[], prefix: string) => texts.map((text, index) => ({ key: `${prefix}:${index}`, text, state: 'none' as const, failNote: '' }));
          createdRunResources.set(resourceId, { kind: 'case', document: { revision: 'a'.repeat(64), model: { caseId: snapshot.model.id ?? '', displayId: snapshot.model.displayId, title: snapshot.model.title, result: 'not_run', tester: '', executedAt: '', testDate: null, notes: '', setup: checks(snapshot.model.setup.map((item) => item.name), 'setup'), steps: checks(snapshot.model.steps.map((item) => item.text), 'step'), accept: checks(snapshot.model.acceptanceCriteria, 'accept') }, warnings: [], snapshot } });
          return { resourceId, path: `${runId}/001-case.md`, caseId: snapshot.model.id ?? '', displayId: snapshot.model.displayId, title: snapshot.model.title, result: 'not_run' as const };
        });
        currentRuns.runs.push({ runId, name: creation.name, created: '2026-10-14T12:00:00Z', testDate: creation.testDate, status: 'open', scope: creation.scope, detailsResourceId, cases });
        return { runId };
      }
      if (command === 'catalog_runs') return currentRuns;
      if (command === 'read_run' && typeof value.resourceId === 'string' && createdRunResources.has(value.resourceId)) return createdRunResources.get(value.resourceId);
      if (command === 'read_run') return value.resourceId === fixtures.runDetailsResource ? currentRunDetails : currentRunCase;
      throw { code: 'INVALID_REQUEST', message: 'unexpected command' };
    };
    const invoke = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
      if (name === 'plugin:event|listen') { const id = Number(args.handler); listeners.set(id, { event: String(args.event), handler: id }); return id; }
      if (name === 'plugin:event|unlisten') { listeners.delete(Number(args.eventId)); return null; }
      const allowed = ['prepare_suite_operation', 'apply_suite_operation', 'create_suite', 'refresh_repository', 'git_sync', 'git_commit', 'git_status', 'git_diff', 'get_runtime_diagnostics', 'pick_repository', 'list_recent_repositories', 'open_recent_repository', 'remember_workspace', 'initialize_repository', 'close_repository', 'flush_repository', 'catalog_workspace', 'read_case', 'save_case', 'save_run_case', 'save_run_details', 'create_case', 'create_run', 'organize_case', 'catalog_runs', 'read_run'];
      if (!allowed.includes(name)) throw { code: 'INVALID_REQUEST', message: 'unexpected command' };
      const command = name as MockCommand;
      calls.push({ command, args: structuredClone(args) });
      validateEnvelope(command, args);
      const queue = queues[command];
      const next = queue?.shift();
      let reply: unknown;
      if (next === undefined) reply = replies(command, args);
      else if (typeof next === 'object' && next !== null && '__reject' in next) throw next.__reject;
      else if (typeof next === 'object' && next !== null && '__deferred' in next) {
        const token = (next as { __deferred: string }).__deferred;
        reply = await new Promise((resolve) => pending.set(token, resolve));
      } else if (typeof next === 'object' && next !== null && '__delayMs' in next) {
        const delayed = next as { __delayMs: number; value: unknown };
        await new Promise((resolve) => setTimeout(resolve, delayed.__delayMs));
        reply = delayed.value;
      } else reply = next;
      return structuredClone(reply);
    };
    mockWindow.isTauri = true;
    mockWindow.__TAURI_INTERNALS__ = { invoke, metadata: {currentWindow: {label: 'main'}, currentWebview: {label: 'main'}}, transformCallback: (callback) => { const id = ++callbackId; if (typeof callback === 'function') callbacks.set(id, callback as (event: unknown) => void); return id; } };
    mockWindow.__TAURI_EVENT_PLUGIN_INTERNALS__ = {unregisterListener: () => {}};
    mockWindow.__TESTORITTO_MOCK__ = {
      calls,
      emitChange: (payload) => { for (const [id, listener] of listeners) if (listener.event === 'repository-changed') callbacks.get(listener.handler)?.({ event: 'repository-changed', id, payload }); },
      enqueue: (command, reply) => { (queues[command] ??= []).push(reply); },
      resolve: (token, reply) => { const resolve = pending.get(token); pending.delete(token); resolve?.(reply); },
      setRunDetails: (document) => { currentRunDetails = structuredClone(document); },
      setRunCase: (document) => { currentRunCase = structuredClone(document); },
      setCase: (document) => { currentCase = structuredClone(document); },
    };
  }, { seed, fixtures: mockFixtures });
}

async function getCalls(page: Page): Promise<MockCall[]> {
  return page.evaluate(() => (window as TestWindow).__TESTORITTO_MOCK__?.calls ?? []);
}

test.describe('read-only repository browser in headless Chromium', () => {
  let pageErrors: string[];
  let externalRequests: string[];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    externalRequests = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(message.text()); });
    page.on('request', (request) => {
      if (!request.url().startsWith('http://127.0.0.1:4175/')) externalRequests.push(request.url());
    });
    await page.route('**/*', async (route) => {
      if (route.request().url().startsWith('http://127.0.0.1:4175/')) await route.continue();
      else {
        externalRequests.push(route.request().url());
        await route.abort('blockedbyclient');
      }
    });
    await page.route('http://127.0.0.1:4175/', async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': tauriConfig.app.security.csp } });
    });
  });

  test.afterEach(async () => {
    expect(pageErrors, 'browser console/page errors').toEqual([]);
    expect(externalRequests, 'unexpected external requests').toEqual([]);
  });

  test('browser preview is explicit and cannot open a repository', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Предпросмотр в браузере не имеет доступа к репозиторию.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Открыть репозиторий' })).toBeDisabled();
    await expect(page.getByText('Репозиторий не открыт')).toBeVisible();
  });

  test('opens nested case and folder, reads run metadata/checklist, and stays responsive', async ({ page }) => {
    await installMock(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await expect(page.getByRole('heading', { name: 'Fixture repo' })).toBeVisible();
    const folder = page.getByRole('treeitem', { name: /Payments QA/ });
    await folder.click();
    await expect(page.getByRole('heading', { name: 'Payments QA' })).toBeVisible();
    await expect(page.getByText('Папка: Billing.')).toBeVisible();
    const caseItem = page.getByRole('treeitem', { name: /PAY-7 · Платёж проходит/ });
    await caseItem.click();
    await expect(page.getByRole('heading', { name: 'PAY-7 · Платёж проходит' })).toBeVisible();
    await expect(page.getByText('Платёжный шлюз')).toBeVisible();
    await expect(page.getByText('Подтвердить транзакцию')).toBeVisible();
    await captureEvidence(page, 'case-reader.png');

    await page.getByRole('tab', { name: 'Прогоны' }).click();
    await page.getByRole('button', { name: /Регрессия оплаты/ }).click();
    await expect(page.getByRole('heading', { name: 'Регрессия оплаты' })).toBeVisible();
    await expect(page.getByText('2026-10-14', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /PAY-7 · Платёж проходит/ }).last().click();
    await expect(page.getByText('временный лимит')).toBeVisible();
    await expect(page.getByText('Оплата подтверждена')).toBeVisible();
    await captureEvidence(page, 'run-reader.png');

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await captureEvidence(page, 'narrow-layout.png');
    const calls = await getCalls(page);
    expect(calls.every((call) => Object.keys(call.args).length === 1 && 'request' in call.args)).toBe(true);
    expect(calls.some((call) => call.command === 'read_case' && (call.args.request as { resourceId: string }).resourceId === caseResourceA)).toBe(true);
  });

  test('cancel and picker failure preserve the opened case; native errors stay sanitized', async ({ page }) => {
    await installMock(page, { queues: { pick_repository: [defaultOpen(), null, { __reject: { code: 'GIT_UNAVAILABLE', message: 'D:/private/repo secret stderr' } }] } });
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    const caseItem = page.getByRole('treeitem', { name: /PAY-7 · Платёж проходит/ });
    await caseItem.click();
    await expect(page.getByText('Проверить успешную оплату.')).toBeVisible();
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await expect(page.getByText('Проверить успешную оплату.')).toBeVisible();
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await expect(page.getByText('Системный Git не найден. Установите Git и проверьте PATH.')).toBeVisible();
    await expect(page.getByText(/D:\/private|secret stderr/)).toHaveCount(0);
    await expect(page.getByText('Проверить успешную оплату.')).toBeVisible();
  });

  test('recent entries reopen the repository and restore the preferred workspace', async ({ page }) => {
    await installMock(page, { queues: {
      list_recent_repositories: [[recentRepository]],
      open_recent_repository: [defaultOpen(sessionB, 'Восстановленный репозиторий', 'area')],
    } });
    await page.goto('/');
    await page.getByRole('button', { name: /Недавний репозиторий/ }).click();
    await expect(page.getByRole('heading', { name: 'Восстановленный репозиторий' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Рабочая область' })).toContainText('Area');
    await expect.poll(async () => (await getCalls(page)).some((call) => call.command === 'catalog_workspace' && (call.args.request as { workspacePath?: string }).workspacePath === 'area')).toBe(true);
    const calls = await getCalls(page);
    expect(calls.some((call) => call.command === 'open_recent_repository' && (call.args.request as { recentId?: string }).recentId === recentId)).toBe(true);
    expect(calls.some((call) => call.command === 'remember_workspace' && (call.args.request as { workspacePath?: string }).workspacePath === 'area')).toBe(false);
  });

  test('missing preferred workspace stays explicitly empty and does not catalog the root', async ({ page }) => {
    await installMock(page, { queues: {
      list_recent_repositories: [[recentRepository]],
      open_recent_repository: [defaultOpen(sessionB, 'Без доступной области', null)],
    } });
    await page.goto('/');
    await page.getByRole('button', { name: /Недавний репозиторий/ }).click();
    await expect(page.getByRole('heading', { name: 'Без доступной области' })).toBeVisible();
    const selector = page.getByRole('combobox', { name: 'Рабочая область' });
    await expect(selector).toBeDisabled();
    await expect(selector).toContainText('Нет доступной рабочей области.');
    expect((await getCalls(page)).some((call) => call.command === 'catalog_workspace')).toBe(false);
  });

  test('history errors do not block picker; recent-open retry preserves then replaces the current reader', async ({ page }) => {
    await installMock(page, { queues: {
      list_recent_repositories: [{ __reject: { code: 'RECENT_HISTORY_UNAVAILABLE', message: 'private appdata path' } }, [recentRepository]],
      open_recent_repository: [{ __reject: { code: 'GIT_UNAVAILABLE', message: 'D:/private stderr' } }, defaultOpen(sessionB, 'Повторно открытый репозиторий')],
    } });
    await page.goto('/');
    await expect(page.getByText('Не удалось загрузить историю')).toBeVisible();
    await page.getByRole('button', { name: 'Повторить проверку' }).click();
    await expect(page.getByRole('button', { name: /Недавний репозиторий/ })).toBeVisible();
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('treeitem', { name: /PAY-7 · Платёж проходит/ }).click();
    await expect(page.getByText('Проверить успешную оплату.')).toBeVisible();
    await page.getByRole('button', { name: /Недавний репозиторий/ }).click();
    await expect(page.getByText('Не удалось открыть недавний репозиторий')).toBeVisible();
    await expect(page.getByText('Проверить успешную оплату.')).toBeVisible();
    await page.getByRole('button', { name: 'Повторить проверку' }).click();
    await expect(page.getByRole('heading', { name: 'Повторно открытый репозиторий' })).toBeVisible();
    const calls = await getCalls(page);
    expect(calls.filter((call) => call.command === 'open_recent_repository')).toHaveLength(2);
    expect(calls.filter((call) => call.command === 'pick_repository')).toHaveLength(1);
    await expect(page.getByText(/D:\/private stderr|private appdata path/)).toHaveCount(0);
  });

  test('workspace preference failure is best effort and can be retried without losing the selected workspace', async ({ page }) => {
    await installMock(page, { queues: { remember_workspace: [
      { __reject: { code: 'NATIVE_COMMAND_FAILED', message: 'private path' } }, null,
    ] } });
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('combobox', { name: 'Рабочая область' }).click();
    await page.getByRole('option', { name: 'Area' }).click();
    await expect(page.getByText(/не удалось сохранить/i)).toBeVisible();
    await expect(page.getByRole('treeitem', { name: /PAY-7 · Платёж проходит/ })).toBeVisible();
    await page.getByRole('button', { name: /Повторить сохранение области/ }).click();
    await expect(page.getByText(/не удалось сохранить/i)).toHaveCount(0);
    const writes = (await getCalls(page)).filter((call) => call.command === 'remember_workspace');
    expect(writes.map((call) => (call.args.request as { workspacePath: string }).workspacePath)).toEqual(['area', 'area']);
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  });

  test('refresh and workspace changes discard old resource IDs; transient reads retry', async ({ page }) => {
    await installMock(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    const firstItem = page.getByRole('treeitem', { name: /PAY-7 · Платёж проходит/ });
    await firstItem.click();
    await expect(page.getByText('Проверить успешную оплату.')).toBeVisible();
    await page.evaluate((reply) => (window as TestWindow).__TESTORITTO_MOCK__?.enqueue('catalog_workspace', reply), workspace(caseResourceB, 'Обновлённый кейс'));
    await page.evaluate((reply) => (window as TestWindow).__TESTORITTO_MOCK__?.enqueue('read_case', reply), { ...validCase, model: { ...validCase.model, title: 'Обновлённый кейс' } });
    await page.locator('aside').getByRole('button', { name: 'Обновить' }).first().click();
    await expect(page.getByRole('treeitem', { name: /PAY-7 · Обновлённый кейс/ })).toBeVisible();
    await expect(page.getByText('Проверить успешную оплату.')).toHaveCount(0);
    await page.getByRole('treeitem', { name: /PAY-7 · Обновлённый кейс/ }).click();
    await expect(page.getByRole('heading', { name: /Обновлённый кейс/ })).toBeVisible();
    await expect.poll(async () => (await getCalls(page)).filter((call) => call.command === 'read_case').length).toBe(2);

    const areaCatalog = structuredClone(workspace('550e8400-e29b-41d4-a716-446655440022', 'Область: свежий ID'));
    areaCatalog.workspacePath = 'area';
    const areaCase = areaCatalog.entries.find((entry) => entry.kind === 'case');
    if (areaCase?.kind === 'case') areaCase.metadata.path = 'area/area-case.md';
    await page.evaluate((reply) => (window as TestWindow).__TESTORITTO_MOCK__?.enqueue('catalog_workspace', reply), areaCatalog);
    await page.getByRole('combobox', { name: 'Рабочая область' }).click();
    await page.getByRole('option', { name: 'Area' }).click();
    await expect(page.getByRole('treeitem', { name: /PAY-7 · Область: свежий ID/ })).toBeVisible();
    await expect(page.getByText('Проверить успешную оплату.')).toHaveCount(0);
    await page.evaluate((replies) => {
      const control = (window as TestWindow).__TESTORITTO_MOCK__;
      control?.enqueue('read_case', replies.failure);
      control?.enqueue('read_case', replies.success);
    }, { failure: { __reject: { code: 'NATIVE_COMMAND_FAILED', message: 'private path' } }, success: validCase });
    await page.getByRole('treeitem', { name: /PAY-7 · Область: свежий ID/ }).click();
    await expect(page.getByText('Нативная команда завершилась ошибкой.')).toBeVisible();
    await page.getByRole('button', { name: 'Повторить проверку' }).click();
    await expect(page.getByRole('heading', { name: 'PAY-7 · Платёж проходит' })).toBeVisible();
  });

  test('late old-session response and malformed DTO never replace the active repository or leak native errors', async ({ page }) => {
    await installMock(page, { queues: { catalog_workspace: [{ __deferred: 'oldCatalog' }], read_case: [{ model: { title: 'bad DTO' }, warnings: [] }] } });
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await expect.poll(async () => (await getCalls(page)).some((call) => call.command === 'catalog_workspace')).toBe(true);
    await page.evaluate((reply) => (window as TestWindow).__TESTORITTO_MOCK__?.enqueue('pick_repository', reply), defaultOpen(sessionB, 'Второй репозиторий'));
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await expect(page.getByRole('heading', { name: 'Второй репозиторий' })).toBeVisible();
    const item = page.getByRole('treeitem', { name: /PAY-7 · Второй кейс/ });
    await item.click();
    await page.evaluate((reply) => (window as TestWindow).__TESTORITTO_MOCK__?.resolve('oldCatalog', reply), workspace());
    await expect(page.getByText('Нативная часть вернула данные неожиданного формата.')).toBeVisible();
    await expect(page.getByText(/bad DTO|secret path/)).toHaveCount(0);
    await expect(page.getByRole('treeitem', { name: /Платёж проходит/ })).toHaveCount(0);
  });

  test('a repository without config stays unchanged until initialization is confirmed', async ({ page }) => {
    await installMock(page, { queues: { pick_repository: [{ sessionId: sessionA, displayName: 'Empty fixture', needsInitialization: true, workspaces: [], warnings: [] }] } });
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await expect(page.getByText(/Автоматическая инициализация не выполняется/).first()).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(0);
    const calls = await getCalls(page);
    expect(calls.filter((call) => call.command === 'pick_repository')).toHaveLength(1);
    expect(calls.some((call) => call.command === 'remember_workspace')).toBe(false);
    expect(calls.some((call) => call.command === 'catalog_workspace')).toBe(false);
    await page.getByRole('button', { name: 'Инициализировать репозиторий' }).click();
    await expect(page.getByText('.casewright/config.yaml', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Отмена', exact: true }).click();
    expect((await getCalls(page)).some((call) => call.command === 'initialize_repository')).toBe(false);
    await page.getByRole('button', { name: 'Инициализировать репозиторий' }).click();
    await page.getByRole('button', { name: 'Создать структуру' }).click();
    await expect(page.getByRole('treeitem', { name: /PAY-7 · Платёж проходит/ })).toBeVisible();
    expect((await getCalls(page)).filter((call) => call.command === 'initialize_repository')).toHaveLength(1);
  });

  test('case Markdown is rendered without HTML execution or remote fetches and tree supports keyboard activation', async ({ page }) => {
    const hostileCase = structuredClone(validCase);
    hostileCase.model.objective = '<img src="https://example.invalid/pixel" onerror="window.__testorittoXss=1">';
    await installMock(page, { queues: { read_case: [hostileCase] } });
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    const tree = page.getByRole('tree', { name: 'Кейсы' });
    await tree.focus();
    await tree.press('ArrowDown');
    await tree.press('Enter');
    await expect(page.getByRole('heading', { name: 'PAY-7 · Платёж проходит' })).toBeVisible();
    await expect(page.locator('img[src="https://example.invalid/pixel"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as Window & { __testorittoXss?: boolean }).__testorittoXss)).toBeUndefined();
    expect(externalRequests).toEqual([]);
  });

  test('creates a case only on submit, preserves failed input and reveals the created case', async ({ page }) => {
    await installMock(page, { queues: { create_case: [{ __reject: { code: 'SAVE_FAILED', message: 'private disk path' } }] } });
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('button', { name: 'Создать кейс' }).click();
    await page.getByRole('button', { name: 'Отмена' }).click();
    expect((await getCalls(page)).filter((call) => call.command === 'create_case')).toHaveLength(0);
    await page.getByRole('treeitem', { name: /Payments QA/ }).click();
    await page.getByRole('button', { name: 'Создать кейс' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Название кейса' }).fill('Новая проверка');
    await dialog.getByRole('button', { name: 'Создать кейс' }).click();
    await expect(dialog.getByText('Не удалось сохранить файл; черновик остаётся в редакторе.')).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Название кейса' })).toHaveValue('Новая проверка');
    await dialog.getByRole('button', { name: 'Создать кейс' }).click();
    await expect(page.getByRole('heading', { name: 'PAY-0008 · Новая проверка' })).toBeVisible();
    await expect(page.getByText('new-stable-case-id', { exact: true })).toBeVisible();
    const calls = (await getCalls(page)).filter((call) => call.command === 'create_case');
    expect(calls).toHaveLength(2);
    expect((calls[1]!.args.request as { creation: CaseCreation }).creation).toEqual({ workspacePath: '', parentResourceId: folderResource, title: 'Новая проверка', source: null });
    await captureEvidence(page, 'created-case.png');
  });

  test('duplicates the selected case with a new identity and keeps nested steps', async ({ page }) => {
    await installMock(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('treeitem', { name: /PAY-7 · Платёж проходит/ }).click();
    await page.getByRole('button', { name: 'Дублировать кейс' }).click();
    await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Название кейса' })).toHaveValue('Копия: Платёж проходит');
    await page.getByRole('dialog').getByRole('button', { name: 'Дублировать кейс' }).click();
    await expect(page.getByRole('heading', { name: 'PAY-0008 · Копия: Платёж проходит' })).toBeVisible();
    await expect(page.getByText('Подтвердить транзакцию', { exact: true })).toBeVisible();
    await expect(page.getByRole('treeitem', { name: /PAY-7 · Платёж проходит/ })).toBeVisible();
    const request = (await getCalls(page)).find((call) => call.command === 'create_case')!.args.request as { creation: CaseCreation };
    expect(request.creation.source).toEqual({ resourceId: caseResourceA, expectedRevision: 'a'.repeat(64) });
    await captureEvidence(page, 'duplicated-case.png');
  });

  test('moves a case after confirmation while retaining its identity and contents', async ({ page }) => {
    await installMock(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('treeitem', { name: /PAY-7 · Платёж проходит/ }).click();
    await page.getByRole('button', { name: 'Переместить кейс' }).click();
    await page.getByRole('button', { name: 'Отмена' }).click();
    expect((await getCalls(page)).filter((call) => call.command === 'organize_case')).toHaveLength(0);
    await page.getByRole('button', { name: 'Переместить кейс' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: 'Папка назначения' }).click();
    await page.getByRole('option', { name: 'Корень рабочей области' }).click();
    await captureEvidence(page, 'move-case-dialog.png');
    await dialog.getByRole('button', { name: 'Переместить кейс' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { name: 'PAY-7 · Платёж проходит' })).toBeVisible();
    await expect(page.getByText('case-stable-id', { exact: true })).toBeVisible();
    await expect(page.getByText('Подтвердить транзакцию', { exact: true })).toBeVisible();
    const request = (await getCalls(page)).find((call) => call.command === 'organize_case')!.args.request as { operation: CaseOperation };
    expect(request.operation.action).toEqual({ kind: 'move', parentResourceId: null });
    expect(request.operation.expectedRevision).toBe('a'.repeat(64));
  });

  test('confirms the exact deletion file and retains selection on cancel and failed deletion', async ({ page }) => {
    await installMock(page, { queues: { organize_case: [{ __reject: { code: 'SAVE_FAILED', message: 'private path' } }] } });
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('treeitem', { name: /PAY-7 · Платёж проходит/ }).click();
    await page.getByRole('button', { name: 'Удалить кейс' }).click();
    await expect(page.getByRole('dialog').getByText(`Payments QA/${caseResourceA}.md`, { exact: true })).toBeVisible();
    await captureEvidence(page, 'delete-case-dialog.png');
    await page.getByRole('button', { name: 'Отмена' }).click();
    expect((await getCalls(page)).filter((call) => call.command === 'organize_case')).toHaveLength(0);
    await expect(page.getByRole('heading', { name: 'PAY-7 · Платёж проходит' })).toBeVisible();
    await page.getByRole('button', { name: 'Удалить кейс' }).click();
    await page.getByRole('button', { name: 'Удалить файл кейса' }).click();
    await expect(page.getByText('Не удалось выполнить операцию. Файл не изменён.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'PAY-7 · Платёж проходит' })).toBeVisible();
    await page.getByRole('button', { name: 'Удалить файл кейса' }).click();
    await expect(page.getByRole('treeitem', { name: /PAY-7 · Платёж проходит/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'PAY-7 · Платёж проходит' })).toHaveCount(0);
    const request = (await getCalls(page)).filter((call) => call.command === 'organize_case')[1]!.args.request as { operation: CaseOperation };
    expect(request.operation.action).toEqual({ kind: 'delete' });
  });

  test('refuses deletion if the source changes after the confirmation dialog opens', async ({ page }) => {
    await installMock(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('treeitem', { name: /PAY-7 · Платёж проходит/ }).click();
    await page.getByRole('button', { name: 'Удалить кейс' }).click();
    const external = { ...validCase, revision: 'c'.repeat(64), model: { ...validCase.model, title: 'Внешняя версия перед удалением' } };
    await page.evaluate((document) => (window as TestWindow).__TESTORITTO_MOCK__!.setCase(document), external);
    await expect(page.getByRole('heading', { name: 'PAY-7 · Внешняя версия перед удалением' })).toBeVisible();
    await page.getByRole('button', { name: 'Удалить файл кейса' }).click();
    await expect(page.getByText('Файл изменён извне. Черновик не записан поверх новой версии.')).toBeVisible();
    await expect(page.getByRole('treeitem', { name: /PAY-7 · Внешняя версия перед удалением/ })).toBeVisible();
    const request = (await getCalls(page)).find((call) => call.command === 'organize_case')!.args.request as { operation: CaseOperation };
    expect(request.operation.expectedRevision).toBe('a'.repeat(64));
    await page.getByRole('button', { name: 'Отмена' }).click();
    await expect(page.getByRole('heading', { name: 'PAY-7 · Внешняя версия перед удалением' })).toBeVisible();
  });

  test('creates a snapshot run after retry and displays frozen full case content', async ({ page }) => {
    await installMock(page, { queues: { create_run: [{ __reject: { code: 'SAVE_FAILED', message: 'private disk path' } }] } });
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('button', { name: 'Создать прогон' }).click();
    await page.getByRole('button', { name: 'Отмена' }).click();
    expect((await getCalls(page)).filter((call) => call.command === 'create_run')).toHaveLength(0);
    await page.getByRole('button', { name: 'Создать прогон' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Название прогона' }).fill('Проверка снимков');
    await dialog.getByLabel('Дата теста').fill('2026-10-14');
    await dialog.getByText('PAY-7 · Платёж проходит', { exact: true }).click();
    await expect(dialog.getByRole('checkbox', { name: /PAY-7 · Платёж проходит/ })).toBeChecked();
    await captureEvidence(page, 'create-run-dialog.png');
    await dialog.getByRole('button', { name: 'Создать прогон' }).click();
    await expect(dialog.getByText('Не удалось создать прогон. Ввод сохранён, частичный прогон не опубликован.')).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Название прогона' })).toHaveValue('Проверка снимков');
    await dialog.getByRole('button', { name: 'Создать прогон' }).click();
    await expect(page.getByRole('heading', { name: 'Проверка снимков' })).toBeVisible();
    const writes = (await getCalls(page)).filter((call) => call.command === 'create_run');
    expect(writes).toHaveLength(2);
    expect((writes[1]!.args.request as { creation: RunCreation }).creation.cases).toEqual([{ resourceId: caseResourceA, expectedRevision: 'a'.repeat(64) }]);
    await page.evaluate((document) => (window as TestWindow).__TESTORITTO_MOCK__!.setCase(document), { ...validCase, revision: 'c'.repeat(64), model: { ...validCase.model, title: 'Новый исходник', objective: 'Изменённая цель' } });
    await page.getByRole('button', { name: /PAY-7 · Платёж проходит.*Не запущен/ }).click();
    await expect(page.getByText('2026-10-14', { exact: true })).toBeVisible();
    await page.getByText('Снимок исходного кейса', { exact: true }).click();
    await expect(page.locator('details').getByText('Проверить успешную оплату.', { exact: true })).toBeVisible();
    await expect(page.getByText('Изменённая цель', { exact: true })).toHaveCount(0);
    await captureEvidence(page, 'run-source-snapshot.png');
  });

  test('does not submit a run with an empty selection or stale selected revision', async ({ page }) => {
    await installMock(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('button', { name: 'Создать прогон' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Название прогона' }).fill('Stale run');
    await dialog.getByRole('button', { name: 'Создать прогон' }).click();
    await expect(dialog.getByText('Проверьте поле: нужны название, корректная дата и от 1 до 500 кейсов.')).toBeVisible();
    expect((await getCalls(page)).filter((call) => call.command === 'create_run')).toHaveLength(0);
    await dialog.getByText('PAY-7 · Платёж проходит', { exact: true }).click();
    await expect(dialog.getByRole('checkbox', { name: /PAY-7 · Платёж проходит/ })).toBeChecked();
    await page.evaluate((document) => (window as TestWindow).__TESTORITTO_MOCK__!.setCase(document), { ...validCase, revision: 'c'.repeat(64) });
    await dialog.getByRole('button', { name: 'Создать прогон' }).click();
    await expect(dialog.getByText('Файл изменён извне. Черновик не записан поверх новой версии.')).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Название прогона' })).toHaveValue('Stale run');
  });

  test('filters cases without losing the parent folder or current document', async ({ page }) => {
    await installMock(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('treeitem', { name: /PAY-7 · Платёж проходит/ }).click();
    await page.getByRole('textbox', { name: 'Поиск кейсов' }).fill(' pay-7 ');
    await expect(page.getByRole('treeitem', { name: /PAY-7 · Платёж проходит/ })).toBeVisible();
    await expect(page.getByRole('treeitem', { name: /Payments QA/ })).toBeVisible();
    await page.getByRole('textbox', { name: 'Теги' }).fill(' SMOKE ');
    await page.getByRole('combobox', { name: 'Статус' }).click();
    await page.getByRole('option', { name: 'Черновик' }).click();
    await expect(page.getByText('Кейсы не найдены', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'PAY-7 · Платёж проходит' })).toBeVisible();
    await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
    await expect(page.getByRole('treeitem', { name: /PAY-7 · Платёж проходит/ })).toBeVisible();
    await page.getByRole('textbox', { name: 'Поиск кейсов' }).fill('ПЛАТЁЖ');
    await expect(page.getByRole('treeitem', { name: /PAY-7 · Платёж проходит/ })).toBeVisible();
    expect((await getCalls(page)).filter((call) => call.command === 'catalog_workspace')).toHaveLength(1);
    await captureEvidence(page, 'case-filters.png');
  });

  test('Git push confirms target, cancels without mutation and safely retries rejection', async ({ page }) => {
    const syncToken = '550e8400-e29b-41d4-a716-446655440040';
    const status: GitStatus = { syncToken, abortToken: null, syncBlocked: false, branch: 'main', head: 'a'.repeat(40), unborn: false, detached: false, upstream: 'origin/main', ahead: 1, behind: 0, filtersDisabled: false, files: [] };
    await installMock(page, { gitStatus: status, queues: { git_sync: [{ __reject: { code: 'GIT_PUSH_REJECTED', message: 'secret stderr' } }, { __deferred: 'push' }] } });
    await page.goto('/'); await page.getByRole('button', { name: 'Открыть репозиторий' }).click(); await page.getByRole('tab', { name: 'Git', exact: true }).click();
    const push = page.getByRole('button', { name: 'Отправить изменения…', exact: true });
    await push.click(); const dialog = page.getByRole('dialog', { name: 'Подтвердите действие Git' }); await expect(dialog).toContainText('main → origin/main');
    await dialog.getByRole('button', { name: 'Отмена', exact: true }).click(); expect((await getCalls(page)).filter((call) => call.command === 'git_sync')).toHaveLength(0);
    await push.click(); await dialog.getByRole('button', { name: 'Подтвердить', exact: true }).click(); await expect(page.getByText(/^Push отклонён/)).toBeVisible(); await expect(page.getByText('secret stderr')).toHaveCount(0);
    await push.click(); await dialog.getByRole('button', { name: 'Подтвердить', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Отмена', exact: true })).toBeDisabled(); await expect(page.locator('main > header').getByRole('button', { name: 'Закрыть', exact: true })).toBeDisabled();
    await page.evaluate(() => (window as TestWindow).__TESTORITTO_MOCK__?.resolve('push', { outcome: 'pushed', abortToken: null, unmergedPaths: [], repository: null, reloadRequired: false }));
    await expect(page.getByText('Push выполнен.', { exact: true })).toBeVisible();
    expect((await getCalls(page)).filter((call) => call.command === 'git_sync').map((call) => call.args.request)).toEqual(Array.from({ length: 2 }, () => ({ protocolVersion: 1, sessionId: sessionA, confirmation: syncToken, action: 'push' })));
  });

  test('Git pull refreshes catalogs and owned conflict abort requires explicit confirmation', async ({ page }) => {
    const syncToken = '550e8400-e29b-41d4-a716-446655440040'; const abortToken = '550e8400-e29b-41d4-a716-446655440041';
    const status: GitStatus = { syncToken, abortToken: null, syncBlocked: false, branch: 'main', head: 'a'.repeat(40), unborn: false, detached: false, upstream: 'origin/main', ahead: 0, behind: 1, filtersDisabled: false, files: [] };
    const conflicted: GitStatus = { ...status, syncToken: null, abortToken, syncBlocked: true, files: [{ fileId: caseResourceA, path: 'case.md', originalPath: null, committable: false, index: 'U', worktree: 'U', unmerged: true, submodule: false }] };
    await installMock(page, { gitStatus: status, queues: { git_status: [status, conflicted, status], git_sync: [{ outcome: 'conflict', abortToken, unmergedPaths: ['case.md'], repository: null, reloadRequired: false }, { outcome: 'aborted', abortToken: null, unmergedPaths: [], repository: defaultOpen(), reloadRequired: false }] } });
    await page.goto('/'); await page.getByRole('button', { name: 'Открыть репозиторий' }).click(); await page.getByRole('tab', { name: 'Git', exact: true }).click();
    const before = (await getCalls(page)).filter((call) => call.command === 'catalog_workspace').length;
    await page.getByRole('button', { name: 'Получить изменения…', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Подтвердите действие Git' }); await dialog.getByRole('button', { name: 'Подтвердить', exact: true }).click();
    await expect(page.getByText(/^Pull создал конфликт/)).toBeVisible(); await expect(page.getByRole('button', { name: 'Отправить изменения…', exact: true })).toBeDisabled(); await expect(page.getByRole('button', { name: 'Создать commit…', exact: true })).toBeDisabled();
    await captureEvidence(page, 'git-sync-conflict.png');
    await page.getByRole('button', { name: 'Отменить слияние…', exact: true }).click(); await expect(dialog).toContainText('Отмена доступна только'); await dialog.getByRole('button', { name: 'Отмена', exact: true }).click(); expect((await getCalls(page)).filter((call) => call.command === 'git_sync')).toHaveLength(1);
    await page.getByRole('button', { name: 'Отменить слияние…', exact: true }).click(); await dialog.getByRole('button', { name: 'Подтвердить', exact: true }).click(); await expect(page.getByText('Слияние отменено. Локальные commits сохранены.')).toBeVisible();
    await expect.poll(async () => (await getCalls(page)).filter((call) => call.command === 'catalog_workspace').length).toBeGreaterThan(before);
    expect((await getCalls(page)).filter((call) => call.command === 'git_sync')[1]?.args.request).toEqual({ protocolVersion: 1, sessionId: sessionA, confirmation: abortToken, action: 'abort' });
  });

  test('Git successful pull reloads changed workspace metadata and clears stale selection', async ({ page }) => {
    const syncToken = '550e8400-e29b-41d4-a716-446655440040';
    const status: GitStatus = { syncToken, abortToken: null, syncBlocked: false, branch: 'main', head: 'a'.repeat(40), unborn: false, detached: false, upstream: 'origin/main', ahead: 0, behind: 1, filtersDisabled: false, files: [] };
    const repository = { ...defaultOpen(), workspaces: [{ path: 'area', name: 'Remote area', displayIdPrefix: 'AREA', description: '' }] };
    await installMock(page, { gitStatus: status, queues: { git_sync: [{ outcome: 'pulled', abortToken: null, unmergedPaths: [], repository, reloadRequired: false }], git_status: [status, { ...status, head: 'b'.repeat(40), behind: 0 }] } });
    await page.goto('/'); await page.getByRole('button', { name: 'Открыть репозиторий' }).click(); await page.getByRole('tab', { name: 'Git', exact: true }).click();
    await page.getByRole('button', { name: 'Получить изменения…', exact: true }).click(); await page.getByRole('dialog', { name: 'Подтвердите действие Git' }).getByRole('button', { name: 'Подтвердить', exact: true }).click();
    await expect(page.getByText('Pull выполнен. Данные репозитория обновлены.')).toBeVisible();
    await page.getByRole('tab', { name: 'Кейсы', exact: true }).click(); await expect(page.getByRole('combobox', { name: 'Рабочая область', exact: true })).toHaveText('Remote area');
    await expect.poll(async () => (await getCalls(page)).filter((call) => call.command === 'catalog_workspace').map((call) => (call.args.request as { workspacePath: string }).workspacePath)).toContain('area');
  });

  test('Git safe abort failure blocks further actions and preserves visible conflict', async ({ page }) => {
    const abortToken = '550e8400-e29b-41d4-a716-446655440041';
    const status: GitStatus = { syncToken: null, abortToken, syncBlocked: true, branch: 'main', head: 'a'.repeat(40), unborn: false, detached: false, upstream: 'origin/main', ahead: 1, behind: 1, filtersDisabled: false, files: [{ fileId: caseResourceA, path: 'case.md', originalPath: null, committable: false, index: 'U', worktree: 'U', unmerged: true, submodule: false }] };
    await installMock(page, { gitStatus: status, queues: { git_sync: [{ __reject: { code: 'GIT_ABORT_FAILED', message: 'secret stderr' } }] } });
    await page.goto('/'); await page.getByRole('button', { name: 'Открыть репозиторий' }).click(); await page.getByRole('tab', { name: 'Git', exact: true }).click(); await page.getByRole('button', { name: 'Отменить слияние…', exact: true }).click(); await page.getByRole('dialog', { name: 'Подтвердите действие Git' }).getByRole('button', { name: 'Подтвердить', exact: true }).click();
    await expect(page.getByText(/^Безопасная отмена невозможна/)).toBeVisible(); await expect(page.getByRole('button', { name: 'Отменить слияние…', exact: true })).toBeDisabled(); await expect(page.getByRole('button', { name: 'Отправить изменения…', exact: true })).toBeDisabled(); await expect(page.getByText('secret stderr')).toHaveCount(0); await expect(page.getByRole('button', { name: 'case.md', exact: true })).toBeVisible();
    await captureEvidence(page, 'git-sync-abort-failed.png');
  });

  test('explicit commit requires product selection and confirmation, retains failed draft, then refreshes', async ({ page }) => {
    const fileId = '550e8400-e29b-41d4-a716-446655440030'; const foreignId = '550e8400-e29b-41d4-a716-446655440031';
    const status: GitStatus = { syncToken: null, abortToken: null, syncBlocked: false, branch: 'main', head: 'a'.repeat(40), unborn: false, detached: false, upstream: null, ahead: null, behind: null, filtersDisabled: false, files: [{ fileId, committable: true, path: 'case.md', originalPath: null, index: 'M', worktree: 'M', unmerged: false, submodule: false }, { fileId: foreignId, committable: false, path: 'foreign.txt', originalPath: null, index: 'M', worktree: '.', unmerged: false, submodule: false }] };
    await installMock(page, { gitStatus: status, queues: { git_commit: [{ __reject: { code: 'GIT_IDENTITY_MISSING', message: 'secret stderr' } }, { __deferred: 'commit' }], git_status: [status, { ...status, head: 'b'.repeat(40), files: [] }] } });
    await page.goto('/'); await page.getByRole('button', { name: 'Открыть репозиторий' }).click(); await page.getByRole('tab', { name: 'Git', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Включить в commit foreign.txt' })).toBeDisabled();
    await page.getByRole('checkbox', { name: 'Включить в commit case.md' }).press('Space'); await page.getByLabel('Сообщение commit', { exact: true }).fill('Сохранённый кейс');
    await expect(page.getByRole('button', { name: 'Закрыть', exact: true })).toBeDisabled(); await expect(page.getByRole('button', { name: 'Обновить Git' })).toBeDisabled();
    await page.getByRole('button', { name: 'Создать commit…', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Подтвердить commit' }); await expect(dialog).toContainText('case.md'); await expect(dialog).not.toContainText('foreign.txt'); await captureEvidence(page, 'git-commit-confirmation.png');
    await dialog.getByRole('button', { name: 'Отмена', exact: true }).click(); expect((await getCalls(page)).filter((call) => call.command === 'git_commit')).toHaveLength(0);
    await page.getByRole('button', { name: 'Создать commit…', exact: true }).click(); await dialog.getByRole('button', { name: 'Создать commit', exact: true }).click();
    await expect(page.getByText('Настройте Git user.name и user.email во внешнем Git.')).toBeVisible(); await expect(page.getByLabel('Сообщение commit', { exact: true })).toHaveValue('Сохранённый кейс'); await expect(page.getByRole('checkbox', { name: 'Включить в commit case.md' })).toBeChecked();
    await page.getByRole('button', { name: 'Создать commit…', exact: true }).click(); await dialog.getByRole('button', { name: 'Создать commit', exact: true }).dblclick();
    await expect(dialog.getByRole('button', { name: 'Отмена', exact: true })).toBeDisabled();
    expect((await getCalls(page)).filter((call) => call.command === 'git_commit')).toHaveLength(2);
    await page.evaluate((reply) => (window as TestWindow).__TESTORITTO_MOCK__?.resolve('commit', reply), { head: 'b'.repeat(40), indexPublished: true, recoveryIndex: null }); await expect(page.getByText('Commit создан:', { exact: false })).toBeVisible(); await expect(page.getByText('Нет локальных изменений')).toBeVisible();
    const calls = await getCalls(page); expect(calls.filter((call) => call.command === 'git_commit')[0]?.args.request).toEqual({ protocolVersion: 1, sessionId: sessionA, fileIds: [fileId], message: 'Сохранённый кейс' }); expect(calls.filter((call) => call.command.startsWith('save_'))).toHaveLength(0);
  });

  test('commit recovery displays created HEAD and prevents another commit or refresh', async ({ page }) => {
    const fileId = '550e8400-e29b-41d4-a716-446655440030';
    const status: GitStatus = { syncToken: null, abortToken: null, syncBlocked: false, branch: 'main', head: 'a'.repeat(40), unborn: false, detached: false, upstream: null, ahead: null, behind: null, filtersDisabled: false, files: [{ fileId, committable: true, path: 'case.md', originalPath: null, index: 'M', worktree: '.', unmerged: false, submodule: false }] };
    await installMock(page, { gitStatus: status, queues: { git_commit: [{ head: 'b'.repeat(40), indexPublished: false, recoveryIndex: 'testoritto-index-550e8400-e29b-41d4-a716-446655440000' }] } });
    await page.goto('/'); await page.getByRole('button', { name: 'Открыть репозиторий' }).click(); await page.getByRole('tab', { name: 'Git', exact: true }).click(); await page.getByRole('checkbox', { name: 'Включить в commit case.md' }).press('Space'); await page.getByLabel('Сообщение commit', { exact: true }).fill('saved'); await page.getByRole('button', { name: 'Создать commit…', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Создать commit', exact: true }).click();
    await expect(page.getByText(/Commit создан, но индекс не опубликован/)).toBeVisible(); await expect(page.getByText('b'.repeat(40), { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Создать commit…', exact: true })).toBeDisabled(); await expect(page.getByRole('button', { name: 'Обновить Git' })).toBeDisabled(); expect((await getCalls(page)).filter((call) => call.command === 'git_commit')).toHaveLength(1); await captureEvidence(page, 'git-commit-recovery.png');
  });

  test('Git status and diff load on demand, retry safely and render diff as literal text', async ({ page }) => {
    const fileId = '550e8400-e29b-41d4-a716-446655440030';
    const path = 'Payments QA/case [one].md';
    const status: GitStatus = { syncToken: null, abortToken: null, syncBlocked: false, branch: 'main', head: 'a'.repeat(40), unborn: false, detached: false, upstream: 'origin/main', ahead: 2, behind: 1, filtersDisabled: false, files: [{ fileId, committable: true, path, originalPath: null, index: 'M', worktree: 'M', unmerged: false, submodule: false }] };
    const diff: GitDiff = { path, staged: '+staged text', workingTree: '+<script>window.__gitExecuted = true</script>\n+working text', untrackedContent: null, binary: false, unmerged: false, filtersDisabled: false };
    await installMock(page, { gitStatus: status, gitDiffs: { [fileId]: diff }, queues: { git_status: [{ __reject: { code: 'GIT_UNAVAILABLE', message: 'secret stderr D:/private' } }] } });
    await page.goto('/'); await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    expect((await getCalls(page)).some((call) => call.command === 'git_status')).toBe(false);
    await page.getByRole('tab', { name: 'Git', exact: true }).click();
    await expect(page.getByText('Системный Git не найден. Установите Git и проверьте PATH.')).toBeVisible();
    await page.getByRole('button', { name: 'Обновить Git' }).click();
    await expect(page.getByText('origin/main', { exact: true })).toBeVisible();
    await expect(page.getByText('2 / 1', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: path, exact: true }).click();
    await expect(page.getByText('+staged text', { exact: true })).toBeVisible();
    await expect(page.locator('pre').filter({ hasText: '+<script>window.__gitExecuted' })).toContainText('+working text');
    expect(await page.evaluate(() => '__gitExecuted' in window)).toBe(false);
    const calls = await getCalls(page); expect(calls.filter((call) => call.command.startsWith('save_'))).toHaveLength(0);
    const request = calls.find((call) => call.command === 'git_diff')!.args.request;
    expect(request).toEqual({ protocolVersion: 1, sessionId: sessionA, fileId });
    await expect(page.getByText(/secret stderr|D:\/private/)).toHaveCount(0);
    await captureEvidence(page, 'git-status-diff.png');
  });

  test('Git shows unborn, detached and conflict states without modifying the repository', async ({ page }) => {
    const clean: GitStatus = { syncToken: null, abortToken: null, syncBlocked: false, branch: 'new-branch', head: null, unborn: true, detached: false, upstream: null, ahead: null, behind: null, filtersDisabled: false, files: [] };
    const conflicted: GitStatus = { ...clean, branch: null, head: 'b'.repeat(40), unborn: false, detached: true, filtersDisabled: true, files: [{ fileId: '550e8400-e29b-41d4-a716-446655440031', committable: false, path: 'conflict.md', originalPath: null, index: 'U', worktree: 'U', unmerged: true, submodule: false }] };
    await installMock(page, { queues: { git_status: [clean, conflicted] } });
    await page.goto('/'); await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('tab', { name: 'Git', exact: true }).click();
    await expect(page.getByText(/В ветке пока нет коммитов/)).toBeVisible();
    await expect(page.getByText('Upstream не настроен')).toBeVisible();
    await expect(page.getByText('Нет локальных изменений')).toBeVisible();
    await page.getByRole('button', { name: 'Обновить Git' }).click();
    await expect(page.getByText(/^Detached HEAD/)).toBeVisible();
    await expect(page.getByText(/Есть неразрешённые конфликты/)).toBeVisible();
    await expect(page.getByText(/Внешние фильтры преобразования отключены/)).toBeVisible();
    expect((await getCalls(page)).filter((call) => !['git_status', 'get_runtime_diagnostics', 'pick_repository', 'list_recent_repositories', 'remember_workspace', 'catalog_workspace', 'catalog_runs'].includes(call.command))).toHaveLength(0);
    await captureEvidence(page, 'git-conflict-state.png');
  });

  test('Git diff failure hides native stderr and refresh invalidates the selected file', async ({ page }) => {
    const fileId = '550e8400-e29b-41d4-a716-446655440030'; const path = 'new.md';
    const status: GitStatus = { syncToken: null, abortToken: null, syncBlocked: false, branch: 'main', head: 'a'.repeat(40), unborn: false, detached: false, upstream: null, ahead: null, behind: null, filtersDisabled: false, files: [{ fileId, committable: true, path, originalPath: null, index: '?', worktree: '?', unmerged: false, submodule: false }] };
    await installMock(page, { gitStatus: status, gitDiffs: { [fileId]: { path, staged: null, workingTree: null, untrackedContent: 'new content', binary: false, unmerged: false, filtersDisabled: false } }, queues: { git_status: [status, { ...status, files: [] }], git_diff: [{ __reject: { code: 'GIT_OUTPUT_TOO_LARGE', message: 'private stderr' } }] } });
    await page.goto('/'); await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('tab', { name: 'Git', exact: true }).click(); await page.getByRole('button', { name: path, exact: true }).click();
    await expect(page.getByText(/Git-вывод слишком велик/)).toBeVisible();
    await page.getByRole('button', { name: 'Повторить', exact: true }).click();
    await expect(page.getByText('new content', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Обновить Git' }).click();
    await expect(page.getByText('Нет локальных изменений')).toBeVisible();
    await expect(page.getByText('new content', { exact: true })).toHaveCount(0);
    await expect(page.getByText('private stderr')).toHaveCount(0);
  });

  test('run grid filters without writes, preserves run order and paginates cases', async ({ page }) => {
    const seed = workflowFixtures();
    const first = seed.runs.runs[0]!;
    first.cases = Array.from({ length: 60 }, (_, index) => ({ ...first.cases[0]!, resourceId: `550e8400-e29b-41d4-a716-${String(446655440100 + index)}`, caseId: `case-${index}`, displayId: `ROW-${index + 1}`, title: `Кейс ${index + 1}`, result: index % 3 === 0 ? 'pass' : 'not_run' }));
    await installMock(page, seed);
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('tab', { name: 'Прогоны' }).click();
    await page.getByRole('button', { name: /Регрессия оплаты/ }).click();
    const grid = page.getByRole('region', { name: 'Результаты прогона' });
    await expect(grid.getByRole('row')).toHaveCount(26);
    await expect(grid.getByText('Завершено: 20 из 60', { exact: true })).toBeVisible();
    await grid.getByRole('textbox', { name: 'Поиск в прогоне' }).fill('ROW-60');
    await expect(grid.getByRole('row')).toHaveCount(2);
    await expect(grid.getByRole('button', { name: 'Открыть строку 60' })).toContainText('ROW-60');
    await grid.getByRole('combobox', { name: 'Фильтр результатов' }).click();
    await page.getByRole('option', { name: 'Пройден', exact: true }).click();
    await expect(grid.getByText('Нет кейсов по выбранному фильтру')).toBeVisible();
    await expect(grid.getByText('Завершено: 20 из 60', { exact: true })).toBeVisible();
    expect((await getCalls(page)).filter((call) => call.command.startsWith('save_'))).toHaveLength(0);
    await grid.getByRole('textbox', { name: 'Поиск в прогоне' }).fill('ROW-1');
    await captureEvidence(page, 'run-results-grid.png');
  });

  test('guided execution keeps failed input, saves snapshots and advances only after a successful write', async ({ page }) => {
    await installMock(page, { ...workflowFixtures(), queues: { save_run_case: [{ __reject: { code: 'SAVE_FAILED', message: 'private path' } }] } });
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('tab', { name: 'Прогоны' }).click();
    await page.getByRole('button', { name: /Регрессия оплаты/ }).click();
    await page.getByRole('button', { name: 'Начать / продолжить выполнение' }).click();
    await expect(page.getByText('Кейс 1 из 3', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'RUN-1 · Первый снимок', exact: true })).toBeFocused();
    await expect(page.getByRole('region', { name: 'Подготовка 1', exact: true }).getByText('Сохранённое описание подготовки', { exact: true })).toBeVisible();
    await expect(page.locator('form').getByText('Цель из сохранённого снимка 1', { exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Подготовка 1 · Отметка' }).click();
    await page.getByRole('option', { name: 'Пройдено', exact: true }).click();
    await page.getByRole('button', { name: 'Следующий пункт' }).click();
    await page.getByRole('combobox', { name: 'Шаги 1 · Отметка' }).click();
    await page.getByRole('option', { name: 'Не пройдено', exact: true }).click();
    await page.getByRole('textbox', { name: 'Шаги 1 · Пояснение ошибки' }).fill('Сохранённое пояснение');
    await page.getByRole('button', { name: 'К записи результата' }).click();
    await expect(page.getByRole('button', { name: 'Сохранить и продолжить' })).toBeDisabled();
    await page.getByRole('combobox', { name: 'Результат', exact: true }).click();
    await page.getByRole('option', { name: 'Не пройден', exact: true }).click();
    await page.getByRole('textbox', { name: 'Тестировщик' }).fill('QA Guide');
    await expect(page.getByRole('button', { name: 'К таблице результатов' })).toBeDisabled();
    await page.getByRole('button', { name: 'Сохранить и продолжить' }).click();
    await expect(page.getByText('Не удалось сохранить файл; черновик остаётся в редакторе.')).toBeVisible();
    await expect(page.getByText('Кейс 1 из 3', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Тестировщик' })).toHaveValue('QA Guide');
    await captureEvidence(page, 'run-guide-failed-save.png');
    await page.getByRole('button', { name: 'Сохранить и продолжить' }).click();
    await expect(page.getByText('Кейс 3 из 3', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'RUN-3 · Последний снимок', exact: true })).toBeFocused();
    await expect(page.locator('form').getByText('Цель из сохранённого снимка 3', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'К записи результата' }).click();
    await page.getByRole('combobox', { name: 'Результат', exact: true }).click();
    await page.getByRole('option', { name: 'Пройден', exact: true }).click();
    await page.getByRole('button', { name: 'Сохранить и продолжить' }).click();
    await expect(page.getByRole('region', { name: 'Результаты прогона' }).getByText('Завершено: 3 из 3', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Открыть строку 1', exact: true }).click();
    await expect(page.getByText('Сохранённое пояснение', { exact: true })).toBeVisible();
    const writes = (await getCalls(page)).filter((call) => call.command === 'save_run_case');
    expect(writes).toHaveLength(3);
    const edit = (writes[1]!.args.request as { edit: RunCaseEdit }).edit;
    expect(edit.setup[0]?.state).toBe('pass'); expect(edit.steps[0]?.failNote).toBe('Сохранённое пояснение');
    expect((await getCalls(page)).filter((call) => call.command === 'read_case')).toHaveLength(0);
    await captureEvidence(page, 'run-guide-completed.png');
  });

  test('guides an older run without a full snapshot or checklist and keeps in-progress unfinished', async ({ page }) => {
    const seed = workflowFixtures();
    const row = seed.runs.runs[0]!.cases[0]!;
    seed.runs.runs[0]!.cases = [{ ...row, result: 'in_progress' }];
    seed.resources[row.resourceId] = { ...runCase, document: { ...runCase.document, model: { ...runCase.document.model, caseId: row.caseId, displayId: row.displayId, title: row.title, result: 'in_progress', setup: [], steps: [], accept: [] } } };
    await installMock(page, seed);
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('tab', { name: 'Прогоны' }).click();
    await page.getByRole('button', { name: /Регрессия оплаты/ }).click();
    await page.getByRole('button', { name: 'Начать / продолжить выполнение' }).click();
    await expect(page.getByText('Полного снимка исходника нет. Используются сохранённые тексты пунктов этого прогона.')).toBeVisible();
    await expect(page.getByText('Отмечено: 0 из 0', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Тестировщик' })).toBeVisible();
    await page.getByRole('button', { name: 'Сохранить и продолжить' }).click();
    await expect(page.getByRole('region', { name: 'Результаты прогона' }).getByText('Завершено: 0 из 1', { exact: true })).toBeVisible();
    expect((await getCalls(page)).filter((call) => call.command === 'read_case')).toHaveLength(0);
  });

  test('closes and reopens a run, retries notes save and retains approvals', async ({ page }) => {
    await installMock(page, { queues: { save_run_details: [{ __reject: { code: 'SAVE_FAILED', message: 'private path' } }] } });
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('tab', { name: 'Прогоны' }).click();
    await page.getByRole('button', { name: /Регрессия оплаты/ }).click();
    await page.getByRole('button', { name: 'Редактировать прогон' }).click();
    await page.getByRole('textbox', { name: 'Итоги' }).fill('Итоги проверки');
    await page.getByRole('textbox', { name: 'Заметки' }).fill('${variable}\nПрогон завершён');
    await page.getByRole('combobox', { name: 'Статус', exact: true }).click();
    await page.getByRole('option', { name: 'Закрыт', exact: true }).click();
    await page.getByRole('button', { name: 'Сохранить прогон' }).click();
    await expect(page.getByText('Не удалось сохранить файл; черновик остаётся в редакторе.')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Итоги' })).toHaveValue('Итоги проверки');
    await page.keyboard.press('Control+s');
    await expect(page.getByText('Сохранено', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Регрессия оплаты/ })).toContainText('Закрыт');
    await page.getByRole('button', { name: 'Просмотр', exact: true }).click();
    await expect(page.getByText('Ирина · 2026-10-14')).toBeVisible();
    await page.getByRole('button', { name: /PAY-7 · Платёж проходит/ }).click();
    await page.getByRole('button', { name: /Регрессия оплаты/ }).click();
    await expect(page.getByText('Итоги проверки', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Редактировать прогон' }).click();
    await page.getByRole('combobox', { name: 'Статус', exact: true }).click();
    await page.getByRole('option', { name: 'Открыт', exact: true }).click();
    await page.getByRole('button', { name: 'Сохранить прогон' }).click();
    await expect(page.getByText('Сохранено', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Регрессия оплаты/ })).toContainText('Открыт');
    const writes = (await getCalls(page)).filter((call) => call.command === 'save_run_details');
    expect(writes).toHaveLength(3);
    const request = writes[1]!.args.request as { edit: RunDetailsEdit; expectedRevision: string };
    expect(Object.keys(request.edit).sort()).toEqual(['notes', 'status', 'summary']);
    expect(request.expectedRevision).toBe('a'.repeat(64));
    expect(request.edit.status).toBe('closed');
    await page.getByRole('button', { name: 'Просмотр', exact: true }).click();
    await captureEvidence(page, 'saved-run-details.png');
  });

  test('keeps dirty run notes during an external details update until confirmed reload', async ({ page }) => {
    await installMock(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('tab', { name: 'Прогоны' }).click();
    await page.getByRole('button', { name: /Регрессия оплаты/ }).click();
    await page.getByRole('button', { name: 'Редактировать прогон' }).click();
    await page.getByRole('textbox', { name: 'Заметки' }).fill('Мои заметки');
    const external = { ...runDetails, document: { ...runDetails.document, revision: 'd'.repeat(64), model: { ...runDetails.document.model, notes: 'Внешние заметки' } } };
    await page.evaluate((document) => (window as TestWindow).__TESTORITTO_MOCK__!.setRunDetails(document), external);
    await expect(page.getByText(/Файл изменён извне. Черновик сохранён/)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Заметки' })).toHaveValue('Мои заметки');
    await expect(page.getByRole('button', { name: 'Сохранить прогон' })).toBeDisabled();
    await page.getByRole('button', { name: 'Загрузить версию с диска' }).click();
    await page.getByRole('button', { name: 'Отказаться и загрузить файл' }).click();
    await expect(page.getByText('Внешние заметки', { exact: true })).toBeVisible();
    expect((await getCalls(page)).filter((call) => call.command === 'save_run_details')).toHaveLength(0);
  });

  test('saves run execution after failure and restores checks, failure notes and metadata', async ({ page }) => {
    await installMock(page, { queues: { save_run_case: [{ __reject: { code: 'SAVE_FAILED', message: 'private disk path' } }] } });
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('tab', { name: 'Прогоны' }).click();
    await page.getByRole('button', { name: /PAY-7 · Платёж проходит/ }).click();
    await page.getByRole('button', { name: 'Записать результат' }).click();
    await page.getByRole('combobox', { name: 'Результат', exact: true }).click();
    await page.getByRole('option', { name: 'Заблокирован', exact: true }).click();
    await page.getByRole('combobox', { name: /Подготовка 1 · Отметка/ }).click();
    await page.getByRole('option', { name: 'Не пройдено', exact: true }).click();
    await page.getByRole('textbox', { name: /Подготовка 1 · Пояснение ошибки/ }).fill('Не выполнено условие подготовки');
    await page.getByRole('textbox', { name: 'Тестировщик' }).fill('Мария');
    await page.getByRole('textbox', { name: /Шаги 1 · Пояснение ошибки/ }).fill('Ответ не соответствует ожиданию');
    await page.getByRole('textbox', { name: 'Заметки' }).fill('${variable}\nПодробности выполнения');
    await page.getByRole('button', { name: 'Указать текущее время' }).click();
    await expect(page.getByRole('button', { name: /Регрессия оплаты/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Сохранить результат' }).click();
    await expect(page.getByText('Не удалось сохранить файл; черновик остаётся в редакторе.')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Тестировщик' })).toHaveValue('Мария');
    await page.getByRole('button', { name: 'Сохранить результат' }).click();
    await expect(page.getByText('Сохранено', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Просмотр', exact: true }).click();
    await expect(page.getByText('Ответ не соответствует ожиданию')).toBeVisible();
    await page.getByRole('button', { name: /Регрессия оплаты/ }).click();
    await page.getByRole('button', { name: /PAY-7 · Платёж проходит/ }).click();
    await expect(page.getByText('Мария', { exact: true })).toBeVisible();
    await expect(page.getByText('Ответ не соответствует ожиданию')).toBeVisible();
    const writes = (await getCalls(page)).filter((call) => call.command === 'save_run_case');
    expect(writes).toHaveLength(2);
    const request = writes[1]!.args.request as { expectedRevision: string; edit: RunCaseEdit };
    expect(request.expectedRevision).toBe('a'.repeat(64));
    expect(request.edit.result).toBe('blocked'); expect(request.edit.setup[0]?.state).toBe('fail');
    expect(request.edit.steps[0]?.state).toBe('fail'); expect(request.edit.steps[0]?.failNote).toBe('Ответ не соответствует ожиданию');
    expect(request.edit).not.toHaveProperty('caseId'); expect(request.edit.steps[0]).not.toHaveProperty('text');
    expect(request.edit.executedAt).toMatch(/^\d{4}-/);
    await captureEvidence(page, 'saved-run-execution.png');
  });

  test('keeps dirty run execution on external change and reloads after explicit discard', async ({ page }) => {
    await installMock(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('tab', { name: 'Прогоны' }).click();
    await page.getByRole('button', { name: /PAY-7 · Платёж проходит/ }).click();
    await page.getByRole('button', { name: 'Записать результат' }).click();
    await page.getByRole('textbox', { name: 'Тестировщик' }).fill('Мой черновик');
    const external = { ...runCase, document: { ...runCase.document, revision: 'c'.repeat(64), model: { ...runCase.document.model, tester: 'Внешняя версия' } } };
    await page.evaluate((document) => (window as TestWindow).__TESTORITTO_MOCK__!.setRunCase(document), external);
    await expect(page.getByText(/Файл изменён извне. Черновик сохранён/)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Тестировщик' })).toHaveValue('Мой черновик');
    await expect(page.getByRole('button', { name: 'Сохранить результат' })).toBeDisabled();
    await page.getByRole('button', { name: 'Загрузить версию с диска' }).click();
    await page.getByRole('button', { name: 'Отказаться и загрузить файл' }).click();
    await expect(page.getByText('Внешняя версия', { exact: true })).toBeVisible();
    expect((await getCalls(page)).filter((call) => call.command === 'save_run_case')).toHaveLength(0);
  });

  test('edits and saves a case, keeps a failed draft and sends only typed edits', async ({ page }) => {
    await installMock(page, { queues: { save_case: [{ __reject: { code: 'SAVE_FAILED', message: 'D:/private stderr' } }] } });
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('treeitem', { name: /PAY-7 · Платёж проходит/ }).click();
    await page.getByRole('button', { name: 'Редактировать кейс' }).click();
    await page.getByRole('textbox', { name: 'Название кейса' }).fill('Изменённый платёж');
    await page.getByRole('textbox', { name: 'Текст шага 2' }).fill('Проверить вложенный шаг');
    await expect(page.getByRole('button', { name: 'Закрыть' })).toBeDisabled();
    await page.getByRole('button', { name: 'Сохранить кейс' }).click();
    await expect(page.getByText('Не удалось сохранить файл; черновик остаётся в редакторе.')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Название кейса' })).toHaveValue('Изменённый платёж');
    await page.getByRole('button', { name: 'Сохранить кейс' }).click();
    await expect(page.getByText('Сохранено', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Просмотр', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'PAY-7 · Изменённый платёж' })).toBeVisible();
    await expect(page.getByText('Проверить вложенный шаг')).toBeVisible();
    const writes = (await getCalls(page)).filter((call) => call.command === 'save_case');
    expect(writes).toHaveLength(2);
    const request = writes[1]!.args.request as { edit: CaseEdit; expectedRevision: string };
    expect(request.expectedRevision).toBe('a'.repeat(64));
    expect(request.edit).not.toHaveProperty('id');
    expect(request.edit.steps[1]?.depth).toBe(1);
    await expect(page.getByText('D:/private stderr')).toHaveCount(0);
    await captureEvidence(page, 'saved-case.png');
  });

  test('polls external changes without overwriting a dirty draft and reloads only after confirmation', async ({ page }) => {
    await installMock(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('treeitem', { name: /PAY-7 · Платёж проходит/ }).click();
    await page.getByRole('button', { name: 'Редактировать кейс' }).click();
    await page.getByRole('textbox', { name: 'Название кейса' }).fill('Мой черновик');
    const external = { ...validCase, revision: 'c'.repeat(64), model: { ...validCase.model, title: 'Внешняя версия' } };
    await page.evaluate((document) => (window as TestWindow).__TESTORITTO_MOCK__!.setCase(document), external);
    await expect(page.getByText(/Файл изменён извне. Черновик сохранён/)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Название кейса' })).toHaveValue('Мой черновик');
    await expect(page.getByRole('button', { name: 'Сохранить кейс' })).toBeDisabled();
    await page.getByRole('button', { name: 'Загрузить версию с диска' }).click();
    await page.getByRole('button', { name: 'Продолжить редактирование' }).click();
    await expect(page.getByRole('textbox', { name: 'Название кейса' })).toHaveValue('Мой черновик');
    await page.getByRole('button', { name: 'Загрузить версию с диска' }).click();
    await page.getByRole('button', { name: 'Отказаться и загрузить файл' }).click();
    await expect(page.getByRole('heading', { name: 'PAY-7 · Внешняя версия' })).toBeVisible();
    expect((await getCalls(page)).some((call) => call.command === 'save_case')).toBe(false);
  });

  test('case reader and workspace Select work with the exact production Tauri CSP', async ({ page }) => {
    const areaCatalog = structuredClone(workspace('550e8400-e29b-41d4-a716-446655440022', 'Проверка CSP'));
    areaCatalog.workspacePath = 'area';
    const areaCase = areaCatalog.entries.find((entry) => entry.kind === 'case');
    if (areaCase?.kind === 'case') areaCase.metadata.path = 'area/csp-case.md';
    const hostileCase = structuredClone(validCase);
    hostileCase.model.objective = '<img src="https://example.invalid/pixel" onerror="window.__testorittoXss=1">\n\n`Текст без HTML`';
    await installMock(page, { queues: { catalog_workspace: [areaCatalog], read_case: [hostileCase] } });

    await page.route('http://127.0.0.1:4175/**', async (route) => {
      if (route.request().resourceType() !== 'document') {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const headers = { ...response.headers(), 'content-security-policy': tauriConfig.app.security.csp };
      await route.fulfill({ response, headers });
    });

    const documentResponse = await page.goto('/');
    expect(documentResponse?.headers()['content-security-policy']).toBe(tauriConfig.app.security.csp);
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('combobox', { name: 'Рабочая область' }).click();
    await page.getByRole('option', { name: 'Area' }).click();
    const item = page.getByRole('treeitem', { name: /PAY-7 · Платёж проходит/ });
    await item.click();

    await expect(page.getByRole('heading', { name: 'PAY-7 · Платёж проходит' })).toBeVisible();
    await expect(page.getByText(/Текст без HTML/)).toBeVisible();
    await expect(page.locator('img[src="https://example.invalid/pixel"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as Window & { __testorittoXss?: boolean }).__testorittoXss)).toBeUndefined();
    expect(externalRequests).toEqual([]);
    await captureEvidence(page, 'csp-case-reader.png');
  });


  test('creates a suite with retry and renames a case while preserving its identity', async ({ page }) => {
    await installMock(page, { queues: { create_suite: [{ __reject: { code: 'SAVE_FAILED', message: 'private path' } }], organize_case: [{ __reject: { code: 'SAVE_FAILED', message: 'private path' } }] } });
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('button', { name: 'Создать папку' }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Имя папки' }).fill('New suite');
    await dialog.getByRole('button', { name: 'Создать папку' }).click();
    await expect(dialog.getByText('Не удалось сохранить файл; черновик остаётся в редакторе.')).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Имя папки' })).toHaveValue('New suite');
    await captureEvidence(page, 'create-suite-retry.png');
    await dialog.getByRole('button', { name: 'Создать папку' }).click();
    await expect(page.getByRole('heading', { name: 'New suite', exact: true })).toBeVisible();
    await page.getByRole('treeitem', { name: /PAY-7 · Платёж проходит/ }).click();
    await page.getByRole('button', { name: 'Переименовать файл' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Имя файла кейса' }).fill('payment-renamed.md');
    await expect(dialog.getByText('Payments QA/payment-renamed.md')).toBeVisible();
    await captureEvidence(page, 'rename-case-file.png');
    await dialog.getByRole('button', { name: 'Переименовать файл' }).click();
    await expect(dialog.getByText('Не удалось выполнить операцию. Файл не изменён.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Переименовать файл' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { name: 'PAY-7 · Платёж проходит' })).toBeVisible();
    await expect(page.getByText('case-stable-id', { exact: true })).toBeVisible();
    const calls = await getCalls(page);
    expect(calls.filter((call) => call.command === 'organize_case').at(-1)?.args.request).toMatchObject({ operation: { action: { kind: 'rename', filename: 'payment-renamed.md' }, expectedRevision: 'a'.repeat(64) } });
    expect(calls.filter((call) => call.command === 'save_case')).toHaveLength(0);
  });

  test('native change events refresh clean cases and retain Git drafts until explicitly cleared', async ({ page }) => {
  await installMock(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
  await page.getByRole('treeitem', { name: /PAY-7 · Платёж проходит/ }).click();
  await expect(page.getByRole('heading', { name: 'PAY-7 · Платёж проходит' })).toBeVisible();
  await page.evaluate(({ document, sessionId }) => {
    const mock = (window as TestWindow).__TESTORITTO_MOCK__;
    mock?.setCase({ ...document, revision: 'c'.repeat(64), model: { ...document.model, title: 'Версия native watcher' } });
    mock?.emitChange({ sessionId, epoch: 1, kind: 'content', errorCode: null });
  }, { document: validCase, sessionId: sessionA });
  await expect(page.getByRole('heading', { name: 'PAY-7 · Версия native watcher' })).toBeVisible();
  await page.getByRole('tab', { name: 'Git', exact: true }).click();
  await page.getByRole('textbox', { name: 'Сообщение commit' }).fill('Не терять сообщение');
  const count = (await getCalls(page)).filter((call) => call.command === 'refresh_repository').length;
  await page.evaluate((sessionId) => (window as TestWindow).__TESTORITTO_MOCK__?.emitChange({ sessionId, epoch: 2, kind: 'git', errorCode: null }), sessionA);
  await expect(page.getByText(/Обнаружены внешние изменения/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Сообщение commit' })).toHaveValue('Не терять сообщение');
  expect((await getCalls(page)).filter((call) => call.command === 'refresh_repository').length).toBe(count);
  await captureEvidence(page, 'watcher-pending.png');
  await page.getByRole('button', { name: 'Очистить выбор и сообщение' }).click();
  await expect.poll(async () => (await getCalls(page)).filter((call) => call.command === 'refresh_repository').length).toBe(count + 1);
});

  test('suite preview, duplicate, rename, move and explicit delete run under production CSP', async ({ page }) => {
    await installMock(page, { folderName: 'Название из заметки' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('treeitem', { name: 'Название из заметки', exact: true }).click();
    await page.getByRole('button', { name: 'Дублировать папку' }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Имя папки' }).fill('Copy');
    await dialog.getByRole('button', { name: 'Проверить содержимое' }).click();
    await expect(dialog.getByText('Payments QA/unknown.bin', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Payments QA.md', { exact: true })).toBeVisible();
    await captureEvidence(page, 'suite-operation-preview.png');
    await dialog.getByRole('button', { name: 'Подтвердить операцию' }).click();
    await expect(page.locator('code').filter({ hasText: /^Copy$/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Название из заметки', exact: true })).toBeVisible();
    await expect(page.locator('[role=treeitem][aria-selected=true]')).toContainText('Название из заметки');
    await page.getByRole('button', { name: 'Переименовать папку' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Имя папки' }).fill('Renamed');
    await dialog.getByRole('button', { name: 'Проверить содержимое' }).click();
    await dialog.getByRole('button', { name: 'Подтвердить операцию' }).click();
    await expect(page.locator('code').filter({ hasText: /^Renamed$/ })).toBeVisible();
    await page.getByRole('button', { name: 'Переместить папку' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: 'Папка назначения' }).click();
    await page.getByRole('option', { name: 'Payments QA', exact: true }).click();
    await dialog.getByRole('button', { name: 'Проверить содержимое' }).click();
    await expect(dialog.getByText('Payments QA/Renamed', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Подтвердить операцию' }).click();
    await expect(page.locator('code').filter({ hasText: /^Payments QA\/Renamed$/ })).toBeVisible();
    await page.getByRole('button', { name: 'Удалить папку' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Проверить содержимое' }).click();
    const callsBeforeCancel = (await getCalls(page)).filter((call) => call.command === 'apply_suite_operation').length;
    await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
    expect((await getCalls(page)).filter((call) => call.command === 'apply_suite_operation')).toHaveLength(callsBeforeCancel);
    await page.getByRole('button', { name: 'Удалить папку' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Проверить содержимое' }).click();
    await dialog.getByRole('button', { name: 'Окончательно удалить перечисленное' }).click();
    await expect(page.getByRole('treeitem', { name: 'Название из заметки', exact: true })).toHaveCount(1);
    const calls = await getCalls(page);
    expect(calls.filter((call) => call.command === 'apply_suite_operation')).toHaveLength(4);
    expect(calls.some((call) => call.command === 'save_case' || call.command === 'git_commit')).toBe(false);
  });

  test('partial suite deletion reports paths and blocks writes after refresh and reopen', async ({ page }) => {
    const recovery = { transactionPath: `.testoritto-suite-${sessionA}`, removedPaths: ['Payments QA/unknown.bin'], remainingPaths: ['Payments QA', `.testoritto-suite-${sessionA}/journal.json`] };
    const reopened = { ...defaultOpen(), warnings: [{ code: 'SUITE_RECOVERY_REQUIRED', message: `Незавершённая операция: ${recovery.transactionPath}; требуется внешняя проверка.` }] };
    await installMock(page, { queues: { apply_suite_operation: [{ outcome: 'recoveryRequired', path: null, recovery }], refresh_repository: [reopened], pick_repository: [defaultOpen(), { ...reopened, sessionId: sessionB }] } });
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await page.getByRole('treeitem', { name: 'Payments QA', exact: true }).click();
    await page.getByRole('button', { name: 'Удалить папку' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Проверить содержимое' }).click();
    await dialog.getByRole('button', { name: 'Окончательно удалить перечисленное' }).click();
    await expect(dialog.getByText('Уже удалены')).toBeVisible();
    await expect(dialog.getByText('Payments QA/unknown.bin', { exact: true })).toBeVisible();
    await captureEvidence(page, 'suite-recovery-required.png');
    await dialog.getByText('Закрыть', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Создать папку', exact: true })).toBeDisabled();
    await page.evaluate((sessionId) => (window as TestWindow).__TESTORITTO_MOCK__?.emitChange({ sessionId, epoch: 1, kind: 'rescan', errorCode: null }), sessionA);
    await expect.poll(async () => (await getCalls(page)).filter((call) => call.command === 'refresh_repository').length).toBe(1);
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await page.getByRole('button', { name: 'Открыть репозиторий' }).click();
    await expect(page.getByText(`Незавершённая операция: ${recovery.transactionPath}; требуется внешняя проверка.`, { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Создать папку', exact: true })).toBeDisabled();
    await page.getByRole('treeitem', { name: /PAY-7 · Второй кейс/ }).click();
    await expect(page.getByRole('heading', { name: 'PAY-7 · Платёж проходит' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Редактировать кейс' })).toHaveCount(0);
  });

});
