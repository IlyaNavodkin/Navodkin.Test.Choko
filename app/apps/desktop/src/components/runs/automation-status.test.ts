import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from '@/schemas/automation-store';
import type { RunAutomationResult } from '@/services/automation/run-results';
import { AutomationStatus, automationResultLookup } from './automation-status';

const entry = (project: string): CatalogEntry => ({ automationId: 'login', project, variantId: null, title: 'Login', titlePath: [], file: 'auth/login.spec.ts', line: 1, caseId: null, tags: [], expectedStatus: 'passed', arguments: [], archived: false, revision: 'r1' });
const result = (over: Partial<RunAutomationResult> = {}): RunAutomationResult => ({ executionId: '2026-10-20T10', automationId: 'login', project: 'chromium', caseId: 'c1', caseRowIndex: 0, status: 'passed', flaky: false, attempts: 1, duration: 20, ...over });

describe('run autotest statuses', () => {
  it('distinguishes never-run, interrupted, failed and active tests in readable text', () => {
    expect(renderToStaticMarkup(createElement(AutomationStatus, {}))).toContain('Not run');
    expect(renderToStaticMarkup(createElement(AutomationStatus, { status: 'interrupted' }))).toContain('Interrupted');
    expect(renderToStaticMarkup(createElement(AutomationStatus, { status: 'timedOut' }))).toContain('Failed');
    expect(renderToStaticMarkup(createElement(AutomationStatus, { status: 'passed', running: true }))).toContain('Running');
  });
  it('keeps project-specific results separate and does not guess a project-less import', () => {
    const catalog = [entry('chromium'), entry('firefox')];
    const lookup = automationResultLookup(catalog, [result({ project: '' })]);
    expect(lookup(catalog[0])).toBeUndefined();
    expect(lookup(catalog[1])).toBeUndefined();
  });
  it('uses a newer imported result only when it maps unambiguously', () => {
    const catalog = [entry('chromium')];
    const lookup = automationResultLookup(catalog, [result({ recordedAt: '2026-10-20T10:00:00Z' }), result({ project: '', executionId: 'import:a', status: 'failed', recordedAt: '2026-10-20T11:00:00Z' })]);
    expect(lookup(catalog[0])?.status).toBe('failed');
  });
});
