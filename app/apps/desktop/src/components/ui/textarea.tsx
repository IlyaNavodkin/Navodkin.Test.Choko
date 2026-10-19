import type { ComponentPropsWithRef } from 'react';
import { cn } from '@/lib/utils';
import { editorKeyDown } from '@/utils/markdown';
import { controlBase } from './input';

export type TextareaProps = ComponentPropsWithRef<'textarea'>;

export function Textarea({ className, onKeyDown, ...rest }: TextareaProps) {
  return (
    <textarea
      className={cn(controlBase, className)}
      onKeyDown={(e) => {
        if (!editorKeyDown(e)) onKeyDown?.(e);
      }}
      {...rest}
    />
  );
}
