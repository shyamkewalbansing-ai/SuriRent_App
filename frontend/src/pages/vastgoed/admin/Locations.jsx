import { useState, useEffect, useCallback, useRef } from 'react';
import { MapPin, Plus, Pencil, Trash2, X, Check, Loader2, Building2, Image as ImageIcon, Upload } from 'lucide-react';
import { api, formatError } from '../../../lib/api';
import { useAutoRefresh } from '../../../lib/auto-refresh';

function LocationForm({ initial, onCancel, onSaved }) {
  const [data, setData] = useState(initial || { name: '', address: '', photo_url: '' });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Bestand is te groot (max 5 MB).');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Alleen afbeeldingen toegestaan.');
      return;
    }
    setUploading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      // Hergebruikt de bestaande branding-upload endpoint (zelfde
      // landing_assets opslag, 5 MB limiet, image-only validation).
      // Resultaat: { id, url: '/api/landing/asset/<id>' }.
      const { data: r } = await api.post('/companies/me/branding/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const apiBase = process.env.REACT_APP_BACKEND_URL || '';
      const absolute = r.url?.startsWith('http') ? r.url : `${apiBase}${r.url}`;
      setData((d) => ({ ...d, photo_url: absolute }));
    } catch (e) {
      setError(formatError(e));
    } finally {
      setUploading(false);
    }
  };

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
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4">
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
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Foto</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              data-testid="loc-photo-file"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            {data.photo_url ? (
              <button type="button"
                onClick={() => fileInputRef.current?.click()}
                data-testid="loc-photo-preview"
                className="relative w-full mt-1 h-40 rounded-xl bg-slate-100 overflow-hidden group cursor-pointer">
                <img src={data.photo_url} alt="preview" className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/40 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-white text-slate-900 rounded-lg font-bold text-sm">
                    <Upload className="w-4 h-4" /> Wijzig foto
                  </span>
                </div>
                {uploading && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-[#FF5C00]" />
                  </div>
                )}
                <button type="button"
                  onClick={(e) => { e.stopPropagation(); setData((d) => ({ ...d, photo_url: '' })); }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white shadow flex items-center justify-center hover:bg-red-50 text-slate-600 hover:text-red-600"
                  aria-label="Foto verwijderen">
                  <X className="w-3.5 h-3.5" />
                </button>
              </button>
            ) : (
              <button type="button"
                onClick={() => fileInputRef.current?.click()}
                data-testid="loc-photo-empty"
                className="w-full mt-1 h-40 rounded-xl bg-slate-50 border-2 border-dashed border-slate-300 hover:border-[#FF5C00] hover:bg-orange-50/40 transition flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-[#FF5C00] cursor-pointer">
                {uploading ? (
                  <>
                    <Loader2 className="w-7 h-7 animate-spin" />
                    <span className="text-xs font-bold">Uploaden…</span>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold">Klik om foto te uploaden</span>
                    <span className="text-[10px] text-slate-400">JPG / PNG · max 5 MB</span>
                  </>
                )}
              </button>
            )}
            <details className="mt-2">
              <summary className="text-[11px] text-slate-400 cursor-pointer hover:text-slate-600 select-none">
                of plak een externe URL
              </summary>
              <input value={data.photo_url || ''} onChange={(e) => setData({ ...data, photo_url: e.target.value })}
                placeholder="https://…"
                data-testid="loc-photo"
                className="mt-1.5 w-full h-9 px-3 rounded-xl border border-slate-200 focus:border-[#FF5C00] outline-none font-mono text-xs" />
            </details>
          </div>
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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/locations');
      setItems(data);
    } finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // Stille polling — geen spinner / scroll-reset tijdens auto-refresh.
  useAutoRefresh(() => load({ silent: true }), { interval: 15000, enabled: !creating && !editing });

  const del = async (loc) => {
    if (!window.confirm(`Locatie "${loc.name}" verwijderen? Appartementen worden ontkoppeld.`)) return;
    await api.delete(`/locations/${loc.id}`);
    load();
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Locaties</h1>
          <p className="text-sm text-slate-500 mt-1">{items.length} locaties — gebruikt in de kiosk om appartementen te groeperen</p>
        </div>
        <button onClick={() => setCreating(true)} data-testid="loc-new-btn"
          className="inline-flex items-center gap-2 px-5 py-3 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-xl shadow-[0_10px_25px_-5px_rgba(255,92,0,0.5)]">
          <Plus className="w-4 h-4" /> Nieuwe locatie
        </button>
      </div>

      {loading ? (
        <div className="py-16 flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#FF5C00] animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-orange-200 p-10 text-center">
          <MapPin className="w-10 h-10 text-orange-300 mx-auto mb-3" />
          <p className="text-slate-500 font-semibold">Nog geen locaties.</p>
          <p className="text-sm text-slate-400 mt-1">Voeg een locatie toe en koppel uw appartementen.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((loc) => (
            <div key={loc.id} data-testid={`loc-card-${loc.id}`}
              className="bg-white rounded-2xl border border-orange-100 overflow-hidden hover:border-[#FF5C00]/30 transition-colors">
              {loc.photo_url ? (
                <div className="h-32 bg-slate-100 overflow-hidden">
                  <img src={loc.photo_url} alt={loc.name} className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                </div>
              ) : (
                <div className="h-32 bg-gradient-to-br from-[#FFF4EC] to-[#FFE6D3] flex items-center justify-center">
                  <MapPin className="w-12 h-12 text-[#FF5C00]/40" />
                </div>
              )}
              <div className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0">
                    <h3 className="font-black text-slate-900 truncate">{loc.name}</h3>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{loc.address || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-3 text-xs">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-50 text-[#C74600] font-bold">
                    <Building2 className="w-3 h-3" /> {loc.apartments_total} appt.
                  </span>
                  {loc.apartments_occupied > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold">
                      {loc.apartments_occupied} bezet
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditing(loc)} data-testid={`loc-edit-${loc.id}`}
                    className="flex-1 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center gap-1.5">
                    <Pencil className="w-3.5 h-3.5" /> Bewerk
                  </button>
                  <button onClick={() => del(loc)} data-testid={`loc-delete-${loc.id}`}
                    className="w-10 h-10 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
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
