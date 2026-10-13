import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import type { IconFn } from '@/components/icons';
import { cn } from '@/lib/utils';

/** A single menu entry — shared shape used by the titlebar menus and sidebar menus. */
export interface MenuItem {
  sep?: boolean;
  icon?: IconFn;
  label?: string;
  sub?: string;
  /** Marks a native desktop action (NW.js shell) with a ↗. */
  desktop?: boolean;
  danger?: boolean;
  on?: () => void;
}

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-[71] min-w-[210px] rounded-md border border-border-2 bg-panel p-[5px] shadow-[0_12px_34px_oklch(0.3_0.02_70/0.28),0_2px_6px_oklch(0.3_0.02_70/0.16)] animate-[ctxin_0.1s_ease]',
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { danger?: boolean }
>(({ className, danger, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      'group flex w-full cursor-pointer items-center gap-[9px] rounded-sm px-[9px] py-1.5 text-left text-[12.5px] outline-none',
      danger
        ? 'text-fail data-[highlighted]:bg-fail-soft data-[highlighted]:text-fail'
        : 'text-ink data-[highlighted]:bg-accent-soft data-[highlighted]:text-accent-ink',
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

export const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator ref={ref} className={cn('mx-1.5 my-1 h-px bg-border', className)} {...props} />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

/**
 * Convenience renderer: a trigger + a list of `MenuItem`s. Reproduces the old
 * `.ctx-menu` look. Used by the titlebar menu bar and the sidebar's hover menus.
 */
export function Menu({
  trigger,
  items,
  align = 'start',
  asChild = true,
}: {
  trigger: React.ReactNode;
  items: MenuItem[];
  align?: 'start' | 'center' | 'end';
  asChild?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild={asChild}>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {items.map((it, i) =>
          it.sep ? (
            <DropdownMenuSeparator key={i} />
          ) : (
            <DropdownMenuItem key={i} danger={it.danger} onSelect={() => it.on?.()}>
              {it.icon && (
                <span
                  className={cn(
                    'grid shrink-0 place-items-center',
                    it.danger ? 'text-fail' : 'text-ink-3 group-data-[highlighted]:text-accent-ink',
                  )}
                >
                  {it.icon({ size: 15 })}
                </span>
              )}
              <span className="flex-1">{it.label}</span>
              {it.sub && (
                <span className="max-w-24 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10.5px] text-ink-faint">
                  {it.sub}
                </span>
              )}
              {it.desktop && (
                <span className="text-[11px] text-ink-faint" title="Native desktop action">
                  ↗
                </span>
              )}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
