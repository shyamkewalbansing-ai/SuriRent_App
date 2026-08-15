// SaaS Kasregister — Superadmin Kiosk
// -----------------------------------------------------------------------------
// Een kiosk-stijl overzicht voor de SaaS-eigenaar: welk bedrijf heeft betaald,
// wie moet nog, en directe knoppen om een factuur te openen of een betaling
// te registreren. Vervangt de huurder-kiosk voor superadmin-gebruikers.
//
// Data-bron: GET /api/superadmin/kasregister → { companies: [...], totals: {...} }
// Refreshed elke 15s.
// -----------------------------------------------------------------------------

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Crown, Building2, CheckCircle, Clock, AlertCircle, ArrowLeft,
  RefreshCw, Loader2, Receipt, Banknote, Plus, ArrowRight,
} from 'lucide-react';
import { api, fmtMoney } from '../../../lib/api';

const STATUS_META = {
  overdue: { label: 'Achterstand', bg: 'bg-red-500', text: 'text-white', ring: 'ring-red-600', icon: AlertCircle, tone: 'from-red-500 to-red-700' },
  open:    { label: 'Open',        bg: 'bg-amber-500', text: 'text-white', ring: 'ring-amber-600', icon: Clock,       tone: 'from-amber-500 to-orange-600' },
  paid:    { label: 'Betaald',     bg: 'bg-emerald-500', text: 'text-white', ring: 'ring-emerald-600', icon: CheckCircle, tone: 'from-emerald-500 to-emerald-700' },
};

