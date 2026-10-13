import type { CSSProperties, ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';

export interface ModalProps {
  onClose?: () => void;
  children: ReactNode;
  className?: string;
  maxWidth?: number;
  /** Allow Escape / backdrop click to close (default true). */
  dismissable?: boolean;
}

/**
 * Centered modal over a scrim, built on Radix Dialog. Rendered inline (no Portal)
 * so it stays beneath the frameless titlebar (z-50) exactly like the original scrim,
 * while gaining a focus trap + Escape handling. Clicking the backdrop closes it
 * (unless `dismissable={false}`).
 */
export function Modal({ onClose, children, className, maxWidth, dismissable = true }: ModalProps) {
  const onOpenChange = (open: boolean) => {
    if (!open) onClose?.();
  };
  const guard = dismissable ? undefined : (e: Event) => e.preventDefault();

  return (
    <Dialog.Root open onOpenChange={onOpenChange}>
      <Dialog.Overlay className="absolute inset-0 z-40 grid place-items-center bg-[oklch(0.3_0.02_70/0.32)] p-9 animate-[fade_0.14s_ease]">
        <Dialog.Content
          aria-describedby={undefined}
          onEscapeKeyDown={guard}
          onPointerDownOutside={guard}
          onInteractOutside={guard}
          style={maxWidth ? { maxWidth } : undefined}
          className={cn(
            'flex max-h-[86%] w-full max-w-[560px] flex-col overflow-hidden rounded-lg border border-border-2 bg-panel shadow-[0_24px_64px_oklch(0.3_0.02_70/0.34)] outline-none animate-[pop_0.16s_cubic-bezier(0.2,0.8,0.2,1)]',
            className,
          )}
        >
          <Dialog.Title className="sr-only">Dialog</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog.Root>
  );
}

export function ModalHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-border px-[18px] py-[15px] [&_h3]:m-0 [&_h3]:text-[14.5px] [&_h3]:font-semibold">
      {children}
    </div>
  );
}

export function ModalBody({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={cn('overflow-auto p-[18px]', className)} style={style}>
      {children}
    </div>
  );
}

export function ModalFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-[9px] border-t border-border bg-panel-2 px-[18px] py-[13px]">
      {children}
    </div>
  );
}
