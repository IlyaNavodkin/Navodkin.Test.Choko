import { describe, expect, it } from 'vitest';
import { markdownInlineToHtml, markdownToHtml } from './markdown-html';

describe('markdownInlineToHtml', () => {
  it('renders the inline whitelist', () => {
    expect(markdownInlineToHtml('**b** *i* ~~s~~ `c`')).toBe(
      '<strong>b</strong> <em>i</em> <s>s</s> <code>c</code>',
    );
  });

  it('links safe URLs and escapes the rest', () => {
    expect(markdownInlineToHtml('[docs](https://x.io)')).toBe('<a href="https://x.io">docs</a>');
    expect(markdownInlineToHtml('see https://x.io.')).toBe('see <a href="https://x.io">https://x.io</a>.');
  });

  it('does not emit links for unsafe schemes', () => {
    expect(markdownInlineToHtml('[x](javascript:alert)')).toBe('x');
  });

  it('escapes HTML so raw markup cannot be injected', () => {
    expect(markdownInlineToHtml('a <script>alert(1)</script> & "b"')).toBe(
      'a &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;b&quot;',
    );
  });

  it('returns empty string for nullish input', () => {
    expect(markdownInlineToHtml(undefined)).toBe('');
    expect(markdownInlineToHtml(null)).toBe('');
  });
});

describe('markdownToHtml', () => {
  it('wraps prose in a paragraph with inline formatting', () => {
    expect(markdownToHtml('Hello **world**')).toBe('<p>Hello <strong>world</strong></p>');
  });

  it('renders an unordered list', () => {
    expect(markdownToHtml('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>');
  });

  it('renders an ordered list, preserving a non-default start', () => {
    expect(markdownToHtml('3. three\n4. four')).toBe('<ol start="3"><li>three</li><li>four</li></ol>');
  });

  it('renders nested lists', () => {
    expect(markdownToHtml('- a\n    - b')).toBe('<ul><li>a<ul><li>b</li></ul></li></ul>');
  });

  it('renders fenced code, escaping its contents', () => {
    expect(markdownToHtml('```\n<x> & y\n```')).toBe('<pre><code>&lt;x&gt; &amp; y</code></pre>');
  });

  it('is empty for blank input', () => {
    expect(markdownToHtml('   ')).toBe('');
    expect(markdownToHtml(undefined)).toBe('');
  });
});
