import { createElement, Fragment, type KeyboardEvent, type ReactNode } from 'react';
import { openExternal } from '@/lib/nwjs';
import { resolveVariables } from './variables';

// ---------------------------------------------------------------------------
// Inline formatting
// ---------------------------------------------------------------------------

const countChar = (s: string, ch: string): number => {
  let n = 0;
  for (const c of s) if (c === ch) n++;
  return n;
};

/** Peel trailing sentence punctuation / unbalanced closers off an autolinked URL → `[url, trailing]`. */
function splitUrlTrailing(url: string): [string, string] {
  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1];
    if (/[.,;:!?'"]/.test(ch)) {
      end--;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      const open = ch === ')' ? '(' : ch === ']' ? '[' : '{';
      if (countChar(url.slice(0, end), ch) > countChar(url.slice(0, end), open)) {
        end--;
        continue;
      }
    }
    break;
  }
  return [url.slice(0, end), url.slice(end)];
}

const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/**
 * Validate an external link target — only well-formed http(s)/mailto URLs may reach `openExternal`.
 * Case content is untrusted repo data, so this blocks `javascript:`, `file:` and custom-scheme links.
 */
function safeUrl(raw: string): string | null {
  try {
    return SAFE_LINK_PROTOCOLS.has(new URL(raw).protocol) ? raw : null;
  } catch {
    return null;
  }
}

/** An external link that opens in the user's browser (NW.js shell) rather than navigating the app. */
function extLink(key: string, url: string, label: string): ReactNode {
  const safe = safeUrl(url);
  if (!safe) return <span key={key}>{label}</span>; // unsupported/unsafe scheme — render the label as plain text
  return (
    <a
      key={key}
      href={safe}
      className="text-accent-ink underline underline-offset-2"
      onClick={(ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        openExternal(safe);
      }}
    >
      {label}
    </a>
  );
}

/**
 * Render the inline-formatting whitelist to React nodes.
 * Allowed: **bold**  *italic*  ~~strike~~  `code`  [text](url), plus bare http(s) URLs
 * (auto-linked). This is the single-line surface; for multi-line content use {@link renderMarkdown}.
 */
