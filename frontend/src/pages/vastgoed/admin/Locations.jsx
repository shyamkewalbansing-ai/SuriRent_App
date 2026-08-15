import { useState, useEffect, useCallback } from 'react';
import { MapPin, Plus, Pencil, Trash2, X, Check, Loader2, Building2, Image as ImageIcon, Search, ChevronRight, ArrowLeft } from 'lucide-react';
import { api, formatError } from '../../../lib/api';
import { useAutoRefresh } from '../../../lib/auto-refresh';
import PhotoUpload from '../../../components/PhotoUpload';

function LocationForm({ initial, onCancel, onSaved }) {
  const [data, setData] = useState(initial || { name: '', address: '', photo_url: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!data.name.trim()) { setError('Naam is verplicht'); return; }
    setLoading(true); setError('');
    try {
      const payload = {
        name: data.name.trim(),
        address: (data.address || '').trim(),
        photo_url: (data.photo_url || '').trim(),
      };
      if (initial?.id) {
        const { data: r } = await api.put(`/locations/${initial.id}`, payload);
        onSaved(r);
      } else {
        const { data: r } = await api.post('/locations', payload);
        onSaved(r);
      }
    } catch (e) {
      setError(formatError(e));
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4 modal-sheet-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-black text-slate-900">{initial?.id ? 'Locatie bewerken' : 'Nieuwe locatie'}</h3>
          <button onClick={onCancel} data-testid="loc-form-close"
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Naam *</label>
            <input value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })}
              placeholder="bv. Kewalbansingweg 7"
              data-testid="loc-name"
              className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Adres</label>
            <input value={data.address || ''} onChange={(e) => setData({ ...data, address: e.target.value })}
              placeholder="bv. Paramaribo Noord"
              data-testid="loc-address"
              className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
          </div>
          <PhotoUpload
            value={data.photo_url}
            onChange={(url) => setData({ ...data, photo_url: url })}
            testId="loc-photo"
          />
        </div>
        {error && <p className="text-sm text-red-600 mt-3" data-testid="loc-form-error">{error}</p>}
        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Annuleer</button>
          <button onClick={save} disabled={loading} data-testid="loc-form-save"
            className="flex-1 h-11 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-black flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Opslaan
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Locations() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all'); // all | active | empty
  const [loading, setLoading] = useState(true);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/locations');
      setItems(data);
    } finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(() => load({ silent: true }), {
    interval: 15000,
    enabled: !creating && !editing && !detailId,
  });

  const del = async (loc) => {
    if (!window.confirm(`Locatie "${loc.name}" verwijderen? Appartementen worden ontkoppeld.`)) return;
    await api.delete(`/locations/${loc.id}`);
    setDetailId(null);
    load();
  };

  // Detail-view — dezelfde patroon als Appartementen/Huurders.
  if (detailId) {
    const loc = items.find((x) => x.id === detailId);
    if (!loc) { setDetailId(null); return null; }
    return (
      <LocationDetail loc={loc}
        onBack={() => setDetailId(null)}
        onEdit={() => setEditing(loc)}
        onDelete={() => del(loc)} />
    );
  }

  const bySearch = items.filter((l) => !q
    || (l.name || '').toLowerCase().includes(q.toLowerCase())
    || (l.address || '').toLowerCase().includes(q.toLowerCase()));
  const filtered = bySearch.filter((l) => {
    if (filter === 'all') return true;
    if (filter === 'active') return (l.apartments_total || 0) > 0;
    return (l.apartments_total || 0) === 0;
  });
  const counts = {
    all: bySearch.length,
    active: bySearch.filter((l) => (l.apartments_total || 0) > 0).length,
    empty: bySearch.filter((l) => (l.apartments_total || 0) === 0).length,
  };

  return (
    <div className="space-y-4 pb-24 sm:pb-6" data-testid="locations-page">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900">Locaties</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {items.length} locaties · {counts.active} actief
          </p>
        </div>
        <button onClick={() => setCreating(true)} data-testid="loc-new-btn"
          className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-2xl text-sm shadow-[0_10px_25px_-5px_rgba(255,92,0,0.5)]">
          <Plus className="w-4 h-4" /> Nieuwe locatie
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek op naam of adres"
          data-testid="loc-search"
          className="w-full h-11 pl-11 pr-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white text-sm" />
      </div>
      <div className="flex items-center gap-2 flex-wrap" data-testid="loc-filter-bar">
        {[
          { v: 'all', l: 'Alles', c: counts.all },
          { v: 'active', l: 'Actief', c: counts.active },
          { v: 'empty', l: 'Leeg', c: counts.empty },
        ].map((f) => (
          <button key={f.v} onClick={() => setFilter(f.v)} data-testid={`loc-filter-${f.v}`}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              filter === f.v ? 'bg-[#FF5C00] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}>
            {f.l}
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
              filter === f.v ? 'bg-white/20 text-white' : 'bg-white text-slate-500'
            }`}>{f.c}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#FF5C00] animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center shadow-sm" data-testid="loc-empty">
          <MapPin className="w-12 h-12 mx-auto text-slate-300 mb-2" />
          <p className="text-slate-500 font-semibold">Geen locaties gevonden.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((loc) => (
            <LocationRow key={loc.id} loc={loc} onOpen={() => setDetailId(loc.id)} />
          ))}
        </div>
      )}

      {(creating || editing) && (
        <LocationForm initial={editing} onCancel={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }} />
      )}
    </div>
  );
}

// =====================================================================
// LocationRow — compacte klikbare card in dezelfde stijl als Huurders/Appartementen.
// =====================================================================
function LocationRow({ loc, onOpen }) {
  const active = (loc.apartments_total || 0) > 0;
  return (
    <div onClick={onOpen} data-testid={`loc-row-${loc.id}`}
      role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      className="w-full text-left bg-white hover:bg-slate-50 active:bg-slate-100 rounded-2xl shadow-sm p-4 flex items-center gap-3 border border-slate-100 cursor-pointer transition">
      {loc.photo_url ? (
        <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-slate-100">
          <img src={loc.photo_url} alt={loc.name}
            className="w-full h-full object-cover" loading="lazy"
            onError={(e) => { e.currentTarget.parentElement.classList.add('bg-orange-50'); e.currentTarget.style.display = 'none'; }} />
        </div>
      ) : (
        <div className="w-14 h-14 rounded-xl bg-orange-50 text-[#FF5C00] flex items-center justify-center shrink-0">
          <MapPin className="w-6 h-6" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-black text-slate-900 truncate">{loc.name}</p>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
            active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
          }`}>
            {active ? 'Actief' : 'Leeg'}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5 truncate">{loc.address || '—'}</p>
      </div>
      <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
        <p className="text-base font-black text-slate-900 tracking-tight">{loc.apartments_total || 0}</p>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
          {loc.apartments_occupied || 0} bezet
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
    </div>
  );
}

