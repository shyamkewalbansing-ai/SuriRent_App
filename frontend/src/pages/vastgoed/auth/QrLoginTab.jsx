import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Check, QrCode, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../../lib/api';

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
    if (!qr || status !== 'pending') return undefined;
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
            Tik &quot;Scan QR&quot; en richt op deze code.
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

export default QrLoginTab;
