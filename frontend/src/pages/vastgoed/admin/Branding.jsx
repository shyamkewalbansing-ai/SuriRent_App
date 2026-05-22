import { useState, useEffect, useCallback } from 'react';
import { Palette, Save, Loader2, Upload, Check, AlertCircle, Eye, RotateCcw } from 'lucide-react';
import { api, formatError } from '../../../lib/api';
import { resolveLogoUrl, applyBranding } from '../../../lib/branding';
import MyUrlCard from '../../../components/MyUrlCard';

const PRESET_COLORS = [
  '#FF5C00', '#1e88e5', '#7c3aed', '#059669',
  '#dc2626', '#0ea5e9', '#ea580c', '#0f172a',
];

function ColorPicker({ value, onChange }) {
  return (
    <div className="space-y-2" data-testid="branding-color-picker">
      <div className="flex flex-wrap gap-2">
        {PRESET_COLORS.map((c) => (
          <button key={c} type="button" onClick={() => onChange(c)}
            data-testid={`branding-color-${c.replace('#', '')}`}
            title={c}
            className={`w-9 h-9 rounded-lg border-2 transition ${value?.toLowerCase() === c.toLowerCase() ? 'border-slate-900 scale-110' : 'border-white shadow'}`}
            style={{ backgroundColor: c }} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input type="color" value={value || '#FF5C00'} onChange={(e) => onChange(e.target.value)}
          data-testid="branding-color-input"
          className="h-10 w-12 cursor-pointer rounded border border-slate-200" />
        <input type="text" value={value || ''} onChange={(e) => onChange(e.target.value)}
          placeholder="#FF5C00"
          data-testid="branding-color-hex"
          className="h-10 flex-1 px-3 border-2 border-slate-200 rounded-lg font-mono text-sm focus:border-slate-900 focus:outline-none" />
      </div>
    </div>
  );
}

function LogoUploader({ value, onChange }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const handleFile = async (file) => {
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post('/companies/me/branding/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onChange(data.url);
    } catch (e) { setErr(formatError(e)); }
    finally { setBusy(false); }
  };
  const preview = resolveLogoUrl(value);
  return (
    <div data-testid="branding-logo">
      {preview && (
        <div className="mb-2 flex items-center gap-2">
          <img src={preview} alt="logo preview" className="w-20 h-20 object-contain rounded-lg border border-slate-200 bg-white p-2" />
          <button type="button" onClick={() => onChange('')}
            data-testid="branding-logo-clear"
            className="text-xs text-rose-600 font-semibold hover:underline">verwijderen</button>
        </div>
      )}
      <label className="block">
        <span className="block w-full h-10 rounded-lg border-2 border-dashed border-slate-300 hover:border-slate-900 hover:bg-slate-50 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {busy ? 'Uploaden...' : 'Upload logo (max 5 MB)'}
        </span>
        <input type="file" accept="image/*" className="hidden"
          data-testid="branding-logo-file"
          onChange={(e) => handleFile(e.target.files?.[0])} />
      </label>
      {err && <p className="text-[11px] text-rose-600 mt-1">{err}</p>}
    </div>
  );
}

export default function Branding() {
  const [b, setB] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/companies/me/branding');
      setB(data);
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const upd = (k, v) => setB((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true); setErr(''); setMsg('');
    try {
      const { data } = await api.put('/companies/me/branding', {
        app_name: b.app_name || '',
        primary_color: b.primary_color || '',
        logo_url: b.logo_url || '',
        tagline: b.tagline || '',
      });
      setB(data);
      applyBranding(data);
      setMsg('Opgeslagen! Branding is direct actief.');
      setTimeout(() => setMsg(''), 4000);
    } catch (e) { setErr(formatError(e)); }
    finally { setSaving(false); }
  };

  if (loading || !b) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-900" /></div>;
  }

  const previewColor = b.primary_color || '#FF5C00';
  const loginUrl = `/login?c=${encodeURIComponent(b.slug || '')}`;

  return (
    <div className="space-y-4" data-testid="branding-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Palette className="w-5 h-5" /> Branding
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Logo, kleur en naam die uw klanten zien bij login en in de PWA.</p>
        </div>
        <div className="flex items-center gap-2">
          <a href={loginUrl} target="_blank" rel="noreferrer"
            data-testid="branding-preview-link"
            className="h-10 px-3 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 inline-flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" /> Preview login
          </a>
          <button type="button" onClick={save} disabled={saving}
            data-testid="branding-save"
            className="h-10 px-4 rounded-lg text-xs font-extrabold text-white inline-flex items-center gap-1.5 disabled:opacity-60"
            style={{ backgroundColor: previewColor }}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Opslaan
          </button>
        </div>
      </div>

      {err && <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-lg p-3 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{err}</div>}
      {msg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-lg p-3 flex items-center gap-2"><Check className="w-4 h-4" />{msg}</div>}

      <MyUrlCard />

      <div className="grid md:grid-cols-2 gap-4">
        {/* LEFT: form */}
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="text-sm font-extrabold text-slate-900 mb-3">Logo</h3>
            <LogoUploader value={b.logo_url} onChange={(v) => upd('logo_url', v)} />
            <p className="text-[11px] text-slate-400 mt-2">PNG/SVG met transparante achtergrond werkt het beste. Maximaal 5 MB.</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="text-sm font-extrabold text-slate-900 mb-3">Primaire kleur</h3>
            <ColorPicker value={b.primary_color} onChange={(v) => upd('primary_color', v)} />
            <p className="text-[11px] text-slate-400 mt-2">Wordt gebruikt voor knoppen en accenten op uw eigen login-pagina.</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="text-sm font-extrabold text-slate-900 mb-3">Naam & tagline</h3>
            <label className="block mb-3">
              <span className="block text-xs font-bold text-slate-700 mb-1">App naam</span>
              <input type="text" value={b.app_name || ''} onChange={(e) => upd('app_name', e.target.value)}
                placeholder={b.name || 'Uw bedrijfsnaam'}
                data-testid="branding-app-name"
                className="w-full h-10 px-3 border-2 border-slate-200 rounded-lg text-sm focus:border-slate-900 focus:outline-none" />
              <p className="text-[11px] text-slate-400 mt-1">Verschijnt boven het PIN-veld op de login-pagina.</p>
            </label>
            <label className="block">
              <span className="block text-xs font-bold text-slate-700 mb-1">Tagline (optioneel)</span>
              <input type="text" value={b.tagline || ''} onChange={(e) => upd('tagline', e.target.value)}
                placeholder="bv. Beheer & Kiosk toegang"
                data-testid="branding-tagline"
                className="w-full h-10 px-3 border-2 border-slate-200 rounded-lg text-sm focus:border-slate-900 focus:outline-none" />
            </label>
          </div>
        </div>

        {/* RIGHT: live preview */}
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest font-extrabold text-slate-500">Live preview</p>
          <div className="rounded-3xl overflow-hidden border-2 border-slate-200 shadow-2xl" data-testid="branding-preview">
            <div className="w-full h-32 flex items-center px-6 gap-3"
              style={{ background: `linear-gradient(135deg, ${previewColor} 0%, ${previewColor}DD 100%)` }}>
              {b.logo_url ? (
                <img src={resolveLogoUrl(b.logo_url)} alt="logo" className="w-14 h-14 rounded-xl bg-white p-2 object-contain" />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-white/95 flex items-center justify-center text-2xl font-black"
                  style={{ color: previewColor }}>
                  {(b.app_name || b.name || '?').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="text-white">
                <p className="text-lg font-black tracking-tight">{b.app_name || b.name || 'Uw bedrijf'}</p>
                <p className="text-xs opacity-90">{b.tagline || 'Beheer & Kiosk toegang'}</p>
              </div>
            </div>
            <div className="bg-white p-6 text-center">
              <h3 className="text-base font-black text-slate-900 mb-1">Welkom bij {b.app_name || b.name || 'Kiosk'}</h3>
              <p className="text-xs text-slate-500 mb-4">Voer uw PIN code in om te beginnen</p>
              <div className="flex justify-center gap-2 mb-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="w-9 h-9 border-2 border-slate-200 rounded-lg" />
                ))}
              </div>
              <button type="button" className="w-full h-10 rounded-lg text-sm font-black text-white"
                style={{ backgroundColor: previewColor }}>
                Inloggen
              </button>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 text-center">Dit is wat klanten zien op {(typeof window !== 'undefined' ? window.location.origin : '')}/login?c={b.slug}</p>
        </div>
      </div>
    </div>
  );
}

// Quiet unused-import lint flag
void RotateCcw;