export function renderInline(text: string | null | undefined, keyPrefix = 'k'): ReactNode {
  if (text == null) return null;
  const out: ReactNode[] = [];
  let k = 0;
  const rx =
    /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(~~([^~]+)~~)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))|(https?:\/\/[^\s<`*]+)/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${k++}`;
    if (m[1]) out.push(<strong key={key}>{m[2]}</strong>);
    else if (m[3]) out.push(<em key={key}>{m[4]}</em>);
    else if (m[5]) out.push(<s key={key}>{m[6]}</s>);
    else if (m[7])
      out.push(
        <code key={key} className="rounded-sm border border-border bg-sunken px-1 font-mono text-[0.88em]">
          {m[8]}
        </code>,
      );
    else if (m[9]) out.push(extLink(key, m[11], m[10]));
    else if (m[12]) {
      // A bare URL — link the url itself, leaving any trailing sentence punctuation as plain text.
      const [url, trailing] = splitUrlTrailing(m[12]);
      out.push(extLink(key, url, url));
      if (trailing) out.push(trailing);
    }
    last = rx.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Resolve `{{today}}` variables against `date`, then render the inline-formatting whitelist. */
export function renderInlineResolved(text: string | null | undefined, date: string, keyPrefix = 'k'): ReactNode {
  return renderInline(text == null ? text : resolveVariables(text, date), keyPrefix);
}

// ---------------------------------------------------------------------------
// Block-level markdown
//
// A small hand-rolled CommonMark-ish renderer covering the standard block
// elements — headings, ordered/unordered (nestable) lists, blockquotes, fenced
// code blocks, horizontal rules and paragraphs — with the inline whitelist
// applied inside each block. Kept dependency-free and aligned with the inline
// whitelist above (no raw HTML is ever emitted).
// ---------------------------------------------------------------------------

type MdNode =
  | { t: 'p'; lines: string[] }
  | { t: 'h'; level: number; text: string }
  | { t: 'hr' }
  | { t: 'code'; code: string }
  | { t: 'quote'; children: MdNode[] }
  | { t: 'list'; ordered: boolean; start: number; items: MdNode[][] };

interface RenderCtx {
  key: () => string;
}

const LIST_RE = /^( *)([-*+]|\d+[.)])( +)(.*)$/;
const HEADING_RE = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const HR_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const QUOTE_RE = /^ {0,3}> ?(.*)$/;

const leadingSpaces = (s: string): number => s.match(/^ */)?.[0].length ?? 0;

function trimBlankLines(lines: string[]): string[] {
  let s = 0;
  let e = lines.length;
  while (s < e && lines[s].trim() === '') s++;
  while (e > s && lines[e - 1].trim() === '') e--;
  return lines.slice(s, e);
}

const isBlockStart = (line: string): boolean =>
  FENCE_RE.test(line) || HEADING_RE.test(line) || HR_RE.test(line) || QUOTE_RE.test(line) || LIST_RE.test(line);

/** Gather one list (and any nested content) starting at `start`; returns the node and the next index. */
function consumeList(lines: string[], start: number): { list: MdNode; next: number } {
  const first = LIST_RE.exec(lines[start]) as RegExpExecArray;
  const baseIndent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const startNum = ordered ? parseInt(first[2], 10) : 1;
  const items: MdNode[][] = [];
  let cur: string[] | null = null;
  let contentIndent = 0;
  let i = start;
  const n = lines.length;
  const flush = () => {
    if (cur !== null) items.push(parseBlocks(trimBlankLines(cur)));
    cur = null;
  };

  while (i < n) {
    const line = lines[i];
    if (line.trim() === '') {
      // A blank line stays inside the list only if more list content follows.
      let j = i + 1;
      while (j < n && lines[j].trim() === '') j++;
      if (j < n) {
        const ni = leadingSpaces(lines[j]);
        if (ni > baseIndent || (LIST_RE.test(lines[j]) && ni === baseIndent)) {
          if (cur !== null) cur.push('');
          i++;
          continue;
        }
      }
      break;
    }
    const ind = leadingSpaces(line);
    const m = LIST_RE.exec(line);
    if (m && ind <= baseIndent) {
      if (ind < baseIndent) break; // belongs to an outer list
      if (/\d/.test(m[2]) !== ordered) break; // a different list type starts a new list
      flush();
      cur = [m[4]];
      contentIndent = m[1].length + m[2].length + m[3].length;
      i++;
      continue;
    }
    if (ind > baseIndent) {
      // continuation / nested content — drop this item's marker indent so nesting parses correctly
      (cur ??= []).push(line.slice(Math.min(contentIndent, ind)));
      i++;
      continue;
    }
    // same indent, not a marker → lazy paragraph continuation of the current item
    (cur ??= []).push(line.trimStart());
    i++;
  }
  flush();
  return { list: { t: 'list', ordered, start: startNum, items }, next: i };
}

/** Parse a block of markdown lines into an MdNode tree. */
function parseBlocks(lines: string[]): MdNode[] {
  const out: MdNode[] = [];
  let i = 0;
  const n = lines.length;

  while (i < n) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }

    const fence = FENCE_RE.exec(line);
    if (fence) {
      const mark = fence[1][0];
      const len = fence[1].length;
      const code: string[] = [];
      i++;
      while (i < n) {
        const close = FENCE_CLOSE_RE.exec(lines[i]);
        if (close && close[1][0] === mark && close[1].length >= len) {
          i++;
          break;
        }
        code.push(lines[i]);
        i++;
      }
      out.push({ t: 'code', code: code.join('\n') });
      continue;
    }

    const h = HEADING_RE.exec(line);
    if (h) {
      out.push({ t: 'h', level: h[1].length, text: h[2] });
      i++;
      continue;
    }

    if (HR_RE.test(line)) {
      out.push({ t: 'hr' });
      i++;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const inner: string[] = [];
      while (i < n && QUOTE_RE.test(lines[i])) {
        inner.push((QUOTE_RE.exec(lines[i]) as RegExpExecArray)[1]);
        i++;
      }
      out.push({ t: 'quote', children: parseBlocks(trimBlankLines(inner)) });
      continue;
    }

    if (LIST_RE.test(line)) {
      const { list, next } = consumeList(lines, i);
      out.push(list);
      i = next;
      continue;
    }

    // paragraph — runs until a blank line or an interrupting block construct
    const para: string[] = [line];
    i++;
    while (i < n && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    out.push({ t: 'p', lines: para });
  }

  return out;
}

