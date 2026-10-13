'use client';

import { useMemo } from 'react';
import MarkdownIt from 'markdown-it';
import styles from './Markdown.module.css';

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

export type MarkdownProps = {
  content: string;
  className?: string;
};

/** Renders safe markdown (no raw HTML) for release notes and similar content. */
export function Markdown({ content, className }: MarkdownProps) {
  const html = useMemo(() => markdown.render(content || ''), [content]);

  return (
    <article
      className={`${styles.markdown} ${className ?? ''}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