export default function SaasKasregister() {
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data: d } = await api.get('/superadmin/kasregister');
      setData(d);
    } catch { /* toon leegte */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center" data-testid="kasregister-loading">
        <Loader2 className="w-10 h-10 text-orange-400 animate-spin" />
      </div>
    );
  }

  const companies = data.companies || [];
  const filtered = statusFilter === 'all' ? companies : companies.filter((c) => c.status === statusFilter);
  const totals = data.totals || { overdue: 0, open: 0, paid: 0 };
  const grandTotalPerCurrency = companies.reduce((acc, c) => {
    for (const [cur, v] of Object.entries(c.outstanding_by_currency || {})) {
      acc[cur] = (acc[cur] || 0) + v;
    }
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white" data-testid="saas-kasregister">
      {/* Top bar */}
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-slate-950/80 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => nav('/admin/saas_overview')} data-testid="kasregister-back"
              className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #F8C260 0%, #D4A037 60%, #8B6914 100%)' }}>
              <Crown className="w-5 h-5 text-slate-900" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: '#F0C97A' }}>
                SaaS Kasregister
              </p>
              <h1 className="text-lg sm:text-xl font-black tracking-tight">Overzicht per bedrijf</h1>
            </div>
          </div>
          <button onClick={load} disabled={refreshing} data-testid="kasregister-refresh"
            className="h-10 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Vernieuwen</span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        {/* Totalen dashboard */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-5">
          <StatusCard status="overdue" count={totals.overdue} active={statusFilter === 'overdue'}
            onClick={() => setStatusFilter(statusFilter === 'overdue' ? 'all' : 'overdue')} />
          <StatusCard status="open" count={totals.open} active={statusFilter === 'open'}
            onClick={() => setStatusFilter(statusFilter === 'open' ? 'all' : 'open')} />
          <StatusCard status="paid" count={totals.paid} active={statusFilter === 'paid'}
            onClick={() => setStatusFilter(statusFilter === 'paid' ? 'all' : 'paid')} />
        </div>

        {/* Totaal openstaand */}
        {Object.keys(grandTotalPerCurrency).length > 0 && (
          <div className="mb-5 rounded-2xl p-4 border border-white/10"
            style={{ background: 'linear-gradient(135deg, rgba(248,194,96,0.08) 0%, rgba(212,160,55,0.02) 100%)' }}
            data-testid="grand-total">
            <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: '#F0C97A' }}>
              Totaal openstaand
            </p>
            <div className="flex items-baseline gap-4 flex-wrap">
              {Object.entries(grandTotalPerCurrency).map(([cur, v]) => (
                <p key={cur} className="text-2xl font-black tracking-tight">
                  <span className="text-sm opacity-60 mr-1">{cur}</span>
                  {Math.round(v).toLocaleString('nl-NL')}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Bedrijven grid */}
        {filtered.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-12 text-center" data-testid="kasregister-empty">
            <CheckCircle className="w-12 h-12 mx-auto text-emerald-400 mb-3" />
            <p className="text-lg font-black">Niets te tonen voor deze filter</p>
            <p className="text-sm text-white/60 mt-1">
              {statusFilter === 'paid' ? 'Geen betaalde bedrijven yet.' :
                statusFilter === 'open' ? 'Alle open facturen zijn opgevolgd — mooi!' :
                statusFilter === 'overdue' ? 'Geen achterstanden. 🎉' : 'Nog geen bedrijven met facturen.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4" data-testid="companies-grid">
            {filtered.map((c) => (
              <CompanyKioskCard key={c.id} company={c} onOpenInvoices={() => nav('/admin/saas_invoices')}
                onRegisterPayment={() => nav('/admin/saas_payments')} />
            ))}
          </div>
        )}

        {/* Snelle acties onderaan */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button onClick={() => nav('/admin/saas_invoices')}
            className="rounded-2xl p-4 border border-white/10 bg-white/5 hover:bg-white/10 transition text-left flex items-center gap-3"
            data-testid="quick-invoices">
            <div className="w-11 h-11 rounded-xl bg-orange-500/20 flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <p className="text-xs text-white/60 font-bold">Facturen</p>
              <p className="text-sm font-black">Bekijk alle</p>
            </div>
          </button>
          <button onClick={() => nav('/admin/saas_payments')}
            className="rounded-2xl p-4 border border-white/10 bg-white/5 hover:bg-white/10 transition text-left flex items-center gap-3"
            data-testid="quick-payments">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
              <Banknote className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-white/60 font-bold">Betalingen</p>
              <p className="text-sm font-black">Registreer</p>
            </div>
          </button>
          <button onClick={() => nav('/admin/saas_kasgeld')}
            className="rounded-2xl p-4 border border-white/10 bg-white/5 hover:bg-white/10 transition text-left flex items-center gap-3"
            data-testid="quick-kasgeld">
            <div className="w-11 h-11 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-white/60 font-bold">Kasgeld</p>
              <p className="text-sm font-black">Mutaties</p>
            </div>
          </button>
          <button onClick={() => nav('/admin/saas_payment_plans')}
            className="rounded-2xl p-4 border border-white/10 bg-white/5 hover:bg-white/10 transition text-left flex items-center gap-3"
            data-testid="quick-plans">
            <div className="w-11 h-11 rounded-xl bg-sky-500/20 flex items-center justify-center shrink-0">
              <Plus className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <p className="text-xs text-white/60 font-bold">Regeling</p>
              <p className="text-sm font-black">Maak nieuwe</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusCard — grote statistiek-tegel per status (klikbaar → filter)
// ---------------------------------------------------------------------------
function StatusCard({ status, count, active, onClick }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <button onClick={onClick} data-testid={`status-card-${status}`}
      className={`relative overflow-hidden rounded-2xl p-4 sm:p-5 text-left border transition-all ${
        active ? 'border-white/40 scale-[1.02]' : 'border-white/10 hover:border-white/20'
      }`}
      style={{ background: `linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)` }}>
      <div className={`inline-flex w-10 h-10 rounded-xl bg-gradient-to-br ${meta.tone} items-center justify-center mb-3`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <p className="text-3xl sm:text-4xl font-black tracking-tight" data-testid={`status-count-${status}`}>{count}</p>
      <p className="text-xs sm:text-sm text-white/60 font-bold mt-0.5">{meta.label}</p>
      {active && (
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-white animate-pulse" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// CompanyKioskCard — kiosk-tegel per bedrijf met status + snelle acties
// ---------------------------------------------------------------------------
function CompanyKioskCard({ company: c, onOpenInvoices, onRegisterPayment }) {
  const meta = STATUS_META[c.status] || STATUS_META.paid;
  const Icon = meta.icon;
  return (
    <div className={`rounded-2xl overflow-hidden border transition ${
      c.status === 'overdue' ? 'border-red-400/30 bg-gradient-to-br from-red-500/10 to-transparent' :
      c.status === 'open' ? 'border-amber-400/30 bg-gradient-to-br from-amber-500/10 to-transparent' :
      'border-emerald-400/20 bg-gradient-to-br from-emerald-500/5 to-transparent'
    }`}
      data-testid={`company-card-${c.id}`}>
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-black tracking-tight truncate" data-testid={`company-name-${c.id}`}>{c.name}</p>
            <p className="text-[10px] text-white/50 font-mono truncate">/{c.slug} · {c.plan || 'geen plan'}</p>
          </div>
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${meta.bg} ${meta.text}`}
            data-testid={`company-status-${c.id}`}>
            <Icon className="w-3 h-3" />
            {meta.label}
          </span>
        </div>

        {/* Outstanding */}
        <div className="mb-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/50">Openstaand</p>
          {Object.keys(c.outstanding_by_currency || {}).length === 0 ? (
            <p className="text-2xl font-black text-emerald-400 mt-1">✓ Voldaan</p>
          ) : (
            <div className="flex items-baseline gap-3 flex-wrap mt-1">
              {Object.entries(c.outstanding_by_currency).map(([cur, v]) => (
                <p key={cur} className="text-xl font-black tracking-tight">
                  <span className="text-xs opacity-60 mr-1">{cur}</span>
                  {Math.round(v).toLocaleString('nl-NL')}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Meta info */}
        <div className="grid grid-cols-3 gap-2 mb-4 pb-3 border-b border-white/10">
          <div>
            <p className="text-[9px] text-white/40 font-bold uppercase tracking-wider">Open</p>
            <p className="text-lg font-black" data-testid={`company-open-${c.id}`}>{c.open_count}</p>
          </div>
          <div>
            <p className="text-[9px] text-white/40 font-bold uppercase tracking-wider">Vervallen</p>
            <p className={`text-lg font-black ${c.overdue_count > 0 ? 'text-red-400' : ''}`}>{c.overdue_count}</p>
          </div>
          <div>
            <p className="text-[9px] text-white/40 font-bold uppercase tracking-wider">Betaald</p>
            <p className="text-lg font-black text-emerald-400">{c.paid_count}</p>
          </div>
        </div>

        {/* Last payment */}
        {c.last_payment && (
          <p className="text-[11px] text-white/50 mb-3">
            Laatste betaling: <span className="font-mono text-white/80">{fmtMoney(c.last_payment.amount, c.last_payment.currency)}</span> · {(c.last_payment.paid_at || '').slice(0, 10)}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={onOpenInvoices} data-testid={`open-invoices-${c.id}`}
            className="flex-1 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold flex items-center justify-center gap-1.5">
            <Receipt className="w-3.5 h-3.5" /> Facturen
          </button>
          <button onClick={onRegisterPayment} data-testid={`register-payment-${c.id}`}
            className="flex-1 h-10 rounded-xl bg-orange-500 hover:bg-orange-600 text-xs font-black text-white flex items-center justify-center gap-1.5">
            <Banknote className="w-3.5 h-3.5" /> Betaling
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
