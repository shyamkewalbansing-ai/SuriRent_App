import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBrandedNavigate } from '../../lib/branded-nav';
import { RESERVED_SLUGS } from '../../lib/branded-nav';
import { Loader2, Delete, KeyRound, ArrowLeft, ArrowRight, Eye, EyeOff, UserPlus, LogIn, Check, CheckCircle, Globe, X as XIcon, QrCode, HelpCircle, Camera, Smartphone, Sparkles, Star, ShieldCheck, Zap, ChevronDown } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import { api, formatError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { setPreferredRole, isStandalonePWA, getPreferredRole, routeForRole } from '../../lib/pwaRole';
import { setKioskEmployee, clearKioskEmployee } from '../../components/KioskEmployee';
import {
  detectCompanySlug, fetchBranding, fetchBrandingByHost, applyBranding,
  resolveLogoUrl, readCachedBranding, clearBrandingCache,
} from '../../lib/branding';
import { useIsMobile } from '../../lib/use-is-mobile';
import { MobileEmailLogin } from '../../components/MobileAuthShell';

function Clock() {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  // Suriname tijdzone (America/Paramaribo, UTC-3) — overschrijft de
  // browser-locale zodat de klok altijd lokale Surinaamse tijd toont,
  // ook als de gebruiker reist of een internationaal apparaat gebruikt.
  const TZ = 'America/Paramaribo';
  return (
    <div className="text-right" data-testid="kiosk-clock">
      <p className="font-bold text-white tracking-tight leading-none" style={{ fontSize: 'clamp(13px, 1.8vh, 22px)' }}>
        {t.toLocaleTimeString('nl-NL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })}
      </p>
      <p className="text-white/80 capitalize" style={{ fontSize: 'clamp(9px, 1.2vh, 13px)', marginTop: '1px' }}>
        {t.toLocaleDateString('nl-NL', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' })}
      </p>
    </div>
  );
}

function Header({ branding }) {
  const appName = branding?.app_name || 'Vastgoed Kiosk';
  const tagline = branding?.tagline || 'Beheer & Kiosk toegang';
  const logo = branding?._logoResolved || '/kiosk-icons/kiosk-192.png';
  return (
    <div className="flex items-center justify-between shrink-0"
      style={{ padding: 'clamp(6px, 1.2vh, 16px) clamp(12px, 4vw, 32px)' }}>
      <div className="flex items-center" style={{ gap: 'clamp(8px, 2vw, 16px)' }}>
        <div className="rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center overflow-hidden"
          style={{ width: 'clamp(32px, 5vh, 56px)', height: 'clamp(32px, 5vh, 56px)', padding: '4px' }}>
          <img src={logo} alt={appName} className="w-full h-full object-contain" data-testid="login-header-logo" />
        </div>
        <div className="min-w-0">
          <h1 className="font-bold text-white tracking-tight leading-tight truncate" style={{ fontSize: 'clamp(13px, 2vh, 20px)' }} data-testid="login-header-name">{appName}</h1>
          <p className="text-white/80 font-medium leading-tight truncate" style={{ fontSize: 'clamp(9px, 1.2vh, 13px)' }}>{tagline}</p>
        </div>
      </div>
      <Clock />
    </div>
  );
}

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
function QrLoginTab({ onSuccess, primary = '#FF5C00' }) {
  const [qr, setQr] = useState(null);     // { token, qr_url }
  const [status, setStatus] = useState('loading'); // loading | pending | claimed | expired
  const pollRef = useRef(null);

  const createQr = useCallback(async () => {
    setStatus('loading');
    try {
      const { data } = await api.post('/auth/qr/create');
      setQr(data);
      setStatus('pending');
    } catch {
      setStatus('expired');
    }
  }, []);

  useEffect(() => { createQr(); }, [createQr]);

  useEffect(() => {
    if (!qr || status !== 'pending') return;
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/auth/qr/status/${qr.token}`);
        if (data.status === 'claimed' && data.access_token) {
          clearInterval(pollRef.current);
          setStatus('claimed');
          try { localStorage.setItem('admin_token', data.access_token); } catch { /* ignore */ }
          // Korte pauze om de "Ingelogd" state te tonen, dan navigeren.
          setTimeout(() => onSuccess?.(), 800);
        } else if (data.status === 'expired') {
          clearInterval(pollRef.current);
          setStatus('expired');
        }
      } catch { /* keep polling, network may flicker */ }
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [qr, status, onSuccess]);

  return (
    <div className="w-full max-w-sm mx-auto text-center" data-testid="qr-login-tab">
      <h3 className="text-xl font-black text-slate-900 mb-1">Inloggen met QR</h3>
      <p className="text-sm text-slate-500 mb-5">Open uw SuriRent app en scan deze code.</p>

      <div className="relative inline-block p-5 bg-white rounded-3xl border-2 mb-4"
        style={{ borderColor: `${primary}25` }}>
        {status === 'pending' && qr && (
          <QRCodeSVG value={qr.qr_url} size={220} bgColor="#FFFFFF" fgColor="#0F0F0F"
            level="M" includeMargin={false} data-testid="qr-code-svg" />
        )}
        {status === 'loading' && (
          <div className="w-[220px] h-[220px] flex items-center justify-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        )}
        {status === 'claimed' && (
          <div className="w-[220px] h-[220px] flex flex-col items-center justify-center gap-2">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <Check className="w-8 h-8 text-emerald-600" strokeWidth={3} />
            </div>
            <p className="text-sm font-black text-slate-900">Ingelogd!</p>
            <p className="text-xs text-slate-500">U wordt doorgestuurd…</p>
          </div>
        )}
        {status === 'expired' && (
          <div className="w-[220px] h-[220px] flex flex-col items-center justify-center gap-2">
            <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
              <QrCode className="w-8 h-8 text-amber-600" />
            </div>
            <p className="text-sm font-black text-slate-900">QR verlopen</p>
            <button onClick={createQr} data-testid="qr-refresh"
              className="text-xs font-bold mt-1" style={{ color: primary }}>
              Vraag nieuwe QR aan →
            </button>
          </div>
        )}
      </div>

      {status === 'pending' && (
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2 text-sm font-bold text-slate-700">
            <Smartphone className="w-4 h-4" style={{ color: primary }} />
            Open de SuriRent app op uw telefoon
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Tik "Scan QR" en richt op deze code.
          </p>
          <div className="flex items-center justify-center gap-2 mt-3">
            <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
            <span className="text-[11px] font-bold text-slate-400">Wachten op scan…</span>
          </div>
        </div>
      )}
    </div>
  );
}

function PinLanding({ onSuccess, onPassword, onRegister, branding, pwaTarget }) {
  const [pin, setPin] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Persoonlijke PIN-modus: als dit apparaat een onthouden gebruiker heeft,
  // gebruiken we PIN-by-email (in plaats van de gedeelde kiosk-PIN). Dit
  // activeert de "Welkom [naam]" ervaring zoals ABN AMRO.
  const [deviceUser, setDeviceUser] = useState(() => {
    try {
      const email = localStorage.getItem('device_user_email') || '';
      const name = localStorage.getItem('device_user_name') || '';
      return email ? { email, name: name || email.split('@')[0] } : null;
    } catch { return null; }
  });

  const primary = branding?.primary_color || '#FF5C00';
  const appName = branding?.app_name || 'SuriRent';
  const logoUrl = branding?.logo_url ? branding._logoResolved : '/kiosk-icons/kiosk-512.png';
  const isAdminTarget = pwaTarget === 'admin';

  // Fix witte strook onder home-indicator op iOS PWA: schilder html+body in
  // dezelfde brand-kleur als de PinLanding zelf. `position: fixed; inset: 0`
  // dekt niet altijd de gesture-zone onder de safe-area op standalone iOS,
  // dus we kleuren de onderliggende html/body ook. Cleanup on unmount.
  useEffect(() => {
    const prevHtml = document.documentElement.style.backgroundColor;
    const prevBody = document.body.style.backgroundColor;
    document.documentElement.style.backgroundColor = primary;
    document.body.style.backgroundColor = primary;
    return () => {
      document.documentElement.style.backgroundColor = prevHtml;
      document.body.style.backgroundColor = prevBody;
    };
  }, [primary]);

  const forgetDevice = () => {
    try {
      localStorage.removeItem('device_user_email');
      localStorage.removeItem('device_user_name');
    } catch { /* ignore */ }
    setDeviceUser(null);
  };

  const verify = async (code) => {
    setLoading(true); setError('');
    try {
      if (deviceUser) {
        // Persoonlijke PIN login — gebruikt user.personal_pin_hash op backend.
        const { data } = await api.post('/auth/personal-pin/login', {
          email: deviceUser.email, pin: code,
        });
        if (data?.access_token) localStorage.setItem('admin_token', data.access_token);
        setPreferredRole('admin');
        // Fire-and-forget: device_qr_token issuing in achtergrond zodat de
        // gebruiker er NIET op moet wachten. Dit voorkomt 200-500ms extra
        // latency bij elke PIN-login. AuthProvider.refresh() backfilt
        // sowieso bij volgende session-restore.
        api.post('/auth/device-qr-token/issue').then((r) => {
          if (r?.data?.device_qr_token) {
            try { localStorage.setItem('device_qr_token', r.data.device_qr_token); } catch { /* ignore */ }
          }
        }).catch(() => { /* niet-kritiek */ });
        onSuccess();
        return;
      }
      // Geen onthouden gebruiker → val terug op gedeelde kiosk PIN.
      const { data } = await api.post('/auth/kiosk-pin', {
        pin: code,
        company_slug: branding?.slug || undefined,
        company_id: branding?.company_id || undefined,
      });
      if (data?.token) localStorage.setItem('kiosk_token', data.token);
      if (data?.company) localStorage.setItem('kiosk_company', JSON.stringify(data.company));
      if (data?.employee?.id) {
        try { localStorage.removeItem('admin_token'); } catch { /* ignore */ }
        setKioskEmployee({
          id: data.employee.id,
          name: data.employee.name || 'Medewerker',
          pin: data.employee.pin || code,
        });
        setPreferredRole('kiosk');
      } else {
        try { clearKioskEmployee(); } catch { /* ignore */ }
        if (data?.admin_token) localStorage.setItem('admin_token', data.admin_token);
        setPreferredRole(isAdminTarget ? 'admin' : 'kiosk');
      }
      onSuccess();
    } catch (e) {
      setError(formatError(e, 'Ongeldige PIN code'));
      setPin(['', '', '', '']);
    } finally { setLoading(false); }
  };

  const handleKey = (k) => {
    if (loading) return;
    setError('');
    if (k === 'DEL') {
      for (let i = 3; i >= 0; i--) {
        if (pin[i]) { const np = [...pin]; np[i] = ''; setPin(np); return; }
      }
      return;
    }
    for (let i = 0; i < 4; i++) {
      if (!pin[i]) {
        const np = [...pin]; np[i] = k; setPin(np);
        if (i === 3) verify(np.join(''));
        return;
      }
    }
  };

  // Numpad letters voor sub-labels (ABN AMRO stijl)
  const NUMPAD_LETTERS = {
    '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL',
    '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ',
  };

  // Desktop variant — gestileerd EXACT zoals PasswordView (email login + register).
  // Oranje achtergrond, witte card met ronde hoeken, oranje icoon-square boven,
  // "Beheerder Login" titel, subtitel, dan PIN dots + numpad in een net rooster.
  // Klanten op telefoon zien NOG STEEDS de full-screen ABN-stijl ervaring.
  const isDesktop = (() => {
    try { return typeof window !== 'undefined' && window.innerWidth >= 1024; }
    catch { return false; }
  })();

  if (isDesktop) {
    return (
      <div className="flex flex-col" style={{
        position: 'fixed', inset: 0,
        backgroundColor: primary,
        overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}>
        <Header branding={branding} />
        <div className="flex-1 flex items-start sm:items-center justify-center p-3 sm:p-6">
          <div className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] w-full max-w-xl p-5 sm:p-8 md:p-10"
            data-testid="auth-form">
            {/* Top action bar: Scan QR + Help — als pillen rechtsboven */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setShowScanner(true)} data-testid="login-scan-qr-btn"
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors">
                <QrCode className="w-3.5 h-3.5" /> Scan QR
              </button>
              <button onClick={() => setShowHelp(true)} data-testid="login-help-btn"
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors">
                <HelpCircle className="w-3.5 h-3.5" /> Help
              </button>
            </div>

            {/* Titel: zelfde structuur als PasswordView */}
            <div className="text-center mb-5">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-orange-500/20"
                style={{ backgroundColor: primary }}>
                <KeyRound className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight" data-testid="pin-welcome">
                {deviceUser ? `Welkom, ${deviceUser.name}` : 'PIN Login'}
              </h2>
              <p className="text-sm text-slate-400 mt-1" data-testid="pin-company-name">
                {deviceUser
                  ? 'Vul uw persoonlijke PIN in om verder te gaan'
                  : `Vul de 4-cijferige PIN in voor ${appName}`}
              </p>
            </div>

            {error && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-center text-sm font-medium" data-testid="pin-error">
                {error}
              </div>
            )}

            {/* PIN dots */}
            <div className="flex items-center justify-center gap-5 mb-6">
              {pin.map((digit, i) => (
                <div key={`pin-slot-${i}`} data-testid={`pin-input-${i}`}
                  className={`w-4 h-4 rounded-full transition-all ${
                    error ? 'bg-red-400 scale-110' : digit ? 'scale-110' : 'bg-slate-200'
                  }`}
                  style={digit && !error ? { backgroundColor: primary } : {}} />
              ))}
            </div>

            {/* Numpad */}
            <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
              {['1','2','3','4','5','6','7','8','9','_e','0','DEL'].map((k) => (
                k === '_e' ? <div key="e" /> : (
                  <button key={k} type="button" onClick={() => handleKey(k)} disabled={loading}
                    data-testid={`keypad-${k}`}
                    className="h-14 rounded-xl bg-slate-50 hover:bg-orange-50 active:bg-orange-100 active:scale-95 disabled:opacity-50 flex flex-col items-center justify-center transition-all border border-slate-100">
                    {k === 'DEL' ? (
                      <Delete className="w-5 h-5 text-slate-600" />
                    ) : (
                      <>
                        <span className="text-2xl font-black text-slate-900 leading-none">{k}</span>
                        {NUMPAD_LETTERS[k] && (
                          <span className="text-[9px] font-bold tracking-[0.18em] text-slate-400 mt-0.5">{NUMPAD_LETTERS[k]}</span>
                        )}
                      </>
                    )}
                  </button>
                )
              ))}
            </div>

            {loading && (
              <div className="flex items-center justify-center gap-2 text-slate-600 mt-3">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm font-bold">Verifiëren…</span>
              </div>
            )}

            {/* Footer links */}
            <div className="flex items-center justify-center gap-4 mt-6 pt-4 border-t border-slate-100 text-xs font-bold flex-wrap">
              {deviceUser ? (
                <>
                  <button onClick={forgetDevice} data-testid="login-switch-user-btn"
                    className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900">
                    <KeyRound className="w-3.5 h-3.5" /> Andere gebruiker
                  </button>
                  <span className="text-slate-300">•</span>
                  <button onClick={onPassword} data-testid="login-password-btn"
                    className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900">
                    <LogIn className="w-3.5 h-3.5" /> Inloggen met wachtwoord
                  </button>
                </>
              ) : (
                <>
                  <button onClick={onPassword} data-testid="login-password-btn"
                    className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900">
                    <KeyRound className="w-3.5 h-3.5" /> Inloggen met e-mail
                  </button>
                  {!branding?.slug && (
                    <>
                      <span className="text-slate-300">•</span>
                      <button onClick={onRegister} data-testid="login-register-btn"
                        className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900">
                        <UserPlus className="w-3.5 h-3.5" /> Nieuw account
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Modals */}
        {showScanner && <QrScannerModal onClose={() => setShowScanner(false)} primary={primary} />}
        {showHelp && <HelpModal onClose={() => setShowHelp(false)} primary={primary} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col text-white relative overflow-hidden" style={{
      position: 'fixed', inset: 0,
      backgroundColor: primary,
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      paddingLeft: 'env(safe-area-inset-left, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
    }}>
      {/* Diagonal decorative background pattern — ABN AMRO inspired */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden -z-0">
        <div className="absolute -top-32 -right-40 w-[600px] h-[600px] rounded-full opacity-20 blur-3xl"
          style={{ background: 'rgba(255,255,255,0.4)' }} />
        <div className="absolute top-[20%] -left-32 w-[400px] h-[400px] rounded-full opacity-15 blur-3xl"
          style={{ background: 'rgba(255,176,99,0.6)' }} />
        {/* Diagonal layered curves */}
        <svg className="absolute top-0 right-0 w-full h-full opacity-[0.08]" preserveAspectRatio="none" viewBox="0 0 400 800">
          <path d="M0,200 Q200,150 400,250 L400,300 Q200,200 0,250 Z" fill="white" />
          <path d="M0,360 Q200,310 400,410 L400,460 Q200,360 0,410 Z" fill="white" />
        </svg>
      </div>

      {/* TOP ACTION BAR — Scan QR linksboven, Help rechtsboven */}
      <div className="relative z-10 flex items-center justify-between px-5"
        style={{ paddingTop: 'clamp(12px, 2vh, 24px)', paddingBottom: 'clamp(8px, 1.5vh, 16px)' }}>
        <button onClick={() => setShowScanner(true)} data-testid="login-scan-qr-btn"
          className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm border border-white/20 transition-all text-white text-sm font-bold">
          <QrCode className="w-4 h-4" />
          Scan QR
        </button>
        <button onClick={() => setShowHelp(true)} data-testid="login-help-btn"
          className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm border border-white/20 transition-all text-white text-sm font-bold">
          <HelpCircle className="w-4 h-4" />
          Help
        </button>
      </div>

      {/* CENTER — Welkom + profielfoto + naam + PIN */}
      <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-start overflow-y-auto"
        style={{ paddingTop: 'clamp(8px, 2vh, 24px)', paddingBottom: 'clamp(16px, 3vh, 32px)' }}>

        <h1 className="font-black tracking-tight text-white text-center"
          style={{ fontSize: 'clamp(28px, 5vh, 44px)', lineHeight: '1.05' }}
          data-testid="pin-welcome">
          Welkom{deviceUser ? ',' : ''}
        </h1>

        {/* Profielfoto in cirkel */}
        <div className="relative mt-4 mb-3">
          <div className="rounded-full bg-white p-1 shadow-[0_12px_28px_-8px_rgba(0,0,0,0.35)]"
            style={{
              width: 'clamp(76px, 12vh, 110px)',
              height: 'clamp(76px, 12vh, 110px)',
            }}>
            <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, #FFF6D6 0%, #F8C260 60%, #D4A037 100%)`,
              }}>
              <img src={logoUrl} alt="logo"
                className="w-[70%] h-[70%] object-contain drop-shadow-md"
                data-testid="pin-profile-photo" />
            </div>
          </div>
          {/* Online dot indicator */}
          <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-white bg-emerald-400 shadow-md" />
        </div>

        <p className="text-white/90 font-black text-center uppercase tracking-wider"
          style={{ fontSize: 'clamp(13px, 1.8vh, 17px)' }}
          data-testid="pin-company-name">
          {deviceUser ? deviceUser.name : appName}
        </p>
        <p className="text-white/80 text-center font-medium mt-2 px-6"
          style={{ fontSize: 'clamp(12px, 1.6vh, 15px)', maxWidth: '340px' }}>
          {deviceUser
            ? 'Vul je persoonlijke PIN in om verder te gaan'
            : 'Vul je 4-cijferige PIN in om verder te gaan'}
        </p>

        {error && (
          <div className="mt-3 px-5 py-2 rounded-full bg-red-500/95 text-white text-xs font-bold shadow-lg"
            data-testid="pin-error">
            {error}
          </div>
        )}

        {/* PIN dots */}
        <div className="flex items-center mt-5" style={{ gap: 'clamp(14px, 3vw, 24px)' }}>
          {pin.map((digit, i) => (
            <div key={`pin-slot-${i}`} data-testid={`pin-input-${i}`}
              className={`rounded-full transition-all ${
                error ? 'bg-red-300 scale-110' : digit ? 'bg-white scale-110' : 'bg-white/35'
              }`}
              style={{
                width: 'clamp(14px, 1.8vh, 18px)',
                height: 'clamp(14px, 1.8vh, 18px)',
              }} />
          ))}
        </div>

        {/* Numpad — ABN-stijl met letters subscript */}
        <div className="grid grid-cols-3 mt-6"
          style={{
            gap: 'clamp(10px, 1.5vh, 16px) clamp(20px, 6vw, 40px)',
            width: 'min(340px, 88%)',
          }}>
          {['1','2','3','4','5','6','7','8','9','_e','0','DEL'].map((k) => (
            k === '_e' ? <div key="e" /> : (
              <button key={k} type="button" onClick={() => handleKey(k)} disabled={loading}
                data-testid={`keypad-${k}`}
                className="flex flex-col items-center justify-center text-white active:scale-95 disabled:opacity-50 transition-all"
                style={{ height: 'clamp(54px, 8vh, 70px)' }}>
                {k === 'DEL' ? (
                  <Delete style={{ width: 'clamp(22px, 3vh, 28px)', height: 'clamp(22px, 3vh, 28px)' }} />
                ) : (
                  <>
                    <span className="font-black leading-none"
                      style={{ fontSize: 'clamp(28px, 4.5vh, 38px)' }}>
                      {k}
                    </span>
                    {NUMPAD_LETTERS[k] && (
                      <span className="font-bold tracking-[0.18em] text-white/70 mt-0.5"
                        style={{ fontSize: 'clamp(9px, 1.2vh, 11px)' }}>
                        {NUMPAD_LETTERS[k]}
                      </span>
                    )}
                  </>
                )}
              </button>
            )
          ))}
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-white/80 mt-3">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm font-bold">Verifiëren…</span>
          </div>
        )}

        {/* Onderaan: Beheerder login + nieuw account */}
        <div className="flex items-center gap-4 mt-4 text-xs font-bold flex-wrap justify-center px-4">
          {deviceUser ? (
            <>
              <button onClick={forgetDevice} data-testid="login-switch-user-btn"
                className="flex items-center gap-1.5 text-white/80 hover:text-white">
                <KeyRound className="w-3.5 h-3.5" /> Andere gebruiker
              </button>
              <span className="text-white/40">•</span>
              <button onClick={onPassword} data-testid="login-password-btn"
                className="flex items-center gap-1.5 text-white/80 hover:text-white">
                <LogIn className="w-3.5 h-3.5" /> Inloggen met wachtwoord
              </button>
            </>
          ) : (
            <>
              <button onClick={onPassword} data-testid="login-password-btn"
                className="flex items-center gap-1.5 text-white/80 hover:text-white">
                <KeyRound className="w-3.5 h-3.5" /> Inloggen met e-mail
              </button>
              {!branding?.slug && (
                <>
                  <span className="text-white/40">•</span>
                  <button onClick={onRegister} data-testid="login-register-btn"
                    className="flex items-center gap-1.5 text-white/80 hover:text-white">
                    <UserPlus className="w-3.5 h-3.5" /> Nieuw account
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {showScanner && <QrScannerModal onClose={() => setShowScanner(false)} primary={primary} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} primary={primary} />}
    </div>
  );
}

// =============================================================================
// HelpModal — uitleg over hoe PIN + QR login werkt
// =============================================================================
function HelpModal({ onClose, primary = '#FF5C00' }) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      data-testid="help-modal">
      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white">
          <h3 className="text-base font-black text-slate-900">Hulp bij inloggen</h3>
          <button onClick={onClose} data-testid="help-modal-close"
            className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500">
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black"
                style={{ background: primary }}>1</span>
              <h4 className="text-sm font-black text-slate-900">Inloggen met PIN</h4>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed pl-9">
              Voer uw 4-cijferige PIN in. Dit is de bedrijfs-PIN of uw persoonlijke medewerker-PIN
              (toegewezen door de beheerder).
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black"
                style={{ background: primary }}>2</span>
              <h4 className="text-sm font-black text-slate-900">QR scannen (desktop login)</h4>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed pl-9">
              Tik op <strong>Scan QR</strong> linksboven om uw camera te openen. Open SuriRent in
              een browser op uw computer, kies de "QR code" tab, en scan de QR om uw desktop in
              te loggen.
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black"
                style={{ background: primary }}>3</span>
              <h4 className="text-sm font-black text-slate-900">PIN vergeten?</h4>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed pl-9">
              Vraag uw beheerder om een nieuwe PIN. Heeft u geen toegang? Tik op
              "Inloggen met e-mail" onderaan om met uw wachtwoord in te loggen.
            </p>
          </div>
          <button onClick={onClose}
            className="w-full h-12 rounded-xl text-white font-black text-sm"
            style={{ background: primary }}>
            Begrepen
          </button>
        </div>
      </div>
    </div>
  );
}

function PinLanding_DEPRECATED({ onSuccess, onPassword, onRegister, branding, pwaTarget }) {

  const verify = async (code) => {
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/auth/kiosk-pin', {
        pin: code,
        // company_slug komt uit het branded pad of de cached branding —
        // zonder bedrijfs-context weigert backend de PIN-login.
        company_slug: branding?.slug || undefined,
        company_id: branding?.company_id || undefined,
      });
      if (data?.token) localStorage.setItem('kiosk_token', data.token);
      if (data?.company) localStorage.setItem('kiosk_company', JSON.stringify(data.company));
      // Detecteer of dit een MEDEWERKER-PIN was (eigen PIN) of een bedrijfs-PIN.
      // Bij medewerker: GEEN admin_token (zij mogen niet bij Beheer), sla
      // employee-sessie op zodat alle betalingen automatisch pending_approval
      // krijgen met deze medewerker als ontvanger.
      if (data?.employee?.id) {
        // Eerst verzekerd verwijderen — een vorige admin-sessie mag geen
        // ongewenste toegang houden voor deze medewerker.
        try { localStorage.removeItem('admin_token'); } catch { /* ignore */ }
        setKioskEmployee({
          id: data.employee.id,
          name: data.employee.name || 'Medewerker',
          pin: data.employee.pin || code,
        });
        setPreferredRole('kiosk');
      } else {
        // Shared company-PIN: backend geeft ook een admin_token mee zodat
        // de "Beheerder" knop direct doorgaat naar /admin. Vorige employee-
        // sessie van een collega legen — anders blijft die meeknopen.
        try { clearKioskEmployee(); } catch { /* ignore */ }
        if (data?.admin_token) localStorage.setItem('admin_token', data.admin_token);
        setPreferredRole(isAdminTarget ? 'admin' : 'kiosk');
      }
      onSuccess();
    } catch (e) {
      setError(formatError(e, 'Ongeldige PIN code'));
      setPin(['', '', '', '']);
    } finally { setLoading(false); }
  };

  const handleKey = (k) => {
    if (loading) return;
    setError('');
    if (k === 'DEL') {
      for (let i = 3; i >= 0; i--) {
        if (pin[i]) { const np = [...pin]; np[i] = ''; setPin(np); return; }
      }
      return;
    }
    for (let i = 0; i < 4; i++) {
      if (!pin[i]) {
        const np = [...pin]; np[i] = k; setPin(np);
        if (i === 3) verify(np.join(''));
        return;
      }
    }
  };

  return (
    <div className="flex flex-col" style={{
      position: 'fixed', inset: 0,
      backgroundColor: primary,
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      paddingLeft: 'env(safe-area-inset-left, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
    }}>
      <Header branding={branding} />
      <div className="flex-1 min-h-0 flex items-center justify-center px-2 py-2 sm:p-6 overflow-hidden">
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] w-full max-w-md flex flex-col"
          style={{ maxHeight: '100%', padding: 'clamp(12px, 2.5vh, 32px) clamp(14px, 4vw, 32px)' }}
          data-testid="pin-card">
          <div className="text-center" style={{ marginBottom: 'clamp(6px, 1.5vh, 16px)' }}>
            <div className="rounded-2xl flex items-center justify-center mx-auto shadow-xl overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${primary}, ${primary}CC)`,
                width: 'clamp(40px, 7vh, 72px)',
                height: 'clamp(40px, 7vh, 72px)',
                padding: 'clamp(4px, 0.8vh, 10px)',
                marginBottom: 'clamp(4px, 1vh, 10px)',
              }}>
              <img src={logoUrl} alt="logo" className="w-full h-full object-contain drop-shadow-md" data-testid="pin-logo" />
            </div>
            <h2 className="font-bold text-slate-900 tracking-tight leading-tight"
              style={{ fontSize: 'clamp(15px, 2.4vh, 22px)' }}
              data-testid="pin-app-name">{isAdminTarget ? `Beheer · ${appName}` : `Welkom bij ${appName}`}</h2>
            {tagline && !isAdminTarget && <p className="text-slate-400 leading-tight" style={{ fontSize: 'clamp(11px, 1.5vh, 13px)', marginTop: '2px' }}>{tagline}</p>}
            {isAdminTarget && (
              <p className="font-bold leading-tight" style={{ fontSize: 'clamp(11px, 1.5vh, 13px)', marginTop: '2px', color: primary }}>
                Voer uw PIN in om naar het Beheer-dashboard te gaan
              </p>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl text-center font-medium"
              style={{ fontSize: 'clamp(11px, 1.5vh, 13px)', padding: 'clamp(6px, 1vh, 10px)', marginBottom: 'clamp(6px, 1vh, 12px)' }}
              data-testid="pin-error">
              {error}
            </div>
          )}

          <div className="flex justify-center" style={{ gap: 'clamp(6px, 1.5vw, 12px)', marginBottom: 'clamp(8px, 1.5vh, 16px)' }}>
            {pin.map((digit, i) => (
              <div key={`pin-slot-${i}`} data-testid={`pin-input-${i}`}
                style={{
                  width: 'clamp(36px, 9vw, 56px)',
                  height: 'clamp(40px, 6vh, 64px)',
                  fontSize: 'clamp(18px, 2.5vh, 24px)',
                  ...(digit && !error ? { borderColor: primary, color: primary, backgroundColor: `${primary}10` } : {}),
                }}
                className={`text-center font-bold rounded-xl border-2 transition-all flex items-center justify-center ${
                  error ? 'border-red-400 bg-red-50 text-red-600'
                    : digit ? ''
                    : 'border-slate-200 bg-[#F9FAFB] text-slate-300'
                }`}>
                {digit ? '●' : ''}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 mx-auto w-full"
            style={{ gap: 'clamp(4px, 1vh, 12px)', maxWidth: 'min(320px, 90%)' }}>
            {['1','2','3','4','5','6','7','8','9','_e','0','DEL'].map((k) => (
              k === '_e' ? <div key="e" /> : (
                <button key={k} type="button" onClick={() => handleKey(k)} disabled={loading}
                  data-testid={`keypad-${k}`}
                  style={{ height: 'clamp(36px, 6vh, 56px)', fontSize: 'clamp(16px, 2.4vh, 24px)' }}
                  className={`font-bold rounded-xl transition-all active:scale-90 disabled:opacity-50 flex items-center justify-center ${
                    k === 'DEL'
                      ? 'bg-red-50 text-red-500 hover:bg-red-100 border border-red-200'
                      : 'bg-[#F4F5F7] text-slate-800 hover:bg-orange-50 hover:text-orange-600 border border-slate-200'
                  }`}>
                  {k === 'DEL' ? <Delete style={{ width: 'clamp(16px, 2.2vh, 22px)', height: 'clamp(16px, 2.2vh, 22px)' }} /> : k}
                </button>
              )
            ))}
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 text-slate-400"
              style={{ marginTop: 'clamp(6px, 1vh, 12px)' }}>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span style={{ fontSize: 'clamp(10px, 1.4vh, 12px)' }} className="font-medium">Verifiëren...</span>
            </div>
          )}

          <div className="border-t border-slate-100 flex items-center justify-center flex-wrap font-medium"
            style={{ gap: 'clamp(8px, 2vw, 16px)', fontSize: 'clamp(10px, 1.4vh, 12px)', marginTop: 'clamp(8px, 1.5vh, 16px)', paddingTop: 'clamp(6px, 1.2vh, 12px)' }}>
            <button onClick={onPassword} data-testid="login-password-btn" className="flex items-center gap-1 text-slate-500 hover:text-orange-500 transition">
              <KeyRound style={{ width: 'clamp(11px, 1.6vh, 14px)', height: 'clamp(11px, 1.6vh, 14px)' }} /> Beheerder
            </button>
            <span className="text-slate-200">•</span>
            <button onClick={onRegister} data-testid="login-register-btn" className="flex items-center gap-1 text-slate-500 hover:text-orange-500 transition">
              <UserPlus style={{ width: 'clamp(11px, 1.6vh, 14px)', height: 'clamp(11px, 1.6vh, 14px)' }} /> Nieuw account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PasswordView({ initialMode = 'login', onBack, onRegistered, branding }) {
  const navigate = useBrandedNavigate();
  const { login, register } = useAuth();
  const isMobile = useIsMobile();
  const [mode, setMode] = useState(initialMode); // 'login' | 'register'
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem('saved_login_email') || ''; } catch { return ''; }
  });
  const [password, setPassword] = useState(() => {
    try { return localStorage.getItem('saved_login_password') || ''; } catch { return ''; }
  });
  const [remember, setRemember] = useState(() => {
    try { return localStorage.getItem('saved_login_email') !== null; } catch { return false; }
  });
  const [showForgot, setShowForgot] = useState(false);
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [telefoon, setTelefoon] = useState('');
  const [address, setAddress] = useState('');
  const [plan, setPlan] = useState('starter');
  const [kioskPin, setKioskPin] = useState('');
  // Country selection: '' (auto), 'SR', 'NL', 'OTHER'.
  // Initialized from localStorage.preferred_currency (set by landing page toggle).
  const [country, setCountry] = useState(() => {
    try {
      const pref = (localStorage.getItem('preferred_currency') || '').toUpperCase();
      if (pref === 'EUR') return 'NL';
      if (pref === 'SRD') return 'SR';
    } catch { /* localStorage unavailable */ }
    return '';
  });
  const [plans, setPlans] = useState([]);
  const [bankDetails, setBankDetails] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [registeredSlug, setRegisteredSlug] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // QR vs password login method (alleen relevant in mode === 'login').
  const [loginMethod, setLoginMethod] = useState('password');

  // Build the query that drives the plan-currency on the registration form.
  // Explicit country wins; otherwise the phone is used for auto-detect.
  const planQuery = (() => {
    if (country === 'NL') return '?currency=EUR';
    if (country === 'SR') return '?currency=SRD';
    return telefoon ? `?phone=${encodeURIComponent(telefoon)}` : '';
  })();

  useEffect(() => {
    if (mode !== 'register') return;
    api.get(`/billing/plans${planQuery}`).then((r) => setPlans(r.data)).catch(() => setPlans([]));
    api.get('/billing/bank-details').then((r) => setBankDetails(r.data)).catch(() => setBankDetails(null));
  }, [mode, planQuery]);

  // Live preview van de portal-URL die deze klant na registratie krijgt.
  // Gebruikt dezelfde slug-regels als de backend (`_slugify` + reserved suffix).
  const portalPreview = useMemo(() => {
    const raw = (companyName || '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || '';
    if (!raw) return { slug: '', host: '' };
    const slug = RESERVED_SLUGS.has(raw) ? `${raw}-bedrijf` : raw;
    let host = '';
    try { host = (window.location.host || '').replace(/:.*$/, ''); } catch { /* ignore */ }
    return { slug, host };
  }, [companyName]);

  // Debounced availability-check tegen `/api/public/companies/{slug}/available`.
  // 350ms na de laatste keystroke. State:
  //   - 'idle'      → geen check
  //   - 'checking'  → request loopt
  //   - 'available' → slug is vrij
  //   - 'taken'     → slug al in gebruik
  //   - 'reserved'  → gereserveerde platform-slug (krijgt sowieso `-bedrijf` suffix)
  //   - 'format'    → ongeldig formaat (zou niet moeten — wij hebben hem geslugified)
  const [slugStatus, setSlugStatus] = useState('idle');
  useEffect(() => {
    if (mode !== 'register') return undefined;
    const s = portalPreview.slug;
    if (!s) { setSlugStatus('idle'); return undefined; }
    setSlugStatus('checking');
    const handle = setTimeout(async () => {
      try {
        const { data } = await api.get(`/public/companies/${encodeURIComponent(s)}/available`);
        if (data?.available) setSlugStatus('available');
        else setSlugStatus(data?.reason || 'taken');
      } catch {
        setSlugStatus('idle');  // backend onbereikbaar — silence, niet blokkeren
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [portalPreview.slug, mode]);

  const submit = async (e) => {
    e?.preventDefault();
    if (mode === 'register' && !companyName.trim()) {
      setError('Vul de bedrijfsnaam in.');
      return;
    }
    if (mode === 'register' && kioskPin && !/^\d{4}$/.test(kioskPin)) {
      setError('Kiosk PIN moet uit precies 4 cijfers bestaan.');
      return;
    }
    setLoading(true); setError('');
    try {
      if (mode === 'login') {
        const loginResult = await login(email, password);
        // "Onthoud mij": sla email + wachtwoord lokaal op (alleen op apparaten
        // waar de gebruiker zelf toegang toe heeft — niet ideaal voor gedeelde
        // kiosks, daarom uitvink-baar).
        try {
          if (remember) {
            localStorage.setItem('saved_login_email', email);
            localStorage.setItem('saved_login_password', password);
          } else {
            localStorage.removeItem('saved_login_email');
            localStorage.removeItem('saved_login_password');
          }
        } catch { /* noop */ }
        setPreferredRole('admin');
        // Onthoud op dit device welke gebruiker hier het laatst inlogde. Zo
        // kunnen we bij volgende launch "Welkom [naam]" tonen en eventueel
        // de persoonlijke PIN-flow activeren (mobile-only, en alleen wanneer
        // de gebruiker een PIN heeft ingesteld).
        try {
          localStorage.setItem('device_user_email', email.trim());
          localStorage.setItem('device_user_name', name?.trim() || email.split('@')[0]);
        } catch { /* ignore */ }
        // Pending QR? Vorige sessie heeft ons hier naartoe gestuurd via /qr-link.
        // Claim de QR direct nu we ingelogd zijn.
        // BELANGRIJK: NIET sessionStorage hier removen — de parent useEffect
        // controleert ook op pending_qr_token om de auto-redirect naar /admin
        // te onderdrukken (race-conditie). QrLinkPage zelf removed het na claim.
        let pendingQr = null;
        try { pendingQr = sessionStorage.getItem('pending_qr_token'); } catch { /* ignore */ }
        if (pendingQr) {
          navigate(`/qr-link?token=${encodeURIComponent(pendingQr)}`);
        } else {
          // Bepaal het juiste admin-pad. Wanneer we op de generieke /login
          // (zonder slug) zitten en de gebruiker hoort bij een specifiek
          // bedrijf, sturen we hem naar `/<slug>/admin` zodat de branded
          // omgeving + storage-context geactiveerd wordt. KRITIEK voor PWA
          // gebruikers die zonder slug-context openen.
          const userSlug = loginResult?.company?.slug || loginResult?.user?.company_slug;
          const onPlainLogin = /^\/login(\/|$)/i.test(window.location.pathname);
          if (userSlug && onPlainLogin) {
            // Hard-navigate naar branded admin zodat BrandedShell mount +
            // branding kleuren + stored_slug worden geactiveerd in PWA storage.
            window.location.assign(`/${userSlug}/admin`);
          } else {
            navigate('/admin');
          }
        }
      } else {
        const result = await register({
          name: name.trim(),
          email: email.trim(),
          password,
          company_name: companyName.trim(),
          telefoon: telefoon.trim(),
          address: address.trim(),
          plan,
          kiosk_pin: kioskPin.trim() || null,
          ...(country ? { country } : {}),
        });
        setPreferredRole('admin');
        // Sla de slug op zodat de "doorgaan" knop direct naar het branded
        // portaal (`/<slug>/admin`) navigeert i.p.v. de generieke `/admin`.
        // Hierdoor leert de nieuwe admin meteen zijn eigen URL kennen.
        const newSlug = result?.company?.slug || '';
        if (newSlug) setRegisteredSlug(newSlug);
        if (onRegistered) onRegistered();
        setShowSuccess(true);
      }
    } catch (err) {
      setError(formatError(err, mode === 'login' ? 'Inloggen mislukt' : 'Registratie mislukt'));
    } finally { setLoading(false); }
  };

  if (showSuccess) {
    const selectedPlan = plans.find((p) => p.id === plan) || { name: plan, amount: 0, currency: 'SRD' };
    // Bij registratie altijd doorsturen naar het eigen branded portaal —
    // dit is "hun" omgeving. Gebruikt hard-navigate zodat BrandedShell
    // de branding/kleuren netjes opnieuw bootstrapt vóór /admin laadt.
    const goToOwnPortal = () => {
      if (registeredSlug) {
        window.location.assign(`/${registeredSlug}/admin`);
      } else {
        navigate('/admin');
      }
    };
    return <RegisterSuccess plan={selectedPlan} company={companyName} bankDetails={bankDetails}
      onContinue={goToOwnPortal} />;
  }

  // ────────────────────────────────────────────────────────────────────
  // MOBILE LOGIN — toon de "app-stijl" oranje full-screen e-mail/wachtwoord
  // login op telefoon + PWA. Dit voelt identiek aan de PIN-pad ervaring
  // (zelfde oranje canvas, logo-cirkel, welkom-header, witte input pillen).
  // Op desktop blijft het bestaande witte card-design behouden.
  // ────────────────────────────────────────────────────────────────────
  if (mode === 'login' && isMobile) {
    return (
      <>
        <MobileEmailLogin
          onBack={() => { try { onBack?.(); } catch { /* ignore */ } }}
          onForgot={() => setShowForgot(true)}
          branding={branding}
        />
        {showForgot && (
          <ForgotPasswordModal initialEmail={email} onClose={() => setShowForgot(false)} />
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col" style={{
      position: 'fixed', inset: 0,
      backgroundColor: branding?.primary_color || '#FF5C00',
      overflowY: 'auto', WebkitOverflowScrolling: 'touch',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      paddingLeft: 'env(safe-area-inset-left, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
    }}>
      <Header branding={branding} />
      <div className="flex-1 flex items-start sm:items-center justify-center p-3 sm:p-6">
        {/* REGISTER op desktop: 2-panel split (form links + voordelen rechts).
            LOGIN behoudt het bestaande compacte card design. */}
        {mode === 'register' ? (
      <div className="min-h-screen lg:grid lg:grid-cols-2" data-testid="auth-form">
        {/* LEFT: branded panel — vol oranje, marketing + stats */}
        <aside className="relative px-8 py-12 sm:px-12 sm:py-16 lg:p-16 xl:p-20 text-white overflow-hidden lg:min-h-screen flex flex-col"
          style={{ background: 'linear-gradient(160deg, #FF5C00 0%, #C74600 100%)' }}>
          <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full opacity-15 blur-3xl bg-white pointer-events-none" />
          <div className="absolute bottom-[-20%] left-[-20%] w-[500px] h-[500px] rounded-full opacity-10 blur-3xl bg-[#FFE0C2] pointer-events-none" />

          {/* Logo / merk */}
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-12 lg:mb-16">
              <span className="w-12 h-12 rounded-2xl bg-white p-2 shadow-lg">
                <img src="/kiosk-icons/mark-orange.png" alt="SuriRent" className="w-full h-full object-contain"
                  onError={(e) => { e.currentTarget.src = '/kiosk-icons/mark-white.png'; e.currentTarget.style.filter = 'brightness(0) invert(0.2)'; }} />
              </span>
              <span className="text-3xl lg:text-4xl font-black tracking-tight">SURIRENT</span>
            </div>

            <h2 className="font-black tracking-tight leading-[1.05]"
              style={{ fontSize: 'clamp(2.25rem, 4.5vw, 4rem)' }}>
              Start vandaag met <br />
              <span className="text-[#FFE0C2]">SuriRent N.V.</span>
            </h2>
            <p className="mt-6 text-base lg:text-lg text-white/85 leading-relaxed max-w-md">
              Maak gratis een account aan en ontdek het complete vastgoedplatform voor Suriname.
            </p>
          </div>

          {/* Glassy "14 Dagen Gratis" card */}
          <div className="relative z-10 mt-10 lg:mt-12">
            <div className="rounded-2xl border border-white/20 backdrop-blur-sm bg-white/[0.07] p-6">
              <div className="flex items-start gap-4 mb-5">
                <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-xl font-black">14 Dagen Gratis!</p>
                  <p className="text-sm text-white/75 mt-0.5">Geen creditcard nodig</p>
                </div>
              </div>
              <ul className="space-y-3 text-sm">
                {[
                  'Toegang tot alle modules',
                  'Onbeperkte gebruikers',
                  'Volledige functionaliteit',
                ].map((feat) => (
                  <li key={feat} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                    </span>
                    <span className="font-semibold">{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Trust signals */}
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <span className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4 text-white" />
                </span>
                <span className="font-semibold text-white/90">SSL-encryptie &amp; privacy gegarandeerd</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4 text-white" />
                </span>
                <span className="font-semibold text-white/90">Snel en modern platform</span>
              </div>
            </div>
          </div>

          <div className="flex-1" />

          {/* Bottom stats */}
          <div className="relative z-10 mt-10 lg:mt-12 grid grid-cols-3 gap-4 lg:gap-8">
            {[
              { value: '500+',  label: 'Klanten' },
              { value: '99.9%', label: 'Uptime' },
              { value: '24/7',  label: 'Support' },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-3xl lg:text-4xl font-black">{s.value}</p>
                <p className="text-xs lg:text-sm text-white/70 font-semibold mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </aside>

        {/* RIGHT: schoon wit formulier */}
        <div className="bg-white px-6 py-10 sm:px-12 sm:py-14 lg:p-16 xl:px-20 lg:overflow-y-auto lg:max-h-screen">
          <div className="max-w-md mx-auto">
          {branding?.slug && (
            <button onClick={onBack} data-testid="auth-back" className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-600 mb-6 transition active:scale-95">
              <ArrowLeft className="w-4 h-4" /> Terug naar PIN
            </button>
          )}

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-100 mb-5">
            <Sparkles className="w-3.5 h-3.5 text-[#FF5C00]" />
            <span className="text-[11px] font-extrabold tracking-[0.18em] uppercase text-[#FF5C00]">14 Dagen Gratis</span>
          </div>

          <h1 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-tight">
            Account aanmaken
          </h1>
          <p className="text-base text-slate-500 mt-2 mb-8">Vul uw gegevens in om te beginnen</p>

          {error && (
            <div className="mb-5 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-medium" data-testid="auth-error">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-5">
            {/* Volledige naam */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Volledige naam</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} data-testid="auth-name"
                required minLength={2}
                placeholder="Jan Jansen"
                className="w-full h-12 text-base px-4 rounded-xl border border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-white outline-none transition" />
            </div>

            {/* Bedrijfsnaam */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Bedrijfsnaam <span className="text-slate-400 font-medium">(optioneel)</span>
              </label>
              <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} data-testid="auth-company-name"
                placeholder="Uw bedrijfsnaam"
                className="w-full h-12 text-base px-4 rounded-xl border border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-white outline-none transition" />
              {portalPreview.slug && companyName.length > 1 && (() => {
                const okTone = slugStatus === 'available';
                const errTone = slugStatus === 'taken' || slugStatus === 'format';
                const palette = errTone
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700';
                return (
                  <div className={`mt-2 flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold ${palette}`} data-testid="auth-portal-preview">
                    <Globe className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-mono truncate flex-1">{portalPreview.host || 'app.surirent.sr'}/{portalPreview.slug}</span>
                    {slugStatus === 'checking' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {okTone && <span className="font-extrabold">✓ VRIJ</span>}
                    {slugStatus === 'taken' && <span className="font-extrabold">✗ BEZET</span>}
                  </div>
                );
              })()}
            </div>

            {/* E-mailadres */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">E-mailadres</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="auth-email"
                required
                placeholder="naam@bedrijf.sr"
                className="w-full h-12 text-base px-4 rounded-xl border border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-slate-50 outline-none transition" />
            </div>

            {/* Wachtwoord */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Wachtwoord</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  data-testid="auth-password" required minLength={6}
                  placeholder="••••••••••"
                  className="w-full h-12 text-base px-4 pr-11 rounded-xl border border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-slate-50 outline-none transition" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Geavanceerde opties — Telefoon, Adres, Land, PIN, Pakket — verborgen onder een toggle */}
            <details className="group rounded-xl border border-slate-200 overflow-hidden">
              <summary className="flex items-center justify-between cursor-pointer px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors list-none">
                <span className="text-sm font-bold text-slate-700">Geavanceerde opties</span>
                <ChevronDown className="w-4 h-4 text-slate-500 transition-transform group-open:rotate-180" />
              </summary>
              <div className="p-4 space-y-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Telefoon</label>
                    <input type="tel" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} data-testid="auth-telefoon"
                      placeholder="+597 ..."
                      className="w-full h-11 text-sm px-3 rounded-lg border border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-white outline-none transition" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Kiosk PIN</label>
                    <input type="text" inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="off"
                      value={kioskPin}
                      onChange={(e) => setKioskPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      data-testid="auth-kiosk-pin"
                      placeholder="• • • •"
                      className="w-full h-11 text-sm px-3 rounded-lg border border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-white outline-none transition font-mono tracking-[0.4em] text-center" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Adres</label>
                  <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} data-testid="auth-address"
                    placeholder="Bedrijfsadres"
                    className="w-full h-11 text-sm px-3 rounded-lg border border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-white outline-none transition" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Land &amp; valuta</label>
                  <div className="grid grid-cols-2 gap-2" data-testid="country-picker">
                    {[
                      { code: 'SR', flag: '🇸🇷', label: 'Suriname', sub: 'SRD' },
                      { code: 'NL', flag: '🇳🇱', label: 'Nederland', sub: 'EUR' },
                    ].map((c) => {
                      const sel = country === c.code;
                      return (
                        <button key={c.code} type="button" onClick={() => setCountry(c.code)}
                          data-testid={`country-${c.code.toLowerCase()}`}
                          className={`rounded-lg border p-2 text-center transition-all ${
                            sel ? 'border-[#FF5C00] bg-orange-50' : 'border-slate-200 bg-white hover:border-orange-300'
                          }`}>
                          <span className="text-lg leading-none mr-1.5">{c.flag}</span>
                          <span className={`text-xs font-extrabold ${sel ? 'text-[#C74600]' : 'text-slate-700'}`}>{c.label}</span>
                          <span className="text-[10px] text-slate-400 font-bold ml-1">{c.sub}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Pakket</label>
                  <div className="grid grid-cols-2 gap-2">
                    {plans.map((p) => {
                      const sel = plan === p.id;
                      return (
                        <button key={p.id} type="button" onClick={() => setPlan(p.id)}
                          data-testid={`plan-${p.id}`}
                          className={`text-left rounded-lg border p-2.5 transition-all ${
                            sel ? 'border-[#FF5C00] bg-orange-50' : 'border-slate-200 bg-white hover:border-orange-300'
                          }`}>
                          <p className={`font-extrabold text-xs ${sel ? 'text-[#C74600]' : 'text-slate-900'}`}>{p.name}</p>
                          <p className={`text-base font-extrabold mt-0.5 ${sel ? 'text-[#FF5C00]' : 'text-slate-900'}`}>
                            {(p.currency || 'SRD').toUpperCase() === 'EUR'
                              ? `€${Number(p.amount).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : `${p.currency} ${Number(p.amount).toLocaleString('nl-NL')}`}
                            <span className="text-[10px] text-slate-400 ml-1">/m</span>
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </details>

            {/* Submit */}
            <button type="submit" disabled={loading} data-testid="auth-submit"
              className="w-full h-14 bg-[#FF5C00] hover:bg-[#C74600] text-white font-extrabold text-base rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-orange-500/30 mt-2">
              {loading ? (<><Loader2 className="w-5 h-5 animate-spin" /> Bezig…</>)
                : (<>Account aanmaken <ArrowRight className="w-5 h-5" /></>)}
            </button>

            {/* Social proof */}
            <div className="rounded-xl bg-emerald-50/70 border border-emerald-100 p-3 flex items-center gap-3">
              <div className="flex -space-x-2">
                {['JK', 'SM', 'RB'].map((init, i) => (
                  <span key={init} className={`w-8 h-8 rounded-full ring-2 ring-white flex items-center justify-center text-[10px] font-extrabold text-white shadow-sm ${
                    i === 0 ? 'bg-emerald-500' : i === 1 ? 'bg-emerald-600' : 'bg-emerald-700'
                  }`}>{init}</span>
                ))}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1">
                  {[0,1,2,3,4].map((i) => <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />)}
                </div>
                <p className="text-xs font-bold text-slate-700 mt-0.5">500+ tevreden klanten</p>
              </div>
            </div>

            <p className="text-center text-sm text-slate-500">
              Heeft u al een account?{' '}
              <button type="button" onClick={() => { setMode('login'); setError(''); }} className="font-bold text-[#FF5C00] hover:underline">
                Log hier in
              </button>
            </p>
          </form>
          </div>
        </div>
      </div>
      ) : (
        <div
          className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] w-full max-w-xl p-5 sm:p-8 md:p-10"
          data-testid="auth-form"
        >
          {branding?.slug && (
            <button onClick={onBack} data-testid="auth-back" className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-600 mb-4 transition active:scale-95">
              <ArrowLeft className="w-4 h-4" /> Terug naar PIN
            </button>
          )}


          <div className="text-center mb-5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#FF5C00] flex items-center justify-center mx-auto mb-3 shadow-lg shadow-orange-500/20">
              <KeyRound className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Beheerder Login</h2>
            <p className="text-sm text-slate-400 mt-1">Log in met uw e-mail en wachtwoord</p>
          </div>

          {error && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-center text-sm font-medium" data-testid="auth-error">
              {error}
            </div>
          )}

          {/* Tab toggle: e-mail/wachtwoord vs QR code */}
          <div className="mb-5 grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl"
            data-testid="login-method-tabs">
            <button type="button" onClick={() => setLoginMethod('password')}
              data-testid="tab-password"
              className={`h-10 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                loginMethod === 'password'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              <KeyRound className="w-4 h-4" /> Wachtwoord
            </button>
            <button type="button" onClick={() => setLoginMethod('qr')}
              data-testid="tab-qr"
              className={`h-10 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                loginMethod === 'qr'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              <QrCode className="w-4 h-4" /> QR code
            </button>
          </div>

          {loginMethod === 'qr' ? (
            <div className="py-6">
              <QrLoginTab
                primary={branding?.primary_color || '#FF5C00'}
                onSuccess={() => { window.location.assign('/admin'); }}
              />
              <p className="text-center text-xs text-slate-400 mt-5">
                Geen telefoon bij de hand?{' '}
                <button onClick={() => setLoginMethod('password')}
                  data-testid="qr-switch-password"
                  className="font-bold text-[#FF5C00] hover:underline">
                  Gebruik wachtwoord
                </button>
              </p>
            </div>
          ) : (

          <form onSubmit={submit} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">E-mailadres</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="auth-email"
                    required autoComplete="username" name="email" id="login-email"
                    className="w-full h-12 text-base px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition"
                    placeholder="naam@bedrijf.sr" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Wachtwoord</label>
                  <div className="relative">
                    <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                      data-testid="auth-password" required minLength={6}
                      autoComplete="current-password" name="password" id="login-password"
                      className="w-full h-12 text-base px-4 pr-11 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition" />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
                      data-testid="auth-remember"
                      className="w-4 h-4 rounded border-2 border-slate-300 text-[#FF5C00] focus:ring-[#FF5C00]/30 cursor-pointer" />
                    Onthoud mij
                  </label>
                  <button type="button" onClick={() => setShowForgot(true)}
                    data-testid="auth-forgot-link"
                    className="text-sm text-[#FF5C00] font-semibold hover:underline">
                    Wachtwoord vergeten?
                  </button>
                </div>

            <button type="submit" disabled={loading} data-testid="auth-submit"
              className="w-full h-14 mt-1 bg-[#FF5C00] hover:bg-[#E05200] text-white rounded-xl text-lg font-semibold transition-all active:scale-[0.97] shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                <><LogIn className="w-5 h-5" /> Inloggen</>
              )}
            </button>
          </form>
          )}

          {/* Mode switcher — alleen op generieke /login. Op /<slug>/login is
              registratie niet relevant (klanten loggen in, ze maken geen
              nieuw bedrijf aan). */}
          {!branding?.slug && (
            <p className="text-center text-sm text-slate-400 mt-4">
              Nog geen account?{' '}
              <button onClick={() => { setMode('register'); setError(''); }}
                data-testid="auth-switch-mode"
                className="text-[#FF5C00] font-semibold hover:underline">
                Registreer hier
              </button>
            </p>
          )}
        </div>
        )}
      </div>

      {showForgot && (
        <ForgotPasswordModal initialEmail={email} onClose={() => setShowForgot(false)} />
      )}
    </div>
  );
}

// =====================================================================
// Forgot Password Modal — wachtwoord herstel via email + WhatsApp
// =====================================================================
function ForgotPasswordModal({ initialEmail, onClose }) {
  const [stage, setStage] = useState('request');  // 'request' | 'verify' | 'done'
  const [email, setEmail] = useState(initialEmail || '');
  const [channel, setChannel] = useState('email');  // 'email' | 'whatsapp'
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const requestCode = async (e) => {
    e?.preventDefault();
    setLoading(true); setErr(''); setInfo('');
    try {
      const { data } = await api.post('/auth/forgot-password', { email, channel });
      setInfo(data?.message || `Code verzonden via ${channel === 'email' ? 'e-mail' : 'WhatsApp'}.`);
      setStage('verify');
    } catch (e) {
      setErr(formatError(e, 'Kon code niet versturen'));
    } finally { setLoading(false); }
  };

  const submitReset = async (e) => {
    e?.preventDefault();
    setLoading(true); setErr('');
    try {
      await api.post('/auth/reset-password', { email, code: code.trim(), new_password: newPassword });
      setStage('done');
    } catch (e) {
      setErr(formatError(e, 'Reset mislukt'));
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      data-testid="forgot-password-modal" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 bg-[#FF5C00] text-white">
          <p className="text-lg font-extrabold">Wachtwoord vergeten</p>
          <p className="text-xs opacity-90 mt-0.5">
            {stage === 'request' && 'Kies hoe je de herstelcode wilt ontvangen'}
            {stage === 'verify' && 'Voer de ontvangen code in en kies een nieuw wachtwoord'}
            {stage === 'done' && 'Wachtwoord succesvol gewijzigd'}
          </p>
        </div>

        {stage === 'request' && (
          <form onSubmit={requestCode} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">E-mailadres</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                data-testid="forgot-email"
                className="w-full h-12 text-base px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Verstuur code via</label>
              <div className="grid grid-cols-2 gap-2">
                {[{ id: 'email', label: 'E-mail' }, { id: 'whatsapp', label: 'WhatsApp' }].map((c) => (
                  <button key={c.id} type="button" onClick={() => setChannel(c.id)}
                    data-testid={`forgot-channel-${c.id}`}
                    className={`py-3 rounded-xl font-bold text-sm transition ${
                      channel === c.id ? 'bg-[#FF5C00] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{err}</p>}
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose} disabled={loading}
                className="flex-1 py-2.5 rounded-lg bg-white border-2 border-slate-200 text-slate-700 font-bold text-sm">
                Annuleren
              </button>
              <button type="submit" disabled={loading || !email}
                data-testid="forgot-send-btn"
                className="flex-[2] py-2.5 rounded-lg bg-[#FF5C00] text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Verstuur code
              </button>
            </div>
          </form>
        )}

        {stage === 'verify' && (
          <form onSubmit={submitReset} className="p-6 space-y-4">
            {info && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">{info}</p>}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Herstelcode (6 cijfers)</label>
              <input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                required data-testid="forgot-code"
                className="w-full h-14 text-center text-2xl font-mono tracking-[0.5em] px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Nieuw wachtwoord</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  required minLength={6} data-testid="forgot-new-password"
                  className="w-full h-12 text-base px-4 pr-11 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] focus:ring-4 focus:ring-[#FF5C00]/10 bg-[#F9FAFB] outline-none transition" />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{err}</p>}
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setStage('request')} disabled={loading}
                className="flex-1 py-2.5 rounded-lg bg-white border-2 border-slate-200 text-slate-700 font-bold text-sm">
                Terug
              </button>
              <button type="submit" disabled={loading || code.length !== 6 || newPassword.length < 6}
                data-testid="forgot-reset-btn"
                className="flex-[2] py-2.5 rounded-lg bg-[#FF5C00] text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Reset wachtwoord
              </button>
            </div>
          </form>
        )}

        {stage === 'done' && (
          <div className="p-6 text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle className="w-9 h-9 text-emerald-500" />
            </div>
            <p className="text-base font-bold text-slate-900">Wachtwoord gewijzigd</p>
            <p className="text-sm text-slate-500">Je kunt nu inloggen met je nieuwe wachtwoord.</p>
            <button onClick={onClose} data-testid="forgot-done-close"
              className="w-full py-2.5 rounded-lg bg-[#FF5C00] text-white font-bold text-sm">
              Sluiten
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RegisterSuccess({ plan, company, bankDetails, onContinue }) {
  const ref = `ABONNEMENT — ${company || ''} — ${new Date().toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })}`;
  return (
    <div className="flex flex-col" style={{
      position: 'fixed', inset: 0, backgroundColor: '#F97316',
      overflowY: 'auto', WebkitOverflowScrolling: 'touch',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      paddingLeft: 'env(safe-area-inset-left, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
    }}>
      <Header />
      <div className="flex-1 flex items-start sm:items-center justify-center p-4 sm:p-6">
        <div className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] w-full max-w-2xl p-6 sm:p-10" data-testid="register-success">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <Check className="w-10 h-10 text-emerald-600" strokeWidth={3} />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Welkom bij SuriRent!</h2>
            <p className="text-sm text-slate-500 mt-1">Uw eigen omgeving is aangemaakt voor <span className="font-bold text-slate-900">{company}</span>.</p>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-200 p-4 mb-5">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-orange-700">14 dagen proefperiode</p>
                <p className="text-sm font-bold text-slate-900 mt-0.5">Volledige toegang tot {plan.name}</p>
              </div>
              <p className="text-xl font-extrabold text-[#FF5C00] whitespace-nowrap">
                {plan.currency} {Number(plan.amount).toLocaleString('nl-NL')}
                <span className="text-[10px] font-medium text-slate-500 ml-1">/maand</span>
              </p>
            </div>
            <p className="text-xs text-slate-600">Na 14 dagen ontvangt u een factuur per e-mail. Annuleer vrijblijvend via uw beheerder-dashboard.</p>
          </div>

          {bankDetails && (
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 mb-5" data-testid="success-bank-details">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">Bankoverschrijving</p>
              <div className="space-y-1.5 text-sm">
                <Bank label="Bank" value={bankDetails.bank_name} />
                <Bank label="Tenaamstelling" value={bankDetails.account_name} />
                <Bank label="Rekeningnummer" value={bankDetails.account_number} mono />
                {bankDetails.swift && <Bank label="SWIFT" value={bankDetails.swift} mono />}
                <Bank label="Omschrijving" value={ref} mono />
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Vragen? {bankDetails.whatsapp && <>WhatsApp <a href={`https://wa.me/${bankDetails.whatsapp.replace(/\D/g, '')}`} className="text-orange-600 font-bold">{bankDetails.whatsapp}</a> · </>}
                {bankDetails.support_email && <>E-mail <a href={`mailto:${bankDetails.support_email}`} className="text-orange-600 font-bold">{bankDetails.support_email}</a></>}
              </p>
            </div>
          )}

          <button onClick={onContinue} data-testid="success-continue"
            className="w-full h-14 bg-[#FF5C00] hover:bg-[#E05200] text-white rounded-xl text-lg font-extrabold transition shadow-lg shadow-orange-500/20">
            Naar mijn dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

function Bank({ label, value, mono }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={`font-bold text-slate-900 text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

export default function LoginPage() {
  const navigate = useBrandedNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading, refresh } = useAuth();
  // Initial view from ?view=admin or ?view=register query string (e.g. when arriving
  // from the Kiosk "Beheerder" button or a marketing CTA). Defaults to PIN keypad.
  const initialView = (() => {
    const v = (searchParams.get('view') || '').toLowerCase();
    if (v === 'admin' || v === 'login' || v === 'password') return 'login';
    if (v === 'register' || v === 'signup') return 'register';
    if (v === 'pin') return 'pin';   // explicit PIN view (for testing / branded entry)
    // Shortcut: ?register=1 from marketing topbar
    if (searchParams.get('register') === '1') return 'register';
    // Desktop default: skip PIN keypad and show email login form directly.
    // Mobile keeps PIN-first flow (more tactile + branded). We detect via
    // viewport width on initial render — a no-op on SSR (window check).
    try {
      if (typeof window !== 'undefined' && window.innerWidth >= 1024) return 'login';
    } catch { /* noop */ }
    return 'pin';
  })();
  const [view, setView] = useState(initialView);
  const [skipRedirect, setSkipRedirect] = useState(false);

  // ────────────────────────────────────────────────────────────────────
  // Registratie modal-redirect — wanneer iemand op /login?register=1 of
  // /login?view=register komt (bookmark, oude links, marketing CTA),
  // sturen we hem terug naar de landing met de popup direct open.
  // De register-pagina bestaat namelijk niet meer als losse view.
  //
  // BELANGRIJK: alleen op de GENERIEKE /login route. Op een branded
  // /<slug>/login is registreren niet relevant — klanten loggen daar
  // alleen in, er wordt geen nieuw bedrijf aangemaakt.
  // ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (initialView !== 'register') return;
    try {
      const path = window.location.pathname || '';
      // Plain /login → redirect. Branded /<slug>/login → laat zoals het is
      // (de register view zal daar zelf de "alleen inloggen" mode forceren).
      if (/^\/login(\/|$)/i.test(path)) {
        window.location.replace('/?register=1');
      }
    } catch { /* ignore */ }
  }, [initialView]);

  // Branding state — start from cache for instant render, then fetch fresh.
  const [branding, setBranding] = useState(() => {
    const cached = readCachedBranding();
    if (cached) {
      return { ...cached, _logoResolved: resolveLogoUrl(cached.logo_url) };
    }
    return null;
  });

  useEffect(() => {
    // document.title wordt centraal beheerd door usePwaManifest()
  }, []);

  // Login is volledig brand-oranje. We zetten body+#root in PWA standalone
  // op oranje (via body class) zodat het home-indicator gebied en eventuele
  // 1px doorlek aan de notch dezelfde kleur tonen. Ook updaten we de
  // theme-color meta zodat de Android-statusbalk oranje wordt. Unmount
  // (bv. navigatie naar /admin of /kiosk) herstelt automatisch.
  useEffect(() => {
    const primary = (branding?.primary_color || '#FF5C00');
    document.body.classList.add('login-mode');
    document.documentElement.classList.add('login-mode-html');
    document.body.style.setProperty('--login-bg', primary);
    document.documentElement.style.setProperty('--login-bg', primary);
    const meta = document.querySelector('meta[name="theme-color"]:not([media])')
      || document.querySelector('meta[name="theme-color"]');
    const prev = meta?.getAttribute('content');
    if (meta) meta.setAttribute('content', primary);
    return () => {
      document.body.classList.remove('login-mode');
      document.documentElement.classList.remove('login-mode-html');
      document.body.style.removeProperty('--login-bg');
      document.documentElement.style.removeProperty('--login-bg');
      if (meta && prev) meta.setAttribute('content', prev);
    };
  }, [branding]);

  // PWA bedrijfs-context fallback. Wanneer iOS Safari de oude (verkeerde)
  // start_url heeft gecaptured (`/login` zonder slug) maar de gebruiker
  // eerder een bedrijfs-tenant heeft bezocht, redirecten we automatisch
  // naar `/<slug>/login` zodat de PIN-flow en branding correct laden.
  //
  // Dit is een vangnet voor het iOS PWA install-cache probleem waar de
  // start_url is geboekt vóór onze slug-aware manifest fix. Een normale
  // hard refresh kan iOS niet zomaar overrulen — vandaar deze in-app redir.
  useEffect(() => {
    try {
      const path = (window.location.pathname || '').toLowerCase();
      // Alleen op de generieke /login (niet al binnen een /<slug>/login).
      const onPlainLogin = path === '/login' || path === '/login/';
      if (!onPlainLogin) return;
      // Alleen wanneer er ECHT geen slug in de URL zit (geen ?c=, geen /c/<slug>).
      const params = new URLSearchParams(window.location.search);
      if (params.get('c')) return;
      // We vertrouwen op de eerder opgeslagen slug uit localStorage. Die
      // wordt gezet door BrandedShell bij elk bezoek aan /<slug>/...
      const stored = (typeof window !== 'undefined' && window.localStorage)
        ? (window.localStorage.getItem('pwa_company_slug') || '').trim().toLowerCase()
        : '';
      if (!stored) return;
      // Slug-shape sanity check (a-z, 0-9, dashes).
      if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(stored)) return;
      // Bouw target met behoud van bestaande query params (source=pwa, view=admin etc.)
      const qs = window.location.search || '';
      const next = `/${stored}/login${qs}`;
      window.location.replace(next);
    } catch { /* noop */ }
  }, []);

  // Resolve and apply company branding on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const slug = detectCompanySlug();
      let data = slug ? await fetchBranding(slug) : null;
      // Last resort: ask the backend based on the Host header (works for wildcard DNS
      // setups where the slug detector couldn't read window.location.hostname reliably).
      if (!data) {
        data = await fetchBrandingByHost();
      }
      if (cancelled) return;
      if (!data) {
        clearBrandingCache();
        setBranding(null);
        return;
      }
      const enriched = { ...data, _logoResolved: resolveLogoUrl(data.logo_url) };
      applyBranding(data);
      setBranding(enriched);
      // document.title wordt centraal beheerd door usePwaManifest()
    })();
    return () => { cancelled = true; };
  }, []);

  // PWA shortcut target. Two PWA app icons:
  //   /login?source=pwa&target=kiosk → after PIN, go to /kiosk
  //   /login?source=pwa&target=admin → after PIN, go to /admin (PIN gives both tokens)
  // Defaults to 'kiosk' (the original Kiosk-first PWA experience).
  const pwaTarget = (() => {
    const t = (searchParams.get('target') || '').toLowerCase();
    return t === 'admin' ? 'admin' : 'kiosk';
  })();

  // PWA: if user has a stored preferred role AND a still-valid token for that role,
  // jump directly to that surface (kiosk / admin / tenant). The token-check prevents
  // redirect loops when a token has expired or been revoked.
  // If the URL contains an explicit `target`, prefer that over the stored role so
  // the Beheer-shortcut always lands on /admin (or its PIN-gate) and not on /kiosk.
  useEffect(() => {
    if (!isStandalonePWA()) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('pick') === '1') return; // explicit override: show login picker
    if (params.get('view')) return; // explicit view override → respect it
    const targetParam = (params.get('target') || '').toLowerCase();
    const role = targetParam === 'admin' ? 'admin'
      : targetParam === 'kiosk' ? 'kiosk'
      : getPreferredRole();
    if (!role) return;
    const tokenKey = role === 'admin' ? 'admin_token'
      : role === 'tenant' ? 'tenant_token'
      : 'kiosk_token';
    let hasToken = false;
    try { hasToken = !!localStorage.getItem(tokenKey); } catch { /* ignore */ }
    if (!hasToken) return;
    navigate(routeForRole(role), { replace: true });
  }, [navigate]);

  // Auto-redirect if already logged (but not when we're showing the success screen
  // OR wanneer er een pending QR claim is — de submit-handler zelf navigeert dan
  // naar /qr-link?token=... en deze useEffect zou dat anders overschrijven met
  // /admin (race-conditie).
  useEffect(() => {
    if (!loading && user && !skipRedirect) {
      let hasPendingQr = false;
      try { hasPendingQr = !!sessionStorage.getItem('pending_qr_token'); } catch { /* ignore */ }
      if (hasPendingQr) return;
      navigate('/admin', { replace: true });
    }
  }, [user, loading, navigate, skipRedirect]);

  if (view === 'login' || view === 'register') {
    return (
      <PasswordView initialMode={view} onBack={() => setView('pin')}
        onRegistered={() => setSkipRedirect(true)} branding={branding} />
    );
  }

  // Geen bedrijfs-context (gebruiker is op generieke `/login`, niet op
  // `/<slug>/login`)? → PIN-login is hier zinloos en zou onveilig zijn
  // (kruis-bedrijf matching). Toon direct het e-mail+wachtwoord formulier.
  // Klanten openen de PIN-flow alleen via hun branded URL.
  if (!branding?.slug) {
    return (
      <PasswordView initialMode="login" onBack={() => {}}
        onRegistered={() => setSkipRedirect(true)} branding={null} />
    );
  }

  // After PIN-success, navigate to the target surface. Both shortcuts require
  // PIN entry; the difference is only where the user lands afterwards.
  // BELANGRIJK: medewerker-PIN logins krijgen GEEN admin_token, dus we sturen
  // ze altijd naar /kiosk — ook als ze de "Beheer"-shortcut hebben gebruikt.
  //
  // SOFT NAVIGATIE: vroeger deden we `window.location.assign('/admin')` zodat
  // AuthProvider /auth/me opnieuw uitvoerde. Dat veroorzaakte echter een
  // full page reload + spinner flash. We doen nu refresh() (vernieuw /auth/me
  // in dezelfde React tree) en daarna een soft navigate. Geen flash, instant.
  const onPinSuccess = async () => {
    let hasAdmin = false;
    try { hasAdmin = !!localStorage.getItem('admin_token'); } catch { /* ignore */ }
    if (pwaTarget === 'admin' && hasAdmin) {
      setPreferredRole('admin');
      // Refresh AuthProvider zodat de nieuwe admin_token meteen actief is.
      // Soft navigate naar /admin nadat user state is bijgewerkt.
      try { await refresh(); } catch { /* niet-fataal */ }
      navigate('/admin', { replace: true });
    } else {
      navigate('/kiosk', { replace: true });
    }
  };

  return (
    <PinLanding
      branding={branding}
      pwaTarget={pwaTarget}
      onSuccess={onPinSuccess}
      onPassword={() => setView('login')}
      onRegister={() => setView('register')}
    />
  );
}
