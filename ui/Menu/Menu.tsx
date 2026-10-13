'use client';

import {
  Children,
  createContext,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { clsx as cn } from 'clsx';
import { Popover, PopoverContent } from '../Popover/Popover';
import styles from './Menu.module.css';

export type MenuProps = PropsWithChildren<{
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  anchor?: HTMLElement | null;
  align?: 'start' | 'end';
  width?: number | string;
  className?: string;
}>;

export type MenuTriggerProps = ButtonHTMLAttributes<HTMLButtonElement>;

export type MenuItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  trailing?: ReactNode;
  tone?: 'default' | 'danger';
  disabled?: boolean;
};

export type MenuLabelProps = HTMLAttributes<HTMLDivElement>;

export type MenuSeparatorProps = HTMLAttributes<HTMLDivElement>;

type MenuContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  registerTrigger: (node: HTMLButtonElement | null) => void;
};

const MenuContext = createContext<MenuContextValue | null>(null);

function useMenuContext(componentName: string) {
  const context = useContext(MenuContext);
  if (!context) throw new Error(`${componentName} must be used inside Menu.`);
  return context;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

const DEFAULT_MENU_WIDTH = 246;

/**
 * Dropdown menu built on the shared Popover. A `MenuTrigger` rendered inside
 * toggles it; callers that own their trigger element (a split button caret, for
 * instance) can pass it through `anchor` instead.
 */
export const MenuTrigger = forwardRef<HTMLButtonElement, MenuTriggerProps>(function MenuTrigger(
  { className, onClick, type = 'button', ...props },
  forwardedRef,
) {
  const { open, setOpen, registerTrigger } = useMenuContext('MenuTrigger');

  const setTriggerNode = useCallback(
    (node: HTMLButtonElement | null) => {
      registerTrigger(node);
      assignRef(forwardedRef, node);
    },
    [forwardedRef, registerTrigger],
  );

  return (
    <button
      {...props}
      ref={setTriggerNode}
      type={type}
      aria-haspopup="menu"
      aria-expanded={open}
      className={cn(styles.trigger, className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !props.disabled) setOpen(!open);
      }}
    />
  );
});

/** A single menu action. Renders a real button with `role="menuitem"`. */
export function MenuItem({
  children,
  className,
  disabled = false,
  icon,
  tone = 'default',
  trailing,
  type = 'button',
  onClick,
  ...props
}: MenuItemProps): ReactElement {
  const context = useContext(MenuContext);

  return (
    <button
      {...props}
      type={type}
      role="menuitem"
      disabled={disabled}
      tabIndex={-1}
      className={cn(styles.item, tone === 'danger' && styles.danger, className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) context?.setOpen(false);
      }}
    >
      {icon ? (
        <span aria-hidden="true" className={styles.itemIcon}>
          {icon}
        </span>
      ) : null}
      <span className={styles.itemLabel}>{children}</span>
      {trailing ? (
        <span aria-hidden="true" className={styles.itemTrailing}>
          {trailing}
        </span>
      ) : null}
    </button>
  );
}

/** Section caption inside a menu. */
export function MenuLabel({ className, ...props }: MenuLabelProps): ReactElement {
  return <div {...props} className={cn(styles.label, className)} />;
}

/** Horizontal rule between menu groups. */
export function MenuSeparator({ className, ...props }: MenuSeparatorProps = {}): ReactElement {
  return (
    <div
      {...props}
      aria-hidden="true"
      role="separator"
      className={cn(styles.separator, className)}
    />
  );
}

export function Menu({
  children,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  anchor = null,
  align = 'start',
  width = DEFAULT_MENU_WIDTH,
  className = '',
}: MenuProps): ReactElement | null {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [triggerElement, setTriggerElement] = useState<HTMLButtonElement | null>(null);
  const open = controlledOpen ?? uncontrolledOpen;

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange],
  );

  const registerTrigger = useCallback((node: HTMLButtonElement | null) => {
    setTriggerElement((current) => (current === node ? current : node));
  }, []);

  const contextValue = useMemo<MenuContextValue>(
    () => ({ open, setOpen, registerTrigger }),
    [open, registerTrigger, setOpen],
  );

  const triggers: ReactNode[] = [];
  const items: ReactNode[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === MenuTrigger) triggers.push(child);
    else items.push(child);
  });

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const entries = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
    );
    if (!entries.length) return;

    const origin = event.target instanceof HTMLElement ? event.target : null;
    const index = origin ? entries.indexOf(origin as HTMLButtonElement) : -1;

    const focusAt = (nextIndex: number) => {
      event.preventDefault();
      entries[nextIndex]?.focus();
    };

    if (event.key === 'ArrowDown') focusAt(index < 0 ? 0 : (index + 1) % entries.length);
    else if (event.key === 'ArrowUp') focusAt(index <= 0 ? entries.length - 1 : index - 1);
    else if (event.key === 'Home') focusAt(0);
    else if (event.key === 'End') focusAt(entries.length - 1);
  };

  const resolvedAnchor = anchor ?? triggerElement;

  return (
    <MenuContext.Provider value={contextValue}>
      <Popover
        align={align}
        anchor={resolvedAnchor}
        offset={6}
        open={open}
        placement="bottom"
        onOpenChange={setOpen}
      >
        {triggers}
        <PopoverContent
          autoFocus
          aria-orientation="vertical"
          className={cn(styles.menu, className)}
          role="menu"
          style={{ width: typeof width === 'number' ? `${width}px` : width }}
          onKeyDown={handleKeyDown}
        >
          {items}
        </PopoverContent>
      </Popover>
    </MenuContext.Provider>
  );
}
