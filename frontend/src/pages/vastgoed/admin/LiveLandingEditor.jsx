// Superadmin · Live Landing Editor
// =============================================================================
// Toon de echte landing in een iframe (`/?edit=1`), luister naar postMessage
// patches en sla ze op in de `landing_content` draft. Publish kopieert draft
// naar published. Discard reset draft naar published.
//
// Patches komen binnen als { type:'landing-edit-patch', path:'v2.hero.title', value:'…' }
// Image-request: { type:'landing-edit-image-request', path, current }  → toon picker
// Image-reply:   { type:'landing-edit-image-reply', path, url }       → naar iframe
//
// Pad-conventie: alle V2 velden onder `v2.*` (zodat ze losstaan van het oude
// landing schema dat door MarketingLanding.jsx wordt gebruikt).
// =============================================================================

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Save, Eye, RefreshCw, Trash2, Upload, X, ExternalLink, AlertCircle,
  CheckCircle2, Loader2, Monitor, Smartphone, Tablet, Paintbrush, History,
} from 'lucide-react';
import { api, formatError } from '../../../lib/api';

const DEVICE_PRESETS = [
  { id: 'desktop', label: 'Desktop', icon: Monitor, w: '100%', h: '100%' },
  { id: 'tablet',  label: 'Tablet',  icon: Tablet,  w: 820,    h: '100%' },
  { id: 'mobile',  label: 'Mobiel',  icon: Smartphone, w: 390, h: '100%' },
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

export default function LiveLandingEditor() {
  const iframeRef = useRef(null);
  const [draft, setDraft] = useState(null);            // content object van /superadmin/landing/content?mode=draft
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [device, setDevice] = useState('desktop');
  const [hasUnpublished, setHasUnpublished] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);
  // Image picker dialog
  const [imageReq, setImageReq] = useState(null);  // { path, current }
  const [uploadingImg, setUploadingImg] = useState(false);

  const previewSrc = `/?edit=1&landing=1&_t=${draft ? '0' : Date.now()}`; // landing=1 voorkomt auto-redirect naar /login

  const loadDraft = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const { data } = await api.get('/superadmin/landing/content', { params: { mode: 'draft' } });
      setDraft(data.content || {});
      setHasUnpublished(!!data.has_unpublished_changes);
      setDirty(false);
    } catch (e) {
      setErr(formatError(e, 'Kon concept niet laden.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDraft(); }, [loadDraft]);

  // PostMessage listener — luistert naar patches uit de iframe.
  useEffect(() => {
    const onMsg = (ev) => {
      const data = ev?.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'landing-edit-ready') {
        setIframeReady(true);
        return;
      }
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

  // Stuur draft naar iframe bij elke reload (zodat hij ook draft toont, niet published).
  useEffect(() => {
    if (!iframeReady || !draft) return;
    try {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'landing-edit-reset', content: draft }, '*',
      );
    } catch { /* no-op */ }
  }, [iframeReady, draft]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const saveDraft = useCallback(async () => {
    if (!draft) return;
    setSaving(true); setErr('');
    try {
      const { data } = await api.put('/superadmin/landing/content', { content: draft });
      setHasUnpublished(!!data.has_unpublished_changes);
      setDirty(false);
      showToast('Concept opgeslagen ✓');
    } catch (e) {
      setErr(formatError(e, 'Opslaan mislukt'));
    } finally {
      setSaving(false);
    }
  }, [draft]);

  // Autosave 1.5s na laatste edit
  useEffect(() => {
    if (!dirty) return undefined;
    const t = setTimeout(() => { saveDraft(); }, 1500);
    return () => clearTimeout(t);
  }, [dirty, saveDraft]);

  const publish = async () => {
    if (dirty) await saveDraft();
    if (!window.confirm('Concept publiceren naar de live landing page? Deze wijzigingen worden direct zichtbaar voor bezoekers.')) return;
    setPublishing(true); setErr('');
    try {
      await api.post('/superadmin/landing/publish');
      setHasUnpublished(false);
      showToast('Live gepubliceerd ✓');
    } catch (e) {
      setErr(formatError(e, 'Publiceren mislukt'));
    } finally {
      setPublishing(false);
    }
  };

  const discard = async () => {
    if (!window.confirm('Concept resetten naar de huidige live versie? Niet-opgeslagen wijzigingen gaan verloren.')) return;
    try {
      await api.post('/superadmin/landing/discard');
      await loadDraft();
      // Force iframe-reload zodat hij de nieuwe state oppikt.
      if (iframeRef.current) iframeRef.current.src = `/?edit=1&landing=1&_t=${Date.now()}`;
      showToast('Concept gereset');
    } catch (e) {
      setErr(formatError(e));
    }
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
      // Stuur reply naar iframe — die patcht z'n local state EN we patchen onze draft.
      const url = data.url;
      try {
        iframeRef.current?.contentWindow?.postMessage(
          { type: 'landing-edit-image-reply', path: imageReq.path, url }, '*',
        );
      } catch { /* no-op */ }
      setDraft((prev) => setPath(prev || {}, imageReq.path, url));
      setDirty(true);
      setImageReq(null);
      showToast('Afbeelding bijgewerkt ✓');
    } catch (e) {
      setErr(formatError(e, 'Upload mislukt'));
    } finally {
      setUploadingImg(false);
    }
  };

  const dev = DEVICE_PRESETS.find((d) => d.id === device) || DEVICE_PRESETS[0];

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] -mx-5 md:-mx-6 lg:-mx-8 -my-5 md:-my-5 lg:-my-3" data-testid="live-landing-editor">
      {/* Toolbar */}
      <div className="px-4 lg:px-6 py-3 bg-white border-b border-slate-200 flex items-center gap-2 flex-wrap shrink-0">
        <div className="flex items-center gap-2 mr-3">
          <Paintbrush className="w-5 h-5 text-orange-500" />
          <h1 className="font-extrabold text-slate-900">Landing Editor</h1>
        </div>

        {/* Device switcher */}
        <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
          {DEVICE_PRESETS.map((d) => {
            const Icon = d.icon;
            return (
              <button key={d.id} onClick={() => setDevice(d.id)}
                data-testid={`device-${d.id}`}
                className={`px-2.5 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition ${
                  device === d.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>
                <Icon className="w-3.5 h-3.5" /> {d.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        {/* Status */}
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

        <button onClick={discard} title="Concept resetten naar live"
          data-testid="landing-discard"
          className="h-9 w-9 rounded-lg border border-slate-200 hover:border-red-300 hover:bg-red-50 hover:text-red-700 text-slate-500 flex items-center justify-center">
          <Trash2 className="w-4 h-4" />
        </button>

        <a href="/" target="_blank" rel="noreferrer"
          className="h-9 w-9 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-500 flex items-center justify-center"
          title="Open live landing in nieuw tabblad">
          <ExternalLink className="w-4 h-4" />
        </a>

        <button onClick={saveDraft} disabled={!dirty || saving}
          data-testid="landing-save"
          className="h-9 px-4 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-sm flex items-center gap-1.5 disabled:opacity-50">
          <Save className="w-4 h-4" /> Opslaan
        </button>

        <button onClick={publish} disabled={publishing || (!hasUnpublished && !dirty)}
          data-testid="landing-publish"
          className="h-9 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-sm flex items-center gap-1.5 disabled:opacity-50 shadow-md shadow-emerald-500/25">
          {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
          Publiceer live
        </button>
      </div>

      {err && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-sm text-red-700 flex items-center gap-2 shrink-0">
          <AlertCircle className="w-4 h-4" /> {err}
          <button onClick={() => setErr('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Iframe preview */}
      <div className="flex-1 min-h-0 bg-slate-100 flex items-center justify-center p-4 overflow-auto">
        {loading ? (
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
        ) : (
          <div className="bg-white rounded-xl shadow-2xl overflow-hidden mx-auto"
            style={{
              width: dev.w === '100%' ? '100%' : `${dev.w}px`,
              maxWidth: '100%',
              height: '100%',
              maxHeight: '100%',
              transition: 'width 250ms ease',
            }}>
            <iframe ref={iframeRef} title="Landing preview" src={previewSrc}
              data-testid="landing-iframe"
              className="w-full h-full border-0 block" />
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-5 py-3 rounded-xl text-sm font-bold shadow-2xl z-50 flex items-center gap-2"
          data-testid="landing-toast">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" /> {toast}
        </div>
      )}

      {/* Image picker modal */}
      {imageReq && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setImageReq(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" data-testid="image-picker">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-slate-900">Afbeelding wijzigen</h3>
              <button onClick={() => setImageReq(null)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 font-mono mb-3 truncate">{imageReq.path}</p>
            {imageReq.current && (
              <img src={imageReq.current} alt="" className="w-full h-32 object-cover rounded-lg mb-3 bg-slate-100" />
            )}
            <label className="block">
              <input type="file" accept="image/*"
                onChange={(e) => uploadImage(e.target.files?.[0])}
                disabled={uploadingImg}
                className="block w-full text-sm text-slate-600 file:mr-3 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:font-bold file:text-sm file:bg-orange-500 file:text-white hover:file:bg-orange-600 file:cursor-pointer disabled:opacity-50" />
            </label>
            {uploadingImg && (
              <p className="text-sm text-orange-600 flex items-center gap-2 mt-3">
                <Loader2 className="w-4 h-4 animate-spin" /> Uploaden…
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
