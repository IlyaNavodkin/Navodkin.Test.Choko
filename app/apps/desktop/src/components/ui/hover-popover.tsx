import { cloneElement, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createHoverIntent } from './hover-intent';

/** Informational popover shared by calendar cells and result segments. Click belongs to the trigger. */
export function HoverPopover({ children, content, className, style, inline = false, interactive = false }: {
  children: ReactElement<{ 'aria-describedby'?: string; 'aria-haspopup'?: 'dialog'; 'aria-expanded'?: boolean }>;
  content: ReactNode;
  className?: string;
  style?: CSSProperties;
  inline?: boolean;
  interactive?: boolean;
}) {
  const id = useId();
  const anchor = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const intent = useMemo(() => createHoverIntent((next) => {
    if (next) setPosition(null);
    setOpen(next);
  }), []);
  useEffect(() => () => intent.dispose(), [intent]);
  useEffect(() => {
    if (!open) return;
    const dismiss = () => intent.dismiss();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') {
      if (panel.current?.contains(document.activeElement)) anchor.current?.querySelector('button')?.focus();
      dismiss();
    } };
    const onScroll = (e: Event) => { if (!(e.target instanceof Node && panel.current?.contains(e.target))) dismiss(); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, intent]);
  useLayoutEffect(() => {
    if (!open || !anchor.current || !panel.current) return;
    const a = anchor.current.getBoundingClientRect();
    const p = panel.current.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(a.left + a.width / 2 - p.width / 2, window.innerWidth - p.width - 8)),
      top: a.top - p.height >= 16 ? a.top - p.height - 8 : Math.min(a.bottom + 8, window.innerHeight - p.height - 8),
    });
  }, [open, content]);
  const Anchor = inline ? 'span' : 'div';
  return <>
    <Anchor ref={(node) => { anchor.current = node; }} className={className} style={style}
      onPointerEnter={() => intent.enter()} onPointerLeave={() => intent.leave()}
      onPointerDownCapture={() => intent.dismiss()} onClickCapture={() => intent.dismiss()}
      onFocusCapture={(e) => { if (e.target instanceof HTMLElement && e.target.matches(':focus-visible')) intent.enter(350); }}
      onBlurCapture={() => intent.leave()}
      onKeyDownCapture={(e) => {
        if (e.key === 'Escape') intent.dismiss();
        if (interactive && open && e.key === 'ArrowDown') { e.preventDefault(); panel.current?.querySelector('button')?.focus(); }
      }}>
      {cloneElement(children, { 'aria-describedby': open ? id : undefined, ...(interactive ? { 'aria-haspopup': 'dialog', 'aria-expanded': open } as const : {}) })}
    </Anchor>
    {open && createPortal(<div ref={panel} id={id} role={interactive ? 'dialog' : 'tooltip'} aria-label={interactive ? 'Reference preview' : undefined}
      onPointerEnter={() => intent.keepOpen()} onPointerLeave={() => { if (!panel.current?.contains(document.activeElement)) intent.leave(); }}
      onFocusCapture={() => intent.keepOpen()} onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) intent.leave(); }}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-[100] w-max max-w-[min(320px,calc(100vw-16px))] rounded-lg border border-border-2 bg-panel p-3 text-[12px] leading-relaxed text-ink shadow-[0_6px_24px_var(--shadow)]"
      style={{ ...position, visibility: position ? 'visible' : 'hidden' }}>{content}</div>, document.body)}
  </>;
}
