import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2, ArrowRight, ArrowLeft, Banknote, CreditCard, Receipt, LogOut,
  Check, Loader2, Home, Search, X, Wallet, ChevronRight, KeySquare,
} from 'lucide-react';
import { api, formatError, fmtMoney, MONTHS_NL } from '../../lib/api';

const variants = {
  enter: { opacity: 0, x: 60 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -60 },
};

function Clock() {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  return (
    <div className="text-right text-white">
      <p className="text-lg sm:text-2xl font-bold leading-none">{t.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</p>
      <p className="text-xs sm:text-sm text-white/80 capitalize mt-0.5">{t.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
    </div>
  );
}

function KioskHeader({ onExit }) {
  return (
    <div className="flex items-center justify-between px-4 sm:px-8 py-4 bg-orange-600/30 backdrop-blur-sm border-b border-white/20">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-white flex items-center justify-center shadow-lg p-1">
          <img src="/kiosk-icons/kiosk-192.png" alt="Kiosk" className="w-full h-full object-contain" />
        </div>
        <div>
          <h1 className="text-base sm:text-lg font-black text-white tracking-tight">Vastgoed Kiosk</h1>
          <p className="text-[10px] sm:text-xs text-white/80">Selfservice terminal</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Clock />
        <button onClick={onExit} data-testid="kiosk-exit"
          className="ml-2 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold backdrop-blur-sm">
          <LogOut className="w-4 h-4" /> Uit
        </button>
      </div>
    </div>
  );
}

// ============== Welcome ==============
function Welcome({ onStart }) {
  return (
    <div className="h-full flex items-center justify-center p-4 sm:p-8">
      <div className="bg-white rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.25)] w-full max-w-2xl p-8 sm:p-12 text-center">
        <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-orange-500/40 p-4">
          <img src="/kiosk-icons/kiosk-512.png" alt="Kiosk" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tighter mb-3">Welkom</h1>
        <p className="text-base sm:text-lg text-slate-500 mb-8">Betaal uw huur, servicekosten en meer</p>
        <button onClick={onStart} data-testid="kiosk-start-btn"
          className="inline-flex items-center gap-3 px-10 py-5 bg-[#FF5C00] hover:bg-[#E05200] text-white text-xl font-black rounded-2xl shadow-[0_20px_40px_-10px_rgba(255,92,0,0.6)] active:scale-[0.98] transition-all">
          Start <ArrowRight className="w-6 h-6" />
        </button>
        <div className="mt-10 pt-8 border-t border-slate-100">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Beschikbare diensten</p>
          <div className="flex gap-3 sm:gap-6 justify-center flex-wrap">
            {[
              { icon: Banknote, label: 'Maandhuur' },
              { icon: Wallet, label: 'Servicekosten' },
              { icon: Receipt, label: 'Borg & Boetes' },
            ].map((s) => (
              <div key={s.label} className="bg-slate-50 rounded-2xl px-4 py-3 flex flex-col items-center">
                <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center mb-2">
                  <s.icon className="w-5 h-5 text-[#FF5C00]" />
                </div>
                <p className="text-xs font-bold text-slate-700">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== Apartment select ==============
function ApartmentSelect({ onSelect, onBack }) {
  const [apts, setApts] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.get('/kiosk/apartments').then((r) => setApts(r.data))
      .catch((e) => setErr(formatError(e)))
      .finally(() => setLoading(false));
  }, []);
  const filtered = useMemo(
    () => apts.filter((a) => !q ||
      a.number.toLowerCase().includes(q.toLowerCase()) ||
      (a.tenant_name || '').toLowerCase().includes(q.toLowerCase())
    ),
    [apts, q]
  );
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <button onClick={onBack} data-testid="apt-select-back"
          className="flex items-center gap-2 text-white/90 hover:text-white mb-4 font-bold">
          <ArrowLeft className="w-5 h-5" /> Terug
        </button>
        <div className="bg-white rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.25)] p-6 sm:p-8">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-1">Selecteer uw appartement</h2>
          <p className="text-sm text-slate-500 mb-5">Kies het appartement waarvoor u wilt betalen</p>

          <div className="relative mb-5">
            <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek appartement of naam..."
              data-testid="apt-search-kiosk"
              className="w-full h-14 pl-12 pr-4 rounded-2xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none text-lg" />
          </div>

          {loading ? (
            <div className="py-16 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#FF5C00]" /></div>
          ) : err ? (
            <div className="py-16 text-center text-red-500">{err}</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Home className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-semibold">Geen appartementen gevonden.</p>
              <p className="text-xs text-slate-400 mt-1">De beheerder moet appartementen aanmaken.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
              {filtered.map((a) => (
                <button key={a.id} disabled={!a.tenant_id} onClick={() => onSelect(a)}
                  data-testid={`apt-${a.id}`}
                  className={`text-left p-4 rounded-2xl border-2 transition-all ${
                    a.tenant_id
                      ? 'border-slate-200 hover:border-[#FF5C00] hover:bg-orange-50 active:scale-[0.98]'
                      : 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed'
                  }`}>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-widest text-[#FF5C00]">Appt. {a.number}</p>
                      <p className="font-bold text-slate-900 truncate mt-0.5">{a.tenant_name || 'Geen huurder'}</p>
                      <p className="text-xs text-slate-500 mt-1">{fmtMoney(a.rent_amount, a.currency)} / maand</p>
                    </div>
                    {a.tenant_id && <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============== Tenant overview ==============
function TenantOverview({ apartment, onBack, onPay }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!apartment?.tenant_id) return;
    api.get(`/kiosk/tenants/${apartment.tenant_id}/overview`)
      .then((r) => setData(r.data))
      .catch((e) => setErr(formatError(e)))
      .finally(() => setLoading(false));
  }, [apartment]);
  if (loading) {
    return <div className="h-full flex items-center justify-center"><Loader2 className="w-10 h-10 text-white animate-spin" /></div>;
  }
  if (err || !data) {
    return <div className="h-full flex items-center justify-center text-white p-8">{err || 'Geen data'}</div>;
  }
  const { tenant, apartment: apt, balance } = data;
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-8">
      <div className="max-w-3xl mx-auto">
        <button onClick={onBack} data-testid="overview-back" className="flex items-center gap-2 text-white/90 hover:text-white mb-4 font-bold">
          <ArrowLeft className="w-5 h-5" /> Terug
        </button>
        <div className="bg-white rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.25)] p-6 sm:p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] flex items-center justify-center">
              <Home className="w-7 h-7 text-white" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-[#FF5C00]">Appartement {apt.number}</p>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">{tenant.name}</h2>
              <p className="text-sm text-slate-500">{apt.address || ''}</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 mb-5">
            <div className="bg-gradient-to-br from-[#FFF4EC] to-[#FFE6D3] border border-[#FF5C00]/20 rounded-2xl p-4">
              <p className="text-xs font-bold text-[#C74600] uppercase tracking-widest">Maandhuur</p>
              <p className="text-2xl font-black text-slate-900 tracking-tight mt-1">{fmtMoney(apt.rent_amount, apt.currency)}</p>
            </div>
            <div className={`rounded-2xl p-4 border ${
              balance.balance > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'
            }`}>
              <p className={`text-xs font-bold uppercase tracking-widest ${balance.balance > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                {balance.balance > 0 ? 'Openstaand' : 'Saldo'}
              </p>
              <p className="text-2xl font-black text-slate-900 tracking-tight mt-1">
                {fmtMoney(Math.abs(balance.balance), balance.currency)}
              </p>
            </div>
          </div>

          {balance.next_period && balance.balance > 0 && (
            <div className="bg-slate-50 rounded-2xl p-4 mb-5">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Volgende termijn</p>
              <p className="text-lg font-black text-slate-900 capitalize">
                {MONTHS_NL[balance.next_period.month - 1]} {balance.next_period.year}
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-slate-50 rounded-xl p-3 text-center">
              <p className="text-[10px] uppercase font-bold text-slate-500">Maanden actief</p>
              <p className="text-xl font-black text-slate-900">{balance.months_due}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 text-center">
              <p className="text-[10px] uppercase font-bold text-slate-500">Totaal verschuldigd</p>
              <p className="text-xl font-black text-slate-900">{fmtMoney(balance.total_due, balance.currency).replace(balance.currency, '').trim()}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 text-center">
              <p className="text-[10px] uppercase font-bold text-slate-500">Betaald</p>
              <p className="text-xl font-black text-emerald-600">{fmtMoney(balance.total_paid, balance.currency).replace(balance.currency, '').trim()}</p>
            </div>
          </div>

          <button onClick={() => onPay(data)} data-testid="overview-pay-btn"
            className="w-full h-16 bg-[#FF5C00] hover:bg-[#E05200] text-white text-xl font-black rounded-2xl flex items-center justify-center gap-3 shadow-[0_20px_40px_-10px_rgba(255,92,0,0.6)] active:scale-[0.98] transition-all">
            Betaal nu <ArrowRight className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============== Payment select ==============
function PaymentSelect({ overview, onBack, onConfirm }) {
  const { tenant, apartment: apt, balance } = overview;
  const [amount, setAmount] = useState(balance.balance > 0 ? balance.balance : apt.rent_amount);
  const [method, setMethod] = useState('contant');
  const [category, setCategory] = useState('huur');
  const [period, setPeriod] = useState(balance.next_period || { month: new Date().getMonth() + 1, year: new Date().getFullYear() });

  const setQuick = (n) => setAmount(apt.rent_amount * n);

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        <button onClick={onBack} data-testid="payment-back" className="flex items-center gap-2 text-white/90 hover:text-white mb-4 font-bold">
          <ArrowLeft className="w-5 h-5" /> Terug
        </button>
        <div className="bg-white rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.25)] p-6 sm:p-8">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-1">Betaling instellen</h2>
          <p className="text-sm text-slate-500 mb-5">{tenant.name} · Appt. {apt.number}</p>

          <div className="mb-5">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Categorie</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {[
                { v: 'huur', l: 'Huur' },
                { v: 'servicekosten', l: 'Servicekosten' },
                { v: 'borg', l: 'Borg' },
                { v: 'boete', l: 'Boete' },
              ].map((c) => (
                <button key={c.v} onClick={() => setCategory(c.v)} data-testid={`cat-${c.v}`}
                  className={`h-12 rounded-xl font-bold text-sm transition-all ${
                    category === c.v ? 'bg-[#FF5C00] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}>{c.l}</button>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Bedrag ({apt.currency})</label>
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              data-testid="payment-amount"
              className="w-full mt-2 h-16 px-5 rounded-2xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none text-3xl font-black text-center" />
            <div className="grid grid-cols-3 gap-2 mt-2">
              {[
                { n: 1, l: '1 maand' },
                { n: 2, l: '2 maanden' },
                { n: 3, l: '3 maanden' },
              ].map((q) => (
                <button key={q.n} onClick={() => setQuick(q.n)} data-testid={`quick-${q.n}`}
                  className="h-10 rounded-xl bg-orange-50 hover:bg-orange-100 text-[#FF5C00] font-bold text-sm">
                  {q.l}
                </button>
              ))}
            </div>
          </div>

          {category === 'huur' && (
            <div className="mb-5">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Periode</label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <select value={period.month} onChange={(e) => setPeriod({ ...period, month: parseInt(e.target.value) })}
                  data-testid="payment-month"
                  className="h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
                  {MONTHS_NL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select value={period.year} onChange={(e) => setPeriod({ ...period, year: parseInt(e.target.value) })}
                  data-testid="payment-year"
                  className="h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
                  {[period.year - 1, period.year, period.year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="mb-5">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Betalingswijze</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {[
                { v: 'contant', l: 'Contant', icon: Banknote },
                { v: 'bank', l: 'Bank', icon: CreditCard },
                { v: 'mope', l: 'Mope', icon: CreditCard },
                { v: 'sumup', l: 'SumUp', icon: CreditCard },
              ].map((m) => {
                const Icon = m.icon;
                return (
                  <button key={m.v} onClick={() => setMethod(m.v)} data-testid={`method-${m.v}`}
                    className={`h-14 rounded-xl flex items-center justify-center gap-2 font-bold transition-all ${
                      method === m.v ? 'bg-[#FF5C00] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}>
                    <Icon className="w-4 h-4" /> {m.l}
                  </button>
                );
              })}
            </div>
          </div>

          <button onClick={() => onConfirm({
            tenant_id: tenant.id, apartment_id: apt.id,
            amount, currency: apt.currency, method, category,
            period_month: category === 'huur' ? period.month : null,
            period_year: category === 'huur' ? period.year : null,
            note: '',
          })}
            disabled={!amount || amount <= 0}
            data-testid="payment-continue"
            className="w-full h-16 bg-[#FF5C00] hover:bg-[#E05200] text-white text-xl font-black rounded-2xl flex items-center justify-center gap-3 shadow-[0_20px_40px_-10px_rgba(255,92,0,0.6)] active:scale-[0.98] transition-all disabled:opacity-50">
            Verder <ArrowRight className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============== Payment confirm ==============
function PaymentConfirm({ payload, overview, onBack, onSuccess }) {
  const { tenant, apartment: apt } = overview;
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setLoading(true); setErr('');
    try {
      const { data } = await api.post('/kiosk/payments', payload);
      onSuccess(data);
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  };
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-8">
      <div className="max-w-xl mx-auto">
        <button onClick={onBack} data-testid="confirm-back" className="flex items-center gap-2 text-white/90 hover:text-white mb-4 font-bold">
          <ArrowLeft className="w-5 h-5" /> Terug
        </button>
        <div className="bg-white rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.25)] p-6 sm:p-8">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-1">Bevestig betaling</h2>
          <p className="text-sm text-slate-500 mb-6">Controleer de gegevens voordat u doorgaat</p>

          <div className="bg-gradient-to-br from-[#FF8A3D] via-[#FF5C00] to-[#C74600] rounded-3xl p-6 mb-5 text-white text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-white/80">Te betalen</p>
            <p className="text-5xl font-black tracking-tighter mt-2">{fmtMoney(payload.amount, payload.currency)}</p>
            <p className="text-sm text-white/90 mt-2 capitalize">{payload.category}{payload.period_month ? ` · ${MONTHS_NL[payload.period_month - 1]} ${payload.period_year}` : ''}</p>
          </div>

          <div className="space-y-2 mb-5">
            <div className="flex justify-between items-center bg-slate-50 rounded-xl p-3">
              <span className="text-sm text-slate-500">Huurder</span>
              <span className="text-sm font-bold text-slate-900">{tenant.name}</span>
            </div>
            <div className="flex justify-between items-center bg-slate-50 rounded-xl p-3">
              <span className="text-sm text-slate-500">Appartement</span>
              <span className="text-sm font-bold text-slate-900">Appt. {apt.number}</span>
            </div>
            <div className="flex justify-between items-center bg-slate-50 rounded-xl p-3">
              <span className="text-sm text-slate-500">Betaalwijze</span>
              <span className="text-sm font-bold text-slate-900 capitalize">{payload.method}</span>
            </div>
          </div>

          {err && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">{err}</div>}

          <button onClick={submit} disabled={loading} data-testid="confirm-submit"
            className="w-full h-16 bg-emerald-500 hover:bg-emerald-600 text-white text-xl font-black rounded-2xl flex items-center justify-center gap-3 shadow-[0_20px_40px_-10px_rgba(16,185,129,0.5)] active:scale-[0.98] disabled:opacity-50">
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Check className="w-6 h-6" />}
            Bevestig betaling
          </button>
        </div>
      </div>
    </div>
  );
}

// ============== Receipt ==============
function ReceiptScreen({ payment, onDone }) {
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.25)] p-6 sm:p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <Check className="w-12 h-12 text-emerald-600" strokeWidth={3} />
          </div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Bedankt!</h2>
          <p className="text-base text-slate-500 mb-6">Uw betaling is succesvol verwerkt</p>

          <div className="bg-slate-50 rounded-2xl p-5 mb-5 text-left border-2 border-dashed border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Kwitantie</p>
                <p className="font-mono text-base font-black text-slate-900">{payment.receipt_number}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] p-1.5">
                <img src="/kiosk-icons/kiosk-512.png" alt="logo" className="w-full h-full object-contain" />
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Huurder</span><span className="font-bold text-slate-900">{payment.tenant_name}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Appartement</span><span className="font-bold text-slate-900">{payment.apartment_number || '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Categorie</span><span className="font-bold text-slate-900 capitalize">{payment.category}</span></div>
              {payment.period_month && (
                <div className="flex justify-between"><span className="text-slate-500">Periode</span><span className="font-bold text-slate-900 capitalize">{MONTHS_NL[payment.period_month - 1]} {payment.period_year}</span></div>
              )}
              <div className="flex justify-between"><span className="text-slate-500">Methode</span><span className="font-bold text-slate-900 capitalize">{payment.method}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Datum</span><span className="font-bold text-slate-900">{new Date(payment.paid_at).toLocaleString('nl-NL')}</span></div>
              <div className="flex justify-between pt-2 border-t border-dashed border-slate-200 mt-2">
                <span className="text-slate-500 font-bold">Totaal</span>
                <span className="font-black text-slate-900 text-lg">{fmtMoney(payment.amount, payment.currency)}</span>
              </div>
            </div>
          </div>

          <button onClick={onDone} data-testid="receipt-done"
            className="w-full h-14 bg-[#FF5C00] hover:bg-[#E05200] text-white text-lg font-black rounded-2xl shadow-[0_15px_30px_-10px_rgba(255,92,0,0.5)] active:scale-[0.98]">
            Klaar
          </button>
        </div>
      </div>
    </div>
  );
}

// ============== Main ==============
export default function KioskLayout() {
  const navigate = useNavigate();
  const [step, setStep] = useState('check');
  const [apartment, setApartment] = useState(null);
  const [overview, setOverview] = useState(null);
  const [paymentPayload, setPaymentPayload] = useState(null);
  const [paymentResult, setPaymentResult] = useState(null);

  // Verify kiosk token exists
  useEffect(() => {
    document.title = 'Vastgoed Kiosk';
    const tok = localStorage.getItem('kiosk_token');
    if (!tok) {
      navigate('/vastgoed/login', { replace: true });
      return;
    }
    setStep('welcome');
  }, [navigate]);

  const exit = useCallback(() => {
    localStorage.removeItem('kiosk_token');
    navigate('/vastgoed/login', { replace: true });
  }, [navigate]);

  const reset = () => {
    setApartment(null); setOverview(null);
    setPaymentPayload(null); setPaymentResult(null);
    setStep('welcome');
  };

  return (
    <div className="kiosk-fullscreen flex flex-col" data-testid="kiosk-root">
      <KioskHeader onExit={exit} />
      <div className="flex-1 min-h-0 relative">
        <AnimatePresence mode="wait">
          <motion.div key={step} variants={variants}
            initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="absolute inset-0 overflow-hidden">
            {step === 'check' && (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-white animate-spin" />
              </div>
            )}
            {step === 'welcome' && <Welcome onStart={() => setStep('select')} />}
            {step === 'select' && (
              <ApartmentSelect onBack={() => setStep('welcome')} onSelect={(a) => { setApartment(a); setStep('overview'); }} />
            )}
            {step === 'overview' && apartment && (
              <TenantOverview apartment={apartment} onBack={() => setStep('select')}
                onPay={(d) => { setOverview(d); setStep('payment'); }} />
            )}
            {step === 'payment' && overview && (
              <PaymentSelect overview={overview} onBack={() => setStep('overview')}
                onConfirm={(p) => { setPaymentPayload(p); setStep('confirm'); }} />
            )}
            {step === 'confirm' && paymentPayload && overview && (
              <PaymentConfirm payload={paymentPayload} overview={overview} onBack={() => setStep('payment')}
                onSuccess={(r) => { setPaymentResult(r); setStep('receipt'); }} />
            )}
            {step === 'receipt' && paymentResult && (
              <ReceiptScreen payment={paymentResult} onDone={reset} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
