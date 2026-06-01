// QrLinkPage — wordt geopend wanneer een geauthenticeerde gebruiker
// een QR scant via de native camera (deep-link). Bevestigt en claimt
// de desktop sessie.
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBrandedNavigate } from '../../lib/branded-nav';
import { api, formatError } from '../../lib/api';
import { Loader2, Check, X as XIcon, QrCode, Smartphone } from 'lucide-react';

export default function QrLinkPage() {
  const [params] = useSearchParams();
  const nav = useBrandedNavigate();
  const token = params.get('token');
  const [status, setStatus] = useState(token ? 'idle' : 'invalid'); // idle | claiming | success | error | invalid
  const [error, setError] = useState('');

  const claim = useCallback(async () => {
    if (!token) return;
    setStatus('claiming');
    try {
      await api.post(`/auth/qr/claim/${encodeURIComponent(token)}`);
      setStatus('success');
    } catch (e) {
      setError(formatError(e, 'QR sessie kon niet worden geclaimd.'));
      setStatus('error');
    }
  }, [token]);

  // Geen auth? Stuur naar login en bewaar token in sessionStorage zodat
  // we na inloggen alsnog kunnen claimen. ALS al ingelogd: auto-claim direct
  // zodat de gebruiker geen extra "Bevestig" tik nodig heeft (de scenario is:
  // /qr-link?token=X → /login → submit → terug naar /qr-link?token=X).
  useEffect(() => {
    if (!token) return;
    const t = localStorage.getItem('admin_token') || localStorage.getItem('kiosk_token');
    if (!t) {
      try { sessionStorage.setItem('pending_qr_token', token); } catch { /* ignore */ }
      nav('/login');
      return;
    }
    // Auto-claim als we via post-login redirect hier kwamen.
    let isPostLogin = false;
    try { isPostLogin = sessionStorage.getItem('pending_qr_token') === token; } catch { /* ignore */ }
    if (isPostLogin) {
      try { sessionStorage.removeItem('pending_qr_token'); } catch { /* ignore */ }
      claim();
    }
  }, [token, nav, claim]);

  if (status === 'invalid') {
    return (
      <div className="min-h-screen bg-[#FFF7F0] flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-red-50 flex items-center justify-center">
            <XIcon className="w-7 h-7 text-red-500" />
          </div>
          <h1 className="text-lg font-black text-slate-900">Ongeldige QR link</h1>
          <p className="text-sm text-slate-600 mt-2">Vraag een nieuwe QR aan op uw desktop.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF7F0] flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center"
        data-testid="qr-link-page">
        <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-orange-50 flex items-center justify-center">
          <QrCode className="w-7 h-7 text-[#FF5C00]" />
        </div>
        {status === 'idle' && (
          <>
            <h1 className="text-xl font-black text-slate-900">Desktop inloggen?</h1>
            <p className="text-sm text-slate-600 mt-2 mb-6">
              U staat op het punt om uw desktop sessie van SuriRent in te loggen via deze telefoon.
            </p>
            <button onClick={claim} data-testid="qr-link-confirm"
              className="w-full h-12 rounded-xl bg-[#FF5C00] hover:bg-[#C74600] text-white font-black text-sm transition-colors flex items-center justify-center gap-2">
              <Smartphone className="w-4 h-4" /> Bevestig en log in
            </button>
            <button onClick={() => nav('/')}
              className="mt-3 text-sm text-slate-500 hover:text-slate-700 font-bold">
              Annuleren
            </button>
          </>
        )}
        {status === 'claiming' && (
          <div className="py-6">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-[#FF5C00]" />
            <p className="text-sm font-bold text-slate-700 mt-3">Desktop wordt ingelogd…</p>
          </div>
        )}
        {status === 'success' && (
          <>
            <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-emerald-100 flex items-center justify-center">
              <Check className="w-8 h-8 text-emerald-600" strokeWidth={3} />
            </div>
            <h1 className="text-xl font-black text-slate-900">Desktop ingelogd!</h1>
            <p className="text-sm text-slate-600 mt-2">U kunt nu uw computer gebruiken.</p>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="text-lg font-black text-slate-900">Mislukt</h1>
            <p className="text-sm text-slate-600 mt-2">{error}</p>
            <button onClick={claim}
              className="mt-5 w-full h-11 rounded-xl bg-[#FF5C00] text-white font-bold text-sm">
              Opnieuw proberen
            </button>
          </>
        )}
      </div>
    </div>
  );
}
