import React from 'react';
import ReactDOM from 'react-dom/client';
import '../shared/i18n/i18n';
import '@codaa/ui/theme/tokens.css';
import './global.css';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
