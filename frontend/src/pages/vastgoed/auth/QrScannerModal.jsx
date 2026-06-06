import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Check, Camera, QrCode, X as XIcon } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { api, formatError } from '../../../lib/api';

// =============================================================================
// QrScannerModal — opent de camera om een QR code te scannen.
// Bij detectie haalt het de `token` query parameter uit de URL en roept
// `/api/auth/qr/claim/{token}` aan zodat de desktop sessie wordt ingelogd.
// =============================================================================
function QrScannerModal({ onClose, primary = '#FF5C00' }) {
  const [status, setStatus] = useState('idle');  // idle | scanning | claiming | success | error
  const [message, setMessage] = useState('');
  const scannerRef = useRef(null);
  // resolvedRef = true zodra we EEN resultaat hebben (success of expliciete
  // error). Hierna negeren we eventuele aborted-promises van scanner.start()
  // zodat de gebruiker geen valse "camera kan niet starten" melding krijgt
  // nadat de QR-claim al was geslaagd.
  const resolvedRef = useRef(false);

  const stopScanner = useCallback(async () => {
    try { await scannerRef.current?.stop(); } catch { /* ignore */ }
    try { scannerRef.current?.clear(); } catch { /* ignore */ }
    scannerRef.current = null;
  }, []);

  const handleScan = useCallback(async (decoded) => {
    if (status !== 'scanning') return;
    setStatus('claiming');
    await stopScanner();
    try {
      // Extract token from URL like https://app.surirent.sr/qr-link?token=XXX
      let token = decoded;
      try {
        const u = new URL(decoded);
        token = u.searchParams.get('token') || decoded;
      } catch { /* not a URL — assume raw token */ }
      // Bouw headers: gebruik bearer-auth als beschikbaar, anders fallback
      // op device-qr-token (long-lived, alleen QR-claim). Hiermee werkt
      // scannen vanaf PWA ook wanneer admin_token is verlopen.
      const headers = {};
      try {
        const dqt = localStorage.getItem('device_qr_token');
        if (dqt) headers['X-Device-QR-Token'] = dqt;
      } catch { /* ignore */ }
      await api.post(`/auth/qr/claim/${encodeURIComponent(token)}`, undefined, { headers });
      resolvedRef.current = true;
      setStatus('success');
      setMessage('Desktop sessie ingelogd!');
      setTimeout(onClose, 1500);
    } catch (e) {
      resolvedRef.current = true;
      setStatus('error');
      setMessage(formatError(e, 'QR sessie kon niet worden geclaimd. Log eerst in op de PWA om scannen te activeren.'));
    }
  }, [status, stopScanner, onClose]);

  useEffect(() => {
    let cancelled = false;
    let scanner = null;
    // PRIORITY 1: Als er al een device_qr_token in localStorage staat, en
    // we kennen een desktop QR token (URL param of vooraf doorgegeven),
    // dan zou een direct-claim al hebben moeten plaatsvinden in QrLinkPage.
    // Hier in de Scanner-modal hebben we GEEN voor-gescande token, dus we
    // moeten altijd de camera openen. We voorkomen wel valse error-toasts
    // wanneer claim al succes was.
    (async () => {
      try {
        // Probeer eerst beschikbare camera's op te halen — dit triggert
        // de permissie-prompt op iOS Safari op een betrouwbare manier.
        let cameras = [];
        try {
          cameras = await Html5Qrcode.getCameras();
        } catch (e) {
          if (cancelled) return;
          setStatus('error');
          setMessage('Geen camera toegang. Sta camera toe in de browser-instellingen en probeer opnieuw.');
          return;
        }
        if (cancelled) return;
        if (!cameras || cameras.length === 0) {
          setStatus('error');
          setMessage('Geen camera gevonden op dit apparaat.');
          return;
        }
        // Kies de achterste camera als beschikbaar (label bevat 'back' of 'environment').
        const back = cameras.find((c) => /back|environment|rear/i.test(c.label || ''));
        const cameraId = (back || cameras[cameras.length - 1] || cameras[0]).id;

        scanner = new Html5Qrcode('qr-reader', { verbose: false });
        scannerRef.current = scanner;
        setStatus('scanning');
        await scanner.start(
          cameraId,
          { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1.0 },
          handleScan,
          () => { /* silent decode-failure ignore */ },
        );
      } catch (e) {
        // Cleanup-aborts (component unmount / handleScan stopt scanner) zijn
        // GEEN echte fouten — we negeren ze. Anders krijgt de gebruiker een
        // valse "camera kan niet starten" melding ondanks dat de QR al
        // succesvol is geclaimed.
        if (cancelled) return;
        // Reeds afgehandeld door handleScan (success of expliciete error) —
        // niet overschrijven met de aborted-promise van scanner.start().
        if (resolvedRef.current) return;
        const msg = (e && e.message) || String(e || '');
        if (/aborted|stopped|interrupt/i.test(msg)) {
          // Camera was bewust gestopt (door handleScan-success of unmount).
          return;
        }
        setStatus('error');
        if (/NotAllowedError|Permission/i.test(msg)) {
          setMessage('Camera toegang geweigerd. Sta camera toe en herlaad de pagina.');
        } else if (/NotFoundError/i.test(msg)) {
          setMessage('Geen camera gevonden op dit apparaat.');
        } else if (/NotReadableError/i.test(msg)) {
          setMessage('Camera is in gebruik door een andere app. Sluit andere camera-apps en probeer opnieuw.');
        } else {
          setMessage('Camera kon niet starten. Probeer opnieuw of gebruik de native camera-app om de QR te scannen.');
        }
      }
    })();
    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [handleScan, stopScanner]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
      data-testid="qr-scanner-modal">
      <div className="relative w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: `${primary}15` }}>
              <QrCode className="w-5 h-5" style={{ color: primary }} />
            </span>
            <h3 className="text-base font-black text-slate-900">QR scannen</h3>
          </div>
          <button onClick={onClose} data-testid="qr-scanner-close"
            className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500">
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">
          {status === 'error' ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-red-50 flex items-center justify-center">
                <XIcon className="w-7 h-7 text-red-500" />
              </div>
              <p className="text-sm font-bold text-slate-900">{message}</p>
              <button onClick={onClose}
                className="mt-5 px-5 h-10 rounded-lg text-white text-sm font-bold"
                style={{ background: primary }}>
                Sluiten
              </button>
            </div>
          ) : status === 'success' ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-emerald-50 flex items-center justify-center">
                <Check className="w-7 h-7 text-emerald-600" strokeWidth={3} />
              </div>
              <p className="text-sm font-black text-slate-900">{message}</p>
              <p className="text-xs text-slate-500 mt-1">U kunt nu uw desktop gebruiken.</p>
            </div>
          ) : (
            <>
              <p className="text-xs font-bold text-slate-500 text-center mb-3">
                Richt de camera op de QR-code op uw desktop scherm
              </p>
              <div id="qr-reader" className="w-full rounded-2xl overflow-hidden bg-slate-900 aspect-square" />
              {status === 'claiming' && (
                <div className="mt-4 flex items-center justify-center gap-2 text-slate-700">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm font-bold">Inloggen op desktop…</span>
                </div>
              )}
              {status === 'scanning' && (
                <p className="mt-4 text-center text-xs text-slate-400 font-medium">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1.5" />
                  Camera actief — scannen…
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// QrLoginTab — toont een QR code die door een mobiele admin gescand kan
// worden om deze desktop sessie in te loggen. Polt status elke 2s.
// =============================================================================

export default QrScannerModal;
