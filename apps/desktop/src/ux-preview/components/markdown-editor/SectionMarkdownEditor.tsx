import { rt } from './referenceMessages';
import { useId, useRef, useState } from 'react';
import { Button, Modal, Textarea } from '@codaa/ui';
import { EditorContent } from '@tiptap/react';
import { closeHistory } from '@tiptap/pm/history';
import { MarkdownToolbar } from './MarkdownToolbar';
import { EditorFloating } from './EditorFloating';
import { mt } from './messages';
import { useSectionMarkdownEditor, type UseSectionMarkdownEditorArgs } from './useSectionMarkdownEditor';
import { ReferencePicker, type ReferenceOption } from './ReferencePicker';
import { SourceReferenceButton } from './SourceReferenceButton';
import styles from './SectionMarkdownEditor.module.css';

export type SectionMarkdownEditorProps = UseSectionMarkdownEditorArgs & { references?: ReferenceOption[] };
export function SectionMarkdownEditor(props: SectionMarkdownEditorProps) {
  const model = useSectionMarkdownEditor(props);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const [picking, setPicking] = useState(false);
  const selection = useRef({ from: 0, to: 0 });
  function restoreRichFocus() { requestAnimationFrame(() => { model.editor?.chain().focus().setTextSelection(selection.current).run(); }); }
  const floatingOwner = useId();
  const [expanded, setExpanded] = useState(false); const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const expandButton = useRef<HTMLButtonElement>(null);
  function collapse() { setExpanded(false); requestAnimationFrame(() => expandButton.current?.focus()); }
  const surface = <div className={`${styles.editor} ${expanded ? styles.expanded : ''}`} data-focused={focused || expanded || menuOpen} data-disabled={model.locked} data-markdown-editor={props.label}
    onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { const floating = event.relatedTarget instanceof Element ? event.relatedTarget.closest('[data-section-floating]') : null; if (!event.currentTarget.contains(event.relatedTarget) && floating?.getAttribute('data-section-floating') !== floatingOwner) setFocused(false); }}
    onKeyDown={(event) => { if (event.key === 'Escape' && model.slash) { event.preventDefault(); event.stopPropagation(); model.closeSlash(); } }}>
    <div className={styles.panel}>
      {model.editor && <MarkdownToolbar editor={model.editor} disabled={model.locked || model.sourceMode} onMenuOpenChange={setMenuOpen} />}
      <div className={styles.modes}>
      <Button size="sm" variant="ghost" aria-pressed={!model.sourceMode} disabled={!model.supported} onClick={() => model.setSourceMode(false)}>{mt('visual')}</Button>
      <Button size="sm" variant="ghost" aria-pressed={model.sourceMode} onClick={() => model.setSourceMode(true)}>{mt('source')}</Button>
      {props.references && (model.sourceMode ? <SourceReferenceButton target={sourceRef} value={model.source} options={props.references} disabled={model.locked} onChange={model.changeSource} /> : <Button size="sm" variant="ghost" disabled={model.locked} onMouseDown={(event) => event.preventDefault()} onClick={() => { if (!model.editor) return; selection.current = { from: model.editor.state.selection.from, to: model.editor.state.selection.to }; setPicking(true); }}>{rt('insert')}</Button>)}
      <span className={styles.modeSpacer} />
      {!expanded && <Button ref={expandButton} size="sm" variant="ghost" aria-label={`${mt('expand')}: ${props.label}`} onClick={() => setExpanded(true)}>{mt('expand')}</Button>}
      </div>
    </div>
    {!model.supported && <p className={styles.notice} role="status">{mt('unsupported')}</p>}
    {model.sourceMode ? <Textarea ref={sourceRef} className={styles.source} rows={expanded ? 18 : 3} aria-label={props.label} value={model.source} readOnly={model.locked} onChange={(event) => model.changeSource(event.target.value)} /> : <>
      <EditorContent editor={model.editor} className={styles.content} />
      {model.slash && !model.locked && model.editor && <EditorFloating editor={model.editor} owner={floatingOwner} kind="slash"><div className={styles.slash} role="listbox" aria-label={mt('insert')}>
        {model.commands.length ? model.commands.map((item, index) => <Button key={item.id} size="sm" variant="ghost" role="option" aria-selected={index === model.slash!.index} onMouseDown={(event) => event.preventDefault()} onClick={() => model.insertBlock(item)}>{item.label}</Button>) : <p>{mt('noCommands')}</p>}
      </div></EditorFloating>}
    </>}
  </div>;
  return <div className={styles.host}>
    {picking && <ReferencePicker options={props.references ?? []} onClose={() => { setPicking(false); restoreRichFocus(); }} onPick={(option) => {
      const editor = model.editor; if (!editor || model.locked) return;
      const { from, to } = selection.current; const label = editor.state.doc.textBetween(from, to, ' ') || option.title;
      editor.view.dispatch(closeHistory(editor.state.tr));
      editor.chain().focus().setTextSelection({ from, to }).insertContent({ type: 'text', text: label, marks: [{ type: 'link', attrs: { href: option.href } }] }).run();
      editor.view.dispatch(closeHistory(editor.state.tr));
      setPicking(false); requestAnimationFrame(() => editor.commands.focus());
    }} />}
    {expanded ? <><div className={styles.placeholder}>{props.label}</div><Modal open title={<span className={styles.modalTitle}>{props.label}</span>} maxWidth={1000} onOpenChange={(open) => { if (!open) collapse(); }} actions={<Button onClick={collapse}>{mt('collapse')}</Button>}>{surface}</Modal></> : surface}
  </div>;
}

