import { describe, expect, it } from 'vitest';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { hasHeadings13, renderMarkdown, stripHeadings13, wrapSelection } from './markdown';

/** Render block markdown to static HTML for structural assertions. */
const html = (src: string): string => renderToStaticMarkup(createElement(Fragment, null, renderMarkdown(src)));
const count = (s: string, re: RegExp): number => s.match(re)?.length ?? 0;

describe('hasHeadings13', () => {
  it('flags h1–h3 markers, including bare ones', () => {
    for (const s of ['# h1', '## h2', '### h3', '###', '##', '#', '  ## indented']) {
      expect(hasHeadings13(s)).toBe(true);
    }
  });

  it('allows h4+, mid-line hashes, and blanks', () => {
    for (const s of ['#### h4', '##### h5', 'text #notitle', 'a # b', '###notitle', '']) {
      expect(hasHeadings13(s)).toBe(false);
    }
  });
});

describe('stripHeadings13', () => {
  it('removes the marker, including a bare ###, keeping h4+', () => {
    expect(stripHeadings13('### Title')).toBe('Title');
    expect(stripHeadings13('###')).toBe('');
    expect(stripHeadings13('## Sub\n#### Keep')).toBe('Sub\n#### Keep');
  });
});

describe('renderMarkdown', () => {
  it('renders unordered lists', () => {
    const out = html('- one\n- two\n- three');
    expect(out).toContain('<ul');
    expect(count(out, /<li/g)).toBe(3);
    expect(out).toContain('one');
    expect(out).toContain('three');
  });

  it('renders ordered lists and honors a non-1 start', () => {
    expect(html('1. a\n2. b')).toContain('<ol');
    const fromThree = html('3. a\n4. b');
    expect(fromThree).toContain('<ol');
    expect(fromThree).toContain('start="3"');
  });

  it('nests lists by indentation', () => {
    const out = html('- a\n  - b\n  - c');
    expect(count(out, /<ul/g)).toBe(2);
    expect(out).toContain('b');
    expect(out).toContain('c');
  });

  it('renders blockquotes', () => {
    expect(html('> a quote\n> second line')).toContain('<blockquote');
  });

  it('renders fenced code blocks verbatim (no inline formatting inside)', () => {
    const out = html('```\nconst x = **not bold**;\n```');
    expect(out).toContain('<pre');
    expect(out).toContain('<code>');
    expect(out).toContain('**not bold**');
    expect(out).not.toContain('<strong>');
  });

  it('renders ATX headings and horizontal rules', () => {
    expect(html('## Section')).toContain('<h2');
    expect(html('#### Smaller')).toContain('<h4');
    expect(html('---')).toContain('<hr');
  });

  it('applies the inline whitelist inside paragraphs', () => {
    const out = html('see **bold**, `code`, and [a link](https://example.com)');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<code');
    expect(out).toContain('href="https://example.com"');
  });

  it('keeps soft line breaks within a paragraph', () => {
    expect(html('first line\nsecond line')).toContain('<br');
  });

  it('separates paragraphs on a blank line', () => {
    expect(count(html('para one\n\npara two'), /<p/g)).toBe(2);
  });
});

describe('autolink', () => {
  it('links bare http(s) URLs', () => {
    const out = html('visit https://example.com today');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('>https://example.com<');
  });

  it('keeps the URL when it ends a line/sentence and drops the trailing period', () => {
    const out = html('Open https://www.random.org/integers/.');
    expect(out).toContain('href="https://www.random.org/integers/"');
    expect(out).toContain('</a>.'); // the period is plain text after the link
  });

  it('trims an unbalanced trailing paren', () => {
    expect(html('(see https://example.com/x)')).toContain('href="https://example.com/x"');
  });

  it('does not double-link a markdown link', () => {
    const out = html('[home](https://example.com)');
    expect(count(out, /<a /g)).toBe(1);
    expect(out).toContain('>home<');
  });

  it('leaves scheme-less domains as plain text', () => {
    expect(html('see random.org/integers for details')).not.toContain('<a ');
  });

  it('renders a safe markdown-link scheme as a link', () => {
    const out = html('[mail me](mailto:dev@example.com)');
    expect(out).toContain('href="mailto:dev@example.com"');
    expect(out).toContain('>mail me<');
  });

  it('refuses unsafe markdown-link schemes, keeping the label as plain text', () => {
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,evil']) {
      const out = html(`[click](${url})`);
      expect(out).not.toContain('<a ');
      expect(out).not.toContain('href=');
      expect(out).toContain('click'); // the link text survives as plain text
    }
  });
});

describe('wrapSelection', () => {
  const field = (value: string, selectionStart: number, selectionEnd: number) =>
    ({ value, selectionStart, selectionEnd }) as HTMLInputElement;

  it('wraps the selection in a symmetric pair and keeps it selected (inside the markers)', () => {
    expect(wrapSelection(field('hello world', 6, 11), '*', '*')).toEqual({
      value: 'hello *world*',
      selStart: 7,
      selEnd: 12,
    });
  });

  it('supports asymmetric bracket pairs', () => {
    expect(wrapSelection(field('a link', 2, 6), '[', ']')).toEqual({
      value: 'a [link]',
      selStart: 3,
      selEnd: 7,
    });
  });
});