const HEADING_CLASS: Record<number, string> = {
  1: 'mb-2 mt-3 text-[1.4em] font-semibold leading-tight first:mt-0',
  2: 'mb-2 mt-3 text-[1.25em] font-semibold leading-tight first:mt-0',
  3: 'mb-1.5 mt-3 text-[1.1em] font-semibold leading-tight first:mt-0',
  4: 'mb-1.5 mt-2.5 text-[1em] font-semibold first:mt-0',
  5: 'mb-1.5 mt-2.5 text-[0.92em] font-semibold uppercase tracking-wide text-ink-2 first:mt-0',
  6: 'mb-1.5 mt-2.5 text-[0.85em] font-semibold uppercase tracking-wide text-ink-3 first:mt-0',
};

/** Render a paragraph's lines, preserving soft line breaks as `<br>`. */
function renderLines(lines: string[], ctx: RenderCtx): ReactNode[] {
  const out: ReactNode[] = [];
  lines.forEach((ln, idx) => {
    if (idx > 0) out.push(<br key={ctx.key()} />);
    out.push(<Fragment key={ctx.key()}>{renderInline(ln, ctx.key())}</Fragment>);
  });
  return out;
}

/** A list item renders tight: a leading paragraph becomes inline text; nested blocks render normally. */
function renderItem(nodes: MdNode[], ctx: RenderCtx): ReactNode[] {
  return nodes.map((nd) =>
    nd.t === 'p' ? <Fragment key={ctx.key()}>{renderLines(nd.lines, ctx)}</Fragment> : renderNode(nd, ctx),
  );
}

function renderNode(nd: MdNode, ctx: RenderCtx): ReactNode {
  const key = ctx.key();
  switch (nd.t) {
    case 'p':
      return (
        <p key={key} className="mb-2 leading-[1.6] last:mb-0">
          {renderLines(nd.lines, ctx)}
        </p>
      );
    case 'h':
      return createElement(
        `h${nd.level}`,
        { key, className: HEADING_CLASS[nd.level] },
        renderInline(nd.text, ctx.key()),
      );
    case 'hr':
      return <hr key={key} className="my-3 h-px border-0 bg-border" />;
    case 'code':
      return (
        <pre
          key={key}
          className="mb-2 overflow-auto rounded-md border border-border bg-sunken p-3 font-mono text-[0.85em] leading-[1.5] last:mb-0"
        >
          <code>{nd.code}</code>
        </pre>
      );
    case 'quote':
      return (
        <blockquote key={key} className="mb-2 border-l-2 border-border-2 pl-3 text-ink-3 last:mb-0">
          {renderNodes(nd.children, ctx)}
        </blockquote>
      );
    case 'list': {
      const items = nd.items.map((it) => (
        <li key={ctx.key()} className="leading-[1.55] [&>ol]:mt-1 [&>ol]:mb-0 [&>ul]:mt-1 [&>ul]:mb-0">
          {renderItem(it, ctx)}
        </li>
      ));
      return nd.ordered ? (
        <ol key={key} start={nd.start !== 1 ? nd.start : undefined} className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">
          {items}
        </ol>
      ) : (
        <ul key={key} className="mb-2 list-disc space-y-1 pl-5 last:mb-0">
          {items}
        </ul>
      );
    }
  }
}

function renderNodes(nodes: MdNode[], ctx: RenderCtx): ReactNode[] {
  return nodes.map((nd) => renderNode(nd, ctx));
}

/**
 * Render full block-level markdown (headings, lists, blockquotes, fenced code,
 * rules, paragraphs) plus the inline whitelist. Use this for any multi-line
 * field; use {@link renderInline} for single-line surfaces.
 */
export function renderMarkdown(text: string | null | undefined, keyPrefix = 'md'): ReactNode {
  if (text == null) return null;
  const lines = text.replace(/\r\n/g, '\n').replace(/\t/g, '    ').split('\n');
  let k = 0;
  const ctx: RenderCtx = { key: () => `${keyPrefix}-${k++}` };
  return renderNodes(parseBlocks(lines), ctx);
}

/** Resolve `{{today}}` variables against `date`, then render full block-level markdown. */
export function renderMarkdownResolved(text: string | null | undefined, date: string, keyPrefix = 'md'): ReactNode {
  return renderMarkdown(text == null ? text : resolveVariables(text, date), keyPrefix);
}

// ---------------------------------------------------------------------------
// Editing helpers
// ---------------------------------------------------------------------------

type TextField = HTMLInputElement | HTMLTextAreaElement;

