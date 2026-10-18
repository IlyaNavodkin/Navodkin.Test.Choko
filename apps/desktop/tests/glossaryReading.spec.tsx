import { useRef, useState } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import { SectionMarkdownEditor } from '../src/ux-preview/components/markdown-editor/SectionMarkdownEditor';
import { SourceReferenceButton } from '../src/ux-preview/components/markdown-editor/SourceReferenceButton';
import { SafeMarkdown } from '../src/ux-preview/components/markdown-editor/SafeMarkdown';
import { inspectMarkdown, isGlossaryReferenceHref, isSafeLink } from '../src/ux-preview/components/markdown-editor/markdownCodec';
import { CaseReading, glossaryHref, resolveGlossaryReference } from '../src/ux-preview/useCases/explore-design/CaseReading';
import { CaseDocument } from '../src/ux-preview/useCases/explore-design/CaseDocument';
import { ExploreDesignPage } from '../src/ux-preview/useCases/explore-design/ExploreDesignPage';
import { usePreviewCaseEditor } from '../src/ux-preview/useCases/explore-design/usePreviewCaseEditor';
import { usePreviewWorkspace } from '../src/ux-preview/useCases/explore-design/usePreviewWorkspace';
import { glossaryFixtures } from '../src/ux-preview/useCases/manage-glossary/fixtures';
const entries = glossaryFixtures(0);
const href = glossaryHref('cases/pay/PAY-042.md', entries[1].id);
const options = entries.filter((entry) => !entry.archived).map((entry) => ({ ...entry, href: glossaryHref('cases/pay/PAY-042.md', entry.id) }));
const originalRangeRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
beforeEach(() => { vi.spyOn(window, 'scrollBy').mockImplementation(() => {}); Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [new DOMRect(0, 0, 100, 24)] }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); if (originalRangeRects) Object.defineProperty(Range.prototype, 'getClientRects', originalRangeRects); else Reflect.deleteProperty(Range.prototype, 'getClientRects'); });
function choose() { fireEvent.click(screen.getByRole('button', { name: /СБП.*Сокращение|СБП.*abbreviation/ })); }
describe('glossary reading and insertion', () => {
  it('reads by default, toggles without edits, retains draft and guards card navigation', async () => {
    render(<ExploreDesignPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Открыть демо-репозиторий' }));
    expect(screen.queryByRole('textbox', { name: 'Название' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    fireEvent.click(screen.getByRole('button', { name: 'Чтение' }));
    expect((screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), { target: { value: 'Draft title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Чтение' }));
    expect(screen.getByRole('heading', { name: 'Draft title' })).toBeTruthy();
    const link = screen.getByRole('button', { name: 'СБП' }); link.focus(); fireEvent.click(link);
    expect(screen.getByText('Оплата по QR-коду через приложение банка.')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Закрыть' }).at(-1)!);
    await waitFor(() => expect(document.activeElement).toBe(link));
    fireEvent.click(link); fireEvent.click(screen.getByRole('button', { name: 'Открыть в справочнике' }));
    expect(screen.queryByText('Оплата по QR-коду через приложение банка.')).toBeNull();
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить работу' }));
    expect(screen.getByRole('heading', { name: 'Draft title' })).toBeTruthy();
    fireEvent.click(link); fireEvent.click(screen.getByRole('button', { name: 'Открыть в справочнике' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отказаться от изменений' }));
    expect(screen.getByRole('heading', { name: 'СБП' })).toBeTruthy();
  });
  it('resolves only the expected path and current repository, and diagnoses archived/missing entries', () => {
    expect(resolveGlossaryReference(href, 'cases/pay/PAY-042.md', entries)?.id).toBe(entries[1].id);
    expect(resolveGlossaryReference(href, 'cases/nested/pay/PAY-042.md', entries)).toBeUndefined();
    expect(resolveGlossaryReference(href, 'cases/pay/PAY-042.md', glossaryFixtures(1))).toBeUndefined();
    function Workspace({ missing = false }: { missing?: boolean }) { const model = usePreviewCaseEditor(); return <CaseReading model={model} entries={missing ? glossaryFixtures(1) : entries.map((entry) => ({ ...entry, archived: true }))} onOpenEntry={vi.fn()} />; }
    const { rerender } = render(<Workspace />);
    fireEvent.click(screen.getByRole('button', { name: 'СБП' }));
    expect(screen.getByText(/Архивная запись/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Закрыть' }).at(-1)!);
    rerender(<Workspace missing />); fireEvent.click(screen.getByRole('button', { name: 'СБП' }));
    expect(screen.getByRole('heading', { name: 'Запись не найдена' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Открыть в справочнике' })).toBeNull();
  });
  it('renders GFM references within formatting, lists and tables without interpreting code, HTML or unsafe paths', () => {
    const open = vi.fn();
    const { container } = render(<SafeMarkdown source={`**[A](${href})**\n\n- [B](${href})\n\n| Ref |\n| --- |\n| [C](${href}) |\n\n\`[code](${href})\`\n\n~~~md\n[fenced](${href})\n~~~\n\n<script>alert(1)</script>\n\n![image](https://evil/x.png)\n\n[bad](javascript:alert(1))`} onReference={open} />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'C' })); expect(open).toHaveBeenCalledWith(href);
    expect(container.querySelectorAll('script,img,iframe,a')).toHaveLength(0);
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.textContent).toContain('![image](https://evil/x.png)');
    for (const bad of ['../secrets.md', 'file:///secret', href.replace('../', '%2e%2e/'), href + '?x=1', href.replace('/', '\\'), 'javascript:alert(1)']) expect(isGlossaryReferenceHref(bad)).toBe(false);
    expect(isGlossaryReferenceHref(href)).toBe(true); expect(isSafeLink(href)).toBe(false); expect(inspectMarkdown(`[СБП](${href})`).supported).toBe(true);
  });
  it('inserts a rich selection as label with an independent undo transaction and no cancel edit', async () => {
    const onChange = vi.fn(); render(<SectionMarkdownEditor label="Text" value="before selected after" onChange={onChange} references={options} />);
    const editor = (screen.getByRole('textbox', { name: 'Text' }) as HTMLElement & { editor: Editor }).editor;
    act(() => { editor.commands.insertContentAt(1, 'X'); editor.commands.setTextSelection({ from: 9, to: 17 }); });
    const before = editor.getMarkdown(); const calls = onChange.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Из справочника' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' })); expect(onChange.mock.calls).toHaveLength(calls);
    fireEvent.click(screen.getByRole('button', { name: 'Из справочника' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Поиск в справочнике' }), { target: { value: 'Система быстрых' } }); choose();
    expect(editor.getMarkdown()).toContain(`[selected](${href})`);
    act(() => { editor.commands.undo(); }); expect(editor.getMarkdown()).toBe(before);
    expect(editor.can().undo()).toBe(true);
    act(() => { editor.commands.undo(); }); expect(editor.getText()).toBe('before selected after');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('retains the same rich editor and its history across read/edit toggles', () => {
    function Workspace() { const model = usePreviewCaseEditor(); return <CaseReading model={model} entries={entries} onOpenEntry={vi.fn()} />; }
    render(<Workspace />); fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    const textbox = screen.getByRole('textbox', { name: 'Цель' }) as HTMLElement & { editor: Editor };
    const editor = textbox.editor; const original = editor.getMarkdown();
    act(() => { editor.commands.insertContentAt(1, 'Draft '); });
    fireEvent.click(screen.getByRole('button', { name: 'Чтение' }));
    expect(screen.queryByRole('textbox', { name: 'Цель' })).toBeNull();
    expect(within(screen.getByRole('article')).getByText(/Draft Проверить/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    expect(screen.getByRole('textbox', { name: 'Цель' })).toBe(textbox);
    act(() => { editor.commands.undo(); }); expect(editor.getMarkdown()).toBe(original);
  });
  it('does not offer archived catalog entries in any new rich insertion', () => {
    function Workspace() { const model = usePreviewCaseEditor(); return <CaseReading model={model} entries={entries.map((entry) => ({ ...entry, archived: true }))} onOpenEntry={vi.fn()} />; }
    render(<Workspace />); fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Из справочника' })[0]);
    expect(screen.getByText('Нет активных записей')).toBeTruthy();
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /СБП/ })).toBeNull();
  });
  it('patches the selected CRLF source slice, restores caret and undo, and clears insertion history on replacement', async () => {
    const original = 'one\r\n**two**\r\nthree\r\n'; const change = vi.fn();
    function Source() { const [value, setValue] = useState(original); const target = useRef<HTMLTextAreaElement>(null); return <><textarea ref={target} aria-label="Source" value={value} onChange={(event) => setValue(event.target.value)} /><SourceReferenceButton target={target} value={value} options={options} disabled={false} onChange={(next) => { change(next); setValue(next); }} /><button onClick={() => setValue('external replacement')}>Replace</button></>; }
    render(<Source />); const source = screen.getByRole('textbox', { name: 'Source' }) as HTMLTextAreaElement;
    source.focus(); source.setSelectionRange(6, 9); fireEvent.click(screen.getByRole('button', { name: 'Из справочника' })); choose();
    const inserted = `one\r\n**[two](${href})**\r\nthree\r\n`;
    expect(change).toHaveBeenLastCalledWith(inserted);
    await waitFor(() => expect(document.activeElement).toBe(source));
    expect(source.selectionStart).toBe(6 + `[two](${href})`.length);
    fireEvent.keyDown(source, { key: 'z', ctrlKey: true }); expect(change).toHaveBeenLastCalledWith(original);
    fireEvent.keyDown(source, { key: 'z', ctrlKey: true, shiftKey: true }); expect(change).toHaveBeenLastCalledWith(inserted);
    fireEvent.click(screen.getByRole('button', { name: 'Replace' })); const count = change.mock.calls.length;
    fireEvent.keyDown(source, { key: 'z', ctrlKey: true }); expect(change.mock.calls).toHaveLength(count);
  });
  it('inserts a link at the compact step caret and excludes archived options', async () => {
    function Steps() { const model = usePreviewCaseEditor(); return <CaseDocument model={model} references={options.filter((entry) => entry.id !== entries[0].id)} />; }
    render(<Steps />); const step = screen.getByRole('textbox', { name: 'Шаг 1' }) as HTMLTextAreaElement;
    step.focus(); step.setSelectionRange(7, 7);
    fireEvent.click(within(step.closest('[class*="step_"]')!).getByRole('button', { name: 'Из справочника' }));
    expect(screen.queryByRole('button', { name: /SLA.*term/ })).toBeNull(); choose();
    expect(step.value).toBe(`Открыть[СБП](${href}) оформление заказа`);
    await waitFor(() => expect(document.activeElement).toBe(step));
    fireEvent.keyDown(step, { key: 'z', ctrlKey: true }); expect(step.value).toBe('Открыть оформление заказа');
  });
  it('places the source caret after a selection crossing multiple CRLF boundaries', async () => {
    const change = vi.fn(); const original = 'aa\r\nbb\r\ncc';
    function Source() { const [value, setValue] = useState(original); const target = useRef<HTMLTextAreaElement>(null); return <><textarea aria-label="Source" ref={target} value={value} readOnly /><SourceReferenceButton target={target} options={options} value={value} disabled={false} onChange={(next) => { change(next); setValue(next); }} /></>; }
    render(<Source />); const source = screen.getByRole('textbox', { name: 'Source' }) as HTMLTextAreaElement;
    source.focus(); source.setSelectionRange(2, 6);
    fireEvent.click(screen.getByRole('button', { name: 'Из справочника' })); choose();
    const insertion = `[\r\nbb\r\n](${href})`;
    expect(change).toHaveBeenLastCalledWith(`aa${insertion}cc`);
    await waitFor(() => expect(source.selectionStart).toBe(2 + insertion.replace(/\r\n/g, '\n').length));
    fireEvent.keyDown(source, { key: 'z', ctrlKey: true });
    expect(change).toHaveBeenLastCalledWith(original);
    fireEvent.keyDown(source, { key: 'z', ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(source.selectionStart).toBe(2 + insertion.replace(/\r\n/g, '\n').length));
  });
  it('blocks edit in readonly and keeps glossary card navigation in the common guard', () => {
    const { result } = renderHook(() => usePreviewWorkspace());
    act(() => { result.current.chromeModel.openRepository(0); result.current.cases.update('title', 'draft'); });
    act(() => result.current.openGlossaryEntry(entries[1].id));
    expect(result.current.navigation.open).toBe(true); expect(result.current.model.section).toBe('cases');
    act(() => result.current.navigation.cancel()); expect(result.current.cases.values.title).toBe('draft');
    cleanup();
    function Readonly() { const model = usePreviewCaseEditor({ blocked: true }); return <CaseReading model={model} entries={entries} onOpenEntry={vi.fn()} />; }
    render(<Readonly />); expect((screen.getByRole('button', { name: 'Редактировать' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
