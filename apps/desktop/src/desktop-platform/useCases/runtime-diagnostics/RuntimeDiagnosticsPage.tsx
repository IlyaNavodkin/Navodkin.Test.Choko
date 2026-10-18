import { useTranslation } from 'react-i18next';
import { Alert, Badge, Button, EmptyState, LoadingState } from '@codaa/ui';
import { useRuntimeDiagnostics } from './useRuntimeDiagnostics';
import styles from './RuntimeDiagnosticsPage.module.css';

export function RuntimeDiagnosticsPage() {
  const { t } = useTranslation();
  const runtime = useRuntimeDiagnostics({});

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brandMark} aria-hidden="true">T</div>
        <div className={styles.brandCopy}>
          <h1>{t('app.name')}</h1>
          <p>{t('app.tagline')}</p>
        </div>
        <Badge variant="brand">{t('app.foundation')}</Badge>
      </header>

      <section className={styles.workspace} aria-labelledby="workspace-title">
        <EmptyState
          title={t('app.workspaceTitle')}
          description={t('app.workspaceDescription')}
          aria-label={t('app.workspaceTitle')}
        />
      </section>

      <section className={styles.diagnostics} aria-labelledby="diagnostics-title">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="diagnostics-title">{t('app.diagnosticsTitle')}</h2>
            <p>{t('app.diagnosticsDescription')}</p>
          </div>
          {runtime.diagnostics ? <Badge variant="success">{t('app.runtimeReady')}</Badge> : null}
        </div>

        {runtime.isLoading ? (
          <LoadingState title={t('app.checking')} />
        ) : null}

        {!runtime.isNativeRuntime ? (
          <EmptyState
            title={t('app.unsupportedTitle')}
            description={t('app.unsupportedDescription')}
            className={styles.unsupported}
          />
        ) : null}

        {runtime.isError ? (
          <Alert
            variant="danger"
            action={
              <Button size="sm" onClick={runtime.retry} loading={runtime.isRetrying}>
                {t('app.retry')}
              </Button>
            }
          >
            <strong>{t('app.errorTitle')}</strong>
            <p className={styles.errorDescription}>
              {t(`app.errors.${runtime.error?.code ?? 'NATIVE_COMMAND_FAILED'}`)}
            </p>
          </Alert>
        ) : null}

        {runtime.diagnostics ? (
          <dl className={styles.details}>
            <div><dt>{t('app.version')}</dt><dd>{runtime.diagnostics.appVersion}</dd></div>
            <div>
              <dt>{t('app.platform')}</dt>
              <dd>{t(`app.platforms.${runtime.diagnostics.platform}`)}</dd>
            </div>
            <div>
              <dt>{t('app.architecture')}</dt>
              <dd>{t(`app.architectures.${runtime.diagnostics.architecture}`)}</dd>
            </div>
          </dl>
        ) : null}
      </section>
    </main>
  );
}
