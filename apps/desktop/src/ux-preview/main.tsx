import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from '@codaa/ui';
import '@codaa/ui/theme/tokens.css';
import { ExploreDesignPage } from './useCases/explore-design/ExploreDesignPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode><I18nProvider><ExploreDesignPage /></I18nProvider></StrictMode>,
);
