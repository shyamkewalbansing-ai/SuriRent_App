import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Check, Loader2, Wallet, Trash2, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { api, formatError, fmtMoney } from '../../../lib/api';

function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function CashForm({ onCancel, onSaved }) {
  const [data, setData] = useState({ type: 'in', amount: 0, currency: 'SRD', description: '', category: 'overig' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setLoading(true); setError('');
    try {
      const { data: r } = await api.post('/kasgeld', { ...data, amount: parseFloat(data.amount) || 0 });
      onSaved(r);
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-white/70 backdrop-blur-xl flex items-center justify-center p-4" data-testid="cash-modal">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-black text-slate-900">Nieuwe kasmutatie</h3>
          <button onClick={onCancel} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        {error && <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">{error}</div>}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setData({ ...data, type: 'in' })} data-testid="cash-type-in"
              className={`h-14 rounded-xl flex items-center justify-center gap-2 font-bold transition-all ${
                data.type === 'in' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-700'
              }`}>
              <ArrowDownCircle className="w-5 h-5" /> Inkomen
            </button>
            <button onClick={() => setData({ ...data, type: 'out' })} data-testid="cash-type-out"
              className={`h-14 rounded-xl flex items-center justify-center gap-2 font-bold transition-all ${
                data.type === 'out' ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-700'
              }`}>
              <ArrowUpCircle className="w-5 h-5" /> Uitgave
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Bedrag *</label>
              <input type="number" step="0.01" value={data.amount} onChange={(e) => setData({ ...data, amount: e.target.value })}
                data-testid="cash-amount" required
                className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Valuta</label>
              <select value={data.currency} onChange={(e) => setData({ ...data, currency: e.target.value })} data-testid="cash-currency"
                className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
                <option value="SRD">SRD</option><option value="USD">USD</option><option value="EUR">EUR</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Omschrijving *</label>
            <input value={data.description} onChange={(e) => setData({ ...data, description: e.target.value })}
              data-testid="cash-description" required
              className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Categorie</label>
            <select value={data.category} onChange={(e) => setData({ ...data, category: e.target.value })} data-testid="cash-category"
              className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
              <option value="huur">Huur ontvangst</option>
              <option value="onderhoud">Onderhoud</option>
              <option value="salaris">Salaris</option>
              <option value="storting">Bank storting</option>
              <option value="opname">Bank opname</option>
              <option value="overig">Overig</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="flex-1 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Annuleren</button>
          <button onClick={save} disabled={loading || !data.amount || !data.description} data-testid="cash-save"
            className="flex-1 h-12 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Boek
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Kasgeld() {
  const [items, setItems] = useState([]);
  const [balances, setBalances] = useState({ SRD: 0, USD: 0, EUR: 0 });
  const [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    const [c, b] = await Promise.all([api.get('/kasgeld'), api.get('/kasgeld/balance')]);
    setItems(c.data); setBalances(b.data);
  }, []);
  useEffect(() => { load(); }, [load]);
  const del = async (id) => {
    if (!window.confirm('Mutatie verwijderen?')) return;
    await api.delete(`/kasgeld/${id}`); load();
  };

  return (
    <div>
      <PageHeader title="Kasgeld" subtitle="Kas in- en uitgaven met saldo per valuta"
        action={
          <button onClick={() => setCreating(true)} data-testid="cash-new-btn"
            className="inline-flex items-center gap-2 px-5 py-3 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-xl shadow-[0_10px_25px_-5px_rgba(255,92,0,0.5)]">
            <Plus className="w-4 h-4" /> Nieuwe mutatie
          </button>
        }
      />
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        {['SRD', 'USD', 'EUR'].map((cur) => (
          <div key={cur} data-testid={`balance-${cur}`}
            className={`rounded-2xl p-5 border ${balances[cur] >= 0 ? 'bg-white border-orange-100' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              <Wallet className={`w-5 h-5 ${balances[cur] >= 0 ? 'text-[#FF5C00]' : 'text-red-500'}`} />
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{cur} saldo</p>
            </div>
            <p className={`text-3xl font-black tracking-tight ${balances[cur] >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
              {fmtMoney(balances[cur], cur)}
            </p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-orange-100 overflow-hidden">
        {items.length === 0 ? (
          <div className="p-10 text-center"><Wallet className="w-10 h-10 text-orange-300 mx-auto mb-3" />
            <p className="text-slate-500 font-semibold">Geen mutaties.</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-orange-50/50 text-left">
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                <th className="px-5 py-3">Datum</th>
                <th className="px-5 py-3">Omschrijving</th>
                <th className="px-5 py-3 hidden md:table-cell">Categorie</th>
                <th className="px-5 py-3 text-right">Bedrag</th>
                <th className="px-5 py-3 text-right">Acties</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} data-testid={`cash-row-${c.id}`} className="border-t border-orange-50 hover:bg-orange-50/30">
                  <td className="px-5 py-3 text-slate-500 text-xs">{new Date(c.created_at).toLocaleDateString('nl-NL')}</td>
                  <td className="px-5 py-3 font-semibold text-slate-900">
                    <div className="flex items-center gap-2">
                      {c.type === 'in' ? <ArrowDownCircle className="w-4 h-4 text-emerald-500" /> : <ArrowUpCircle className="w-4 h-4 text-red-500" />}
                      {c.description}
                    </div>
                  </td>
                  <td className="px-5 py-3 hidden md:table-cell text-slate-500 capitalize">{c.category}</td>
                  <td className={`px-5 py-3 text-right font-black ${c.type === 'in' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {c.type === 'in' ? '+' : '−'} {fmtMoney(c.amount, c.currency)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => del(c.id)} data-testid={`cash-delete-${c.id}`}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {creating && <CashForm onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
    </div>
  );
}
