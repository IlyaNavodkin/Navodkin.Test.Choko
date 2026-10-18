// ---------------------------------------------------------------------------
// Pure markdown → HTML-string renderer.
//
// A string-emitting twin of the app's React renderer (utils/markdown.tsx): same
// inline whitelist (**bold** *italic* ~~strike~~ `code` [text](url) + bare URLs)
// and block set (headings, ordered/unordered nestable lists, blockquotes, fenced
// code, rules, paragraphs). It exists for the PDF report builder, which is
// deliberately React-free + self-contained (its CSS styles the emitted tags), so
// it can't reuse the React renderer. All text is HTML-escaped and only this
// whitelist of tags is ever emitted — case/run content is untrusted repo data.
// ---------------------------------------------------------------------------

/** HTML-escape text content. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** Only well-formed http(s)/mailto URLs may become links — blocks `javascript:`/`file:`/custom schemes. */
function safeUrl(raw: string): string | null {
  try {
    return SAFE_LINK_PROTOCOLS.has(new URL(raw).protocol) ? raw : null;
  } catch {
    return null;
  }
}

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

const link = (url: string, label: string): string => {
  const safe = safeUrl(url);
  return safe ? `<a href="${esc(safe)}">${esc(label)}</a>` : esc(label);
};

const INLINE_RE =
  /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(~~([^~]+)~~)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))|(https?:\/\/[^\s<`*]+)/g;

/** Render the inline-formatting whitelist of a single line to an HTML string. */
function inline(text: string): string {
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) out += esc(text.slice(last, m.index));
    if (m[1]) out += `<strong>${esc(m[2])}</strong>`;
    else if (m[3]) out += `<em>${esc(m[4])}</em>`;
    else if (m[5]) out += `<s>${esc(m[6])}</s>`;
    else if (m[7]) out += `<code>${esc(m[8])}</code>`;
    else if (m[9]) out += link(m[11], m[10]);
    else if (m[12]) {
      const [url, trailing] = splitUrlTrailing(m[12]);
      out += link(url, url) + (trailing ? esc(trailing) : '');
    }
    last = INLINE_RE.lastIndex;
  }
  if (last < text.length) out += esc(text.slice(last));
  return out;
}

/** Render inline markdown only (no block wrapper) — for single-line surfaces. */
export function markdownInlineToHtml(text: string | null | undefined): string {
  return text == null ? '' : inline(text);
}

// ---- block level ----------------------------------------------------------

type MdNode =
  | { t: 'p'; lines: string[] }
  | { t: 'h'; level: number; text: string }
  | { t: 'hr' }
  | { t: 'code'; code: string }
  | { t: 'quote'; children: MdNode[] }
  | { t: 'list'; ordered: boolean; start: number; items: MdNode[][] };

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
      if (ind < baseIndent) break;
      if (/\d/.test(m[2]) !== ordered) break;
      flush();
      cur = [m[4]];
      contentIndent = m[1].length + m[2].length + m[3].length;
      i++;
      continue;
    }
    if (ind > baseIndent) {
      (cur ??= []).push(line.slice(Math.min(contentIndent, ind)));
      i++;
      continue;
    }
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

const linesToHtml = (lines: string[]): string => lines.map((l) => inline(l)).join('<br>');

/** A list item renders tight: a leading paragraph is inline; nested blocks render normally. */
const itemToHtml = (nodes: MdNode[]): string =>
  nodes.map((nd) => (nd.t === 'p' ? linesToHtml(nd.lines) : nodeToHtml(nd))).join('');

function nodeToHtml(nd: MdNode): string {
  switch (nd.t) {
    case 'p':
      return `<p>${linesToHtml(nd.lines)}</p>`;
    case 'h': {
      const lvl = Math.min(6, Math.max(1, nd.level));
      return `<h${lvl}>${inline(nd.text)}</h${lvl}>`;
    }
    case 'hr':
      return '<hr>';
    case 'code':
      return `<pre><code>${esc(nd.code)}</code></pre>`;
    case 'quote':
      return `<blockquote>${nd.children.map(nodeToHtml).join('')}</blockquote>`;
    case 'list': {
      const items = nd.items.map((it) => `<li>${itemToHtml(it)}</li>`).join('');
      return nd.ordered
        ? `<ol${nd.start !== 1 ? ` start="${nd.start}"` : ''}>${items}</ol>`
        : `<ul>${items}</ul>`;
    }
  }
}

/**
 * Render full block-level markdown to an HTML string. Returns `''` for empty input.
 * Use {@link markdownInlineToHtml} for single-line surfaces that shouldn't be wrapped in `<p>`.
 */
export function markdownToHtml(text: string | null | undefined): string {
  if (text == null || text.trim() === '') return '';
  const lines = text.replace(/\r\n/g, '\n').replace(/\t/g, '    ').split('\n');
  return parseBlocks(lines).map(nodeToHtml).join('');
}
