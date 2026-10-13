'use client';

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type MutableRefObject,
  type PropsWithChildren,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './Popover.module.css';

export type PopoverPlacement = 'top' | 'bottom';
export type PopoverAlign = 'start' | 'center' | 'end';

export type PopoverProps = PropsWithChildren<{
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional anchor for composite controls that cannot render PopoverTrigger directly. */
  anchor?: HTMLElement | null;
  placement?: PopoverPlacement;
  align?: PopoverAlign;
  offset?: number;
  /** Keeps the content exactly as wide as its trigger. Useful for select menus. */
  matchAnchorWidth?: boolean;
}>;

type PopoverContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: MutableRefObject<HTMLElement | null>;
  contentRef: MutableRefObject<HTMLDivElement | null>;
  contentId: string;
  placement: PopoverPlacement;
  align: PopoverAlign;
  offset: number;
  matchAnchorWidth: boolean;
};

type PopoverPosition = {
  top: number;
  left: number;
  placement: PopoverPlacement;
};

const VIEWPORT_PADDING = 8;
const PopoverContext = createContext<PopoverContextValue | null>(null);

function usePopoverContext(componentName: string) {
  const context = useContext(PopoverContext);
  if (!context) throw new Error(`${componentName} must be used inside Popover.`);
  return context;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

function alignedLeft(anchor: DOMRect, contentWidth: number, align: PopoverAlign) {
  if (align === 'start') return anchor.left;
  if (align === 'end') return anchor.right - contentWidth;
  return anchor.left + (anchor.width - contentWidth) / 2;
}

export function calculatePopoverPosition({
  anchor,
  contentWidth,
  contentHeight,
  placement,
  align,
  offset,
  viewportWidth,
  viewportHeight,
}: {
  anchor: Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left' | 'width'>;
  contentWidth: number;
  contentHeight: number;
  placement: PopoverPlacement;
  align: PopoverAlign;
  offset: number;
  viewportWidth: number;
  viewportHeight: number;
}): PopoverPosition {
  const bottomTop = anchor.bottom + offset;
  const topTop = anchor.top - contentHeight - offset;
  const bottomFits = bottomTop + contentHeight <= viewportHeight - VIEWPORT_PADDING;
  const topFits = topTop >= VIEWPORT_PADDING;
  const resolvedPlacement =
    placement === 'bottom'
      ? bottomFits || !topFits
        ? 'bottom'
        : 'top'
      : topFits || !bottomFits
        ? 'top'
        : 'bottom';
  const unclampedLeft = alignedLeft(anchor as DOMRect, contentWidth, align);
  const maxLeft = Math.max(VIEWPORT_PADDING, viewportWidth - contentWidth - VIEWPORT_PADDING);

  return {
    top: Math.max(VIEWPORT_PADDING, resolvedPlacement === 'bottom' ? bottomTop : topTop),
    left: Math.min(Math.max(VIEWPORT_PADDING, unclampedLeft), maxLeft),
    placement: resolvedPlacement,
  };
}

export function Popover({
  children,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  anchor = null,
  placement = 'bottom',
  align = 'center',
  offset = 8,
  matchAnchorWidth = false,
}: PopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const triggerRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const contentId = `popover-${reactId.replace(/:/g, '')}`;
  if (anchor) triggerRef.current = anchor;

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange],
  );

  const value = useMemo<PopoverContextValue>(
    () => ({
      open,
      setOpen,
      triggerRef,
      contentRef,
      contentId,
      placement,
      align,
      offset,
      matchAnchorWidth,
    }),
    [align, contentId, matchAnchorWidth, offset, open, placement, setOpen],
  );

  return <PopoverContext.Provider value={value}>{children}</PopoverContext.Provider>;
}

export const PopoverTrigger = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>(function PopoverTrigger(
  { className = '', onClick, type = 'button', 'aria-haspopup': ariaHasPopup = 'dialog', ...props },
  forwardedRef,
) {
  const { open, setOpen, triggerRef, contentId } = usePopoverContext('PopoverTrigger');

  return (
    <button
      {...props}
      ref={(node) => {
        triggerRef.current = node;
        assignRef(forwardedRef, node);
      }}
      type={type}
      className={`${styles.trigger} ${className}`.trim()}
      aria-haspopup={ariaHasPopup}
      aria-expanded={open}
      aria-controls={contentId}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !props.disabled) setOpen(!open);
      }}
    />
  );
});

export type PopoverContentProps = HTMLAttributes<HTMLDivElement> & {
  autoFocus?: boolean;
};

export const PopoverContent = forwardRef<HTMLDivElement, PopoverContentProps>(
  function PopoverContent(
    { children, className = '', style, autoFocus = true, role = 'dialog', ...props },
    forwardedRef,
  ) {
    const {
      open,
      setOpen,
      triggerRef,
      contentRef,
      contentId,
      placement,
      align,
      offset,
      matchAnchorWidth,
    } = usePopoverContext('PopoverContent');
    const [position, setPosition] = useState<PopoverPosition | null>(null);

    const updatePosition = useCallback(() => {
      const trigger = triggerRef.current;
      const content = contentRef.current;
      if (!trigger || !content) return;
      const anchor = trigger.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      setPosition(
        calculatePopoverPosition({
          anchor,
          contentWidth: contentRect.width,
          contentHeight: contentRect.height,
          placement,
          align,
          offset,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        }),
      );
    }, [align, contentRef, offset, placement, triggerRef]);

    useLayoutEffect(() => {
      if (!open) {
        setPosition(null);
        return;
      }
      updatePosition();
      const content = contentRef.current;
      if (!content) return;
      const resizeObserver = new ResizeObserver(updatePosition);
      resizeObserver.observe(content);
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        resizeObserver.disconnect();
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }, [contentRef, open, updatePosition]);

    useEffect(() => {
      if (!open) return;

      const handlePointerDown = (event: PointerEvent) => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (contentRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
        setOpen(false);
      };
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      };

      document.addEventListener('pointerdown', handlePointerDown, true);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('pointerdown', handlePointerDown, true);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [contentRef, open, setOpen, triggerRef]);

    useEffect(() => {
      if (!open || !autoFocus) return;
      const frame = requestAnimationFrame(() => {
        const focusable = contentRef.current?.querySelector<HTMLElement>(
          '[data-autofocus], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        );
        (focusable ?? contentRef.current)?.focus();
      });
      return () => cancelAnimationFrame(frame);
    }, [autoFocus, contentRef, open]);

    if (!open || typeof document === 'undefined') return null;

    const positionStyle: CSSProperties = {
      ...style,
      top: position?.top ?? 0,
      left: position?.left ?? 0,
      width: matchAnchorWidth ? triggerRef.current?.getBoundingClientRect().width : style?.width,
      visibility: position ? 'visible' : 'hidden',
    };

    return createPortal(
      <div
        {...props}
        ref={(node) => {
          contentRef.current = node;
          assignRef(forwardedRef, node);
        }}
        id={contentId}
        role={role}
        tabIndex={-1}
        className={`${styles.content} ${className}`.trim()}
        data-placement={position?.placement ?? placement}
        style={positionStyle}
      >
        {children}
      </div>,
      document.body,
    );
  },
);
