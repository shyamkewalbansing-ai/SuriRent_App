import { useEffect, useState, useCallback, useMemo } from 'react';
import { Loader2, Plus, X, ArrowLeft, Check, Calendar, AlertCircle, CheckCircle2, XCircle, Clock, Trash2, FileText } from 'lucide-react';
import { api, formatError, fmtMoney, MONTHS_NL } from '../../../lib/api';
import { playApproveConfirm, playSwoosh, playErrorBuzz } from '../../../lib/tap-sounds';

// =====================================================================
// Top-level — list of payment plans + "Nieuwe regeling" knop
// =====================================================================
export default function PaymentPlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState(null); // plan in detail-view

  const load = useCallback(async () => {
    setErr('');
    try {
      const q = statusFilter && statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const { data } = await api.get(`/payment-plans${q}`);
      setPlans(data || []);
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  if (detail) {
    return <PlanDetail planId={detail.id} onBack={() => { setDetail(null); load(); }} />;
  }

  return (
    <div className="space-y-4 pb-24 sm:pb-6" data-testid="payment-plans-page">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900">Betalingsregelingen</h1>
          <p className="text-sm text-slate-500 mt-0.5">Maandelijkse of aangepaste termijn-plannen voor huurders met achterstand.</p>
        </div>
        <button onClick={() => setCreating(true)} data-testid="plan-new-btn"
          className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-2xl text-sm shadow-[0_10px_25px_-5px_rgba(255,92,0,0.5)]">
          <Plus className="w-4 h-4" /> Nieuwe regeling
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {[
          { v: 'active', l: 'Actief' },
          { v: 'completed', l: 'Voltooid' },
          { v: 'cancelled', l: 'Geannuleerd' },
          { v: 'all', l: 'Alles' },
        ].map((f) => (
          <button key={f.v} onClick={() => setStatusFilter(f.v)}
            data-testid={`plan-filter-${f.v}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
              statusFilter === f.v
                ? 'bg-[#FF5C00] text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}>
            {f.l}
          </button>
        ))}
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm" data-testid="plan-error">{err}</div>}
      {loading && <Loader2 className="w-8 h-8 animate-spin text-orange-500 mx-auto my-10" />}

      {!loading && plans.length === 0 && (
        <div className="bg-white rounded-2xl p-8 text-center shadow-sm" data-testid="plans-empty">
          <Calendar className="w-12 h-12 mx-auto text-slate-300 mb-2" />
          <p className="text-slate-500">Nog geen betalingsregelingen.</p>
        </div>
      )}

      {!loading && plans.length > 0 && (
        <div className="space-y-2">
          {plans.map((p) => <PlanRow key={p.id} plan={p} onClick={() => setDetail(p)} />)}
        </div>
      )}

      {creating && <CreatePlanSheet onClose={() => setCreating(false)} onCreated={(p) => { setCreating(false); setDetail(p); load(); }} />}
    </div>
  );
}

function PlanRow({ plan, onClick }) {
  const pct = plan.total_amount > 0 ? Math.round((plan.paid_amount / plan.total_amount) * 100) : 0;
  const statusBadge = {
    active: { l: 'Actief', cls: 'bg-orange-100 text-orange-700' },
    completed: { l: 'Voltooid', cls: 'bg-emerald-100 text-emerald-700' },
    cancelled: { l: 'Geannuleerd', cls: 'bg-slate-200 text-slate-600' },
  }[plan.status] || { l: plan.status, cls: 'bg-slate-100 text-slate-600' };
  return (
    <button onClick={onClick} data-testid={`plan-row-${plan.id}`}
      className="w-full text-left bg-white hover:bg-slate-50 active:bg-slate-100 rounded-2xl shadow-sm p-4 flex items-center gap-3 border border-slate-100">
      <div className="w-11 h-11 rounded-xl bg-orange-50 text-[#FF5C00] flex items-center justify-center shrink-0">
        <Calendar className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-black text-slate-900 truncate">{plan.tenant_name || 'Onbekende huurder'}</p>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${statusBadge.cls}`}>{statusBadge.l}</span>
          {plan.overdue_count > 0 && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-red-100 text-red-700">
              {plan.overdue_count} achterstallig
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          {plan.installments.length} termijnen · {fmtMoney(plan.paid_amount, plan.currency)} / {fmtMoney(plan.total_amount, plan.currency)}
        </p>
        <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-[#FF5C00]" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-base font-black text-slate-900">{fmtMoney(plan.remaining_amount, plan.currency)}</p>
        <p className="text-[10px] text-slate-400">resterend</p>
      </div>
    </button>
  );
}

// =====================================================================
// Create plan — bottom sheet: kies huurder, totaal, # termijnen, freq
// =====================================================================
function CreatePlanSheet({ onClose, onCreated }) {
  useEffect(() => { playSwoosh(); }, []);
  const [tenants, setTenants] = useState([]);
  const [tenantId, setTenantId] = useState('');
  const [openInvoices, setOpenInvoices] = useState([]);
  const [selectedInvIds, setSelectedInvIds] = useState(new Set());
  const [currency, setCurrency] = useState('SRD');
  const [numInstallments, setNumInstallments] = useState(3);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [frequency, setFrequency] = useState('monthly');
  const [customMode, setCustomMode] = useState(false);
  const [customRows, setCustomRows] = useState([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Load tenants once
  useEffect(() => {
    api.get('/tenants').then((r) => setTenants((r.data || []).filter((t) => t.apartment_id))).catch(() => {});
  }, []);

  // Wanneer huurder verandert → laad zijn openstaande facturen
  useEffect(() => {
    if (!tenantId) { setOpenInvoices([]); setSelectedInvIds(new Set()); return; }
    api.get('/invoices', { params: { tenant_id: tenantId, status: 'open' } })
      .then((r) => {
        const list = r.data || [];
        setOpenInvoices(list);
        // Pre-select alle openstaande facturen
        setSelectedInvIds(new Set(list.map((x) => x.id)));
        if (list[0]?.currency) setCurrency(list[0].currency);
      })
      .catch(() => setOpenInvoices([]));
  }, [tenantId]);

  const selectedInvoices = useMemo(() =>
    openInvoices.filter((inv) => selectedInvIds.has(inv.id)),
    [openInvoices, selectedInvIds]);

  const totalFromInvoices = useMemo(() =>
    selectedInvoices.reduce((s, inv) => s + Number(inv.amount || 0), 0),
    [selectedInvoices]);

  const submit = async () => {
    if (!tenantId) { setErr('Kies een huurder'); playErrorBuzz(); return; }
    if (totalFromInvoices <= 0) { setErr('Selecteer minstens 1 factuur'); playErrorBuzz(); return; }
    setBusy(true); setErr('');
    try {
      const payload = {
        tenant_id: tenantId,
        invoice_ids: [...selectedInvIds],
        total_amount: totalFromInvoices,
        currency,
        notes,
      };
      if (customMode) {
        if (customRows.length < 2) throw new Error('Minimaal 2 termijnen vereist');
        payload.installments = customRows.map((r, i) => ({ sequence: i + 1, due_date: r.due_date, amount: Number(r.amount) }));
        // Backend valideert dat som == total
      } else {
        payload.num_installments = numInstallments;
        payload.start_date = startDate;
        payload.frequency = frequency;
      }
      const { data } = await api.post('/payment-plans', payload);
      playApproveConfirm();
      onCreated(data);
    } catch (e) { setErr(formatError(e, e.message)); playErrorBuzz(); }
    finally { setBusy(false); }
  };

  // Custom rows initialiseren bij switch + bij totaal/freq verandering opnieuw genereren
  useEffect(() => {
    if (!customMode) return;
    if (customRows.length === 0) {
      // Genereer initiele rows op basis van num+start+monthly
      const rows = [];
      const start = new Date(startDate);
      const per = totalFromInvoices > 0 ? Math.round((totalFromInvoices / numInstallments) * 100) / 100 : 0;
      let running = 0;
      for (let i = 0; i < numInstallments; i++) {
        const d = new Date(start.getFullYear(), start.getMonth() + i, start.getDate());
        const amt = i === numInstallments - 1 ? Math.round((totalFromInvoices - running) * 100) / 100 : per;
        running += per;
        rows.push({ due_date: d.toISOString().slice(0, 10), amount: amt });
      }
      setCustomRows(rows);
    }
    // eslint-disable-next-line
  }, [customMode]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      data-testid="create-plan-sheet" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 24px), 24px)' }}>
        <div className="p-6">
          <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-4 sm:hidden" />
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black text-slate-900">Nieuwe betalingsregeling</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
          </div>

          {/* Huurder selectie */}
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-black uppercase tracking-widest text-slate-500 mb-1">Huurder</label>
              <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}
                data-testid="plan-tenant-select"
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#FF5C00] focus:outline-none">
                <option value="">— Kies huurder —</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            {tenantId && openInvoices.length > 0 && (
              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-slate-500 mb-1">Openstaande facturen</label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {openInvoices.map((inv) => {
                    const sel = selectedInvIds.has(inv.id);
                    return (
                      <button key={inv.id} type="button" data-testid={`plan-inv-${inv.id}`}
                        onClick={() => {
                          const next = new Set(selectedInvIds);
                          if (sel) next.delete(inv.id); else next.add(inv.id);
                          setSelectedInvIds(next);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border-2 text-sm transition ${
                          sel ? 'bg-orange-50 border-orange-300' : 'bg-white border-slate-200 hover:border-orange-200'
                        }`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${sel ? 'bg-orange-500 border-orange-500' : 'border-slate-300'}`}>
                            {sel && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                          </div>
                          <span className="font-bold text-slate-800">
                            {inv.invoice_number || `${MONTHS_NL[(inv.period_month || 1) - 1]} ${inv.period_year || ''}`}
                          </span>
                        </div>
                        <span className="font-extrabold text-slate-900">{fmtMoney(inv.amount, inv.currency)}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Totaal geselecteerd: <b className="text-slate-900">{fmtMoney(totalFromInvoices, currency)}</b>
                </p>
              </div>
            )}

            {tenantId && openInvoices.length === 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700">
                Deze huurder heeft geen openstaande facturen.
              </div>
            )}

            {/* Frequentie + #termijnen */}
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-[11px] font-black uppercase tracking-widest text-slate-500 mb-1">Frequentie</span>
                <div className="flex gap-1">
                  {[{ v: 'monthly', l: 'Maandelijks' }, { v: 'custom', l: 'Custom' }].map((f) => (
                    <button key={f.v} type="button" onClick={() => { setFrequency(f.v); setCustomMode(f.v === 'custom'); }}
                      data-testid={`plan-freq-${f.v}`}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold ${
                        frequency === f.v ? 'bg-[#FF5C00] text-white' : 'bg-slate-100 text-slate-700'
                      }`}>{f.l}</button>
                  ))}
                </div>
              </label>
              <label className="block">
                <span className="block text-[11px] font-black uppercase tracking-widest text-slate-500 mb-1">Aantal termijnen</span>
                <input type="number" value={numInstallments} min={2} max={36}
                  onChange={(e) => setNumInstallments(parseInt(e.target.value) || 2)}
                  disabled={customMode}
                  data-testid="plan-num-installments"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm disabled:opacity-50" />
              </label>
            </div>

            {!customMode && (
              <label className="block">
                <span className="block text-[11px] font-black uppercase tracking-widest text-slate-500 mb-1">Startdatum</span>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  data-testid="plan-start-date"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" />
              </label>
            )}

            {customMode && (
              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-slate-500 mb-1">Termijnen (datum + bedrag)</label>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {customRows.map((r, i) => (
                    <div key={i} className="flex items-center gap-2" data-testid={`plan-custom-row-${i}`}>
                      <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-black shrink-0">{i + 1}</span>
                      <input type="date" value={r.due_date}
                        onChange={(e) => { const next = [...customRows]; next[i] = { ...next[i], due_date: e.target.value }; setCustomRows(next); }}
                        className="flex-1 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs" />
                      <input type="number" step="0.01" value={r.amount}
                        onChange={(e) => { const next = [...customRows]; next[i] = { ...next[i], amount: e.target.value }; setCustomRows(next); }}
                        className="w-24 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-right" />
                      <button type="button" onClick={() => setCustomRows(customRows.filter((_, j) => j !== i))}
                        className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button type="button"
                    onClick={() => setCustomRows([...customRows, { due_date: startDate, amount: 0 }])}
                    className="w-full mt-1 py-2 border-2 border-dashed border-slate-200 hover:border-orange-300 hover:bg-orange-50 rounded-lg text-xs font-bold text-slate-500">
                    + Termijn toevoegen
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Som: <b>{fmtMoney(customRows.reduce((s, r) => s + Number(r.amount || 0), 0), currency)}</b> · Doel: <b>{fmtMoney(totalFromInvoices, currency)}</b>
                </p>
              </div>
            )}

            <label className="block">
              <span className="block text-[11px] font-black uppercase tracking-widest text-slate-500 mb-1">Notitie (optioneel)</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                data-testid="plan-notes"
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none"
                placeholder="Reden voor regeling, afspraken, etc." />
            </label>

            {err && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" data-testid="plan-create-error">{err}</p>}

            <div className="flex gap-2 pt-2">
              <button onClick={onClose} disabled={busy}
                className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm">
                Annuleren
              </button>
              <button onClick={submit} disabled={busy || !tenantId || totalFromInvoices <= 0} data-testid="plan-create-submit"
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-xl text-sm disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Regeling aanmaken
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Plan detail — installments + pay-button per termijn + cancel
// =====================================================================
function PlanDetail({ planId, onBack }) {
  const [plan, setPlan] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [linkedInvoices, setLinkedInvoices] = useState([]);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/payment-plans/${planId}`);
      setPlan(data);
      // Haal de gelinkte facturen op (live paid_amount + remaining_amount)
      if (data.invoice_ids?.length > 0) {
        try {
          const { data: allInvs } = await api.get('/invoices');
          const linked = allInvs.filter((i) => data.invoice_ids.includes(i.id));
          // Sorteer oudst-eerst (zelfde FIFO als allocator)
          linked.sort((a, b) => (a.period_year - b.period_year) || (a.period_month - b.period_month));
          setLinkedInvoices(linked);
        } catch { /* ignore — niet kritisch */ }
      } else {
        setLinkedInvoices([]);
      }
    } catch (e) { setErr(formatError(e)); }
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  const payTermijn = async (seq) => {
    if (!window.confirm(`Markeer termijn ${seq} als betaald (contant)?`)) return;
    setBusy(true); setErr('');
    try {
      const { data } = await api.post(`/payment-plans/${planId}/installments/${seq}/pay`, { method: 'contant' });
      setPlan(data);
      playApproveConfirm();
    } catch (e) { setErr(formatError(e)); playErrorBuzz(); }
    finally { setBusy(false); }
  };

  const cancelPlan = async () => {
    if (!window.confirm('Regeling annuleren? Openstaande termijnen worden gecanceld.')) return;
    setBusy(true); setErr('');
    try {
      const { data } = await api.post(`/payment-plans/${planId}/cancel`);
      setPlan(data);
    } catch (e) { setErr(formatError(e)); }
    finally { setBusy(false); }
  };

  if (!plan) return <div className="py-10 text-center"><Loader2 className="w-7 h-7 animate-spin text-orange-500 mx-auto" /></div>;

  const pct = plan.total_amount > 0 ? Math.round((plan.paid_amount / plan.total_amount) * 100) : 0;

  return (
    <div className="space-y-4 pb-24 sm:pb-6" data-testid="plan-detail-page">
      <div className="flex items-center gap-2">
        <button onClick={onBack} data-testid="plan-detail-back"
          className="flex items-center gap-1.5 text-slate-700 font-bold bg-white hover:bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm">
          <ArrowLeft className="w-4 h-4" /> Terug
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-5 border border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-black text-slate-900 truncate">{plan.tenant_name}</h1>
            {plan.apartment_number && <p className="text-xs text-slate-500">Appt. {plan.apartment_number}</p>}
            {plan.notes && <p className="text-sm text-slate-600 mt-2">{plan.notes}</p>}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Resterend</p>
            <p className="text-2xl font-black text-slate-900">{fmtMoney(plan.remaining_amount, plan.currency)}</p>
            <p className="text-[11px] text-slate-500">van {fmtMoney(plan.total_amount, plan.currency)}</p>
          </div>
        </div>
        <div className="mt-4 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-orange-400 to-orange-600" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[11px] text-slate-500 mt-1">{pct}% afbetaald</p>
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm" data-testid="plan-detail-error">{err}</div>}

      {linkedInvoices.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden" data-testid="plan-linked-invoices">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Gekoppelde facturen</h2>
            <span className="text-[10px] font-bold text-slate-400">{linkedInvoices.length} factu{linkedInvoices.length === 1 ? 'ur' : 'ren'}</span>
          </div>
          <div className="divide-y divide-slate-100">
            {linkedInvoices.map((inv) => {
              const paid = Number(inv.paid_amount || 0);
              const total = Number(inv.amount || 0);
              const rem = Number(inv.remaining_amount || 0);
              const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
              const closed = (inv.status || '').toLowerCase() === 'paid';
              return (
                <div key={inv.id} className="px-4 py-3" data-testid={`plan-linked-inv-${inv.id}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      closed ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'
                    }`}>
                      {closed ? <CheckCircle2 className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 text-sm truncate">
                        {inv.invoice_number}
                        <span className="ml-2 text-xs font-normal text-slate-500 capitalize">
                          {MONTHS_NL[(inv.period_month || 1) - 1]} {inv.period_year}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {fmtMoney(paid, inv.currency)} van {fmtMoney(total, inv.currency)} betaald
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-base font-black ${closed ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {closed ? 'Voldaan' : fmtMoney(rem, inv.currency)}
                      </p>
                      {!closed && <p className="text-[10px] text-slate-400">nog open</p>}
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${closed ? 'bg-emerald-500' : 'bg-[#FF5C00]'}`}
                      style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Termijnen</h2>
          {plan.status === 'active' && (
            <button onClick={cancelPlan} disabled={busy} data-testid="plan-cancel-btn"
              className="text-xs font-bold text-red-600 hover:text-red-700">Annuleren</button>
          )}
        </div>
        <div className="divide-y divide-slate-100">
          {plan.installments.map((i) => {
            const today = new Date().toISOString().slice(0, 10);
            const isOverdue = i.status === 'pending' && i.due_date < today;
            return (
              <div key={i.sequence} className="px-4 py-3 flex items-center gap-3"
                data-testid={`plan-inst-row-${i.sequence}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  i.status === 'paid' ? 'bg-emerald-100 text-emerald-600'
                    : isOverdue ? 'bg-red-100 text-red-600'
                    : i.status === 'cancelled' ? 'bg-slate-100 text-slate-400'
                    : 'bg-orange-100 text-orange-600'
                }`}>
                  {i.status === 'paid' ? <CheckCircle2 className="w-4 h-4" />
                    : i.status === 'cancelled' ? <XCircle className="w-4 h-4" />
                    : isOverdue ? <AlertCircle className="w-4 h-4" />
                    : <Clock className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 text-sm">Termijn {i.sequence} · {fmtMoney(i.amount, plan.currency)}</p>
                  <p className="text-xs text-slate-500">
                    Vervaldatum: {i.due_date}
                    {i.paid_at && ` · Betaald ${new Date(i.paid_at).toLocaleDateString('nl-NL')}`}
                  </p>
                </div>
                {i.status === 'pending' && plan.status === 'active' && (
                  <button onClick={() => payTermijn(i.sequence)} disabled={busy}
                    data-testid={`plan-pay-${i.sequence}`}
                    className="px-3 py-2 bg-[#FF5C00] hover:bg-[#E05200] text-white text-xs font-bold rounded-lg disabled:opacity-50">
                    Markeer betaald
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
