import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '@tiptap/react';
import { Extension, type Editor } from '@tiptap/core';
import { EditorState, Plugin } from '@tiptap/pm/state';
import { blockCommands, type MarkdownCommand } from './commands';
import { createMarkdownExtensions, inspectMarkdown } from './markdownCodec';

export type UseSectionMarkdownEditorArgs = { value: string; onChange: (value: string) => void; label: string; disabled?: boolean; readOnly?: boolean };
export type SlashMenuState = { from: number; to: number; query: string; index: number };
export type UseSectionMarkdownEditorResult = {
  editor: Editor | null; source: string; supported: boolean; locked: boolean; sourceMode: boolean;
  setSourceMode: (value: boolean) => void; changeSource: (value: string) => void;
  slash: SlashMenuState | null; closeSlash: () => void; commands: MarkdownCommand[]; insertBlock: (command: MarkdownCommand) => void;
};

export function useSectionMarkdownEditor(args: UseSectionMarkdownEditorArgs): UseSectionMarkdownEditorResult {
  const latest = useRef(args); latest.current = args;
  const loading = useRef(false);
  const original = useRef(args.value);
  const [source, setSource] = useState(args.value);
  const [sourceMode, setSourceMode] = useState(false);
  const [slash, setSlash] = useState<SlashMenuState | null>(null);
  const slashRef = useRef(slash); slashRef.current = slash;
  const supported = useMemo(() => inspectMarkdown(source).supported, [source]);
  const locked = Boolean(args.disabled || args.readOnly);
  const suppressedSlash = useRef(false);
  const editor = useEditor({
    extensions: [...createMarkdownExtensions(), Extension.create({
      name: 'sectionWriteGuard',
      addProseMirrorPlugins: () => [new Plugin({ filterTransaction: (transaction) => !transaction.docChanged || loading.current || !(latest.current.disabled || latest.current.readOnly) })],
    })], content: supported ? args.value : '', contentType: 'markdown',
    editable: !locked && supported, shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': args.label, tabindex: '0' },
      // Browser paste is text-only: arbitrary HTML/embedded media never enters the schema.
      handlePaste: (_view, event) => {
        if (latest.current.disabled || latest.current.readOnly) return true;
        const text = event.clipboardData?.getData('text/plain');
        if (!text) return true;
        event.preventDefault(); editor?.commands.insertContent(text.split(/\r?\n/).map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] }))); return true;
      },
      handleDrop: () => true,
      handleKeyDown: (_view, event) => {
        if (latest.current.disabled || latest.current.readOnly) return !['Tab', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) && !((event.ctrlKey || event.metaKey) && ['a', 'c'].includes(event.key.toLowerCase()));
        const current = slashRef.current;
        if (!current) return false;
        if (event.key === 'Escape') {
          // Consume at the native ProseMirror boundary before React can close its Modal.
          event.preventDefault(); event.stopPropagation();
          suppressedSlash.current = true; setSlash(null); return true;
        }
        const commands = blockCommands.filter((item) => item.label.toLocaleLowerCase('ru').includes(current.query.toLocaleLowerCase('ru')));
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          const count = commands.length;
          setSlash({ ...current, index: count ? (current.index + (event.key === 'ArrowDown' ? 1 : count - 1)) % count : 0 }); return true;
        }
        if (event.key === 'Enter' && commands.length && editor) {
          const command = commands[current.index % commands.length];
          setSlash(null); editor.chain().focus().deleteRange({ from: current.from, to: current.to }).run(); command.run(editor); return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: current, transaction }) => {
      if (!transaction.docChanged || latest.current.disabled || latest.current.readOnly) return;
      const next = current.getMarkdown();
      if (next === original.current) return;
      original.current = next; setSource(next); latest.current.onChange(next);
    },
    onTransaction: ({ editor: current, transaction }) => {
      if (!transaction.docChanged && !transaction.selectionSet) return;
      if (transaction.docChanged) suppressedSlash.current = false;
      const { $from, empty } = current.state.selection;
      const text = $from.parent.textBetween(0, $from.parentOffset, '\n');
      const match = empty && $from.parent.type.name === 'paragraph' && /^\/([^\n/]*)$/.exec(text);
      if (!match || suppressedSlash.current || latest.current.disabled || latest.current.readOnly) { setSlash(null); return; }
      setSlash({ from: $from.start(), to: $from.pos, query: match[1], index: 0 });
    },
  });

  function loadDocument(value: string) {
    if (!editor) return;
    loading.current = true;
    try { editor.commands.setContent(inspectMarkdown(value).supported ? value : '', { contentType: 'markdown', emitUpdate: false }); }
    finally { loading.current = false; }
    // A parent replacement/discard starts a new history, never undo into another section.
    editor.view.updateState(EditorState.create({ schema: editor.schema, doc: editor.state.doc, plugins: editor.state.plugins }));
    setSlash(null);
  }
  useEffect(() => {
    if (args.value === original.current) return;
    original.current = args.value; setSource(args.value); loadDocument(args.value);
  }, [args.value, editor]);
  useEffect(() => { editor?.setEditable(!locked && supported && !sourceMode, false); if (locked) setSlash(null); }, [editor, locked, supported, sourceMode]);
  useEffect(() => { editor?.setOptions({ editorProps: { ...editor.options.editorProps, attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': args.label, 'aria-readonly': String(locked), tabindex: '0' } } }); }, [editor, args.label, locked]);

  const commands = blockCommands.filter((item) => item.label.toLocaleLowerCase('ru').includes((slash?.query ?? '').toLocaleLowerCase('ru')));
  return {
    editor, source, supported, locked, sourceMode: sourceMode || !supported, slash, commands,
    closeSlash: () => { suppressedSlash.current = true; setSlash(null); },
    setSourceMode: (value) => { setSlash(null); setSourceMode(value); },
    changeSource: (value) => {
      if (locked || value === original.current) return;
      setSourceMode(true); original.current = value; setSource(value); loadDocument(value); latest.current.onChange(value);
    },
    insertBlock: (command) => {
      if (!editor || locked || !supported) return;
      if (slash) editor.chain().focus().deleteRange({ from: slash.from, to: slash.to }).run();
      setSlash(null); command.run(editor);
    },
  };
}
