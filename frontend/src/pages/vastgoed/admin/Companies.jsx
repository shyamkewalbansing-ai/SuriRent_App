import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Pencil, X, Check, Loader2, Building2, Users, KeySquare, Power, PowerOff } from 'lucide-react';
import { api, formatError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';

function CompanyForm({ initial, onCancel, onSaved }) {
  const isEdit = !!initial;
  const [form, setForm] = useState(initial || {
    name: '', slug: '', contact_email: '', contact_phone: '',
    address: '', plan: 'starter', active: true,
  });
  const [seedAdmin, setSeedAdmin] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr(''); setLoading(true);
    try {
      let company;
      if (isEdit) {
        const { data } = await api.put(`/companies/${initial.id}`, form);
        company = data;
      } else {
        const { data } = await api.post('/companies', form);
        company = data;
        // Optional seed admin
        if (seedAdmin.email && seedAdmin.password && seedAdmin.name) {
          await api.post(`/companies/${company.id}/seed-admin`, seedAdmin);
        }
      }
      onSaved(company);
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4 modal-sheet-auto" data-testid="company-form-modal">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-900">{isEdit ? 'Bedrijf bewerken' : 'Nieuw bedrijf'}</h2>
          <button onClick={onCancel} data-testid="company-form-close" className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Bedrijfsnaam *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="company-name"
                className="w-full mt-1 h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Slug (URL-vriendelijk) *</label>
              <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                disabled={isEdit}
                data-testid="company-slug"
                className="w-full mt-1 h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none disabled:opacity-60" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Contact e-mail</label>
              <input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                data-testid="company-email"
                className="w-full mt-1 h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Contact telefoon</label>
              <input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                data-testid="company-phone"
                className="w-full mt-1 h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Adres</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                data-testid="company-address"
                className="w-full mt-1 h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Plan</label>
              <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}
                data-testid="company-plan"
                className="w-full mt-1 h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
                <option value="free">Gratis</option>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
              </select>
            </div>
            <div className="flex items-center gap-3 pt-6">
              <input type="checkbox" id="company-active" checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                data-testid="company-active"
                className="w-5 h-5 accent-[#FF5C00]" />
              <label htmlFor="company-active" className="text-sm font-semibold text-slate-700">Actief</label>
            </div>
          </div>

          {!isEdit && (
            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Eerste admin (optioneel)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input placeholder="Naam" value={seedAdmin.name} onChange={(e) => setSeedAdmin({ ...seedAdmin, name: e.target.value })}
                  data-testid="seed-admin-name"
                  className="h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
                <input placeholder="E-mail" type="email" value={seedAdmin.email} onChange={(e) => setSeedAdmin({ ...seedAdmin, email: e.target.value })}
                  data-testid="seed-admin-email"
                  className="h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
                <input placeholder="Wachtwoord" type="password" value={seedAdmin.password} onChange={(e) => setSeedAdmin({ ...seedAdmin, password: e.target.value })}
                  data-testid="seed-admin-password"
                  className="h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Vul in om direct een admin login aan te maken voor dit bedrijf.</p>
            </div>
          )}

          {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{err}</p>}

          <div className="flex gap-3 pt-2">
            <button onClick={onCancel} data-testid="company-form-cancel"
              className="flex-1 h-11 rounded-xl border-2 border-slate-200 text-slate-700 font-bold hover:bg-slate-50">
              Annuleren
            </button>
            <button onClick={submit} disabled={loading || !form.name || !form.slug} data-testid="company-form-submit"
              className="flex-1 h-11 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {isEdit ? 'Opslaan' : 'Aanmaken'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Companies() {
  const { user, setActiveCompany, activeCompanyId } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const { data } = await api.get('/companies');
      setItems(data);
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onDelete = async (c) => {
    if (!window.confirm(`Bedrijf "${c.name}" verwijderen?\n\nDit kan alleen als er geen data (appartementen, huurders, etc.) meer is.`)) return;
    try {
      await api.delete(`/companies/${c.id}`);
      load();
    } catch (e) { alert(formatError(e)); }
  };

  const isSuper = user?.role === 'superadmin';

  if (!isSuper) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-sm text-amber-800">
        Deze sectie is alleen beschikbaar voor superadmins.
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Bedrijven</h1>
          <p className="text-sm text-slate-500 mt-1">Beheer alle bedrijven die het Vastgoed-platform gebruiken</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }}
          data-testid="company-new-btn"
          className="h-11 px-4 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold flex items-center gap-2 shadow-[0_6px_15px_-3px_rgba(255,92,0,0.5)]">
          <Plus className="w-4 h-4" /> Nieuw bedrijf
        </button>
      </div>

      {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4">{err}</p>}

      {loading ? (
        <div className="text-slate-400 text-sm">Laden...</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-orange-100 p-10 text-center">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Nog geen bedrijven. Maak het eerste bedrijf aan.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((c) => {
            const isActive = c.id === activeCompanyId;
            return (
              <div key={c.id} data-testid={`company-card-${c.slug}`}
                className={`bg-white rounded-2xl border-2 p-5 transition-all ${isActive ? 'border-[#FF5C00] shadow-[0_8px_22px_-6px_rgba(255,92,0,0.35)]' : 'border-orange-100 hover:border-orange-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-black text-slate-900 truncate">{c.name}</h3>
                      {c.active ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Actief</span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Inactief</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate">/{c.slug} • {c.plan}</p>
                    {c.contact_email && <p className="text-xs text-slate-400 truncate mt-0.5">{c.contact_email}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4 mb-4 text-center">
                  <div className="bg-orange-50 rounded-lg py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Apt</p>
                    <p className="text-lg font-black text-[#FF5C00]">{c.stats?.apartments ?? 0}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Huurd.</p>
                    <p className="text-lg font-black text-emerald-700">{c.stats?.tenants ?? 0}</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Admin</p>
                    <p className="text-lg font-black text-blue-700">{c.stats?.admins ?? 0}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setActiveCompany(isActive ? null : c.id)}
                    data-testid={`company-activate-${c.slug}`}
                    className={`flex-1 h-9 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${
                      isActive
                        ? 'bg-[#FF5C00] text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}>
                    {isActive ? <><Power className="w-3.5 h-3.5" /> Actief</> : <><PowerOff className="w-3.5 h-3.5" /> Selecteer</>}
                  </button>
                  <button onClick={() => { setEditing(c); setShowForm(true); }}
                    data-testid={`company-edit-${c.slug}`}
                    className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center" title="Bewerken">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => onDelete(c)}
                    data-testid={`company-delete-${c.slug}`}
                    className="w-9 h-9 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center" title="Verwijderen">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <CompanyForm
          initial={editing}
          onCancel={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}
