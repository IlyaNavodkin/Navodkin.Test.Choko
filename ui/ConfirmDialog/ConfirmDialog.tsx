'use client';

import type { ReactNode } from 'react';
import { Button } from '../Button/Button';
import { Modal } from '../Modal/Modal';
import { useI18n } from '../i18n/provider';
import styles from './ConfirmDialog.module.css';

export type ConfirmDialogTone = 'default' | 'danger';

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
};

/** Confirmation dialog built on Modal for destructive or irreversible actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const resolvedConfirm = confirmLabel ?? t('confirm');
  const resolvedCancel = cancelLabel ?? t('cancel');

  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      maxWidth="24rem"
      closeOnBackdrop={!loading}
      closable={!loading}
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            disabled={loading}
            onClick={() => onOpenChange(false)}
          >
            {resolvedCancel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="sm"
            loading={loading}
            onClick={() => void handleConfirm()}
          >
            {resolvedConfirm}
          </Button>
        </>
      }
    >
      {description ? <p className={styles.description}>{description}</p> : null}
    </Modal>
  );
}
