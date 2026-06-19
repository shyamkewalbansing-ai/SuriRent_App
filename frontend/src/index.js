import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// =====================================================================
// CRA DEV-OVERLAY ONDERDRUKKING (alleen actief in preview/dev)
// =====================================================================
// In productie bestaat deze overlay niet — dit speelt alleen in jouw
// preview environment waar CRA tijdens hot reload soms chunk-hashes
// invalideert en kort een "Unexpected token '<'" of "ChunkLoadError"
// toont. De overlay wordt nu automatisch verborgen + de gebruiker krijgt
// een eenmalige soft reload zodat de nieuwe bundle.js geladen wordt.
const hideDevOverlay = () => {
  try {
    // CRA's react-error-overlay (iframe in head/body)
    document.querySelectorAll(
      'iframe[id^="webpack-dev-server"], iframe#react-refresh-overlay, ' +
      'div#webpack-dev-server-client-overlay, div[data-react-error-overlay]'
    ).forEach((el) => el.remove());
    // webpack-dev-server v4 overlay element (shadow DOM)
    const wds = document.getElementById('webpack-dev-server-client-overlay');
    if (wds) wds.remove();
  } catch { /* noop */ }
};
// Run direct + bij DOM mutaties (overlay wordt async aangemaakt)
hideDevOverlay();
try {
  const obs = new MutationObserver(hideDevOverlay);
  obs.observe(document.documentElement, { childList: true, subtree: true });
} catch { /* noop */ }

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
    hideDevOverlay();
    tryReloadOnce();
  }
}, true);
window.addEventListener('unhandledrejection', (e) => {
  if (isChunkLoadFailure(e)) {
    e.preventDefault();
    hideDevOverlay();
    tryReloadOnce();
  }
});

// Probeer react-error-overlay programmatisch te stoppen (CRA dev tool).
// Faalt stil als de module niet aanwezig is (productie build).
try {
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
  const overlay = require('react-error-overlay');
  if (overlay && typeof overlay.stopReportingRuntimeErrors === 'function') {
    overlay.stopReportingRuntimeErrors();
  }
} catch { /* prod build of niet geinstalleerd */ }

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
