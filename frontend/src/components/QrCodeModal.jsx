import { useEffect, useState } from 'react';
import { X, Download, Loader2, QrCode, Copy, Check, ExternalLink } from 'lucide-react';
import { api, formatError } from '../lib/api';

/** Modal die een PNG QR-code voor een van de bedrijfs-URL's ophaalt en toont.
 *  De endpoint `GET /api/companies/me/qr.png?kind=<kind>` bouwt de URL
 *  server-side, zodat we geen willekeurige strings doorhalen. */
export default function QrCodeModal({ open, onClose, kind, label, url, brandColor }) {
  const [src, setSrc] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !kind) return undefined;
    let alive = true;
    let objectUrl = '';
    (async () => {
      setBusy(true); setErr(''); setSrc('');
      try {
        const { data } = await api.get(`/companies/me/qr.png?kind=${encodeURIComponent(kind)}&size=480`, {
          responseType: 'blob',
        });
        objectUrl = URL.createObjectURL(data);
        if (alive) setSrc(objectUrl);
      } catch (e) { if (alive) setErr(formatError(e, 'QR-code ophalen mislukt')); }
      finally { if (alive) setBusy(false); }
    })();
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, kind]);

  if (!open) return null;

  const download = () => {
    if (!src) return;
    const a = document.createElement('a');
    a.href = src;
    a.download = `qr-${kind}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const copyUrl = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1400); }
    catch { /* ignore */ }
  };

  const accent = brandColor || '#FF5C00';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4"
      onClick={onClose} data-testid="qr-modal">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${accent}22`, color: accent }}>
              <QrCode className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">QR-code</p>
              <p className="text-sm font-extrabold text-slate-900 truncate">{label || kind}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} data-testid="qr-modal-close"
            className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        <div className="px-6 pt-5 pb-3 flex items-center justify-center">
          <div className="relative rounded-2xl border-2 border-slate-100 p-3 bg-white"
            style={{ borderColor: `${accent}33` }}>
            {busy && (
              <div className="w-[300px] h-[300px] flex items-center justify-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            )}
            {!busy && err && (
              <div className="w-[300px] h-[300px] flex items-center justify-center text-xs text-rose-600 px-4 text-center font-semibold">
                {err}
              </div>
            )}
            {!busy && !err && src && (
              <img src={src} alt={`QR ${kind}`} className="w-[300px] h-[300px] block"
                data-testid="qr-modal-image" />
            )}
          </div>
        </div>

        {url && (
          <div className="px-6 pb-2">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2">
              <p className="flex-1 font-mono text-[11px] text-slate-700 truncate">{url.replace(/^https?:\/\//, '')}</p>
              <button type="button" onClick={copyUrl} data-testid="qr-modal-copy"
                className={`shrink-0 h-8 px-2.5 rounded-lg text-[11px] font-extrabold inline-flex items-center gap-1 transition ${copied ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copied ? 'OK' : 'Kopieer'}
              </button>
              <a href={url} target="_blank" rel="noreferrer" data-testid="qr-modal-open"
                className="shrink-0 w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                <ExternalLink className="w-3.5 h-3.5 text-slate-700" />
              </a>
            </div>
          </div>
        )}

        <div className="px-6 pb-5 pt-2 flex flex-wrap gap-2 items-center justify-between">
          <p className="text-[11px] text-slate-500">Tip: print of plak deze QR op uw balie. Klanten scannen ‘m met hun telefoon en openen direct deze pagina.</p>
          <button type="button" onClick={download} disabled={!src} data-testid="qr-modal-download"
            className="h-10 px-4 rounded-xl text-xs font-extrabold text-white inline-flex items-center gap-1.5 disabled:opacity-50"
            style={{ backgroundColor: accent }}>
            <Download className="w-3.5 h-3.5" /> Download PNG
          </button>
        </div>
      </div>
    </div>
  );
}
