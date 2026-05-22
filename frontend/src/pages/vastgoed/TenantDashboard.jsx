import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Home, Wallet, Receipt, Wrench, FileSignature, LogOut, Loader2,
  ArrowLeft, Plus, X, Check, AlertCircle, Calendar, FileText, ShieldCheck,
} from 'lucide-react';
import { api, formatError, fmtMoney, MONTHS_NL } from '../../lib/api';

function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString('nl-NL'); } catch { return iso; }
}

function fmtDateTime(iso) {
  try { return new Date(iso).toLocaleString('nl-NL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
}

function Header({ tenantName, onLogout }) {
  return (
    <div className="bg-gradient-to-r from-[#FF8A3D] via-[#FF5C00] to-[#C74600] text-white">
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white p-1.5 shadow-lg">
            <img src="/kiosk-icons/kiosk-512.png" alt="logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">Mijn Huurportaal</p>
            <p className="text-base font-black tracking-tight">{tenantName}</p>
          </div>
        </div>
        <button onClick={onLogout} data-testid="tenant-logout"
          className="p-2.5 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-sm">
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function Section({ title, action, children }) {
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-black uppercase tracking-widest text-[#FF5C00]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatusBadge({ status }) {
  const map = {
    open: { c: 'bg-blue-100 text-blue-700', l: 'Open' },
    in_progress: { c: 'bg-amber-100 text-amber-700', l: 'In behandeling' },
    done: { c: 'bg-emerald-100 text-emerald-700', l: 'Afgerond' },
    draft: { c: 'bg-amber-100 text-amber-700', l: 'Concept' },
    active: { c: 'bg-emerald-100 text-emerald-700', l: 'Actief' },
  };
  const s = map[status] || { c: 'bg-slate-100 text-slate-600', l: status };
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${s.c}`}>{s.l}</span>;
}

function MaintenanceForm({ onCancel, onSaved }) {
  const [data, setData] = useState({ title: '', description: '', priority: 'medium' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setLoading(true); setError('');
    try {
      const { data: r } = await api.post('/tenant-portal/maintenance', data);
      onSaved(r);
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4" data-testid="tenant-maint-modal">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-7 animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-black text-slate-900">Onderhoudsmelding</h3>
          <button onClick={onCancel} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        {error && <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Wat is er aan de hand? *</label>
            <input value={data.title} onChange={(e) => setData({ ...data, title: e.target.value })}
              data-testid="tenant-maint-title" required
              className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none"
              placeholder="Bv. Lekkende kraan, defecte airco..." />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Omschrijving</label>
            <textarea rows={4} value={data.description} onChange={(e) => setData({ ...data, description: e.target.value })}
              data-testid="tenant-maint-desc"
              className="w-full mt-1 px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none resize-none"
              placeholder="Beschrijf wat er gebeurt en sinds wanneer..." />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Spoed</label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {[
                { v: 'low', l: 'Niet urgent' },
                { v: 'medium', l: 'Normaal' },
                { v: 'high', l: 'Spoed!' },
              ].map((p) => (
                <button key={p.v} onClick={() => setData({ ...data, priority: p.v })}
                  data-testid={`tenant-maint-prio-${p.v}`}
                  className={`h-11 rounded-xl text-xs font-bold ${
                    data.priority === p.v
                      ? p.v === 'high' ? 'bg-red-500 text-white' : p.v === 'medium' ? 'bg-amber-500 text-white' : 'bg-slate-500 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}>
                  {p.l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button onClick={save} disabled={loading || !data.title} data-testid="tenant-maint-save"
          className="w-full mt-5 h-12 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Verstuur melding
        </button>
      </div>
    </div>
  );
}

export default function TenantDashboard() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [payments, setPayments] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [ov, pa, co, ma] = await Promise.all([
        api.get('/tenant-portal/overview'),
        api.get('/tenant-portal/payments'),
        api.get('/tenant-portal/contracts'),
        api.get('/tenant-portal/maintenance'),
      ]);
      setOverview(ov.data);
      setPayments(pa.data);
      setContracts(co.data);
      setMaintenance(ma.data);
    } catch {
      // expired or unauth → back to login
      localStorage.removeItem('tenant_token');
      navigate('/huurder', { replace: true });
    } finally { setLoading(false); }
  }, [navigate]);

  useEffect(() => {
    document.title = 'Mijn huurportaal';
    if (!localStorage.getItem('tenant_token')) {
      navigate('/huurder', { replace: true });
      return;
    }
    loadAll();
  }, [loadAll, navigate]);

  const logout = async () => {
    try { await api.post('/tenant-portal/logout'); } catch (err) { console.warn('Tenant logout API failed (continuing client-side):', err); }
    localStorage.removeItem('tenant_token');
    navigate('/huurder', { replace: true });
  };

  if (loading || !overview) {
    return (
      <div className="min-h-screen bg-[#FFF7F0] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#FF5C00]" />
      </div>
    );
  }

  const { tenant, apartment, balance } = overview;
  const hasBalance = balance.balance > 0;
  const apiBase = `${process.env.REACT_APP_BACKEND_URL}/api`;

  return (
    <div className="min-h-screen bg-[#FFF7F0]">
      <Header tenantName={tenant.name} onLogout={logout} />

      <main className="max-w-2xl mx-auto px-5 py-6 pb-20">
        {apartment ? (
          <div className="bg-white rounded-2xl border border-orange-100 p-5 mb-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] flex items-center justify-center">
                <Home className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#FF5C00]">Appartement {apartment.number}</p>
                <p className="font-bold text-slate-900">{apartment.address || '—'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gradient-to-br from-[#FFF4EC] to-[#FFE6D3] border border-[#FF5C00]/20 rounded-xl p-3">
                <p className="text-xs font-bold text-[#C74600] uppercase tracking-widest">Maandhuur</p>
                <p className="text-xl font-black text-slate-900 tracking-tight mt-1">{fmtMoney(apartment.rent_amount, apartment.currency)}</p>
              </div>
              <div className={`rounded-xl p-3 border ${hasBalance ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                <p className={`text-xs font-bold uppercase tracking-widest ${hasBalance ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {hasBalance ? 'Openstaand' : 'Saldo'}
                </p>
                <p className="text-xl font-black text-slate-900 tracking-tight mt-1">{fmtMoney(Math.abs(balance.balance), balance.currency)}</p>
              </div>
            </div>
            {hasBalance && balance.next_period && (
              <div className="mt-3 flex items-center gap-2 text-sm bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-amber-800">
                <AlertCircle className="w-4 h-4" />
                <span>Volgende termijn: <strong className="capitalize">{MONTHS_NL[balance.next_period.month - 1]} {balance.next_period.year}</strong></span>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-900">Geen appartement gekoppeld</p>
              <p className="text-sm text-amber-800">Neem contact op met de beheerder om uw appartement te koppelen.</p>
            </div>
          </div>
        )}

        <Section title={`Betalingen (${payments.length})`}>
          {payments.length === 0 ? (
            <div className="bg-white rounded-2xl border border-orange-100 p-6 text-center">
              <Receipt className="w-8 h-8 text-orange-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Nog geen betalingen geregistreerd.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-orange-100 divide-y divide-orange-50 overflow-hidden">
              {payments.slice(0, 10).map((p) => (
                <div key={p.id} data-testid={`tenant-payment-${p.id}`} className="p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
                    <Receipt className="w-4 h-4 text-[#FF5C00]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm capitalize">{p.category}</span>
                      {p.period_month && <span className="text-xs text-slate-400 capitalize">· {MONTHS_NL[p.period_month - 1]} {p.period_year}</span>}
                    </div>
                    <p className="text-xs text-slate-400 truncate">{p.receipt_number} · {fmtDateTime(p.paid_at)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-black text-slate-900 text-sm">{fmtMoney(p.amount, p.currency)}</p>
                    <a href={`${apiBase}/payments/${p.id}/pdf`} target="_blank" rel="noreferrer"
                      data-testid={`tenant-payment-pdf-${p.id}`}
                      className="text-[10px] text-[#FF5C00] font-bold uppercase tracking-wider hover:underline">PDF</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title={`Contracten (${contracts.length})`}>
          {contracts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-orange-100 p-6 text-center">
              <FileSignature className="w-8 h-8 text-orange-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Geen contracten.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-orange-100 divide-y divide-orange-50 overflow-hidden">
              {contracts.map((c) => (
                <div key={c.id} data-testid={`tenant-contract-${c.id}`} className="p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
                    <FileSignature className="w-4 h-4 text-[#FF5C00]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 text-sm font-mono">{c.contract_number}</p>
                    <p className="text-xs text-slate-400">Start: {c.start_date}{c.end_date && ` · Tot: ${c.end_date}`}</p>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <StatusBadge status={c.signed_at ? 'active' : 'draft'} />
                    <a href={`${apiBase}/contracts/${c.id}/pdf`} target="_blank" rel="noreferrer"
                      data-testid={`tenant-contract-pdf-${c.id}`}
                      className="text-[10px] text-[#FF5C00] font-bold uppercase tracking-wider hover:underline">PDF</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title={`Onderhoud (${maintenance.length})`}
          action={
            apartment && (
              <button onClick={() => setCreating(true)} data-testid="tenant-maint-new"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white text-xs font-bold shadow">
                <Plus className="w-3.5 h-3.5" /> Melden
              </button>
            )
          }>
          {maintenance.length === 0 ? (
            <div className="bg-white rounded-2xl border border-orange-100 p-6 text-center">
              <Wrench className="w-8 h-8 text-orange-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Geen lopende meldingen.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {maintenance.map((m) => (
                <div key={m.id} data-testid={`tenant-maint-${m.id}`}
                  className="bg-white rounded-2xl border border-orange-100 p-3">
                  <div className="flex items-start justify-between mb-1">
                    <p className="font-bold text-slate-900 text-sm">{m.title}</p>
                    <StatusBadge status={m.status} />
                  </div>
                  {m.description && <p className="text-xs text-slate-500 mb-2">{m.description}</p>}
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <Calendar className="w-3 h-3" />
                    {fmtDate(m.created_at)}
                    {m.resolved_at && <> · Afgerond {fmtDate(m.resolved_at)}</>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </main>

      {creating && <MaintenanceForm onCancel={() => setCreating(false)}
        onSaved={() => { setCreating(false); loadAll(); }} />}
    </div>
  );
}
