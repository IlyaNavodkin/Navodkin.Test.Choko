import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { positionEditorOverlay, type EditorOverlayPosition, type OverlayRect } from './overlayPosition';
import styles from './SectionMarkdownEditor.module.css';

function visibleBounds(element: HTMLElement): OverlayRect {
  const viewport = window.visualViewport;
  const bounds = { left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0, right: (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth), bottom: (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) };
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent); const rect = parent.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { bounds.top = Math.max(bounds.top, rect.top); bounds.bottom = Math.min(bounds.bottom, rect.bottom); }
    if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { bounds.left = Math.max(bounds.left, rect.left); bounds.right = Math.min(bounds.right, rect.right); }
  }
  return bounds;
}

/** Portalled fixed UI escapes scroll clipping; all coordinates remain viewport based. */
export function EditorFloating({ editor, owner, kind, children }: { editor: Editor; owner: string; kind: 'slash' | 'bubble'; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<EditorOverlayPosition | null>(null);
  useLayoutEffect(() => {
    const popup = root.current;
    const selected = popup?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!popup || !selected) return;
    if (selected.offsetTop < popup.scrollTop) popup.scrollTop = selected.offsetTop;
    else if (selected.offsetTop + selected.offsetHeight > popup.scrollTop + popup.clientHeight) popup.scrollTop = selected.offsetTop + selected.offsetHeight - popup.clientHeight;
  });
  useLayoutEffect(() => {
    let frame = 0;
    function update() {
      const popup = root.current; if (!popup || editor.isDestroyed) return;
      try {
        const anchor = editor.view.coordsAtPos(editor.state.selection.head);
        const editorRect = editor.view.dom.getBoundingClientRect(); const bounds = visibleBounds(editor.view.dom);
        // Do not pin UI to the edge after its caret has scrolled out of view.
        if (anchor.bottom < Math.max(bounds.top, editorRect.top) || anchor.top > Math.min(bounds.bottom, editorRect.bottom)) { setPosition(null); return; }
        const rect = popup.getBoundingClientRect();
        const next = positionEditorOverlay({ anchor, width: rect.width, height: popup.scrollHeight, bounds, preferred: kind === 'bubble' ? 'top' : 'bottom' });
        setPosition((old) => old && Object.keys(next).every((key) => old[key as keyof EditorOverlayPosition] === next[key as keyof EditorOverlayPosition]) ? old : next);
      } catch { setPosition(null); }
    }
    function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); }
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (root.current) observer?.observe(root.current);
    observer?.observe(editor.view.dom);
    editor.on('transaction', schedule);
    window.addEventListener('scroll', schedule, true); window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule); window.visualViewport?.addEventListener('scroll', schedule);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); editor.off('transaction', schedule); window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule); };
  }, [editor, kind]);
  return createPortal(<div ref={root} className={`${styles.floating} ${kind === 'slash' ? styles.slashFloating : styles.bubbleFloating}`} data-section-floating={owner} data-overlay={kind}
    style={position ? { ...position, visibility: position.maxHeight > 0 ? 'visible' : 'hidden' } : { visibility: 'hidden' }}>{children}</div>, document.body);
}
