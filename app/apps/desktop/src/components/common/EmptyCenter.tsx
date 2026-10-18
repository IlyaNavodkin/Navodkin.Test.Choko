import { I } from '@/components/icons';
import { Button } from '@/components/ui';
import { useApp } from '@/store/app-store';

export function EmptyCenter() {
  const { createCase } = useApp();
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel">
      <div className="grid flex-1 place-items-center text-ink-faint">
        <div className="flex flex-col items-center gap-2.5 text-center">
          {I.file({ size: 30, style: { color: 'var(--ink-faint)' } })}
          <div className="text-[14px] text-ink-3">Select a case from the tree, or create a new one.</div>
          <Button variant="primary" onClick={() => createCase(null)}>
            {I.plus({ size: 14 })} New case
          </Button>
        </div>
      </div>
    </div>
  );
}
