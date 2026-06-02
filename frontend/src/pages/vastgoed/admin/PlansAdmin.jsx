// Superadmin: SaaS Pakketten beheer.
// Lijst van alle plan_catalog entries met inline edit (naam, prijs, features,
// active toggle). Maakt nieuwe plans aan en kan ze (soft-)deleten.
//
// Backend-koppeling:
//   GET    /api/superadmin/plans
//   POST   /api/superadmin/plans           — nieuw plan
//   PUT    /api/superadmin/plans/{id}      — bewerken
//   DELETE /api/superadmin/plans/{id}      — (soft) delete

import { useState, useEffect, useCallback } from 'react';
import { Plus, Save, Trash2, X, Loader2, Package, Check } from 'lucide-react';
import { api, formatError } from '../../../lib/api';

function LimitsEditor({ value, onChange, primary = '#FF5C00' }) {
  // value = { max_apartments, max_tenants, max_locations, max_employees,
  //           allow_kiosk, allow_ocr, allow_shelly, allow_branding, allow_backup }
  const v = value || {};
  const set = (k, val) => onChange({ ...v, [k]: val });
  const numericFields = [
    { key: 'max_apartments', label: 'Max appartementen' },
    { key: 'max_tenants', label: 'Max huurders' },
    { key: 'max_locations', label: 'Max locaties' },
    { key: 'max_employees', label: 'Max medewerkers' },
  ];
  const booleanFields = [
    { key: 'allow_kiosk', label: 'Kiosk terminal' },
    { key: 'allow_ocr', label: 'AI-OCR (Gemini)' },
    { key: 'allow_shelly', label: 'Shelly stroombeheer' },
    { key: 'allow_branding', label: 'White-label branding' },
    { key: 'allow_backup', label: 'Backup & Herstel' },
  ];
  return (
    <div className="space-y-3 bg-slate-50 rounded-xl p-4">
      <div className="grid grid-cols-2 gap-3">
        {numericFields.map((f) => (
          <div key={f.key}>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">{f.label}</label>
            <div className="flex items-center gap-1">
              <input type="number" value={v[f.key] ?? 0}
                onChange={(e) => set(f.key, parseInt(e.target.value, 10) || 0)}
                data-testid={`plan-limit-${f.key}`}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 focus:border-orange-500 outline-none text-sm font-mono" />
              <button onClick={() => set(f.key, -1)} title="Onbeperkt"
                className="px-2 h-9 rounded-lg border border-slate-200 hover:border-orange-400 text-xs font-bold text-slate-600 shrink-0">∞</button>
            </div>
            {v[f.key] === -1 && (
              <p className="text-[10px] font-bold text-emerald-600 mt-0.5">ONBEPERKT</p>
            )}
          </div>
        ))}
      </div>
      <div className="pt-3 border-t border-slate-200 grid grid-cols-2 gap-2">
        {booleanFields.map((f) => (
          <label key={f.key} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 hover:border-orange-400 cursor-pointer">
            <input type="checkbox" checked={!!v[f.key]}
              onChange={(e) => set(f.key, e.target.checked)}
              data-testid={`plan-feature-${f.key}`}
              className="w-4 h-4 accent-orange-500" />
            <span className="text-sm font-bold text-slate-700">{f.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function FeaturesEditor({ value, onChange, primary = '#FF5C00' }) {
  const items = Array.isArray(value) ? value : [];
  const update = (idx, v) => {
    const next = [...items];
    next[idx] = v;
    onChange(next);
  };
  const add = () => onChange([...items, '']);
  const remove = (idx) => onChange(items.filter((_, i) => i !== idx));
  return (
    <div className="space-y-2">
      {items.map((f, i) => (
        <div key={i} className="flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" style={{ color: primary }} />
          <input value={f} onChange={(e) => update(i, e.target.value)}
            data-testid={`plan-feature-input-${i}`}
            className="flex-1 h-9 px-3 rounded-lg border border-slate-200 focus:border-orange-500 outline-none text-sm" />
          <button onClick={() => remove(i)} data-testid={`plan-feature-remove-${i}`}
            className="w-9 h-9 rounded-lg hover:bg-red-50 text-red-500 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button onClick={add} data-testid="plan-feature-add"
        className="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1">
        <Plus className="w-3.5 h-3.5" /> Feature toevoegen
      </button>
    </div>
  );
}

function PlanCard({ plan, onSave, onDelete, isNew = false, onCancel }) {
  const [draft, setDraft] = useState(plan);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(plan);

  const update = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    setSaving(true); setError('');
    try {
      await onSave(draft);
    } catch (e) {
      setError(formatError(e, 'Opslaan mislukt'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`bg-white rounded-2xl border-2 ${draft.active ? 'border-slate-100' : 'border-slate-200 opacity-70'} overflow-hidden`}
      data-testid={`plan-card-${plan.id || 'new'}`}>
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-orange-50 to-amber-50">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-orange-500 text-white flex items-center justify-center">
            <Package className="w-4.5 h-4.5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Plan ID</p>
            <p className="text-sm font-extrabold text-slate-900 font-mono">{plan.id || 'nieuw'}</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
          <input type="checkbox" checked={!!draft.active}
            onChange={(e) => update('active', e.target.checked)}
            data-testid={`plan-active-toggle-${plan.id}`}
            className="w-4 h-4 accent-orange-500" />
          Actief
        </label>
      </div>

      <div className="p-5 space-y-4">
        {isNew && (
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Plan ID (slug)</label>
            <input value={draft.id || ''} onChange={(e) => update('id', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="bv. enterprise"
              data-testid="plan-new-id-input"
              className="w-full h-10 px-3 rounded-lg border-2 border-slate-200 focus:border-orange-500 outline-none font-mono text-sm" />
            <p className="text-[11px] text-slate-400 mt-1">Alleen kleine letters, cijfers en streepjes. Niet aanpasbaar na opslaan.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Naam</label>
            <input value={draft.name || ''} onChange={(e) => update('name', e.target.value)}
              data-testid={`plan-name-input-${plan.id}`}
              className="w-full h-10 px-3 rounded-lg border-2 border-slate-200 focus:border-orange-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Volgorde</label>
            <input type="number" value={draft.sort_order ?? 50}
              onChange={(e) => update('sort_order', parseInt(e.target.value, 10) || 0)}
              data-testid={`plan-sort-input-${plan.id}`}
              className="w-full h-10 px-3 rounded-lg border-2 border-slate-200 focus:border-orange-500 outline-none" />
          </div>
        </div>

        <div className="grid grid-cols-[2fr,1fr,1fr] gap-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Prijs</label>
            <input type="number" step="0.01" value={draft.amount ?? 0}
              onChange={(e) => update('amount', parseFloat(e.target.value) || 0)}
              data-testid={`plan-amount-input-${plan.id}`}
              className="w-full h-10 px-3 rounded-lg border-2 border-slate-200 focus:border-orange-500 outline-none font-mono" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Valuta</label>
            <select value={draft.currency || 'SRD'} onChange={(e) => update('currency', e.target.value)}
              data-testid={`plan-currency-input-${plan.id}`}
              className="w-full h-10 px-3 rounded-lg border-2 border-slate-200 focus:border-orange-500 outline-none">
              <option value="SRD">SRD</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Interval</label>
            <select value={draft.interval || 'month'} onChange={(e) => update('interval', e.target.value)}
              data-testid={`plan-interval-input-${plan.id}`}
              className="w-full h-10 px-3 rounded-lg border-2 border-slate-200 focus:border-orange-500 outline-none">
              <option value="month">Per maand</option>
              <option value="quarter">Per kwartaal</option>
              <option value="year">Per jaar</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Beschrijving</label>
          <textarea value={draft.description || ''} onChange={(e) => update('description', e.target.value)}
            data-testid={`plan-description-input-${plan.id}`}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border-2 border-slate-200 focus:border-orange-500 outline-none text-sm" />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Features (zichtbaar in pricing)</label>
          <FeaturesEditor value={draft.features || []} onChange={(v) => update('features', v)} />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Limieten & Functies</label>
          <p className="text-[11px] text-slate-400 mb-2">Bepaal hoeveel een bedrijf mag aanmaken en welke premium features beschikbaar zijn. Gebruik ∞ voor onbeperkt.</p>
          <LimitsEditor value={draft.limits || {}} onChange={(v) => update('limits', v)} />
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          {isNew ? (
            <>
              <button onClick={onCancel} data-testid="plan-cancel-new"
                className="px-4 h-10 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50">
                Annuleren
              </button>
              <button onClick={save} disabled={saving || !draft.id || !draft.name}
                data-testid="plan-save-new"
                className="px-5 h-10 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-50 flex items-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Aanmaken
              </button>
            </>
          ) : (
            <>
              <button onClick={() => onDelete(plan)} data-testid={`plan-delete-${plan.id}`}
                className="px-3 h-10 rounded-lg text-sm font-bold text-red-600 hover:bg-red-50 flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> Verwijderen
              </button>
              <div className="flex-1" />
              <button onClick={save} disabled={!dirty || saving}
                data-testid={`plan-save-${plan.id}`}
                className="px-5 h-10 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-50 flex items-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Opslaan
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PlansAdmin() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/superadmin/plans');
      setPlans(data || []);
    } catch (e) {
      setError(formatError(e, 'Kon plannen niet laden'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (draft) => {
    await api.put(`/superadmin/plans/${draft.id}`, draft);
    await load();
  };
  const handleCreate = async (draft) => {
    await api.post('/superadmin/plans', draft);
    setCreating(false);
    await load();
  };
  const handleDelete = async (plan) => {
    const confirmMsg = `Plan "${plan.name}" verwijderen? Als er nog bedrijven op dit plan zitten wordt hij alleen op inactief gezet.`;
    if (!window.confirm(confirmMsg)) return;
    await api.delete(`/superadmin/plans/${plan.id}`);
    await load();
  };

  return (
    <div className="space-y-6" data-testid="plans-admin-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">SaaS Pakketten</h2>
          <p className="text-sm text-slate-500 mt-1">
            Bepaal welke abonnementen klanten kunnen kiezen, met prijzen en features.
            Wijzigingen verschijnen direct op de marketing landing page.
          </p>
        </div>
        <button onClick={() => setCreating(true)} disabled={creating}
          data-testid="plan-add-btn"
          className="h-11 px-5 rounded-lg bg-slate-900 hover:bg-orange-500 text-white text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50">
          <Plus className="w-4 h-4" /> Nieuw pakket
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-5">
          {creating && (
            <PlanCard
              plan={{ id: '', name: '', amount: 0, currency: 'SRD', interval: 'month', description: '', features: [], active: true, sort_order: 50 }}
              isNew
              onSave={handleCreate}
              onCancel={() => setCreating(false)} />
          )}
          {plans.map((p) => (
            <PlanCard key={p.id} plan={p} onSave={handleSave} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
