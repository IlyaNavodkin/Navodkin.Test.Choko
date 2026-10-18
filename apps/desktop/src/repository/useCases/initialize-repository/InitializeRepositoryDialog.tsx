import { Alert, Button, Modal } from '@codaa/ui';
import { useTranslation } from 'react-i18next';
import type { RepositoryApiErrorCode } from '../../api/repositoryApi';
export type InitializeRepositoryDialogProps = { open: boolean; isPending: boolean; displayName: string; errorCode: RepositoryApiErrorCode | null; onCancel: () => void; onConfirm: () => void };
export function InitializeRepositoryDialog({ open, isPending, displayName, errorCode, onCancel, onConfirm }: InitializeRepositoryDialogProps) {
  const { t } = useTranslation();
  return <Modal open={open} onOpenChange={(value) => { if (!value && !isPending) onCancel(); }} title={t('repository.initializeTitle')} closeOnBackdrop={false} closable={!isPending}
    actions={<><Button onClick={onCancel} disabled={isPending}>{t('repository.cancelInitialization')}</Button><Button variant="primary" onClick={onConfirm} loading={isPending}>{t('repository.confirmInitialization')}</Button></>}>
    <p><strong>{displayName}</strong></p><p>{t('repository.initializeDescription')}</p>
    <ul><li><code>.casewright/config.yaml</code></li><li><code>.casewright/.gitignore</code></li><li><code>.casewright/runs/.gitkeep</code></li></ul>
    <p>{t('repository.initializeRootWorkspace')}</p>
    {errorCode ? <Alert variant="danger">{t(`repository.errors.${errorCode}`)}</Alert> : null}
  </Modal>;
}
