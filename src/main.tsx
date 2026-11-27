import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './rustic.css';
import { registerSW } from './features/settings/pwa';
import { startSync } from './lib/sync';
import { requestPersistentStorage } from './lib/backup';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

registerSW();
startSync();
// Ask the browser not to clear our data under storage pressure (iOS evicts unprotected sites).
void requestPersistentStorage();
