import { createRoot } from 'react-dom/client';
import { I18nProvider } from '@codaa/ui';
import '@codaa/ui/theme/tokens.css';
import { App } from './app/App';

createRoot(document.getElementById('root')!).render(<I18nProvider language="ru"><App /></I18nProvider>);
