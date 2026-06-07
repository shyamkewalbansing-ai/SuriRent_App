import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Globale handler voor transiente chunk-load fouten. Code-split chunks
// (lucide-react icons, qrcode.react, etc.) worden lazy geladen — wanneer
// de gebruiker tijdens navigatie de tab sluit/refresht of het netwerk
// hapert (typisch op mobiel/PWA), zien we een "Script error." overlay
// die functioneel niets stuk maakt. We onderdrukken die specifieke
// errors zodat de UI niet onnodig schrikt. ECHTE fouten blijven gewoon
// zichtbaar in de console.
const isChunkLoadFailure = (err) => {
  const msg = String((err && (err.message || err.reason?.message || err.reason)) || err || '');
  return /Loading chunk \d+ failed|ChunkLoadError|Failed to fetch dynamically imported module|net::ERR_ABORTED|importing a module script failed|Script error/i.test(msg);
};
window.addEventListener('error', (e) => {
  if (isChunkLoadFailure(e)) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}, true);
window.addEventListener('unhandledrejection', (e) => {
  if (isChunkLoadFailure(e)) {
    e.preventDefault();
  }
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