/** Wrap the current selection in markers inside a textarea/input. */
export function wrapSelection(el: TextField, before: string, after: string = before) {
  const s = el.selectionStart ?? 0;
  const en = el.selectionEnd ?? 0;
  const v = el.value;
  const sel = v.slice(s, en) || 'text';
  const next = v.slice(0, s) + before + sel + after + v.slice(en);
  return { value: next, selStart: s + before.length, selEnd: s + before.length + sel.length };
}

/** Typing one of these over a non-empty selection wraps it in the matching pair. */
const WRAP_PAIRS: Record<string, string> = {
  '*': '*',
  _: '_',
  '~': '~',
  '`': '`',
  '"': '"',
  "'": "'",
  '[': ']',
  '{': '}',
  '(': ')',
};

/**
 * Push a new value into a (possibly React-controlled) field and fire its change handler,
 * by going through the native value setter + a synthetic `input` event so React's onChange runs.
 */
function setFieldValue(el: TextField, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value; // fallback when the native setter descriptor is unavailable, so the edit isn't a silent no-op
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * The platform's shortcut-modifier label (Cmd on macOS, Ctrl elsewhere) for tooltips/hints.
 * The handlers accept both (`ctrlKey || metaKey`); this only governs the text we display.
 */
export const MOD_KEY = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? 'Cmd' : 'Ctrl';

/** Ctrl/Cmd formatting shortcuts → the inline markers they wrap the selection in. */
const SHORTCUTS: Record<string, [string, string]> = {
  b: ['**', '**'], // bold
  i: ['*', '*'], // italic
  e: ['`', '`'], // inline code
  k: ['[', '](https://)'], // link
};

/** Wrap (or, with no selection, insert a placeholder for) the field's selection, then reselect it. */
function applyWrap(el: TextField, before: string, after: string): boolean {
  try {
    void el.selectionStart; // throws for input types without selection (number, date, …)
  } catch {
    return false;
  }
  const r = wrapSelection(el, before, after);
  setFieldValue(el, r.value);
  requestAnimationFrame(() => el.setSelectionRange(r.selStart, r.selEnd));
  return true;
}

/**
 * Editor key handling for any input/textarea: formatting shortcuts (Ctrl/Cmd+B bold, +I italic,
 * +E code, +K link, +Shift+X strikethrough) and wrap-on-type (typing `* _ ~ \` " ' [ { (` over a
 * selection wraps it in the matching pair). Returns true when it handled the key — call it first
 * from `onKeyDown`; everything else (plain typing, Ctrl+Z/Y/A/C/V) falls through untouched.
 */
export function editorKeyDown(e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): boolean {
  if (e.nativeEvent.isComposing) return false;
  const el = e.currentTarget;

  if (e.ctrlKey || e.metaKey) {
    if (e.altKey) return false;
    const k = e.key.toLowerCase();
    const pair: [string, string] | undefined = e.shiftKey
      ? k === 'x'
        ? ['~~', '~~'] // strikethrough
        : undefined
      : SHORTCUTS[k];
    if (!pair) return false; // not a formatting shortcut (Ctrl+Z/Y/A/C/V…) → leave it
    if (!applyWrap(el, pair[0], pair[1])) return false;
    e.preventDefault();
    return true;
  }

  // wrap-on-type: a wrapping character typed over a non-empty selection
  const close = WRAP_PAIRS[e.key];
  if (close === undefined) return false;
  let start: number | null;
  let end: number | null;
  try {
    start = el.selectionStart;
    end = el.selectionEnd;
  } catch {
    return false;
  }
  if (start == null || end == null || start === end) return false; // nothing selected → type normally
  e.preventDefault();
  applyWrap(el, e.key, close);
  return true;
}

/**
 * Detect ATX h1–h3 headings (`#`, `##`, `###`). These collide with the case file's
 * own structure — `##` delimits the reserved sections and `###` delimits a setup
 * item's name — so they're disallowed inside field content (h4–h6, lists, quotes,
 * code blocks and inline formatting are all fine). A bare marker (e.g. a lone `###`)
 * counts, since the parser treats it as a heading.
 */
export function hasHeadings13(text: string | null | undefined): boolean {
  return /^[ \t]{0,3}#{1,3}([ \t]|$)/m.test(text || '');
}

/** Strip h1–h3 heading markers (including bare ones), keeping any heading text. */
export function stripHeadings13(text: string): string {
  return text.replace(/^[ \t]{0,3}#{1,3}(?:[ \t]+|[ \t]*$)/gm, '');
}
