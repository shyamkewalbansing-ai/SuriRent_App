import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Save, Send, RotateCcw, Loader2, AlertCircle, CheckCircle, Upload, Link2,
  Plus, Trash2, GripVertical, ExternalLink, Eye, Image as ImageIcon, X,
} from 'lucide-react';
import { api, formatError } from '../../../lib/api';

// ============== Small form helpers ==============
function Field({ label, value = '', onChange, hint, placeholder, multiline, testid, mono }) {
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <label className="block">
      <span className="block text-xs font-bold text-slate-700 mb-1">{label}</span>
      <Tag
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={testid}
        rows={multiline ? 3 : undefined}
        className={`w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm focus:border-[#FF5C00] focus:outline-none transition-colors ${mono ? 'font-mono' : ''} ${multiline ? 'resize-y min-h-[78px]' : 'h-10'}`}
      />
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </label>
  );
}

function Section({ title, subtitle, children, testid }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4" data-testid={testid}>
      <div className="mb-4">
        <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function ImageUploader({ value, onChange, testid }) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setErr('');
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post('/superadmin/landing/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onChange(data.url);
    } catch (e) {
      setErr(formatError(e));
    } finally {
      setUploading(false);
    }
  };

  const apiBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/$/, '');
  const preview = !value ? null : value.startsWith('/api/') ? `${apiBase}${value}` : value;

  return (
    <div data-testid={testid}>
      {preview && (
        <div className="mb-2 flex items-start gap-2">
          <img src={preview} alt="preview" className="w-20 h-20 object-cover rounded-lg border border-slate-200" />
          <button type="button" onClick={() => onChange('')} data-testid={`${testid}-clear`}
            className="text-xs text-rose-600 font-semibold hover:underline">verwijderen</button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
          data-testid={`${testid}-upload-btn`}
          className="h-10 rounded-lg border-2 border-dashed border-slate-300 hover:border-[#FF5C00] hover:bg-orange-50 transition flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'Uploading...' : 'Upload afbeelding'}
        </button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden"
          data-testid={`${testid}-file-input`}
          onChange={(e) => handleFile(e.target.files?.[0])} />
        <input type="text" value={value || ''} onChange={(e) => onChange(e.target.value)}
          placeholder="…of plak een URL"
          data-testid={`${testid}-url-input`}
          className="h-10 px-3 border-2 border-slate-200 rounded-lg text-xs focus:border-[#FF5C00] focus:outline-none" />
      </div>
      {err && <p className="text-[11px] text-rose-600 mt-1">{err}</p>}
    </div>
  );
}

// ============== List item helpers (add/remove/reorder) ==============
function RepeatableList({ items = [], onChange, render, addLabel, emptyLabel, testid }) {
  const move = (idx, dir) => {
    const next = [...items];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };
  return (
    <div data-testid={testid}>
      {items.length === 0 && (
        <div className="text-xs text-slate-400 italic py-3">{emptyLabel || 'Nog geen items.'}</div>
      )}
      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="border border-slate-200 rounded-xl p-3 bg-slate-50/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">#{idx + 1}</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0}
                  data-testid={`${testid}-up-${idx}`}
                  className="text-[10px] font-bold text-slate-500 hover:text-slate-900 disabled:opacity-30 px-1.5">↑</button>
                <button type="button" onClick={() => move(idx, 1)} disabled={idx === items.length - 1}
                  data-testid={`${testid}-down-${idx}`}
                  className="text-[10px] font-bold text-slate-500 hover:text-slate-900 disabled:opacity-30 px-1.5">↓</button>
                <button type="button" onClick={() => onChange(items.filter((_, i) => i !== idx))}
                  data-testid={`${testid}-remove-${idx}`}
                  className="text-rose-600 hover:bg-rose-50 rounded p-1"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            {render(item, idx, (patch) => {
              const next = [...items];
              next[idx] = { ...next[idx], ...patch };
              onChange(next);
            })}
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...items, {}])} data-testid={`${testid}-add`}
        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 text-[#C74600] border border-orange-200 text-xs font-bold hover:bg-orange-100 transition">
        <Plus className="w-3.5 h-3.5" /> {addLabel || 'Toevoegen'}
      </button>
    </div>
  );
}

