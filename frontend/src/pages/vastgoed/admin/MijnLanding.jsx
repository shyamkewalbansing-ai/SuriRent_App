// Admin · Mijn Landing — live editor voor de publieke bedrijfslanding.
//
// Toont een iframe met /landing-preview?edit=1 die de TenantPublicLanding
// rendert. Patches komen via postMessage binnen en worden ge-autosaved.
// Identieke flow als LiveLandingEditor (superadmin) maar tegen tenant-scoped
// endpoints: /api/companies/me/landing.
//
// Aanvullend hier: custom_domain input + DNS instructies.

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Save, Eye, RefreshCw, Trash2, AlertCircle, CheckCircle2, Loader2,
  Monitor, Smartphone, Tablet, Paintbrush, History, Globe, Copy, ExternalLink, X,
} from 'lucide-react';
import { api, formatError } from '../../../lib/api';

const DEVICE_PRESETS = [
  { id: 'desktop', label: 'Desktop', icon: Monitor, w: '100%' },
  { id: 'tablet',  label: 'Tablet',  icon: Tablet,  w: 820 },
  { id: 'mobile',  label: 'Mobiel',  icon: Smartphone, w: 390 },
];

function setPath(obj, path, value) {
  if (!path) return obj;
  const parts = path.split('.');
  const out = Array.isArray(obj) ? [...obj] : { ...(obj || {}) };
  let cur = out;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    const next = cur[k];
    const isArr = Array.isArray(next);
    cur[k] = isArr ? [...next] : { ...(next || {}) };
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
  return out;
}

