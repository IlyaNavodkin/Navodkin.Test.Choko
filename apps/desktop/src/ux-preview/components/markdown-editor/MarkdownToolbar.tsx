import { useRef, useState } from 'react';
import { Button, Input, Menu, MenuItem, MenuTrigger } from '@codaa/ui';
import type { Editor } from '@tiptap/core';
import type { SelectionBookmark } from '@tiptap/pm/state';
import { blockCommands, inlineCommands, type MarkdownCommand } from './commands';
import { isSafeLink } from './markdownCodec';
import { mt } from './messages';
import styles from './SectionMarkdownEditor.module.css';

export function MarkdownToolbar({ editor, disabled, onMenuOpenChange }: { editor: Editor; disabled: boolean; onMenuOpenChange?: (open: boolean) => void }) {
  const [linkOpen, setLinkOpen] = useState(false); const [url, setUrl] = useState(''); const [error, setError] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false); const bookmark = useRef<SelectionBookmark | null>(null);
  function setMenu(open: boolean) { if (open && disabled) return; if (open) bookmark.current = editor.state.selection.getBookmark(); setInsertOpen(open); onMenuOpenChange?.(open); }
  function command(item: MarkdownCommand) { if (!disabled && editor.isEditable) item.run(editor); }
  return <div className={styles.toolbar} role="toolbar" aria-label={mt('format')} onMouseDown={(event) => { if (!(event.target instanceof HTMLInputElement)) event.preventDefault(); }} onKeyDown={(event) => { if (event.key === 'Escape' && insertOpen) { event.preventDefault(); event.stopPropagation(); setMenu(false); editor.commands.focus(); } }}>
    {inlineCommands.map((item) => <Button key={item.id} size="sm" variant="ghost" disabled={disabled} aria-label={item.label} title={item.label} aria-pressed={editor.isActive(item.active ?? '')} onClick={() => command(item)}><span className={styles[item.id]}>{item.id === 'bold' ? 'B' : item.id === 'italic' ? 'I' : item.id === 'strike' ? 'S' : '</>'}</span></Button>)}
    <Button size="sm" variant="ghost" disabled={disabled} aria-pressed={editor.isActive('link')} onClick={() => { if (disabled) return; setUrl(String(editor.getAttributes('link').href ?? '')); setError(false); setLinkOpen(!linkOpen); }}>{mt('link')}</Button>
    <>
      <div className={styles.divider} />
      <Menu open={insertOpen && !disabled} onOpenChange={setMenu} className={styles.insertMenu} width={280}>
        <MenuTrigger disabled={disabled} className={styles.insertTrigger}>{mt('insertMenu')}</MenuTrigger>
        {blockCommands.map((item) => <MenuItem key={item.id} disabled={disabled} onClick={() => { if (disabled) return; if (bookmark.current) editor.view.dispatch(editor.state.tr.setSelection(bookmark.current.resolve(editor.state.doc))); command(item); }}>{item.label}</MenuItem>)}
        {editor.isActive('table') && <>
          <MenuItem disabled={disabled} onClick={() => { if (!disabled) editor.chain().focus().addRowAfter().run(); }}>{mt('addRow')}</MenuItem>
          <MenuItem disabled={disabled} onClick={() => { if (!disabled) editor.chain().focus().deleteRow().run(); }}>{mt('deleteRow')}</MenuItem>
          <MenuItem disabled={disabled} onClick={() => { if (!disabled) editor.chain().focus().addColumnAfter().run(); }}>{mt('addColumn')}</MenuItem>
          <MenuItem disabled={disabled} onClick={() => { if (!disabled) editor.chain().focus().deleteTable().run(); }}>{mt('deleteTable')}</MenuItem>
        </>}
      </Menu>
      <div className={styles.divider} />
      <Button size="sm" variant="ghost" disabled={disabled || !editor.can().undo()} onClick={() => { if (!disabled) editor.chain().focus().undo().run(); }}>{mt('undo')}</Button>
      <Button size="sm" variant="ghost" disabled={disabled || !editor.can().redo()} onClick={() => { if (!disabled) editor.chain().focus().redo().run(); }}>{mt('redo')}</Button>

    </>
    {linkOpen && !disabled && <div className={styles.linkForm}>
      <Input size="sm" aria-label={mt('linkUrl')} value={url} placeholder="https://" disabled={disabled} onChange={(event) => { setUrl(event.target.value); setError(false); }} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setLinkOpen(false); editor.commands.focus(); } }} />
      <Button size="sm" disabled={disabled} onClick={() => { if (disabled) return; if (!isSafeLink(url)) { setError(true); return; } editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run(); setLinkOpen(false); }}>{mt('apply')}</Button>
      <Button size="sm" variant="ghost" disabled={disabled} onClick={() => { if (!disabled) editor.chain().focus().extendMarkRange('link').unsetLink().run(); setLinkOpen(false); }}>{mt('removeLink')}</Button>
      <Button size="sm" variant="ghost" onClick={() => { setLinkOpen(false); editor.commands.focus(); }}>{mt('cancel')}</Button>
      {error && <span role="alert">{mt('unsafeLink')}</span>}
    </div>}
  </div>;
}

