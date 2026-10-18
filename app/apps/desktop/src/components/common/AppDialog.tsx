import { I } from '@/components/icons';
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app-store';

/**
 * The single host for the app's generic confirm/alert dialogs (Radix Dialog),
 * replacing the browser's native `window.confirm`/`window.alert`. Driven by the
 * store's `dialog` request; `closeDialog(result)` resolves the pending promise
 * (true = primary action, false = cancel/dismiss).
 */
export function AppDialog() {
  const { dialog, closeDialog } = useApp();
  if (!dialog) return null;

  const isConfirm = dialog.kind === 'confirm';
  const danger = !!dialog.danger;
  const cancel = () => closeDialog(false);
  const accept = () => closeDialog(true);

  return (
    <Modal onClose={cancel} maxWidth={420}>
      <ModalHeader>
        <span className={cn('grid place-items-center', danger ? 'text-fail' : 'text-accent')}>
          {I.warn({ size: 18 })}
        </span>
        <h3>{dialog.title}</h3>
      </ModalHeader>
      {dialog.message && (
        <ModalBody className="whitespace-pre-line text-[13px] leading-relaxed text-ink-2">
          {dialog.message}
        </ModalBody>
      )}
      <ModalFooter>
        {isConfirm && (
          <Button variant="ghost" onClick={cancel}>
            {dialog.cancelLabel ?? 'Cancel'}
          </Button>
        )}
        <Button
          variant={danger ? 'danger' : 'primary'}
          className={danger ? 'border-fail bg-fail text-white hover:bg-fail hover:opacity-90' : undefined}
          onClick={accept}
          autoFocus
        >
          {dialog.confirmLabel ?? (isConfirm ? 'Confirm' : 'OK')}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
