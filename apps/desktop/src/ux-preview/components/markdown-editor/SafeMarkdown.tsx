import { createElement, type ReactNode } from 'react';
import { isGlossaryReferenceHref, markdownManager } from './markdownCodec';
import styles from './SectionMarkdownEditor.module.css';
import { rt } from './referenceMessages';
// The lexer is a parser only. No HTML string or token is ever passed to the DOM.
type Token = { type: string; raw?: string; text?: string; href?: string; tokens?: Token[]; items?: Token[]; depth?: number; ordered?: boolean; start?: number; task?: boolean; checked?: boolean; header?: Cell[]; rows?: Cell[][] };
type Cell = { text: string; tokens: Token[] };
export function SafeMarkdown({ source, onReference }: { source: string; onReference?: (href: string) => void }) {
  function render(tokens: Token[]): ReactNode { return tokens.map((token, key) => {
    const children = () => token.tokens ? render(token.tokens) : token.text;
    switch (token.type) {
      case 'space': return null;
      case 'text': case 'escape': return <span key={key}>{children()}</span>;
      case 'paragraph': return <p key={key}>{children()}</p>;
      case 'strong': return <strong key={key}>{children()}</strong>;
      case 'em': return <em key={key}>{children()}</em>;
      case 'del': return <del key={key}>{children()}</del>;
      case 'br': return <br key={key} />;
      case 'hr': return <hr key={key} />;
      case 'heading': return createElement(`h${Math.min(6, Math.max(2, token.depth ?? 2))}`, { key }, children());
      case 'blockquote': return <blockquote key={key}>{children()}</blockquote>;
      case 'code': return <pre key={key}><code>{token.text}</code></pre>;
      case 'codespan': return <code key={key}>{token.text}</code>;
      case 'link': {
        const href = token.href ?? '';
        if (isGlossaryReferenceHref(href) && onReference) return <button key={key} type="button" className={styles.referenceLink} onClick={() => onReference(href)}>{children()}</button>;
        // This isolated preview never opens external documents; keep their address readable.
        return <span key={key}>{children()}{` (${href})`}</span>;
      }
      case 'list': return token.ordered ? <ol key={key} start={token.start}>{render(token.items ?? [])}</ol> : <ul key={key}>{render(token.items ?? [])}</ul>;
      case 'list_item': return <li key={key}>{token.task && <input type="checkbox" checked={Boolean(token.checked)} readOnly disabled aria-label={rt('task')} />}{children()}</li>;
      case 'table': return <table key={key}><thead><tr>{token.header?.map((cell, i) => <th key={i}>{render(cell.tokens)}</th>)}</tr></thead><tbody>{token.rows?.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{render(cell.tokens)}</td>)}</tr>)}</tbody></table>;
      default: return <span key={key} className={styles.literal}>{token.raw ?? token.text ?? ''}</span>;
    }
  }); }
  try {
    const tokens = markdownManager.instance.lexer(source);
    // Reference definitions and opaque syntax stay verbatim, including unused definitions.
    if (Object.keys(tokens.links).length || /(^|\n)\s*(:::|\[\^)|\{[%{]|\$\$/.test(source)) return <pre className={styles.literal}>{source}</pre>;
    return <div className={styles.reader}>{render(tokens as Token[])}</div>;
  } catch { return <pre className={styles.literal}>{source}</pre>; }
}
