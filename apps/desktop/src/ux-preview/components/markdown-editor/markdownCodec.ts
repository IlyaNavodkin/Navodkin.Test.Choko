import StarterKit from '@tiptap/starter-kit';
import { Markdown, MarkdownManager } from '@tiptap/markdown';
import { TableKit } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';

/** Only the portable glossary file grammar is accepted, never arbitrary relative paths. */
export function isGlossaryReferenceHref(value: string): boolean {
  return /^(?:\.\.\/)*\.testoritto\/glossary\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.md$/.test(value);
}
export function isSupportedEditorLink(value: string): boolean { return isSafeLink(value) || isGlossaryReferenceHref(value); }

/** Explicit protocols only: local paths/attachments are outside this preview's scope. */
export function isSafeLink(value: string): boolean {
  if (!/^(https?:\/\/|mailto:)/i.test(value) || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? Boolean(url.hostname) : url.protocol === 'mailto:' && Boolean(url.pathname); }
  catch { return false; }
}

export function createMarkdownExtensions() {
  return [StarterKit.configure({
    underline: false, trailingNode: false,
    link: { openOnClick: false, autolink: false, linkOnPaste: false, isAllowedUri: isSupportedEditorLink },
  }), TableKit.configure({ table: { resizable: false } }), TaskList, TaskItem.configure({ nested: true }), Markdown.configure({ markedOptions: { gfm: true } })];
}

export const markdownManager = new MarkdownManager({ extensions: createMarkdownExtensions(), markedOptions: { gfm: true } });
const supportedTokens = new Set(['space', 'text', 'paragraph', 'escape', 'strong', 'em', 'del', 'codespan', 'br', 'link', 'heading', 'list', 'list_item', 'taskList', 'taskItem', 'blockquote', 'code', 'hr', 'table']);
export type MarkdownInspection = { supported: boolean };

/** Conservative subset: GFM text/formatting/lists/code/simple tables, no opaque extensions.
 * Raw source is owned by the component until an actual user edit. Supported Markdown
 * may normalize spacing/line endings on edit; this is never a full-file codec.
 */
export function inspectMarkdown(source: string): MarkdownInspection {
  function supported(value: unknown): boolean {
    if (Array.isArray(value)) return value.every(supported);
    if (!value || typeof value !== 'object') return true;
    const item = value as Record<string, unknown>;
    if (typeof item.type === 'string' && !supportedTokens.has(item.type)) return false;
    if (item.type === 'link' && (typeof item.href !== 'string' || !isSupportedEditorLink(item.href))) return false;
    if (item.type === 'table' && Array.isArray(item.align) && item.align.some((alignment) => alignment !== null)) return false;
    // A code node's contents are literal, including HTML and extension-looking text.
    if (item.type === 'code' || item.type === 'codespan') return true;
    if (typeof item.raw === 'string' && /(^|\n)\s*(?:\[\^|\[[^\]]+\]:|:::|\$\$)|\[\^[^\]]+\]|\{[%{]|\{%|\$[^$\n]+\$/.test(item.raw)) return false;
    return Object.values(item).every((nested) => typeof nested === 'object' ? supported(nested) : true);
  }
  try {
    const tokens = markdownManager.instance.lexer(source);
    return { supported: Object.keys(tokens.links).length === 0 && supported(tokens) };
  }
  catch { return { supported: false }; }
}
