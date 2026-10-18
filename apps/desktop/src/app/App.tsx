import { QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@codaa/ui';
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
      </QueryClientProvider>
    </I18nProvider>
  );
}
