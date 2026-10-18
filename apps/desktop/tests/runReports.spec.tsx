import { readFileSync } from 'node:fs';
import { ReportDistribution } from '../src/ux-preview/useCases/export-report/ReportDistribution';
import { distributionSegments, distributionOrder, reportResultColors } from '../src/ux-preview/useCases/export-report/distributionModel';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDemoRuns } from '../src/ux-preview/useCases/explore-design/fixtures';
import { usePreviewWorkspace } from '../src/ux-preview/useCases/explore-design/usePreviewWorkspace';
import { buildReport, summarize, weekPeriod } from '../src/ux-preview/useCases/export-report/buildReport';
import { buildPdfDefinition, pdfDistribution } from '../src/ux-preview/useCases/export-report/pdfDefinition';
import { createReportBlob, downloadReportBlob, reportFilename } from '../src/ux-preview/useCases/export-report/exportReport';
import { reportSchema } from '../src/ux-preview/useCases/export-report/schema';
import { ReportPreview } from '../src/ux-preview/useCases/export-report/ReportPreview';
import { useReportPreview } from '../src/ux-preview/useCases/export-report/useReportPreview';
import type { ReportSource } from '../src/ux-preview/useCases/export-report/types';

const source = (kind: 'run' | 'weekly' = 'run'): ReportSource => ({ kind, runs: createDemoRuns(), runId: 'run-42', repoName: 'PayFlow QA', generatedAt: '2026-10-16T12:00:00.000Z' });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
describe('report document', () => {
  it.each([['2026-10-18', '2026-10-12', '2026-10-18'], ['2026-10-19', '2026-10-19', '2026-10-25'], ['2027-01-01', '2026-12-28', '2027-01-03'], ['2024-02-29', '2024-02-26', '2024-03-03']])('selects Monday–Sunday for %s without timezone rollover', (date, start, end) => expect(weekPeriod(date)).toEqual({ start, end }));
  it.each(['', '2026-02-29', '2026-13-01', '2026-10-16T00:00:00Z'])('rejects invalid date %s', (date) => expect(weekPeriod(date)).toBeNull());
  it('counts all six states and only pass/fail determine pass rate', () => {
    expect(summarize(['not_run', 'in_progress', 'pass', 'pass', 'fail', 'blocked', 'skipped'])).toEqual({ counts: { not_run: 1, in_progress: 1, pass: 2, fail: 1, blocked: 1, skipped: 1 }, total: 7, passRate: 2 / 3 });
    expect(summarize(['blocked', 'skipped', 'not_run', 'in_progress']).passRate).toBeNull();
  });
  it('projects notes out at every depth without mutating or retaining references', () => {
    const input = source(); const before = structuredClone(input);
    input.runs[0].results[1].failNotes[0] = 'SECRET failure'; input.runs[0].notes = 'SECRET run';
    const afterEdit = structuredClone(input);
    const report = buildReport(input, '2026-10-16', false)!;
    expect(reportSchema.safeParse(report).success).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/"notes"|"failNotes"|SECRET/);
    expect(input).toEqual(afterEdit);
    report.runs[0].cases[0].steps[0] = 'changed report';
    expect(input.runs[0].snapshots[0].steps).toEqual(before.runs[0].snapshots[0].steps);
    const withNotes = buildReport(input, '2026-10-16', true)!;
    expect(withNotes.runs[0].notes).toBe('SECRET run'); expect(withNotes.runs[0].cases[1].failNotes?.[0]).toBe('SECRET failure');
  });
  it('joins renamed snapshots by stable ID and distinguishes absent from not_run', () => {
    const input = source('weekly'); const run = structuredClone(input.runs[0]); run.id = 'run-new'; run.date = '2026-10-17'; run.snapshots[0].title = 'Новое snapshot имя'; run.snapshots = run.snapshots.slice(0, 1); run.results = [run.results[0]]; input.runs.push(run);
    input.runs.push({ ...structuredClone(run), id: 'outside', date: '2026-10-19' });
    const report = buildReport(input, '2026-10-16', false)!;
    expect(report.runs.some((item) => item.id === 'outside')).toBe(false);
    const renamed = report.matrix.find((item) => item.caseId === run.snapshots[0].id)!;
    expect(renamed.title).toBe('Новое snapshot имя');
    expect(report.matrix.filter((item) => item.caseId === renamed.caseId)).toHaveLength(1);
    const missing = report.matrix.find((item) => item.caseId === input.runs[0].snapshots[2].id)!;
    expect(missing.results.find((item) => item.runId === 'run-new')?.result).toBeNull();
    expect(missing.results.find((item) => item.runId === 'run-42')?.result).toBe('not_run');
  });
  it('creates a versioned JSON blob and a sanitized bounded filename', async () => {
    const report = buildReport(source(), '2026-10-16', false)!; report.repoName = '../<>:"\\|?*\u0001'; report.runs[0].name = 'x'.repeat(300);
    const filename = reportFilename(report, 'json'); expect(filename).not.toMatch(/[<>:"/\\|?*\u0000-\u001f]/); expect(filename.length).toBeLessThan(140);
    const blob = await createReportBlob(report, 'json'); expect(blob.type).toContain('application/json');
    const body = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); });
    expect(reportSchema.parse(JSON.parse(body))).toEqual(report);
    await expect(createReportBlob({ ...report, runs: [] }, 'json')).rejects.toThrow();
  });
  it('builds repeated PDF table headings and splits a wide weekly matrix', () => {
    const input = source('weekly'); const template = input.runs[0]; input.runs = Array.from({ length: 12 }, (_, index) => ({ ...structuredClone(template), id: `run-${String(index).padStart(2, '0')}`, name: `<script>${index}</script> https://example.com/${'д'.repeat(100)}` }));
    const report = buildReport(input, '2026-10-16', false)!;
    const definition = buildPdfDefinition(report);
    const serialized = JSON.stringify(definition);
    expect(definition.pageSize).toBe('A4'); expect(definition.defaultStyle?.font).toBe('Roboto'); expect(typeof definition.footer).toBe('function');
    expect(serialized.match(/Матрица недели/g)).toHaveLength(3);
    expect(serialized).toContain('headerRows'); expect(serialized).not.toMatch(/"(image|link|attachments|url)":/);
    expect(serialized).not.toMatch(/"notes"|"failNotes"/);
    expect(definition.defaultStyle?.wordBreak).toBe('break-all');
  });
});
describe('report guard', () => {
  it('save-and-continue reads the just-saved metadata before the next React render', async () => {
    const { result } = renderHook(() => usePreviewWorkspace());
    act(() => result.current.runs.updateMetadata('summary', 'FRESH saved summary'));
    act(() => result.current.openReport('run')); expect(result.current.reportSource).toBeNull(); expect(result.current.navigation.open).toBe(true);
    await act(async () => { await result.current.navigation.saveAndContinue(); });
    expect(result.current.reportSource?.runs.find((run) => run.id === 'run-42')?.summary).toBe('FRESH saved summary');
    expect(result.current.runs.metadataDirty).toBe(false);
  });
  it('cancel keeps the draft; discard reports saved data; active table filters do not narrow report', () => {
    const { result } = renderHook(() => usePreviewWorkspace());
    const saved = result.current.runs.run.summary;
    act(() => { result.current.runs.updateMetadata('summary', 'DRAFT'); result.current.runs.setResultFilter('fail'); });
    act(() => result.current.openReport('run')); act(() => result.current.navigation.cancel()); expect(result.current.reportSource).toBeNull(); expect(result.current.runs.metadataDirty).toBe(true);
    act(() => result.current.openReport('run')); act(() => result.current.navigation.discardAndContinue());
    expect(result.current.reportSource?.runs[0].summary).toBe(saved);
    const report = buildReport(result.current.reportSource!, '2026-10-16', false)!; expect(report.summary.total).toBe(5);
  });
  it('failed save retains dirty metadata and does not open report', async () => {
    const { result } = renderHook(() => usePreviewWorkspace()); act(() => result.current.chooseState('runSaveFailed'));
    act(() => result.current.runs.updateMetadata('summary', 'DRAFT')); act(() => result.current.openReport('weekly'));
    await act(async () => { await result.current.navigation.saveAndContinue(); });
    expect(result.current.reportSource).toBeNull(); expect(result.current.navigation.error).toBeTruthy(); expect(result.current.runs.metadataDirty).toBe(true);
  });
  it('protects unsaved guide results and includes freshly saved verdicts', async () => {
    const { result } = renderHook(() => usePreviewWorkspace()); act(() => result.current.runs.startGuide(2));
    act(() => result.current.runs.setDraft({ ...result.current.runs.draft, result: 'blocked', notes: 'Saved guide note' }));
    act(() => result.current.openReport('run')); expect(result.current.navigation.open).toBe(true);
    await act(async () => { await result.current.navigation.saveAndContinue(); });
    expect(result.current.reportSource?.runs[0].results[2].result).toBe('blocked');
  });
  it('keeps report snapshots fixed after subsequent saved edits and allows readonly reports', async () => {
    const { result } = renderHook(() => usePreviewWorkspace());
    act(() => result.current.chooseState('readonly')); act(() => result.current.openReport('run')); expect(result.current.reportSource).toBeTruthy();
    const frozen = result.current.reportSource; act(() => result.current.closeReport()); act(() => result.current.chooseState('normal'));
    act(() => result.current.runs.updateMetadata('summary', 'Later')); await act(async () => { await result.current.runs.saveMetadata(); });
    expect(frozen?.runs[0].summary).not.toBe('Later');
  });
});
describe('report preview lifecycle', () => {
  it('blocks empty and invalid weeks and supports notes projection in the displayed model', () => {
    render(<ReportPreview source={source('weekly')} onClose={() => undefined} />);
    const date = screen.getByLabelText('Дата в выбранной неделе');
    fireEvent.change(date, { target: { value: '2027-01-01' } });
    expect(screen.getByText(/В этой неделе нет/)).toBeTruthy(); expect(screen.getByRole('button', { name: 'Экспорт PDF' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(date, { target: { value: '' } }); expect(screen.getByRole('alert').textContent).toContain('корректную дату');
    fireEvent.change(date, { target: { value: '2026-10-16' } });
    expect(screen.queryByText(/Стенд: staging/)).toBeNull(); fireEvent.click(screen.getByRole('checkbox')); expect(screen.getAllByText(/Стенд: staging/).length).toBeGreaterThan(0);
  });
  it('suppresses double-click exports and exposes a retry after a browser error', async () => {
    const { result } = renderHook(() => useReportPreview({ source: source() }));
    const create = vi.fn<() => string>(() => { throw new Error('download unavailable'); }); Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    await act(async () => { await Promise.all([result.current.exportFile('json'), result.current.exportFile('json')]); });
    expect(create).toHaveBeenCalledTimes(1); expect(result.current.status).toBe('failed'); expect(result.current.busy).toBe(false);
    create.mockImplementation(() => 'blob:test'); Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() }); vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await act(async () => { await result.current.exportFile('json'); }); expect(result.current.status).toBe('handed');
  });
  it('defers object URL revocation and removes its temporary anchor', () => {
    vi.useFakeTimers(); const revoke = vi.fn(); Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test') }); Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke }); const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    downloadReportBlob(new Blob(['{}']), 'report.json'); expect(click).toHaveBeenCalledOnce(); expect(document.querySelector('a[download]')).toBeNull(); expect(revoke).not.toHaveBeenCalled(); vi.advanceTimersByTime(60_000); expect(revoke).toHaveBeenCalledWith('blob:test');
  });
});

describe('report colored distributions', () => {
  it('uses UI Kit colors in both HTML and PDF and preserves six explicit counts', () => {
    const tokens = readFileSync('../../ui/theme/tokens.css', 'utf8');
    const report = buildReport(source(), '2026-10-16', false)!;
    report.summary = summarize(['pass', 'fail', 'blocked', 'in_progress', 'skipped', 'not_run']);
    render(<ReportDistribution summary={report.summary} label="Все результаты" />);
    const group = screen.getByRole('group', { name: 'Распределение результатов: Все результаты' });
    const pdf = JSON.stringify(buildPdfDefinition(report));
    for (const state of distributionOrder) {
      const color = reportResultColors[state];
      expect(tokens).toContain(`${color.token}: ${color.pdf};`);
      expect(group.querySelector(`[data-result="${state}"]`)?.getAttribute('style')).toContain(`var(${color.token})`);
      expect(pdf).toContain(`"color":"${color.pdf}"`);
    }
    expect(group.querySelectorAll('dd')).toHaveLength(6);
    expect([...group.querySelectorAll('dd')].map((cell) => cell.textContent)).toEqual(['1', '1', '1', '1', '1', '1']);
  });
  it('does not divide zero totals or hide the zero-state legend', () => {
    const summary = summarize([]);
    expect(distributionSegments(summary)).toEqual([]);
    render(<ReportDistribution summary={summary} label="Пустой" />);
    expect(screen.getByText('Нет результатов · 0 кейсов')).toBeTruthy();
    expect(document.querySelectorAll('dd')).toHaveLength(6);
    const report = buildReport(source(), '2026-10-16', false)!; report.summary = summary;
    const pdf = JSON.stringify(buildPdfDefinition(report));
    expect(pdf).toContain('Нет результатов · 0 кейсов');
    expect(pdf).not.toMatch(/NaN|Infinity/);
  });
  it('keeps tiny segments proportional with numbers outside the bar', () => {
    const summary = summarize(['fail']); summary.counts.pass = 9999; summary.total = 10000;
    const segments = distributionSegments(summary);
    expect(segments.map((segment) => segment.fraction)).toEqual([0.9999, 0.0001]);
    expect(segments[1].offset).toBe(0.9999);
    render(<ReportDistribution summary={summary} label="Малый сегмент" />);
    expect(document.querySelector('[data-result="fail"]')?.textContent).toBe('');
    expect(screen.getByText('9999')).toBeTruthy();
  });
  it('keeps PDF vectors within A4 margins and uses the same segment proportions', () => {
    const summary = summarize(['pass', 'pass', 'fail']);
    const node = pdfDistribution(summary);
    expect(node).toHaveProperty('unbreakable', true);
    if (typeof node !== 'object' || !('stack' in node) || !node.stack) throw new Error('Expected distribution stack');
    const canvasNode = node.stack[0];
    if (typeof canvasNode !== 'object' || !('canvas' in canvasNode) || !canvasNode.canvas) throw new Error('Expected vector canvas');
    const rectangles = canvasNode.canvas;
    expect(rectangles).toHaveLength(3);
    expect(rectangles[1]).toMatchObject({ type: 'rect', x: 0, y: 0, w: expect.closeTo(523.28 * 2 / 3, 8), color: reportResultColors.pass.pdf });
    expect(rectangles[2]).toMatchObject({ type: 'rect', x: expect.closeTo(523.28 * 2 / 3, 8), y: 0, w: expect.closeTo(523.28 / 3, 8), color: reportResultColors.fail.pdf });
    expect(JSON.stringify(node)).toContain('Пройден: 2');
    const report = buildReport(source('weekly'), '2026-10-16', false)!;
    const before = structuredClone(report);
    const definition = JSON.parse(JSON.stringify(buildPdfDefinition(report))) as { content: { stack?: unknown[] }[] };
    expect(definition.content.filter((item) => item.stack)).toHaveLength(1 + report.suites.length + report.runs.length);
    expect(report).toEqual(before);
  });
  it('renders suite and per-run distributions for a weekly report', () => {
    const report = buildReport(source('weekly'), '2026-10-16', false)!;
    render(<ReportPreview source={source('weekly')} onClose={() => undefined} />);
    expect(screen.getAllByRole('group', { name: /^Распределение результатов:/ })).toHaveLength(1 + report.suites.length + report.runs.length);
  });
});
