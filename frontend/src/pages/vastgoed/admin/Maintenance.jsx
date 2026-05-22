import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Check, Loader2, Wrench, Trash2 } from 'lucide-react';
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

function MaintenanceForm({ apartments, onCancel, onSaved }) {
  const [data, setData] = useState({
    apartment_id: '', title: '', description: '', priority: 'medium', cost: 0, currency: 'SRD',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setLoading(true); setError('');
    try {
      const { data: r } = await api.post('/maintenance', { ...data, cost: parseFloat(data.cost) || 0 });
      onSaved(r);
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4" data-testid="maint-modal">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 animate-slide-up max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-black text-slate-900">Nieuw onderhoudsticket</h3>
          <button onClick={onCancel} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        {error && <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Appartement *</label>
            <select value={data.apartment_id} onChange={(e) => setData({ ...data, apartment_id: e.target.value })}
              data-testid="maint-apt" required
              className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
              <option value="">— Kies appartement —</option>
              {apartments.map((a) => <option key={a.id} value={a.id}>{a.number} {a.address ? `— ${a.address}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Titel *</label>
            <input value={data.title} onChange={(e) => setData({ ...data, title: e.target.value })} data-testid="maint-title" required
              className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none"
              placeholder="Bv. Lekkende kraan keuken" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Omschrijving</label>
            <textarea rows={3} value={data.description} onChange={(e) => setData({ ...data, description: e.target.value })} data-testid="maint-desc"
              className="w-full mt-1 px-4 py-2 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none resize-none" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Prioriteit</label>
              <select value={data.priority} onChange={(e) => setData({ ...data, priority: e.target.value })} data-testid="maint-priority"
                className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
                <option value="low">Laag</option>
                <option value="medium">Normaal</option>
                <option value="high">Hoog</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Kosten</label>
              <input type="number" step="0.01" value={data.cost} onChange={(e) => setData({ ...data, cost: e.target.value })}
                data-testid="maint-cost"
                className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Valuta</label>
              <select value={data.currency} onChange={(e) => setData({ ...data, currency: e.target.value })} data-testid="maint-currency"
                className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
                <option value="SRD">SRD</option><option value="USD">USD</option><option value="EUR">EUR</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="flex-1 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Annuleren</button>
          <button onClick={save} disabled={loading || !data.apartment_id || !data.title} data-testid="maint-save"
            className="flex-1 h-12 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Ticket aanmaken
          </button>
        </div>
      </div>
    </div>
  );
}

const PRIO_COLORS = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
};
const STATUS_COLORS = {
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  done: 'bg-emerald-100 text-emerald-700',
};
const STATUS_LABELS = {
  open: 'Open', in_progress: 'In behandeling', done: 'Afgerond',
};

export default function Maintenance() {
  const [items, setItems] = useState([]);
  const [apartments, setApartments] = useState([]);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    const [m, a] = await Promise.all([api.get('/maintenance'), api.get('/apartments')]);
    setItems(m.data); setApartments(a.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id, status) => {
    await api.post(`/maintenance/${id}/status`, { status });
    load();
  };
  const del = async (id) => {
    if (!window.confirm('Ticket verwijderen?')) return;
    await api.delete(`/maintenance/${id}`); load();
  };

  const filtered = filter === 'all' ? items : items.filter((i) => i.status === filter);

  return (
    <div>
      <PageHeader title="Onderhoud" subtitle={`${items.length} tickets, ${items.filter((i) => i.status !== 'done').length} actief`}
        action={
          <button onClick={() => setCreating(true)} data-testid="maint-new-btn"
            className="inline-flex items-center gap-2 px-5 py-3 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-xl shadow-[0_10px_25px_-5px_rgba(255,92,0,0.5)]">
            <Plus className="w-4 h-4" /> Nieuw ticket
          </button>
        }
      />
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { id: 'all', label: 'Alle' },
          { id: 'open', label: 'Open' },
          { id: 'in_progress', label: 'In behandeling' },
          { id: 'done', label: 'Afgerond' },
        ].map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} data-testid={`maint-filter-${f.id}`}
            className={`px-3 py-2 rounded-xl text-xs font-bold ${filter === f.id ? 'bg-[#FF5C00] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-full bg-white rounded-2xl border-2 border-dashed border-orange-200 p-10 text-center">
            <Wrench className="w-10 h-10 text-orange-300 mx-auto mb-3" />
            <p className="text-slate-500 font-semibold">Geen tickets.</p>
          </div>
        ) : filtered.map((m) => (
          <div key={m.id} data-testid={`maint-card-${m.id}`}
            className="bg-white rounded-2xl border border-orange-100 p-5 hover:border-[#FF5C00]/30 transition-colors">
            <div className="flex items-start justify-between mb-2 gap-2">
              <p className="text-xs font-bold uppercase tracking-widest text-[#FF5C00]">Appt. {m.apartment_number}</p>
              <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${PRIO_COLORS[m.priority]}`}>{m.priority}</span>
            </div>
            <h3 className="font-bold text-slate-900 text-base mb-1">{m.title}</h3>
            <p className="text-sm text-slate-500 mb-3 line-clamp-2">{m.description || '—'}</p>
            <div className="flex items-center justify-between mb-3">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_COLORS[m.status]}`}>{STATUS_LABELS[m.status]}</span>
              {m.cost > 0 && <span className="text-sm font-bold text-slate-700">{fmtMoney(m.cost, m.currency)}</span>}
            </div>
            <p className="text-xs text-slate-400 mb-3">{new Date(m.created_at).toLocaleDateString('nl-NL')}</p>
            <div className="flex gap-2">
              {m.status !== 'done' && (
                <>
                  {m.status === 'open' && (
                    <button onClick={() => updateStatus(m.id, 'in_progress')} data-testid={`maint-start-${m.id}`}
                      className="flex-1 h-9 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-bold">
                      Start
                    </button>
                  )}
                  <button onClick={() => updateStatus(m.id, 'done')} data-testid={`maint-done-${m.id}`}
                    className="flex-1 h-9 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold">
                    Afronden
                  </button>
                </>
              )}
              {m.status === 'done' && (
                <button onClick={() => updateStatus(m.id, 'open')} data-testid={`maint-reopen-${m.id}`}
                  className="flex-1 h-9 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold">
                  Heropen
                </button>
              )}
              <button onClick={() => del(m.id)} data-testid={`maint-delete-${m.id}`}
                className="w-9 h-9 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {creating && <MaintenanceForm apartments={apartments}
        onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
    </div>
  );
}