// =====================================================================
// LocationDetail — full detail-pagina met terug-knop.
// =====================================================================
function LocationDetail({ loc, onBack, onEdit, onDelete }) {
  const active = (loc.apartments_total || 0) > 0;
  const bezettingsPct = loc.apartments_total > 0
    ? Math.round((loc.apartments_occupied / loc.apartments_total) * 100)
    : 0;
  return (
    <div className="space-y-4 pb-24 sm:pb-6" data-testid="loc-detail-page">
      <div className="flex items-center gap-2">
        <button onClick={onBack} data-testid="loc-detail-back"
          className="flex items-center gap-1.5 text-slate-700 font-bold bg-white hover:bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm">
          <ArrowLeft className="w-4 h-4" /> Terug
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {loc.photo_url && (
          <div className="relative w-full h-48 sm:h-64 bg-slate-100">
            <img src={loc.photo_url} alt={loc.name}
              className="w-full h-full object-cover" loading="lazy"
              onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }} />
            <span className={`absolute top-3 right-3 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ring-2 ring-white ${
              active ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-white'
            }`}>
              {active ? 'Actief' : 'Leeg'}
            </span>
          </div>
        )}
        <div className="p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#FF5C00]">Locatie</p>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-1 truncate">{loc.name}</h1>
              <p className="text-sm text-slate-500 mt-1 truncate">{loc.address || 'Geen adres'}</p>
              {!loc.photo_url && (
                <span className={`inline-block mt-2 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${
                  active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {active ? 'Actief' : 'Leeg'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Statistieken */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Totaal</p>
          <div className="flex items-center gap-2 mt-2">
            <Building2 className="w-5 h-5 text-[#FF5C00]" />
            <p className="text-2xl font-black text-slate-900" data-testid="loc-stat-total">{loc.apartments_total || 0}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bezet</p>
          <p className="text-2xl font-black text-emerald-600 mt-2" data-testid="loc-stat-occupied">
            {loc.apartments_occupied || 0}
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bezetting</p>
          <p className="text-2xl font-black text-slate-900 mt-2">{bezettingsPct}%</p>
          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden mt-2">
            <div className="h-full bg-gradient-to-r from-[#F8C260] to-[#FF5C00]" style={{ width: `${bezettingsPct}%` }} />
          </div>
        </div>
      </div>

      {/* Acties */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Acties</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onEdit} data-testid="loc-detail-edit"
            className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Bewerk
          </button>
          <button onClick={onDelete} data-testid="loc-detail-delete"
            className="h-11 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-bold text-sm flex items-center justify-center gap-1.5">
            <Trash2 className="w-3.5 h-3.5" /> Verwijder
          </button>
        </div>
      </div>
    </div>
  );
}