// ============== Main editor ==============
export default function LandingEditor() {
  const [draft, setDraft] = useState(null);
  const [pub, setPub] = useState(null);
  const [allowedIcons, setAllowedIcons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [activeSection, setActiveSection] = useState('hero');
  const previewRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get('/superadmin/landing/content?mode=draft');
      setDraft(d.content || {});
      setPub(d); // metadata
      setAllowedIcons(d.allowed_icons || []);
      setHasChanges(!!d.has_unpublished_changes);
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Push live preview to iframe whenever draft changes
  useEffect(() => {
    if (!draft || !previewRef.current?.contentWindow) return;
    try {
      previewRef.current.contentWindow.postMessage({ type: 'landing-preview', content: draft }, '*');
    } catch { /* ignore cross-origin */ }
  }, [draft]);

  const patch = (key, sub) => setDraft((prev) => ({ ...prev, [key]: { ...(prev?.[key] || {}), ...sub } }));
  const set = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

  const saveDraft = async () => {
    setSaving(true); setErr(''); setMsg('');
    try {
      const { data } = await api.put('/superadmin/landing/content', { content: draft });
      setHasChanges(!!data.has_unpublished_changes);
      setMsg('Concept opgeslagen.');
      setTimeout(() => setMsg(''), 3000);
    } catch (e) { setErr(formatError(e)); }
    finally { setSaving(false); }
  };

  const publish = async () => {
    if (!window.confirm('Concept publiceren? De landing page wordt direct bijgewerkt voor bezoekers.')) return;
    setPublishing(true); setErr(''); setMsg('');
    try {
      await api.put('/superadmin/landing/content', { content: draft });
      await api.post('/superadmin/landing/publish');
      setHasChanges(false);
      setMsg('Live! De landing page is geüpdatet.');
      setTimeout(() => setMsg(''), 4000);
      // Force iframe to reload published content
      if (previewRef.current) previewRef.current.src = previewRef.current.src.split('?')[0] + `?ts=${Date.now()}`;
    } catch (e) { setErr(formatError(e)); }
    finally { setPublishing(false); }
  };

  const discard = async () => {
    if (!window.confirm('Concept-wijzigingen weggooien en terug naar de gepubliceerde versie?')) return;
    try {
      await api.post('/superadmin/landing/discard');
      await load();
      setMsg('Concept gereset naar gepubliceerde versie.');
      setTimeout(() => setMsg(''), 3000);
    } catch (e) { setErr(formatError(e)); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[#FF5C00]" /></div>;
  }
  if (!draft) {
    return <div className="text-sm text-rose-600">{err || 'Kon content niet laden.'}</div>;
  }

  const previewUrl = `/?landing-preview=1#ts=${pub?.updated_at || ''}`;
  const sections = [
    { id: 'brand', label: 'Merk' },
    { id: 'nav', label: 'Navigatie' },
    { id: 'hero', label: 'Hero' },
    { id: 'stats', label: 'Statistieken' },
    { id: 'install', label: 'Installeer' },
    { id: 'features', label: 'Functies' },
    { id: 'pricing', label: 'Prijzen' },
    { id: 'cta', label: 'CTA blok' },
    { id: 'footer', label: 'Footer' },
  ];

  return (
    <div className="space-y-4" data-testid="landing-editor">
      {/* Sticky action bar */}
      <div className="sticky top-0 z-30 -mx-4 px-4 py-3 bg-white/95 backdrop-blur border-b border-slate-200 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <h2 className="text-base font-extrabold text-slate-900 tracking-tight truncate">Landing Editor</h2>
          {hasChanges ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-extrabold uppercase tracking-widest" data-testid="status-draft">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Concept
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase tracking-widest" data-testid="status-published">
              <CheckCircle className="w-3 h-3" /> Gepubliceerd
            </span>
          )}
        </div>
        <button type="button" onClick={discard} className="h-9 px-3 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1.5"
          data-testid="btn-discard">
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
        <button type="button" onClick={saveDraft} disabled={saving}
          data-testid="btn-save-draft"
          className="h-9 px-3 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition inline-flex items-center gap-1.5 disabled:opacity-60">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Opslaan concept
        </button>
        <button type="button" onClick={publish} disabled={publishing}
          data-testid="btn-publish"
          className="h-9 px-4 rounded-lg text-xs font-extrabold bg-[#FF5C00] text-white hover:bg-[#E65300] transition inline-flex items-center gap-1.5 disabled:opacity-60">
          {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Publiceer
        </button>
      </div>

      {err && <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-lg p-3 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{err}</div>}
      {msg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-lg p-3 flex items-center gap-2"><CheckCircle className="w-4 h-4" />{msg}</div>}

      <div className="grid lg:grid-cols-[420px,1fr] gap-4">
        {/* LEFT: form */}
        <div className="space-y-3">
          {/* Section navigator */}
          <div className="bg-white border border-slate-200 rounded-2xl p-2 flex flex-wrap gap-1" data-testid="section-tabs">
            {sections.map((s) => (
              <button key={s.id} type="button" onClick={() => setActiveSection(s.id)}
                data-testid={`section-tab-${s.id}`}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${
                  activeSection === s.id ? 'bg-[#FF5C00] text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}>{s.label}</button>
            ))}
          </div>

          {activeSection === 'brand' && (
            <Section title="Merk" subtitle="Logo + bedrijfsnaam (verschijnt in navigatie + footer)" testid="sec-brand">
              <Field label="Naam" value={draft.brand?.name} onChange={(v) => patch('brand', { name: v })} testid="brand-name" />
              <Field label="Achtervoegsel" value={draft.brand?.suffix} onChange={(v) => patch('brand', { suffix: v })} placeholder="bv. N.V." testid="brand-suffix" />
              <div>
                <span className="block text-xs font-bold text-slate-700 mb-1">Logo</span>
                <ImageUploader value={draft.brand?.logo_url} onChange={(v) => patch('brand', { logo_url: v })} testid="brand-logo" />
              </div>
            </Section>
          )}

          {activeSection === 'nav' && (
            <Section title="Navigatie" subtitle="Menu-items in de topbalk + CTA-knop" testid="sec-nav">
              <Field label="CTA knop tekst" value={draft.nav?.cta_label} onChange={(v) => patch('nav', { cta_label: v })} testid="nav-cta-label" />
              <div>
                <span className="block text-xs font-bold text-slate-700 mb-1">Menu items</span>
                <RepeatableList
                  items={draft.nav?.items || []}
                  onChange={(items) => patch('nav', { items })}
                  addLabel="Item toevoegen"
                  testid="nav-items"
                  render={(it, idx, upd) => (
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Label" value={it.label} onChange={(v) => upd({ label: v })} testid={`nav-item-label-${idx}`} />
                      <Field label="Sectie ID" value={it.anchor} onChange={(v) => upd({ anchor: v })}
                        placeholder="install / features / pricing / contact"
                        hint="Naar welke sectie scrolt deze knop"
                        testid={`nav-item-anchor-${idx}`} />
                    </div>
                  )} />
              </div>
            </Section>
          )}

          {activeSection === 'hero' && (
            <Section title="Hero" subtitle="De grote bovenste sectie" testid="sec-hero">
              <Field label="Eyebrow tekst" value={draft.hero?.eyebrow} onChange={(v) => patch('hero', { eyebrow: v })} testid="hero-eyebrow" />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Titel — woord 1" value={draft.hero?.title_pre} onChange={(v) => patch('hero', { title_pre: v })} testid="hero-title-pre" />
                <Field label="Titel — accent" value={draft.hero?.title_highlight} onChange={(v) => patch('hero', { title_highlight: v })} testid="hero-title-highlight" hint="Wordt oranje" />
              </div>
              <Field label="Titel — rest" value={draft.hero?.title_post} onChange={(v) => patch('hero', { title_post: v })} testid="hero-title-post" />
              <Field label="Subtitel" value={draft.hero?.subtitle} onChange={(v) => patch('hero', { subtitle: v })} multiline testid="hero-subtitle" />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Primaire knop" value={draft.hero?.cta_primary} onChange={(v) => patch('hero', { cta_primary: v })} testid="hero-cta-primary" />
                <Field label="Secundaire knop" value={draft.hero?.cta_secondary} onChange={(v) => patch('hero', { cta_secondary: v })} testid="hero-cta-secondary" />
              </div>
              <div>
                <span className="block text-xs font-bold text-slate-700 mb-1">Trust badges</span>
                <RepeatableList
                  items={(draft.hero?.trust_badges || []).map((s) => ({ text: s }))}
                  onChange={(items) => patch('hero', { trust_badges: items.map((it) => it.text || '') })}
                  addLabel="Badge toevoegen"
                  testid="hero-badges"
                  render={(it, idx, upd) => (
                    <Field label="Tekst" value={it.text} onChange={(v) => upd({ text: v })} testid={`hero-badge-${idx}`} />
                  )} />
              </div>
              <div>
                <span className="block text-xs font-bold text-slate-700 mb-1">Hero afbeelding (optioneel)</span>
                <ImageUploader value={draft.hero?.preview_image_url} onChange={(v) => patch('hero', { preview_image_url: v })} testid="hero-image" />
                <p className="text-[11px] text-slate-400 mt-1">Leeg = standaard Kiosk-kaart wordt getoond.</p>
              </div>
            </Section>
          )}

          {activeSection === 'stats' && (
            <Section title="Statistieken-strip" subtitle="Oranje balk onder de hero" testid="sec-stats">
              <RepeatableList
                items={draft.stats || []}
                onChange={(stats) => set('stats', stats)}
                addLabel="Statistiek toevoegen"
                testid="stats-list"
                render={(it, idx, upd) => (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Waarde" value={it.value} onChange={(v) => upd({ value: v })} mono testid={`stats-value-${idx}`} />
                    <Field label="Label" value={it.label} onChange={(v) => upd({ label: v })} testid={`stats-label-${idx}`} />
                  </div>
                )} />
            </Section>
          )}

          {activeSection === 'install' && (
            <Section title="Installeer sectie (PWA)" subtitle="QR-code, iOS-stappen, Android-stappen, voordelen" testid="sec-install">
              <Field label="Eyebrow" value={draft.install?.eyebrow} onChange={(v) => patch('install', { eyebrow: v })} testid="install-eyebrow" />
              <Field label="Titel — regel 1" value={draft.install?.title} onChange={(v) => patch('install', { title: v })} testid="install-title" />
              <Field label="Titel — accent" value={draft.install?.title_accent} onChange={(v) => patch('install', { title_accent: v })} testid="install-title-accent" hint="Wordt oranje" />
              <Field label="Subtitel" value={draft.install?.subtitle} onChange={(v) => patch('install', { subtitle: v })} multiline testid="install-subtitle" />

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <h4 className="text-xs font-extrabold text-slate-700 mb-2">QR-code paneel</h4>
                <Field label="Eyebrow" value={draft.install?.qr?.eyebrow} onChange={(v) => patch('install', { qr: { ...(draft.install?.qr || {}), eyebrow: v } })} testid="install-qr-eyebrow" />
                <Field label="Titel" value={draft.install?.qr?.title} onChange={(v) => patch('install', { qr: { ...(draft.install?.qr || {}), title: v } })} testid="install-qr-title" />
                <Field label="Omschrijving" value={draft.install?.qr?.desc} onChange={(v) => patch('install', { qr: { ...(draft.install?.qr || {}), desc: v } })} multiline testid="install-qr-desc" />
                <div className="mt-2">
                  <span className="block text-xs font-bold text-slate-700 mb-1">QR-code afbeelding</span>
                  <ImageUploader value={draft.install?.qr?.qr_image_url}
                    onChange={(v) => patch('install', { qr: { ...(draft.install?.qr || {}), qr_image_url: v } })}
                    testid="install-qr-image" />
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <h4 className="text-xs font-extrabold text-slate-700 mb-2">iOS kaart</h4>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Platform label" value={draft.install?.ios?.label} onChange={(v) => patch('install', { ios: { ...(draft.install?.ios || {}), label: v } })} testid="install-ios-label" />
                  <Field label="Badge" value={draft.install?.ios?.badge} onChange={(v) => patch('install', { ios: { ...(draft.install?.ios || {}), badge: v } })} testid="install-ios-badge" />
                </div>
                <Field label="Titel" value={draft.install?.ios?.title} onChange={(v) => patch('install', { ios: { ...(draft.install?.ios || {}), title: v } })} testid="install-ios-title" />
                <div className="mt-2">
                  <span className="block text-xs font-bold text-slate-700 mb-1">Screenshot</span>
                  <ImageUploader value={draft.install?.ios?.screenshot_url}
                    onChange={(v) => patch('install', { ios: { ...(draft.install?.ios || {}), screenshot_url: v } })}
                    testid="install-ios-screenshot" />
                </div>
                <div className="mt-3">
                  <span className="block text-xs font-bold text-slate-700 mb-1">Installatie stappen</span>
                  <RepeatableList
                    items={draft.install?.ios?.steps || []}
                    onChange={(steps) => patch('install', { ios: { ...(draft.install?.ios || {}), steps } })}
                    addLabel="Stap toevoegen"
                    testid="install-ios-steps"
                    render={(it, idx, upd) => (
                      <div className="space-y-2">
                        <label className="block">
                          <span className="block text-xs font-bold text-slate-700 mb-1">Icoon</span>
                          <select value={it.icon || ''} onChange={(e) => upd({ icon: e.target.value })}
                            data-testid={`install-ios-step-icon-${idx}`}
                            className="w-full h-10 px-2 border-2 border-slate-200 rounded-lg text-xs">
                            <option value="">— kies —</option>
                            {allowedIcons.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                          </select>
                        </label>
                        <Field label="Titel" value={it.title} onChange={(v) => upd({ title: v })} testid={`install-ios-step-title-${idx}`} />
                        <Field label="Omschrijving" value={it.desc} onChange={(v) => upd({ desc: v })} multiline testid={`install-ios-step-desc-${idx}`} />
                      </div>
                    )} />
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <h4 className="text-xs font-extrabold text-slate-700 mb-2">Android kaart</h4>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Platform label" value={draft.install?.android?.label} onChange={(v) => patch('install', { android: { ...(draft.install?.android || {}), label: v } })} testid="install-android-label" />
                  <Field label="Badge" value={draft.install?.android?.badge} onChange={(v) => patch('install', { android: { ...(draft.install?.android || {}), badge: v } })} testid="install-android-badge" />
                </div>
                <Field label="Titel" value={draft.install?.android?.title} onChange={(v) => patch('install', { android: { ...(draft.install?.android || {}), title: v } })} testid="install-android-title" />
                <div className="mt-2">
                  <span className="block text-xs font-bold text-slate-700 mb-1">Screenshot</span>
                  <ImageUploader value={draft.install?.android?.screenshot_url}
                    onChange={(v) => patch('install', { android: { ...(draft.install?.android || {}), screenshot_url: v } })}
                    testid="install-android-screenshot" />
                </div>
                <div className="mt-3">
                  <span className="block text-xs font-bold text-slate-700 mb-1">Installatie stappen</span>
                  <RepeatableList
                    items={draft.install?.android?.steps || []}
                    onChange={(steps) => patch('install', { android: { ...(draft.install?.android || {}), steps } })}
                    addLabel="Stap toevoegen"
                    testid="install-android-steps"
                    render={(it, idx, upd) => (
                      <div className="space-y-2">
                        <label className="block">
                          <span className="block text-xs font-bold text-slate-700 mb-1">Icoon</span>
                          <select value={it.icon || ''} onChange={(e) => upd({ icon: e.target.value })}
                            data-testid={`install-android-step-icon-${idx}`}
                            className="w-full h-10 px-2 border-2 border-slate-200 rounded-lg text-xs">
                            <option value="">— kies —</option>
                            {allowedIcons.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                          </select>
                        </label>
                        <Field label="Titel" value={it.title} onChange={(v) => upd({ title: v })} testid={`install-android-step-title-${idx}`} />
                        <Field label="Omschrijving" value={it.desc} onChange={(v) => upd({ desc: v })} multiline testid={`install-android-step-desc-${idx}`} />
                      </div>
                    )} />
                </div>
              </div>

              <div>
                <span className="block text-xs font-bold text-slate-700 mb-1">Voordelen (3 kaartjes onderaan)</span>
                <RepeatableList
                  items={draft.install?.benefits || []}
                  onChange={(benefits) => patch('install', { benefits })}
                  addLabel="Voordeel toevoegen"
                  testid="install-benefits"
                  render={(it, idx, upd) => (
                    <div className="space-y-2">
                      <label className="block">
                        <span className="block text-xs font-bold text-slate-700 mb-1">Icoon</span>
                        <select value={it.icon || ''} onChange={(e) => upd({ icon: e.target.value })}
                          data-testid={`install-benefit-icon-${idx}`}
                          className="w-full h-10 px-2 border-2 border-slate-200 rounded-lg text-xs">
                          <option value="">— kies —</option>
                          {allowedIcons.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                        </select>
                      </label>
                      <Field label="Titel" value={it.title} onChange={(v) => upd({ title: v })} testid={`install-benefit-title-${idx}`} />
                      <Field label="Omschrijving" value={it.desc} onChange={(v) => upd({ desc: v })} multiline testid={`install-benefit-desc-${idx}`} />
                    </div>
                  )} />
              </div>
            </Section>
          )}

          {activeSection === 'features' && (
            <Section title="Functies" subtitle="De grid met functie-kaarten. Eén kan 'featured' zijn (grote oranje kaart)." testid="sec-features">
              <Field label="Eyebrow" value={draft.features_header?.eyebrow} onChange={(v) => patch('features_header', { eyebrow: v })} testid="features-eyebrow" />
              <Field label="Titel — regel 1" value={draft.features_header?.title} onChange={(v) => patch('features_header', { title: v })} testid="features-title" />
              <Field label="Titel — regel 2" value={draft.features_header?.title_accent} onChange={(v) => patch('features_header', { title_accent: v })} testid="features-title-accent" hint="Grijs gestyled" />
              <Field label="Subtitel" value={draft.features_header?.subtitle} onChange={(v) => patch('features_header', { subtitle: v })} multiline testid="features-subtitle" />
              <div>
                <span className="block text-xs font-bold text-slate-700 mb-1">Functies</span>
                <RepeatableList
                  items={draft.features || []}
                  onChange={(features) => set('features', features)}
                  addLabel="Functie toevoegen"
                  testid="features-list"
                  render={(it, idx, upd) => (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="block text-xs font-bold text-slate-700 mb-1">Icoon</span>
                          <select value={it.icon || ''} onChange={(e) => upd({ icon: e.target.value })}
                            data-testid={`features-icon-${idx}`}
                            className="w-full h-10 px-2 border-2 border-slate-200 rounded-lg text-xs focus:border-[#FF5C00] focus:outline-none">
                            <option value="">— kies —</option>
                            {allowedIcons.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                          </select>
                        </label>
                        <label className="block">
                          <span className="block text-xs font-bold text-slate-700 mb-1">Featured (groot)</span>
                          <button type="button" onClick={() => upd({ featured: !it.featured })}
                            data-testid={`features-featured-${idx}`}
                            className={`w-full h-10 rounded-lg font-bold text-xs transition ${
                              it.featured ? 'bg-[#FF5C00] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}>{it.featured ? 'Ja, featured' : 'Nee'}</button>
                        </label>
                      </div>
                      <Field label="Titel" value={it.title} onChange={(v) => upd({ title: v })} testid={`features-title-${idx}`} />
                      <Field label="Omschrijving" value={it.desc} onChange={(v) => upd({ desc: v })} multiline testid={`features-desc-${idx}`} />
                    </div>
                  )} />
              </div>
            </Section>
          )}

          {activeSection === 'pricing' && (
            <Section title="Prijzen" subtitle="Header + feature-lijsten per pakket. Prijzen zelf komen uit de plan-config." testid="sec-pricing">
              <Field label="Eyebrow" value={draft.pricing_header?.eyebrow} onChange={(v) => patch('pricing_header', { eyebrow: v })} testid="pricing-eyebrow" />
              <Field label="Titel" value={draft.pricing_header?.title} onChange={(v) => patch('pricing_header', { title: v })} testid="pricing-title" />
              <Field label="Titel accent" value={draft.pricing_header?.title_accent} onChange={(v) => patch('pricing_header', { title_accent: v })} testid="pricing-title-accent" />
              <Field label="Subtitel" value={draft.pricing_header?.subtitle} onChange={(v) => patch('pricing_header', { subtitle: v })} multiline testid="pricing-subtitle" />

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <h4 className="text-xs font-extrabold text-slate-700 mb-2">Starter pakket</h4>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Naam" value={draft.pricing_starter?.name} onChange={(v) => patch('pricing_starter', { name: v })} testid="pricing-starter-name" />
                  <Field label="CTA tekst" value={draft.pricing_starter?.cta} onChange={(v) => patch('pricing_starter', { cta: v })} testid="pricing-starter-cta" />
                </div>
                <Field label="Omschrijving" value={draft.pricing_starter?.desc} onChange={(v) => patch('pricing_starter', { desc: v })} testid="pricing-starter-desc" />
                <div className="mt-2">
                  <span className="block text-xs font-bold text-slate-700 mb-1">Features</span>
                  <RepeatableList
                    items={(draft.pricing_starter?.features || []).map((s) => ({ text: s }))}
                    onChange={(items) => patch('pricing_starter', { features: items.map((it) => it.text || '') })}
                    addLabel="Feature toevoegen"
                    testid="pricing-starter-features"
                    render={(it, idx, upd) => (
                      <Field label="Tekst" value={it.text} onChange={(v) => upd({ text: v })} testid={`pricing-starter-feat-${idx}`} />
                    )} />
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <h4 className="text-xs font-extrabold text-slate-700 mb-2">Professional pakket</h4>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Naam" value={draft.pricing_pro?.name} onChange={(v) => patch('pricing_pro', { name: v })} testid="pricing-pro-name" />
                  <Field label="CTA tekst" value={draft.pricing_pro?.cta} onChange={(v) => patch('pricing_pro', { cta: v })} testid="pricing-pro-cta" />
                </div>
                <Field label="Omschrijving" value={draft.pricing_pro?.desc} onChange={(v) => patch('pricing_pro', { desc: v })} testid="pricing-pro-desc" />
                <div className="mt-2">
                  <span className="block text-xs font-bold text-slate-700 mb-1">Features</span>
                  <RepeatableList
                    items={(draft.pricing_pro?.features || []).map((s) => ({ text: s }))}
                    onChange={(items) => patch('pricing_pro', { features: items.map((it) => it.text || '') })}
                    addLabel="Feature toevoegen"
                    testid="pricing-pro-features"
                    render={(it, idx, upd) => (
                      <Field label="Tekst" value={it.text} onChange={(v) => upd({ text: v })} testid={`pricing-pro-feat-${idx}`} />
                    )} />
                </div>
              </div>
            </Section>
          )}

          {activeSection === 'cta' && (
            <Section title="CTA blok" subtitle="Oranje banner aan de onderkant" testid="sec-cta">
              <Field label="Eyebrow" value={draft.cta_section?.eyebrow} onChange={(v) => patch('cta_section', { eyebrow: v })} testid="cta-eyebrow" />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Titel regel 1" value={draft.cta_section?.title_line_1} onChange={(v) => patch('cta_section', { title_line_1: v })} testid="cta-title-1" />
                <Field label="Titel regel 2" value={draft.cta_section?.title_line_2} onChange={(v) => patch('cta_section', { title_line_2: v })} testid="cta-title-2" />
              </div>
              <Field label="Subtitel" value={draft.cta_section?.subtitle} onChange={(v) => patch('cta_section', { subtitle: v })} multiline testid="cta-subtitle" />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Primaire knop" value={draft.cta_section?.cta_primary} onChange={(v) => patch('cta_section', { cta_primary: v })} testid="cta-primary" />
                <Field label="WhatsApp knop tekst" value={draft.cta_section?.whatsapp_label} onChange={(v) => patch('cta_section', { whatsapp_label: v })} testid="cta-whatsapp-label" />
              </div>
              <Field label="WhatsApp nummer" value={draft.cta_section?.whatsapp_number} onChange={(v) => patch('cta_section', { whatsapp_number: v })} mono placeholder="5978815993" testid="cta-whatsapp-number" hint="Internationaal formaat zonder + (bv. 5978815993)" />
            </Section>
          )}

          {activeSection === 'footer' && (
            <Section title="Footer" subtitle="Contact + links onderaan de pagina" testid="sec-footer">
              <Field label="Tagline" value={draft.footer?.tagline} onChange={(v) => patch('footer', { tagline: v })} multiline testid="footer-tagline" />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Telefoon (zichtbaar)" value={draft.footer?.phone_display} onChange={(v) => patch('footer', { phone_display: v })} testid="footer-phone" />
                <Field label="Telefoon (tel:)" value={draft.footer?.phone_tel} onChange={(v) => patch('footer', { phone_tel: v })} mono testid="footer-phone-tel" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="E-mail" value={draft.footer?.email} onChange={(v) => patch('footer', { email: v })} testid="footer-email" />
                <Field label="Adres" value={draft.footer?.address} onChange={(v) => patch('footer', { address: v })} testid="footer-address" />
              </div>
              <Field label="Copyright tekst" value={draft.footer?.copyright_text} onChange={(v) => patch('footer', { copyright_text: v })} testid="footer-copyright" />
              <div className="grid grid-cols-2 gap-2">
                <Field label="‘Gemaakt in’ label" value={draft.footer?.made_in_label} onChange={(v) => patch('footer', { made_in_label: v })} testid="footer-made-label" />
                <Field label="Land" value={draft.footer?.made_in_country} onChange={(v) => patch('footer', { made_in_country: v })} testid="footer-made-country" />
              </div>
              <div>
                <span className="block text-xs font-bold text-slate-700 mb-1">Footer links</span>
                <RepeatableList
                  items={draft.footer?.links || []}
                  onChange={(links) => patch('footer', { links })}
                  addLabel="Link toevoegen"
                  testid="footer-links"
                  render={(it, idx, upd) => (
                    <div className="space-y-2">
                      <Field label="Label" value={it.label} onChange={(v) => upd({ label: v })} testid={`footer-link-label-${idx}`} />
                      <label className="block">
                        <span className="block text-xs font-bold text-slate-700 mb-1">Type</span>
                        <select value={it.kind || 'anchor'} onChange={(e) => upd({ kind: e.target.value })}
                          data-testid={`footer-link-kind-${idx}`}
                          className="w-full h-10 px-2 border-2 border-slate-200 rounded-lg text-xs">
                          <option value="login">Login knop</option>
                          <option value="tenant_portal">Huurportaal</option>
                          <option value="anchor">Scroll naar sectie</option>
                          <option value="url">Externe URL</option>
                        </select>
                      </label>
                      {it.kind === 'anchor' && <Field label="Sectie ID" value={it.anchor} onChange={(v) => upd({ anchor: v })} testid={`footer-link-anchor-${idx}`} />}
                      {it.kind === 'url' && <Field label="URL" value={it.url} onChange={(v) => upd({ url: v })} mono testid={`footer-link-url-${idx}`} />}
                    </div>
                  )} />
              </div>
            </Section>
          )}
        </div>

        {/* RIGHT: live preview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Eye className="w-3.5 h-3.5" /> Live preview <span className="text-slate-400">(concept)</span>
            </div>
            <a href="/" target="_blank" rel="noreferrer"
              data-testid="open-live-landing"
              className="text-[11px] font-bold text-[#FF5C00] hover:underline inline-flex items-center gap-1">
              Open live landing <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="bg-slate-100 rounded-2xl border border-slate-200 overflow-hidden">
            <iframe ref={previewRef} src={previewUrl} title="Landing preview"
              data-testid="landing-preview-iframe"
              className="w-full bg-white" style={{ height: '78vh', minHeight: 600 }} />
          </div>
          <p className="text-[11px] text-slate-400 text-center">
            Wijzigingen tonen direct in de preview. Klik <strong>Publiceer</strong> om ze live te zetten voor bezoekers.
          </p>
        </div>
      </div>
    </div>
  );
}

// Silence unused imports kept for future expansion
void [Link2, GripVertical, ImageIcon, X];