function CustomDomainCard({ currentDomain, landingUrl, onSaved }) {
  const [domain, setDomain] = useState(currentDomain || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const save = async () => {
    setSaving(true); setErr(''); setSavedMsg('');
    try {
      const { data } = await api.put('/companies/me/custom-domain', { custom_domain: domain });
      onSaved?.(data.custom_domain || '');
      setSavedMsg(domain ? `Domein '${data.custom_domain}' opgeslagen` : 'Domein verwijderd');
    } catch (e) {
      setErr(formatError(e));
    } finally {
      setSaving(false);
    }
  };
  const copyLanding = async () => {
    if (!landingUrl) return;
    try {
      await navigator.clipboard.writeText(landingUrl);
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <div className="space-y-4">
      {/* PUBLIEKE LANDING — altijd live, ook zonder custom domein. */}
      {landingUrl && (
        <div className="bg-gradient-to-br from-orange-500 to-amber-500 text-white rounded-2xl p-5 shadow-[0_10px_30px_-12px_rgba(255,92,0,0.55)]"
          data-testid="landing-url-card">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/80">Live — deel met je huurders</p>
              <h3 className="text-base font-extrabold leading-tight">Jouw publieke landing</h3>
              <p className="text-xs text-white/85 mt-0.5">Werkt direct, ook zonder eigen domein. Bezoekers zien hier je beschikbare appartementen.</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 bg-white/15 backdrop-blur rounded-xl px-3 py-2.5 font-mono text-xs sm:text-sm truncate"
              data-testid="landing-url-value">
              {landingUrl}
            </div>
            <div className="flex gap-2">
              <button onClick={copyLanding} data-testid="landing-url-copy"
                className={`h-11 px-4 rounded-xl font-extrabold text-xs sm:text-sm inline-flex items-center gap-1.5 transition ${
                  copied ? 'bg-emerald-500 text-white' : 'bg-white/20 hover:bg-white/30 text-white'
                }`}>
                {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Gekopieerd' : 'Kopieer'}
              </button>
              <a href={landingUrl} target="_blank" rel="noreferrer" data-testid="landing-url-open"
                className="h-11 px-4 rounded-xl bg-white text-orange-600 hover:bg-orange-50 font-extrabold text-xs sm:text-sm inline-flex items-center gap-1.5">
                <ExternalLink className="w-4 h-4" /> Bekijk live
              </a>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM DOMEIN — optioneel, voor wie een eigen URL wil. */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5" data-testid="custom-domain-card">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900">Eigen domein <span className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">optioneel</span></h3>
            <p className="text-xs text-slate-500 mt-0.5">Activeer deze landing ook op je eigen domein (bv. <span className="font-mono">gopiappartements.com</span>).</p>
          </div>
        </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input value={domain} onChange={(e) => setDomain(e.target.value)}
          data-testid="custom-domain-input"
          placeholder="uwbedrijf.com"
          className="flex-1 h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-orange-500 outline-none text-sm font-mono" />
        <button onClick={save} disabled={saving}
          data-testid="custom-domain-save"
          className="h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-sm flex items-center gap-1.5 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Opslaan
        </button>
      </div>
      {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
      {savedMsg && <p className="text-sm text-emerald-700 mt-2 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> {savedMsg}</p>}
      {currentDomain && (
        <div className="mt-4 bg-slate-50 rounded-xl p-4 text-xs text-slate-600 space-y-1.5">
          <p className="font-extrabold text-slate-700 mb-1">DNS-instellingen</p>
          <p>Maak een <code className="bg-white px-1 rounded font-bold">CNAME</code> record bij uw domein-provider:</p>
          <div className="bg-white rounded-md p-2.5 font-mono text-[11px] flex items-center justify-between">
            <span><span className="text-slate-400">{currentDomain}</span> → <span className="text-emerald-700">surirent.sr</span></span>
            <button onClick={() => navigator.clipboard?.writeText('surirent.sr')}
              className="text-orange-600 hover:text-orange-700"><Copy className="w-3.5 h-3.5" /></button>
          </div>
          <p className="text-slate-400">DNS-propagatie duurt 5-60 minuten.</p>
        </div>
      )}
      </div>
    </div>
  );
}

export default function MijnLanding() {
  const iframeRef = useRef(null);
  const [draft, setDraft] = useState({});
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [hasUnpublished, setHasUnpublished] = useState(false);
  const [customDomain, setCustomDomain] = useState('');
  const [landingUrl, setLandingUrl] = useState('');
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [device, setDevice] = useState('desktop');
  const [iframeReady, setIframeReady] = useState(false);
  const [imageReq, setImageReq] = useState(null);
  const [uploadingImg, setUploadingImg] = useState(false);

  const previewSrc = '/landing-preview?edit=1';

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const { data } = await api.get('/companies/me/landing', { params: { mode: 'draft' } });
      setDraft(data.content || {});
      setHasUnpublished(!!data.has_unpublished_changes);
      setCustomDomain(data.custom_domain || '');
      setDirty(false);
      // Haal ook de publieke landing URL op — werkt altijd, custom domein
      // is alleen een upgrade. Gefaalde fetch is niet-blokkerend.
      try {
        const { data: urlInfo } = await api.get('/companies/me/url-info');
        setLandingUrl(urlInfo?.landing_url || '');
      } catch { /* niet-kritiek — knop blijft alleen verborgen */ }
    } catch (e) {
      setErr(formatError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onMsg = (ev) => {
      const data = ev?.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'landing-edit-ready') { setIframeReady(true); return; }
      if (data.type === 'landing-edit-patch' && data.path) {
        setDraft((prev) => setPath(prev || {}, data.path, data.value));
        setDirty(true);
        return;
      }
      if (data.type === 'landing-edit-image-request' && data.path) {
        setImageReq({ path: data.path, current: data.current || '' });
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => {
    if (!iframeReady) return;
    try {
      iframeRef.current?.contentWindow?.postMessage({ type: 'landing-edit-reset', content: draft }, '*');
    } catch { /* noop */ }
  }, [iframeReady, draft]);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const saveDraft = useCallback(async () => {
    setSaving(true); setErr('');
    try {
      await api.put('/companies/me/landing', { content: draft });
      setHasUnpublished(true);
      setDirty(false);
      showToast('Concept opgeslagen ✓');
    } catch (e) {
      setErr(formatError(e));
    } finally {
      setSaving(false);
    }
  }, [draft]);

  useEffect(() => {
    if (!dirty) return undefined;
    const t = setTimeout(() => saveDraft(), 1500);
    return () => clearTimeout(t);
  }, [dirty, saveDraft]);

  const publish = async () => {
    if (dirty) await saveDraft();
    if (!window.confirm('Concept publiceren naar uw publieke landing page?')) return;
    setPublishing(true); setErr('');
    try {
      await api.post('/companies/me/landing/publish');
      setHasUnpublished(false);
      showToast('Live gepubliceerd ✓');
    } catch (e) {
      setErr(formatError(e));
    } finally {
      setPublishing(false);
    }
  };

  const discard = async () => {
    if (!window.confirm('Niet-opgeslagen wijzigingen verloren laten gaan?')) return;
    try {
      await api.post('/companies/me/landing/discard');
      await load();
      if (iframeRef.current) iframeRef.current.src = `/landing-preview?edit=1&_t=${Date.now()}`;
      showToast('Concept gereset');
    } catch (e) { setErr(formatError(e)); }
  };

  const uploadImage = async (file) => {
    if (!file || !imageReq) return;
    setUploadingImg(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post('/superadmin/landing/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url = data.url;
      try {
        iframeRef.current?.contentWindow?.postMessage({ type: 'landing-edit-image-reply', path: imageReq.path, url }, '*');
      } catch { /* noop */ }
      setDraft((prev) => setPath(prev || {}, imageReq.path, url));
      setDirty(true);
      setImageReq(null);
      showToast('Afbeelding bijgewerkt ✓');
    } catch (e) {
      setErr(formatError(e));
    } finally {
      setUploadingImg(false);
    }
  };

  const dev = DEVICE_PRESETS.find((d) => d.id === device) || DEVICE_PRESETS[0];

  return (
    <div className="space-y-5" data-testid="mijn-landing-page">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <Paintbrush className="w-6 h-6 text-orange-500" /> Mijn Landing
        </h1>
        <p className="text-sm text-slate-500 mt-1">Bewerk uw publieke bedrijfslanding waarop bezoekers uw beschikbare appartementen zien.</p>
      </div>

      <CustomDomainCard currentDomain={customDomain} landingUrl={landingUrl} onSaved={(d) => setCustomDomain(d)} />

      {/* Editor toolbar + iframe */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden" data-testid="mijn-landing-editor">
        <div className="px-4 lg:px-6 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
            {DEVICE_PRESETS.map((d) => {
              const Icon = d.icon;
              return (
                <button key={d.id} onClick={() => setDevice(d.id)}
                  data-testid={`tenant-device-${d.id}`}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition ${
                    device === d.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}>
                  <Icon className="w-3.5 h-3.5" /> {d.label}
                </button>
              );
            })}
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 text-xs">
            {saving ? (
              <span className="text-orange-600 font-bold flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Opslaan…</span>
            ) : dirty ? (
              <span className="text-amber-700 font-bold flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Niet opgeslagen</span>
            ) : hasUnpublished ? (
              <span className="text-orange-700 font-bold flex items-center gap-1"><History className="w-3.5 h-3.5" /> Onuitgegeven</span>
            ) : (
              <span className="text-emerald-700 font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Live = Concept</span>
            )}
          </div>
          <button onClick={discard} title="Reset" data-testid="tenant-landing-discard"
            className="h-9 w-9 rounded-lg border border-slate-200 hover:border-red-300 hover:bg-red-50 hover:text-red-700 text-slate-500 flex items-center justify-center">
            <Trash2 className="w-4 h-4" />
          </button>
          {(customDomain || landingUrl) && (
            <a href={customDomain ? `https://${customDomain}` : landingUrl} target="_blank" rel="noreferrer"
              data-testid="tenant-landing-live-open"
              className="h-9 w-9 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-500 flex items-center justify-center"
              title={customDomain ? 'Open live op uw domein' : 'Open publieke landing'}>
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button onClick={saveDraft} disabled={!dirty || saving}
            data-testid="tenant-landing-save"
            className="h-9 px-4 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-sm flex items-center gap-1.5 disabled:opacity-50">
            <Save className="w-4 h-4" /> Opslaan
          </button>
          <button onClick={publish} disabled={publishing || (!hasUnpublished && !dirty)}
            data-testid="tenant-landing-publish"
            className="h-9 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-sm flex items-center gap-1.5 disabled:opacity-50">
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            Publiceer
          </button>
        </div>

        {err && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {err}
            <button onClick={() => setErr('')} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        <div className="bg-slate-100 flex items-start justify-center p-4 overflow-auto" style={{ minHeight: '70vh' }}>
          {loading ? (
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin mt-12" />
          ) : (
            <div className="bg-white rounded-xl shadow-2xl overflow-hidden mx-auto"
              style={{ width: dev.w === '100%' ? '100%' : `${dev.w}px`, maxWidth: '100%', height: '85vh', transition: 'width 250ms ease' }}>
              <iframe ref={iframeRef} title="Tenant landing preview" src={previewSrc}
                data-testid="tenant-landing-iframe"
                className="w-full h-full border-0 block" />
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-5 py-3 rounded-xl text-sm font-bold shadow-2xl z-50 flex items-center gap-2"
          data-testid="tenant-landing-toast">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" /> {toast}
        </div>
      )}

      {imageReq && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setImageReq(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-slate-900">Afbeelding wijzigen</h3>
              <button onClick={() => setImageReq(null)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            {imageReq.current && (
              <img src={imageReq.current} alt="" className="w-full h-32 object-cover rounded-lg mb-3 bg-slate-100" />
            )}
            <input type="file" accept="image/*"
              onChange={(e) => uploadImage(e.target.files?.[0])}
              disabled={uploadingImg}
              className="block w-full text-sm text-slate-600 file:mr-3 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:font-bold file:text-sm file:bg-orange-500 file:text-white hover:file:bg-orange-600 file:cursor-pointer disabled:opacity-50" />
            {uploadingImg && <p className="text-sm text-orange-600 flex items-center gap-2 mt-3"><Loader2 className="w-4 h-4 animate-spin" /> Uploaden…</p>}
          </div>
        </div>
      )}
    </div>
  );
}
