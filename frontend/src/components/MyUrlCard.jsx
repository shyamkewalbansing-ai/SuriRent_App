import { useEffect, useState, useCallback } from 'react';
import { Copy, Check, Globe, Loader2, AlertCircle, ExternalLink, RefreshCw, Share2 } from 'lucide-react';
import { api, formatError } from '../lib/api';

const STATUS_META = {
  active: { tone: 'emerald', label: 'Wildcard DNS actief', icon: Check,
    desc: 'Klanten kunnen uw eigen subdomein gebruiken.' },
  dns_missing: { tone: 'amber', label: 'Wildcard DNS nog niet ingesteld', icon: AlertCircle,
    desc: 'Tot DNS actief is, gebruikt u de URL met ?c=… (werkt al direct).' },
  error: { tone: 'rose', label: 'Subdomein gaf een fout terug', icon: AlertCircle,
    desc: 'Het subdomein is bereikbaar, maar de health-check faalde.' },
  unknown: { tone: 'slate', label: 'Status onbekend', icon: Loader2,
    desc: 'Live check kon niet uitgevoerd worden.' },
};

function ToneBadge({ tone, children, icon: Icon }) {
  const cls = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
  }[tone] || 'bg-slate-50 text-slate-700 border-slate-200';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-extrabold ${cls}`}>
      {Icon && <Icon className="w-3 h-3" />}{children}
    </span>
  );
}

function CopyButton({ value, testid }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <button type="button" onClick={copy} data-testid={testid}
      className={`shrink-0 h-9 px-3 rounded-lg text-xs font-extrabold inline-flex items-center gap-1.5 transition ${
        copied ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white hover:bg-slate-800'
      }`}>
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Gekopieerd' : 'Kopieer'}
    </button>
  );
}

/** Reusable card showing the company's login URLs + live DNS status.
 *  `compact` = smaller version for dashboard overview. */
export default function MyUrlCard({ compact = false }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const { data } = await api.get('/companies/me/url-info');
      setInfo(data);
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading && !info) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-5 flex items-center gap-2 text-xs text-slate-500" data-testid="my-url-card-loading">
        <Loader2 className="w-4 h-4 animate-spin" /> Login URL ophalen…
      </div>
    );
  }
  if (err) {
    return (
      <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-700 font-semibold" data-testid="my-url-card-error">
        <AlertCircle className="w-4 h-4 inline mr-1" />{err}
      </div>
    );
  }
  if (!info) return null;

  const meta = STATUS_META[info.dns_status] || STATUS_META.unknown;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-5 md:p-6 shadow-xl" data-testid="my-url-card">
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[#FF5C00]/30 rounded-full blur-3xl pointer-events-none" />
      <div className="relative flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
            <Share2 className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/70">Uw login-URL</p>
            <p className="text-base font-extrabold tracking-tight">{info.company_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ToneBadge tone={meta.tone} icon={meta.icon}>{meta.label}</ToneBadge>
          <button type="button" onClick={load}
            data-testid="my-url-card-refresh"
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <p className="text-xs text-white/70 mb-4 max-w-2xl">{meta.desc}</p>

      <div className="space-y-3">
        {/* Subdomain URL (preferred when DNS active) */}
        {info.subdomain_url && (
          <div className="bg-white/8 backdrop-blur border border-white/10 rounded-xl p-3 flex items-center gap-2">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-[#FF5C00]/20 flex items-center justify-center">
              <Globe className="w-4 h-4 text-orange-200" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest font-black text-white/60">Eigen subdomein {info.dns_status === 'active' ? '· aanbevolen' : '· toekomstig'}</p>
              <p className="font-mono text-xs sm:text-sm text-white truncate" data-testid="my-url-subdomain">{info.subdomain_url}</p>
            </div>
            <a href={info.subdomain_url} target="_blank" rel="noreferrer"
              data-testid="my-url-subdomain-open"
              className="shrink-0 h-9 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold inline-flex items-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" /> Open
            </a>
            <CopyButton value={info.subdomain_url} testid="my-url-subdomain-copy" />
          </div>
        )}

        {/* Always-works query URL */}
        {!compact && info.query_url && (
          <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-3 flex items-center gap-2">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Check className="w-4 h-4 text-emerald-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest font-black text-white/60">Universele link · werkt altijd</p>
              <p className="font-mono text-xs sm:text-sm text-white truncate" data-testid="my-url-query">{info.query_url}</p>
            </div>
            <CopyButton value={info.query_url} testid="my-url-query-copy" />
          </div>
        )}
      </div>

      {info.dns_status === 'dns_missing' && !compact && (
        <p className="text-[11px] text-amber-200/80 mt-4 leading-relaxed">
          Heeft je hostingsbeheerder de DNS al ingesteld? Geef het 5-15 minuten voor verspreiding,
          klik dan op de refresh-knop. Tot die tijd kunnen klanten gewoon de universele link gebruiken.
        </p>
      )}
    </div>
  );
}
