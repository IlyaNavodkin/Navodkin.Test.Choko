import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { createMarkdownExtensions, inspectMarkdown, isSafeLink } from '../src/ux-preview/components/markdown-editor/markdownCodec';
import { SectionMarkdownEditor } from '../src/ux-preview/components/markdown-editor/SectionMarkdownEditor';
import { useSectionMarkdownEditor } from '../src/ux-preview/components/markdown-editor/useSectionMarkdownEditor';
import { usePreviewCaseEditor } from '../src/ux-preview/useCases/explore-design/usePreviewCaseEditor';
import { CaseDocument } from '../src/ux-preview/useCases/explore-design/CaseDocument';
import { usePreviewChangeTracking } from '../src/ux-preview/useCases/explore-design/usePreviewChangeTracking';
import { demoCases } from '../src/ux-preview/useCases/explore-design/fixtures';
import { positionEditorOverlay } from '../src/ux-preview/components/markdown-editor/overlayPosition';

const originalRangeRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
afterEach(() => { cleanup(); vi.unstubAllGlobals(); if (originalRangeRects) Object.defineProperty(Range.prototype, 'getClientRects', originalRangeRects); else Reflect.deleteProperty(Range.prototype, 'getClientRects'); });
describe('editor floating UI collisions', () => {
  const bounds = { left: 260, top: 100, right: 760, bottom: 900 };
  it('flips a slash menu above a caret near the bottom and clamps horizontally', () => {
    const result = positionEditorOverlay({ anchor: { left: 720, right: 720, top: 798, bottom: 822 }, width: 280, height: 262, bounds, preferred: 'bottom' });
    expect(result.top).toBeLessThan(798); expect(result.top + 262).toBeLessThanOrEqual(892);
    expect(result.left + 280).toBeLessThanOrEqual(752);
  });
  it('limits a tall popup to available height and keeps it inside the visible area', () => {
    const result = positionEditorOverlay({ anchor: { left: 300, right: 340, top: 400, bottom: 420 }, width: 280, height: 1000, bounds, preferred: 'top' });
    expect(result.maxHeight).toBeLessThan(1000); expect(result.top).toBeGreaterThanOrEqual(108);
    expect(result.top + result.maxHeight).toBeLessThanOrEqual(892);
  });
});
describe('section Markdown preservation policy', () => {
  it.each(['<script>alert(1)</script>', '![image](https://host/image.png)', 'Текст[^1]\n\n[^1]: заметка', ':::note\nРасширение\n:::', '[x](javascript:alert(1))', '[ref]: https://example.com\n\n[ссылка][ref]', '[ref]: https://example.com', '| A |\n| :--- |\n| x |', '$math$'])('keeps unsupported source available: %s', (source) => {
    expect(inspectMarkdown(source).supported).toBe(false);
  });
  it.each(['https://example.com/a', 'http://localhost:8080', 'mailto:qa@example.com'])('accepts explicit safe protocol %s', (url) => expect(isSafeLink(url)).toBe(true));
  it.each(['javascript:alert(1)', 'data:text/html,test', '//host', '/relative', 'https:\\evil', 'https://host/\nfoo'])('rejects ambiguous or unsafe links %s', (url) => expect(isSafeLink(url)).toBe(false));
  it.each([
    '# Кириллица\r\n\r\n**Жирный** и *курсив* ~~нет~~ `a_b`',
    '- Один\n  - Вложенный\n- Два\n\n1. Первый\n2. Второй',
    '- [ ] Проверить\n- [x] Готово',
    '```ts\nconst html = "<img src=x>";\n```',
    '| A | Б |\n| --- | --- |\n| x | y |',
    '[Тест](https://example.com/a?q=1&b=2) и \\*текст\\*',
  ])('preserves supported document structure after serialization: %s', (source) => {
    expect(inspectMarkdown(source).supported).toBe(true);
    const editor = new Editor({ extensions: createMarkdownExtensions(), content: source, contentType: 'markdown' });
    const parsed = editor.getJSON();
    editor.commands.setContent(editor.getMarkdown(), { contentType: 'markdown', emitUpdate: false });
    expect(editor.getJSON()).toEqual(parsed);
    editor.destroy();
  });
});
describe('section Markdown editor contract', () => {
  it('does not emit on mount, focus, mode changes or expansion; source keeps exact CRLF', async () => {
    const source = '  **Привет**\r\n\r\nМир\r\n'; const onChange = vi.fn();
    render(<SectionMarkdownEditor value={source} onChange={onChange} label="Цель" />);
    fireEvent.focus(screen.getByRole('textbox', { name: 'Цель' }));
    fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));
    expect((screen.getByRole('textbox', { name: 'Цель' }) as HTMLTextAreaElement).value).toBe(source.replaceAll('\r\n', '\n'));
    fireEvent.click(screen.getByRole('button', { name: 'Визуально' }));
    fireEvent.click(screen.getByRole('button', { name: 'Развернуть: Цель' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Свернуть' }));
    expect(onChange).not.toHaveBeenCalled();
  });
  it('keeps one formatting panel mounted across focus and mode switches', () => {
    const onChange = vi.fn(); render(<SectionMarkdownEditor value="Привет" onChange={onChange} label="Цель" />);
    const toolbar = screen.getByRole('toolbar', { name: 'Форматирование' });
    fireEvent.focus(screen.getByRole('textbox', { name: 'Цель' }));
    expect(screen.getByRole('toolbar')).toBe(toolbar);
    expect(document.querySelector('[data-overlay="bubble"]')).toBeNull();
    expect(screen.queryByText('Введите / для вставки блока')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));
    expect(screen.getByRole('toolbar')).toBe(toolbar);
    expect((within(toolbar).getByRole('button', { name: 'Жирный' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Визуально' }));
    expect((within(toolbar).getByRole('button', { name: 'Жирный' }) as HTMLButtonElement).disabled).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });
  it('rejects unsafe link input without editing the document', () => {
    const onChange = vi.fn(); render(<SectionMarkdownEditor value="Привет" onChange={onChange} label="Цель" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ссылка' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Адрес ссылки' }), { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
    expect(screen.getByRole('alert').textContent).toContain('https://');
    expect(onChange).not.toHaveBeenCalled();
    expect(document.querySelector('a')).toBeNull();
  });
  it('shows unsupported content only as text, without active HTML or media', () => {
    const onChange = vi.fn(); const source = '<img src="https://host/x">';
    const { container } = render(<SectionMarkdownEditor value={source} onChange={onChange} label="Цель" />);
    expect((screen.getByRole('textbox', { name: 'Цель' }) as HTMLTextAreaElement).value).toBe(source);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/Исходник сохранён/)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });
  it('reacts to external values and blocks both visual and source editing when disabled', async () => {
    const onChange = vi.fn(); const { rerender } = render(<SectionMarkdownEditor value="Первый" onChange={onChange} label="Цель" />);
    rerender(<SectionMarkdownEditor value="Второй" onChange={onChange} label="Цель" disabled />);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Цель' }).textContent).toBe('Второй'));
    expect(screen.getByRole('textbox', { name: 'Цель' }).getAttribute('contenteditable')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));
    const input = screen.getByRole('textbox', { name: 'Цель' });
    expect((input as HTMLTextAreaElement).readOnly).toBe(true);
    fireEvent.change(input, { target: { value: 'Нельзя' } });
    expect(onChange).not.toHaveBeenCalled();
  });
  it('source edits emit only intentional changed values', () => {
    const onChange = vi.fn(); render(<SectionMarkdownEditor value="Первый" onChange={onChange} label="Цель" />);
    fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));
    act(() => fireEvent.change(screen.getByRole('textbox', { name: 'Цель' }), { target: { value: '**Второй**' } }));
    expect(onChange).toHaveBeenCalledOnce(); expect(onChange).toHaveBeenCalledWith('**Второй**');
  });
  it('stays in source mode when the user removes unsupported syntax', () => {
    render(<SectionMarkdownEditor value="<b>Текст</b>" onChange={vi.fn()} label="Цель" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Цель' }), { target: { value: 'Текст' } });
    expect(screen.getByRole('textbox', { name: 'Цель' }).tagName).toBe('TEXTAREA');
    expect(screen.getByRole('button', { name: 'Markdown' }).getAttribute('aria-pressed')).toBe('true');
  });
  it('never emits or loses original bytes when mounting tables or code blocks', async () => {
    const onChange = vi.fn();
    render(<SectionMarkdownEditor value={'```js\r\nfoo()\r\n```\r\n\r\n| A |\r\n| --- |\r\n| x |\r\n'} onChange={onChange} label="Цель" />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(onChange).not.toHaveBeenCalled();
  });
  it('maintains one editor and undo history through expand/collapse', async () => {
    const onChange = vi.fn(); const { container } = render(<SectionMarkdownEditor value="Привет" onChange={onChange} label="Цель" />);
    const before = screen.getByRole('textbox', { name: 'Цель' });
    fireEvent.focus(before);
    fireEvent.click(screen.getByRole('button', { name: 'Развернуть: Цель' }));
    expect(document.querySelectorAll('.tiptap')).toHaveLength(1);
    // EditorContent reattaches the same ProseMirror view, preserving its state.
    expect(screen.getByRole('textbox', { name: 'Цель' })).toBe(before);
    fireEvent.click(screen.getByRole('button', { name: 'Свернуть' }));
    expect(container.querySelector('.tiptap')).toBe(before);
    expect(onChange).not.toHaveBeenCalled();
  });
  it('consumes native slash Escape before the expanded Modal; the next Escape closes the Modal', async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [new DOMRect(0, 0, 100, 24)] });
    render(<SectionMarkdownEditor value="" onChange={vi.fn()} label="Цель" />);
    fireEvent.click(screen.getByRole('button', { name: 'Развернуть: Цель' }));
    const textbox = screen.getByRole('textbox', { name: 'Цель' });
    fireEvent.paste(textbox, { clipboardData: { getData: () => '/' } });
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
    textbox.focus();
    const nativeBubbled = vi.fn(); const parent = textbox.parentElement!;
    parent.addEventListener('keydown', nativeBubbled);
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => { textbox.dispatchEvent(escape); });
    parent.removeEventListener('keydown', nativeBubbled);
    expect(escape.defaultPrevented).toBe(true);
    expect(nativeBubbled).not.toHaveBeenCalled();
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(screen.getByRole('dialog')).toBeTruthy(); expect(document.activeElement).toBe(textbox);
    fireEvent.keyDown(textbox, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('clears history on parent replacement/discard and keeps independent section histories', () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook(({ value, disabled }) => useSectionMarkdownEditor({ value, disabled, onChange, label: 'Цель' }), { initialProps: { value: 'Первый', disabled: false } });
    act(() => { result.current.editor!.commands.insertContentAt(1, 'Новый '); });
    expect(onChange).toHaveBeenCalled(); expect(result.current.editor!.can().undo()).toBe(true);
    rerender({ value: 'Другой кейс', disabled: false });
    expect(result.current.editor!.getText()).toBe('Другой кейс'); expect(result.current.editor!.can().undo()).toBe(false);
    act(() => { result.current.editor!.commands.insertContentAt(1, 'Ещё '); });
    rerender({ value: 'Другой кейс', disabled: true });
    expect(result.current.editor!.getText()).toBe('Ещё Другой кейс');
    onChange.mockClear();
    act(() => { result.current.editor!.commands.insertContentAt(1, 'Нельзя '); result.current.editor!.commands.undo(); });
    expect(result.current.editor!.getText()).toBe('Ещё Другой кейс'); expect(onChange).not.toHaveBeenCalled();
    rerender({ value: 'Первый', disabled: false });
    expect(result.current.editor!.getText()).toBe('Первый'); expect(result.current.editor!.can().undo()).toBe(false);
  });
  it('serializes visual formatting and undo/redo only for real document edits', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useSectionMarkdownEditor({ value: 'Привет', onChange, label: 'Цель' }));
    act(() => { result.current.editor!.chain().setTextSelection({ from: 1, to: 7 }).toggleBold().run(); });
    expect(onChange).toHaveBeenLastCalledWith('**Привет**');
    act(() => { result.current.editor!.commands.undo(); });
    expect(onChange).toHaveBeenLastCalledWith('Привет');
    act(() => { result.current.editor!.commands.redo(); });
    expect(onChange).toHaveBeenLastCalledWith('**Привет**');
  });
  it('groups block actions in a menu and returns focus to the same editor after a command', async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [new DOMRect(0, 0, 100, 24)] });
    const onChange = vi.fn(); render(<SectionMarkdownEditor value="Привет" onChange={onChange} label="Цель" />);
    const textbox = screen.getByRole('textbox', { name: 'Цель' });
    fireEvent.focus(textbox);
    expect(screen.queryByRole('button', { name: 'Заголовок' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Вставить' }));
    expect(screen.getAllByRole('menuitem')).toHaveLength(7);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Заголовок' }));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith('## Привет');
    await waitFor(() => expect(document.activeElement).toBe(textbox));
  });
  it('keeps compact Markdown rows and their DOM identity through reorder and removal', () => {
    function Document() { const model = usePreviewCaseEditor(); return <CaseDocument model={model} />; }
    render(<Document />);
    const first = screen.getByRole('textbox', { name: 'Шаг 1' }) as HTMLTextAreaElement;
    const second = screen.getByRole('textbox', { name: 'Шаг 2' });
    expect(first.tagName).toBe('TEXTAREA');
    expect(document.querySelectorAll('.tiptap')).toHaveLength(3);
    fireEvent.change(first, { target: { value: '**Новый первый**\nВторая строка' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ниже Шаг 1' }));
    expect(screen.getByRole('textbox', { name: 'Шаг 2' })).toBe(first);
    expect(first.value).toBe('**Новый первый**\nВторая строка');
    expect(screen.getByRole('textbox', { name: 'Шаг 1' })).toBe(second);
    fireEvent.click(screen.getByRole('button', { name: /Удалить шаг 2/i }));
    expect(screen.getByRole('textbox', { name: 'Шаг 1' })).toBe(second);
  });
  it('tracks setup and multiline step changes only when saved demo documents change', () => {
    const recordFiles = vi.fn(); const cases = structuredClone(demoCases);
    const { rerender } = renderHook(({ documents }) => usePreviewChangeTracking({ cases: documents, runs: [], recordFiles }), { initialProps: { documents: cases } });
    expect(recordFiles).not.toHaveBeenCalled();
    rerender({ documents: [{ ...cases[0], setup: 'Новое окружение', steps: ['Первая строка\n\n- Подпункт'] }, ...cases.slice(1)] });
    const after: string[] = recordFiles.mock.calls[0][0][0].after;
    expect(after).toContain('Новое окружение'); expect(after).toContain('1. Первая строка'); expect(after).toContain('   - Подпункт');
  });
});
