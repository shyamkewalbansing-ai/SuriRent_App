import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Loader2, Wallet, Trash2, ArrowDownCircle, ArrowUpCircle, Receipt, X,
} from 'lucide-react';
import { api, formatError, fmtMoney } from '../../../lib/api';

// =====================================================================
// InlineCashForm (desktop) — één compacte rij: type-toggle · bedrag ·
// valuta · omschrijving · categorie · Boek. Op mobiel wordt hij verstopt
// (`hidden md:block`) en vervangen door de NewCashSheet bottom-sheet die
// via de "Nieuwe mutatie" knop bovenaan de pagina wordt geopend — zelfde
// interactiepatroon als Betalingsregelingen.
// =====================================================================
function InlineCashForm({ onSaved }) {
  const [data, setData] = useState({
    type: 'in', amount: '', currency: 'SRD',
    description: '', category: 'overig',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canSave = Number(data.amount) > 0 && data.description.trim().length > 0;

  const save = async () => {
    if (!canSave || loading) return;
    setLoading(true); setError('');
    try {
      const { data: r } = await api.post('/kasgeld', {
        ...data, amount: parseFloat(data.amount) || 0,
      });
      onSaved(r);
      setData((d) => ({ ...d, amount: '', description: '', category: 'overig' }));
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  };

  const onKey = (e) => { if (e.key === 'Enter' && canSave) save(); };
  const isIn = data.type === 'in';

  return (
    <div className="hidden md:block mb-6" data-testid="cash-inline-form">
      {error && (
        <div className="mb-2 p-2 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-semibold" data-testid="cash-form-error">
          {error}
        </div>
      )}
      <div className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] p-1.5">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center rounded-lg bg-slate-100 p-0.5 shrink-0">
            <button type="button" onClick={() => setData({ ...data, type: 'in' })}
              data-testid="cash-type-in-desktop" title="Inkomen"
              className={`h-9 w-9 rounded-md inline-flex items-center justify-center transition ${
                isIn ? 'bg-emerald-500 text-white shadow' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <ArrowDownCircle className="w-4 h-4" strokeWidth={2.5} />
            </button>
            <button type="button" onClick={() => setData({ ...data, type: 'out' })}
              data-testid="cash-type-out-desktop" title="Uitgave"
              className={`h-9 w-9 rounded-md inline-flex items-center justify-center transition ${
                !isIn ? 'bg-red-500 text-white shadow' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <ArrowUpCircle className="w-4 h-4" strokeWidth={2.5} />
            </button>
          </div>
          <input type="number" step="0.01" inputMode="decimal" value={data.amount}
            onChange={(e) => setData({ ...data, amount: e.target.value })}
            onKeyDown={onKey}
            data-testid="cash-amount-desktop"
            placeholder="0.00"
            className="h-9 w-24 px-2 rounded-lg border border-slate-200 focus:border-[#FF5C00] outline-none text-sm font-black text-slate-900 shrink-0" />
          <select value={data.currency} onChange={(e) => setData({ ...data, currency: e.target.value })}
            data-testid="cash-currency-desktop"
            className="h-9 w-[70px] px-1.5 rounded-lg border border-slate-200 focus:border-[#FF5C00] outline-none bg-white font-bold text-xs shrink-0">
            <option value="SRD">SRD</option><option value="USD">USD</option><option value="EUR">EUR</option>
          </select>
          <input value={data.description}
            onChange={(e) => setData({ ...data, description: e.target.value })}
            onKeyDown={onKey}
            data-testid="cash-description-desktop"
            placeholder="Omschrijving *"
            className="h-9 flex-1 min-w-[140px] px-2.5 rounded-lg border border-slate-200 focus:border-[#FF5C00] outline-none text-sm" />
          <select value={data.category} onChange={(e) => setData({ ...data, category: e.target.value })}
            data-testid="cash-category-desktop"
            className="h-9 w-[130px] px-1.5 rounded-lg border border-slate-200 focus:border-[#FF5C00] outline-none bg-white text-xs font-semibold shrink-0">
            <option value="huur">Huur ontvangst</option>
            <option value="onderhoud">Onderhoud</option>
            <option value="salaris">Salaris</option>
            <option value="storting">Bank storting</option>
            <option value="opname">Bank opname</option>
            <option value="overig">Overig</option>
          </select>
          <button onClick={save} disabled={!canSave || loading} data-testid="cash-save-desktop"
            title="Boek mutatie"
            className="h-9 px-3 rounded-lg bg-[#FF5C00] hover:bg-[#E05200] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-black inline-flex items-center justify-center gap-1.5 active:scale-95 transition shrink-0 text-xs">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" strokeWidth={3} />}
            Boek
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// NewCashSheet — bottom-sheet modal (mobiel) / centered dialog (desktop
// fallback). Zelfde interactiepatroon en styling als CreatePlanSheet in
// Betalingsregelingen zodat de app consistent voelt.
// =====================================================================
function NewCashSheet({ onClose, onSaved }) {
  const [data, setData] = useState({
    type: 'in', amount: '', currency: 'SRD',
    description: '', category: 'overig',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canSave = Number(data.amount) > 0 && data.description.trim().length > 0;
  const isIn = data.type === 'in';

  // ESC om te sluiten + body scroll lock
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const save = async () => {
    if (!canSave || loading) return;
    setLoading(true); setError('');
    try {
      const { data: r } = await api.post('/kasgeld', {
        ...data, amount: parseFloat(data.amount) || 0,
      });
      onSaved(r);
      onClose();
    } catch (e) { setError(formatError(e)); setLoading(false); }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      data-testid="cash-new-sheet" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 24px), 24px)' }}>
        <div className="p-5 sm:p-6">
          <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-4 sm:hidden" />
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black text-slate-900">Nieuwe mutatie</h2>
            <button onClick={onClose} data-testid="cash-sheet-close"
              className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
          </div>

          {error && (
            <div className="mb-3 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm" data-testid="cash-sheet-error">
              {error}
            </div>
          )}

          {/* Type toggle */}
          <label className="block text-[11px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Type</label>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button type="button" onClick={() => setData({ ...data, type: 'in' })}
              data-testid="cash-type-in"
              className={`h-12 rounded-xl inline-flex items-center justify-center gap-2 font-black text-sm transition active:scale-95 ${
                isIn ? 'bg-emerald-500 text-white shadow-[0_6px_16px_-4px_rgba(16,185,129,0.5)]' : 'bg-slate-100 text-slate-700'
              }`}>
              <ArrowDownCircle className="w-4 h-4" /> Inkomen
            </button>
            <button type="button" onClick={() => setData({ ...data, type: 'out' })}
              data-testid="cash-type-out"
              className={`h-12 rounded-xl inline-flex items-center justify-center gap-2 font-black text-sm transition active:scale-95 ${
                !isIn ? 'bg-red-500 text-white shadow-[0_6px_16px_-4px_rgba(239,68,68,0.5)]' : 'bg-slate-100 text-slate-700'
              }`}>
              <ArrowUpCircle className="w-4 h-4" /> Uitgave
            </button>
          </div>

          {/* Bedrag + valuta */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="col-span-2">
              <label className="block text-[11px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Bedrag *</label>
              <input type="number" step="0.01" inputMode="decimal" value={data.amount}
                onChange={(e) => setData({ ...data, amount: e.target.value })}
                data-testid="cash-amount" autoFocus
                placeholder="0.00"
                className="w-full h-12 px-3 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-[#FF5C00] focus:border-[#FF5C00] outline-none text-lg font-black text-slate-900" />
            </div>
            <div>
              <label className="block text-[11px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Valuta</label>
              <select value={data.currency} onChange={(e) => setData({ ...data, currency: e.target.value })}
                data-testid="cash-currency"
                className="w-full h-12 px-2 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-[#FF5C00] focus:border-[#FF5C00] outline-none bg-white font-bold text-sm">
                <option value="SRD">SRD</option><option value="USD">USD</option><option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          {/* Omschrijving */}
          <label className="block text-[11px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Omschrijving *</label>
          <input value={data.description}
            onChange={(e) => setData({ ...data, description: e.target.value })}
            data-testid="cash-description"
            placeholder="Waarvoor is deze mutatie?"
            className="w-full h-12 px-3 mb-3 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-[#FF5C00] focus:border-[#FF5C00] outline-none text-sm" />

          {/* Categorie */}
          <label className="block text-[11px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Categorie</label>
          <select value={data.category} onChange={(e) => setData({ ...data, category: e.target.value })}
            data-testid="cash-category"
            className="w-full h-12 px-3 mb-5 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-[#FF5C00] focus:border-[#FF5C00] outline-none bg-white text-sm font-semibold">
            <option value="huur">Huur ontvangst</option>
            <option value="onderhoud">Onderhoud</option>
            <option value="salaris">Salaris</option>
            <option value="storting">Bank storting</option>
            <option value="opname">Bank opname</option>
            <option value="overig">Overig</option>
          </select>

          <button onClick={save} disabled={!canSave || loading} data-testid="cash-save"
            className="w-full h-12 rounded-2xl bg-[#FF5C00] hover:bg-[#E05200] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-black inline-flex items-center justify-center gap-2 shadow-[0_10px_25px_-5px_rgba(255,92,0,0.5)] active:scale-[0.98] transition">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" strokeWidth={3} />}
            Boek mutatie
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// MobileCashCard — POS-stijl card per mutatie (bedoeld voor smalle schermen)
// =====================================================================
function MobileCashCard({ c, onDelete }) {
  const isPayment = c.source === 'payment';
  const isIn = c.type === 'in';
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-3.5 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] flex items-center gap-3"
      data-testid={`mi-cash-${c.id}`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
        isIn ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
      }`}>
        {isIn ? <ArrowDownCircle className="w-5 h-5" /> : <ArrowUpCircle className="w-5 h-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <p className="font-bold text-slate-900 text-sm leading-tight truncate">{c.description}</p>
          {isPayment && (
            <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 inline-flex items-center gap-0.5 shrink-0">
              <Receipt className="w-2 h-2" /> {c.method || 'betaling'}
            </span>
          )}
        </div>
        <p className="text-[10px] text-slate-400 font-semibold capitalize">
          {new Date(c.created_at).toLocaleDateString('nl-NL')} · {c.category}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-black whitespace-nowrap ${isIn ? 'text-emerald-600' : 'text-red-600'}`}>
          {isIn ? '+' : '−'} {fmtMoney(c.amount, c.currency)}
        </p>
        {isPayment ? (
          <p className="text-[9px] text-slate-400 italic mt-0.5">auto</p>
        ) : (
          <button onClick={() => onDelete(c.id)}
            data-testid={`mi-cash-del-${c.id}`}
            className="mt-1 inline-flex items-center justify-center w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 text-red-500">
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function Kasgeld() {
  const [items, setItems] = useState([]);
  const [balances, setBalances] = useState({ SRD: 0, USD: 0, EUR: 0 });
  const [filter, setFilter] = useState('all'); // all | manual | payment
  const [sheetOpen, setSheetOpen] = useState(false);
  const load = useCallback(async () => {
    const [c, b] = await Promise.all([api.get('/kasgeld'), api.get('/kasgeld/balance')]);
    setItems(c.data); setBalances(b.data);
  }, []);
  useEffect(() => { load(); }, [load]);
  const del = async (id) => {
    if (!window.confirm('Mutatie verwijderen?')) return;
    try { await api.delete(`/kasgeld/${id}`); load(); }
    catch (e) { alert(formatError(e)); }
  };

  // Bron-filter — items met source==='payment' zijn geautomatiseerd, rest is handmatig
  const filtered = items.filter((c) => {
    if (filter === 'all') return true;
    if (filter === 'payment') return c.source === 'payment';
    return c.source !== 'payment';
  });
  const counts = {
    all: items.length,
    manual: items.filter((c) => c.source !== 'payment').length,
    payment: items.filter((c) => c.source === 'payment').length,
  };

  return (
    <div>
      {/* Header — titel links, oranje "Nieuwe mutatie" knop rechts (mobiel).
          Zelfde pattern als Betalingsregelingen zodat het consistent voelt. */}
      <div className="flex items-center justify-between gap-3 mb-5 sm:mb-6">
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Kasgeld</h1>
        <button onClick={() => setSheetOpen(true)} data-testid="cash-new-btn"
          className="md:hidden inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-2xl text-sm shadow-[0_10px_25px_-5px_rgba(255,92,0,0.5)] active:scale-95 transition">
          <Plus className="w-4 h-4" strokeWidth={3} /> Nieuwe mutatie
        </button>
      </div>

      {/* Saldo cards — 3 kolommen op desktop, horizontaal scrollend op mobile */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
        {['SRD', 'USD', 'EUR'].map((cur) => {
          const bal = balances[cur] || 0;
          const cnt = items.filter((i) => (i.currency || 'SRD') === cur).length;
          const isNeg = bal < 0;
          return (
            <div key={cur} data-testid={`balance-${cur}`}
              className={`rounded-2xl p-3 sm:p-5 border shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] ${
                isNeg ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'
              }`}>
              <div className="flex items-center justify-between gap-1 mb-1 sm:mb-2">
                <div className="flex items-center gap-1 sm:gap-2">
                  <Wallet className={`w-4 h-4 sm:w-5 sm:h-5 ${isNeg ? 'text-red-500' : 'text-[#FF5C00]'}`} />
                  <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-500">{cur}</p>
                </div>
                <span className="text-[9px] sm:text-[10px] font-bold text-slate-400">{cnt}</span>
              </div>
              <p className={`text-base sm:text-3xl font-black tracking-tight leading-tight ${isNeg ? 'text-red-600' : 'text-slate-900'}`}>
                {fmtMoney(bal, cur)}
              </p>
            </div>
          );
        })}
      </div>

      {/* Inline invoer — vervangt de oude modal, altijd zichtbaar */}
      <InlineCashForm onSaved={() => load()} />

      {/* Filter per bron — Alles / Alleen handmatig / Alleen betalingen */}
      <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1" data-testid="cash-source-filter">
        {[
          { k: 'all', label: 'Alles' },
          { k: 'manual', label: 'Alleen handmatig' },
          { k: 'payment', label: 'Alleen betalingen' },
        ].map((f) => (
          <button key={f.k} onClick={() => setFilter(f.k)}
            data-testid={`cash-filter-${f.k}`}
            className={`h-8 px-3 rounded-lg text-xs font-black uppercase tracking-wider transition inline-flex items-center gap-1.5 shrink-0 ${
              filter === f.k
                ? 'bg-slate-900 text-white shadow'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}>
            {f.label}
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${filter === f.k ? 'bg-white/20 text-white' : 'bg-white text-slate-500'}`}>
              {counts[f.k]}
            </span>
          </button>
        ))}
      </div>

      {/* Mobile card-lijst */}
      <div className="md:hidden space-y-2" data-testid="cash-list-mobile">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
            <Wallet className="w-9 h-9 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500 font-semibold">Geen mutaties voor dit filter.</p>
          </div>
        ) : (
          filtered.map((c) => <MobileCashCard key={c.id} c={c} onDelete={del} />)
        )}
      </div>

      {/* Desktop tabel */}
      <div className="hidden md:block bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center"><Wallet className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-semibold">Geen mutaties voor dit filter.</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50/70 text-left">
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                <th className="px-5 py-3">Datum</th>
                <th className="px-5 py-3">Omschrijving</th>
                <th className="px-5 py-3">Categorie</th>
                <th className="px-5 py-3 text-right">Bedrag</th>
                <th className="px-5 py-3 text-right">Acties</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const isPayment = c.source === 'payment';
                return (
                  <tr key={c.id} data-testid={`cash-row-${c.id}`} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-5 py-3 text-slate-500 text-xs whitespace-nowrap">{new Date(c.created_at).toLocaleDateString('nl-NL')}</td>
                    <td className="px-5 py-3 font-semibold text-slate-900">
                      <div className="flex items-center gap-2 flex-wrap">
                        {c.type === 'in' ? <ArrowDownCircle className="w-4 h-4 text-emerald-500 shrink-0" /> : <ArrowUpCircle className="w-4 h-4 text-red-500 shrink-0" />}
                        <span className="truncate">{c.description}</span>
                        {isPayment && (
                          <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 inline-flex items-center gap-1"
                            data-testid={`cash-source-${c.id}`}
                            title={`Uit ${c.method || 'betaling'} — beheerd via Betalingen`}>
                            <Receipt className="w-2.5 h-2.5" /> {c.method || 'betaling'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-500 capitalize">{c.category}</td>
                    <td className={`px-5 py-3 text-right font-black whitespace-nowrap ${c.type === 'in' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {c.type === 'in' ? '+' : '−'} {fmtMoney(c.amount, c.currency)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {isPayment ? (
                        <span className="text-[10px] text-slate-400 italic" title="Verwijder de betaling zelf via Betalingen">auto</span>
                      ) : (
                        <button onClick={() => del(c.id)} data-testid={`cash-delete-${c.id}`}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Bottom-sheet modal (mobiel) — geopend via de "Nieuwe mutatie" knop
          in de header. Op desktop is er de inline form, dus daar niet nodig. */}
      {sheetOpen && (
        <NewCashSheet onClose={() => setSheetOpen(false)} onSaved={() => load()} />
      )}
    </div>
  );
}
