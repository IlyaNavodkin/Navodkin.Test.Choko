import type { ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';
export type ButtonSize = 'default' | 'sm';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md border font-medium transition duration-[120ms] disabled:opacity-45 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'bg-panel text-ink border-border-2 hover:bg-raise active:bg-sunken',
        primary:
          'bg-accent text-accent-fg border-accent-press shadow-[0_1px_1px_oklch(0.3_0.05_256/0.2)] hover:bg-accent-press active:bg-accent-press',
        ghost: 'bg-transparent text-ink border-transparent hover:bg-raise active:bg-sunken',
        danger: 'bg-panel text-fail border-border-2 hover:bg-fail-soft hover:border-fail',
      },
      size: {
        default: 'h-7 gap-1.5 text-[12.5px] [&_svg]:size-3.5',
        sm: 'h-6 gap-1 text-[12px] [&_svg]:size-[13px]',
      },
      icon: { true: 'p-0', false: '' },
    },
    compoundVariants: [
      { icon: false, size: 'default', class: 'px-[11px]' },
      { icon: false, size: 'sm', class: 'px-2' },
      { icon: true, size: 'default', class: 'w-7' },
      { icon: true, size: 'sm', class: 'w-6' },
    ],
    defaultVariants: { variant: 'default', size: 'default', icon: false },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    Omit<VariantProps<typeof buttonVariants>, 'icon'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square icon-only button. */
  icon?: boolean;
}

/**
 * The base button. shadcn/CVA variants mapped from the original `.btn` classes:
 *   <Button variant="primary">             → .btn.primary
 *   <Button variant="ghost" size="sm" icon> → .btn.ghost.sm.icon
 */
export function Button({
  variant = 'default',
  size = 'default',
  icon = false,
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size, icon }), className)} {...rest} />
  );
}
