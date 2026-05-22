import { useState } from 'react';
import { ShieldAlert, ArrowLeft, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function ImpersonationBanner() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!user?.impersonated_by) return null;

  const exit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/auth/stop-impersonating');
      if (data?.token) localStorage.setItem('admin_token', data.token);
      // Hard reload to clear all client state from the impersonated session
      window.location.href = '/admin';
    } finally { setBusy(false); }
  };

  return (
    <div className="w-full bg-slate-900 text-white px-3 sm:px-5 py-2.5 flex items-center gap-3"
      data-testid="impersonation-banner">
      <div className="w-8 h-8 rounded-lg bg-yellow-400/20 flex items-center justify-center shrink-0">
        <ShieldAlert className="w-4 h-4 text-yellow-300" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-extrabold leading-tight">Support modus actief</p>
        <p className="text-[11px] text-white/70 truncate">
          U bekijkt deze omgeving als superadmin <span className="font-bold text-yellow-300">{user.impersonated_by}</span>
        </p>
      </div>
      <button onClick={exit} disabled={busy} data-testid="exit-impersonation"
        className="px-3 sm:px-4 h-9 rounded-lg bg-white text-slate-900 hover:bg-slate-100 font-extrabold text-xs sm:text-sm flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowLeft className="w-3.5 h-3.5" />}
        Terug naar SaaS dashboard
      </button>
    </div>
  );
}
