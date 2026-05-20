import { useEffect, useState } from 'react';
import { X, Share, Plus } from 'lucide-react';

/**
 * Registers the service worker on mount.
 * Returns nothing visible; safe in production preview environments where
 * SW may not be available (silently no-ops).
 */
export function useRegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // Register on window load so we don't compete with critical render.
    const onReady = () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
    };
    if (document.readyState === 'complete') onReady();
    else window.addEventListener('load', onReady, { once: true });
  }, []);
}

const DISMISS_KEY = 'surirent_pwa_install_dismissed_at';
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isIpadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isIos || isIpadOS;
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

/**
 * Lightweight "Add to Home Screen" prompt.
 * - On Android/desktop Chromium: listens to beforeinstallprompt and shows a CTA
 *   that triggers the native install prompt.
 * - On iOS Safari (no beforeinstallprompt): shows the Share → Add to Home Screen tip.
 * - Hidden when already installed or recently dismissed.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    const dismissed = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
    if (dismissed && Date.now() - dismissed < DISMISS_TTL_MS) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferred(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS doesn't fire beforeinstallprompt — show after a short delay if iOS Safari.
    let timer;
    if (isIOS()) {
      timer = setTimeout(() => setShow(true), 4000);
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const close = () => {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  const triggerInstall = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => {});
    setDeferred(null);
    setShow(false);
  };

  if (!show) return null;
  const ios = isIOS();

  return (
    <div className="fixed left-3 right-3 bottom-3 md:left-auto md:right-6 md:bottom-6 md:max-w-sm z-[60] bg-white rounded-2xl border-2 border-[#FF5C00] shadow-[0_14px_40px_-10px_rgba(255,92,0,0.5)] p-4 animate-slide-up"
      data-testid="pwa-install-prompt">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] p-1.5 shrink-0">
          <img src="/kiosk-icons/kiosk-512.png" alt="SuriRent" className="w-full h-full object-contain" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-slate-900 leading-tight">Installeer SuriRent</p>
          {ios ? (
            <p className="text-xs text-slate-600 mt-1 leading-snug">
              Tik op <Share className="inline w-3.5 h-3.5 -mt-0.5 text-[#FF5C00]" /> Delen
              {' '}en kies <span className="font-bold">"Zet op beginscherm"</span> om SuriRent als app te gebruiken.
            </p>
          ) : (
            <p className="text-xs text-slate-600 mt-1 leading-snug">
              Voeg SuriRent toe aan je startscherm voor sneller toegang — werkt ook offline.
            </p>
          )}
          {!ios && (
            <button onClick={triggerInstall} data-testid="pwa-install-btn"
              className="mt-3 inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-[#FF5C00] hover:bg-[#E05200] text-white text-xs font-bold">
              <Plus className="w-3.5 h-3.5" /> Installeren
            </button>
          )}
        </div>
        <button onClick={close} data-testid="pwa-install-close"
          className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center shrink-0">
          <X className="w-4 h-4 text-slate-500" />
        </button>
      </div>
    </div>
  );
}
