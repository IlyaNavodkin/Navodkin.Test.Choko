import type { ReactNode } from 'react';

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-sm border border-b-2 border-border bg-sunken px-1 py-px font-mono text-[10.5px] leading-none text-ink-3">
      {children}
    </span>
  );
}
