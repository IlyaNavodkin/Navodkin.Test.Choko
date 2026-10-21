import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './app-store';
import { cases, runs, trees } from '@/data/sample';

const store = () => useAppStore.getState();
beforeEach(() => {
  useAppStore.setState({ screen: 'launcher', repoPath: '', modal: null, dialog: null, refPicker: null,
    refDirty: false, refPendingLeave: null, loading: false });
  useAppStore.setState({ screen: 'main', cases: structuredClone(cases), runs: structuredClone(runs),
    tree: structuredClone(Object.values(trees).flat()), view: 'editor', sel: { kind: 'case', id: cases[0].id } });
});

describe('navigation history', () => {
  it('restores calendar year/day and run filters without changing run results', () => {
    store().openRunsList();
    useAppStore.setState((s) => ({ sel: { ...s.sel, activityYear: 2025, activityDate: '2025-06-10' } }));
    store().openRun(runs[0].id, { date: '2025-06-10', result: 'fail' });
    store().openRun(runs[0].id);
    expect(store().sel.runFilter).toBeUndefined();
    store().navigateBack();
    expect(store().sel.runFilter).toEqual({ date: '2025-06-10', result: 'fail' });
    store().navigateBack();
    expect(store().view).toBe('runs');
    expect(store().sel).toMatchObject({ activityYear: 2025, activityDate: '2025-06-10' });
    expect(store().runs).toEqual(runs);
  });
  it('restores locations and drops forward history after a new destination', () => {
    store().openRunsList();
    store().openRun(runs[0].id);
    store().navigateBack();
    expect(store().view).toBe('runs');
    expect(store().canNavigateForward).toBe(true);
    store().navigateBack();
    expect(store().sel.id).toBe(cases[0].id);
    expect(store().canNavigateBack).toBe(false);
    store().navigateForward();
    expect(store().view).toBe('runs');
    store().openCase(cases[1].id);
    expect(store().canNavigateForward).toBe(false);
    store().navigateBack();
    expect(store().view).toBe('runs');
  });

  it('ignores content changes and repeated opens, and skips deleted destinations', () => {
    store().openRunsList();
    store().openRunsList();
    store().openCase(cases[1].id);
    store().openRun(runs[0].id);
    useAppStore.setState({ cases: [cases[0]], branch: 'changed' });
    store().navigateBack();
    expect(store().view).toBe('runs');
    store().navigateBack();
    expect(store().sel.id).toBe(cases[0].id);
    expect(store().canNavigateBack).toBe(false);
  });

  it('keeps position until the dirty reference draft is resolved', async () => {
    store().openRunsList();
    useAppStore.setState({ view: 'glossary', refDirty: true });
    store().navigateBack();
    expect(store().view).toBe('glossary');
    expect(store().refPendingLeave).not.toBeNull();
    await store().resolveRefLeave('stay');
    expect(store().view).toBe('glossary');
    store().navigateBack();
    await store().resolveRefLeave('discard');
    expect(store().view).toBe('runs');
    expect(store().canNavigateForward).toBe(true);
  });

  it('restores the selected run test and resets on repository changes', () => {
    store().openRunAutomation(runs[0].id);
    useAppStore.setState((s) => ({ sel: { ...s.sel, automationKey: 'first-test' } }));
    useAppStore.setState((s) => ({ sel: { ...s.sel, automationKey: 'second-test' } }));
    store().navigateBack();
    expect(store().sel.automationKey).toBe('first-test');
    store().navigateForward();
    expect(store().sel.automationKey).toBe('second-test');
    useAppStore.setState({ repoPath: 'another-repository' });
    expect(store().canNavigateBack).toBe(false);
    expect(store().canNavigateForward).toBe(false);
  });
});
