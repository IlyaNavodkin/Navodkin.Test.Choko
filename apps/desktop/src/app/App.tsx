import { QueryClientProvider } from '@tanstack/react-query';
import { BlockingOverlayHost, I18nProvider, ToastHost } from '@codaa/ui';
import { queryClient } from './queryClient';
import { RepositoryBrowserPage } from '../repository/useCases/browse-repository/RepositoryBrowserPage';
import styles from './App.module.css';

export function App() {
  return (
    <I18nProvider language="ru">
      <QueryClientProvider client={queryClient}>
        <div className={styles.app}>
          <RepositoryBrowserPage />
        </div>
        <div className={styles.toasts}><ToastHost /></div>
        <BlockingOverlayHost />
      </QueryClientProvider>
    </I18nProvider>
  );
}
