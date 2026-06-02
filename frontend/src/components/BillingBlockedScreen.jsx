// BillingBlockedScreen — full-screen blok scherm wanneer het bedrijf
// een opgezegd / verlopen / past_due abonnement heeft. Verschijnt zodra
// een API call 402 retourneert met body.detail.code === 'billing_blocked'.
//
// Toont status + reden + contactactie. De gebruiker kan uitloggen of
// support contacteren. Heractivatie gebeurt door superadmin.

import { Lock, LogOut, MessageCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { useAuth } from '../lib/auth';

const STATUS_META = {
  cancelled: {
    title: 'Abonnement opgezegd',
    color: '#DC2626', // red-600
    bgFrom: 'from-red-500/20',
    icon: Lock,
    explanation: 'Uw SuriRent abonnement is opgezegd. U heeft geen toegang meer tot de admin omgeving. Neem contact op met support om uw abonnement te heractiveren.',
  },
  expired: {
    title: 'Proefperiode verlopen',
    color: '#EA580C', // orange-600
    bgFrom: 'from-orange-500/25',
    icon: AlertTriangle,
    explanation: 'Uw gratis proefperiode is afgelopen. Activeer een abonnement om weer toegang te krijgen tot uw vastgoedgegevens.',
  },
  past_due: {
    title: 'Betaling open',
    color: '#CA8A04', // yellow-600
    bgFrom: 'from-yellow-500/25',
    icon: AlertTriangle,
    explanation: 'Er staat nog een openstaande betaling. Voldoe deze om door te kunnen werken in uw omgeving.',
  },
};

export default function BillingBlockedScreen({ status = 'cancelled', message }) {
  const meta = STATUS_META[status] || STATUS_META.cancelled;
  const Icon = meta.icon;
  const { logout } = useAuth();
  const whatsappUrl = `https://wa.me/597XXXXXXX?text=${encodeURIComponent(
    `Hallo, mijn SuriRent abonnement is geblokkeerd (status: ${status}). Kunnen jullie helpen?`,
  )}`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-5 py-10"
      data-testid="billing-blocked-screen">
      <div className="max-w-xl w-full bg-white rounded-3xl shadow-[0_30px_60px_-20px_rgba(15,15,15,0.2)] overflow-hidden">
        {/* Header with status color */}
        <div className={`relative bg-gradient-to-br ${meta.bgFrom} to-white px-8 pt-10 pb-8`}>
          <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full opacity-20"
            style={{ background: meta.color, filter: 'blur(48px)' }} />
          <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
            style={{ background: meta.color }}>
            <Icon className="w-8 h-8 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 leading-tight">
            {meta.title}
          </h1>
          <p className="mt-3 text-base text-slate-600 leading-relaxed">
            {message || meta.explanation}
          </p>
        </div>

        {/* Actions */}
        <div className="px-8 py-6 space-y-3 bg-white">
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
            data-testid="billing-blocked-whatsapp"
            className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors">
            <MessageCircle className="w-4 h-4" /> Contact via WhatsApp
          </a>
          <a href="mailto:support@surirent.sr"
            data-testid="billing-blocked-email"
            className="w-full h-12 rounded-xl bg-slate-900 hover:bg-orange-500 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors">
            <MessageCircle className="w-4 h-4" /> support@surirent.sr
          </a>
          <button onClick={() => window.location.reload()}
            data-testid="billing-blocked-refresh"
            className="w-full h-11 rounded-xl border-2 border-slate-200 hover:border-orange-400 text-slate-700 text-sm font-bold flex items-center justify-center gap-2 transition-colors">
            <RefreshCw className="w-4 h-4" /> Toegang opnieuw controleren
          </button>
          <button onClick={async () => { try { await logout(); } catch { /* ignore */ } window.location.href = '/'; }}
            data-testid="billing-blocked-logout"
            className="w-full h-11 rounded-xl text-slate-400 hover:text-slate-700 text-sm font-bold flex items-center justify-center gap-2">
            <LogOut className="w-4 h-4" /> Uitloggen
          </button>
        </div>

        {/* Status footer */}
        <div className="px-8 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Status</p>
          <span className="text-xs font-bold text-slate-600 font-mono">{status}</span>
        </div>
      </div>
    </div>
  );
}
