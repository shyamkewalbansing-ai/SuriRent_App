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
//
// EXTRA: wanneer een chunk FOUT laadt (typisch na een deploy waar de
// chunk-hashes veranderd zijn en de gebruiker nog een oude bundle.js
// heeft) doen we automatisch ÉÉN hard-refresh. Een vlag in
// sessionStorage voorkomt een reload-loop als het probleem aanhoudt.
const isChunkLoadFailure = (err) => {
  const msg = String((err && (err.message || err.reason?.message || err.reason)) || err || '');
  return /Loading chunk \S+ failed|ChunkLoadError|Failed to fetch dynamically imported module|net::ERR_ABORTED|importing a module script failed|Script error|Unexpected token '<'|SyntaxError: Unexpected token/i.test(msg);
};

const RELOAD_FLAG = 'chunkReloadAttempted';
const tryReloadOnce = () => {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG) === '1') return;
    sessionStorage.setItem(RELOAD_FLAG, '1');
    // Kleine vertraging zodat de huidige render-cycle eerst afmaakt
    setTimeout(() => { window.location.reload(); }, 250);
  } catch (err) {
    // sessionStorage kan disabled zijn (private mode) — niets te doen
    console.warn('Could not record reload attempt', err);
  }
};
// Reset de reload-vlag wanneer de app succesvol stabiel draait (na 8s)
setTimeout(() => {
  try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* noop */ }
}, 8000);

window.addEventListener('error', (e) => {
  if (isChunkLoadFailure(e)) {
    e.preventDefault();
    e.stopImmediatePropagation();
    tryReloadOnce();
  }
}, true);
window.addEventListener('unhandledrejection', (e) => {
  if (isChunkLoadFailure(e)) {
    e.preventDefault();
    tryReloadOnce();
  }
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
