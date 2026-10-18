import type { Editor } from '@tiptap/core';
import { mt } from './messages';

export type MarkdownCommand = { id: string; label: string; active?: string; run: (editor: Editor) => void };
export const blockCommands: MarkdownCommand[] = [
  { id: 'heading', label: mt('heading'), active: 'heading', run: (e) => { e.chain().focus().toggleHeading({ level: 2 }).run(); } },
  { id: 'bullet', label: mt('bullet'), active: 'bulletList', run: (e) => { e.chain().focus().toggleBulletList().run(); } },
  { id: 'ordered', label: mt('ordered'), active: 'orderedList', run: (e) => { e.chain().focus().toggleOrderedList().run(); } },
  { id: 'task', label: mt('task'), active: 'taskList', run: (e) => { e.chain().focus().toggleTaskList().run(); } },
  { id: 'quote', label: mt('quote'), active: 'blockquote', run: (e) => { e.chain().focus().toggleBlockquote().run(); } },
  { id: 'codeBlock', label: mt('codeBlock'), active: 'codeBlock', run: (e) => { e.chain().focus().toggleCodeBlock().run(); } },
  { id: 'table', label: mt('table'), active: 'table', run: (e) => { e.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run(); } },
];
export const inlineCommands: MarkdownCommand[] = [
  { id: 'bold', label: mt('bold'), active: 'bold', run: (e) => { e.chain().focus().toggleBold().run(); } },
  { id: 'italic', label: mt('italic'), active: 'italic', run: (e) => { e.chain().focus().toggleItalic().run(); } },
  { id: 'strike', label: mt('strike'), active: 'strike', run: (e) => { e.chain().focus().toggleStrike().run(); } },
  { id: 'code', label: mt('code'), active: 'code', run: (e) => { e.chain().focus().toggleCode().run(); } },
];
