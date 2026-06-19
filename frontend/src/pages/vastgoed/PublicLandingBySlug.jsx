// Publieke landing — bereikbaar via /site/<slug>. Werkt voor ELK bedrijf,
// ook zonder custom domein. Hiermee kan een admin direct een shareable URL
// uitdelen (bv. surirent.sr/site/gopi) zonder DNS-configuratie.
//
// Achtergrond: TenantPublicLanding ondersteunt al host-based detectie via
// /api/public/company-landing. Deze wrapper voegt slug-based fetching toe
// via /api/public/company-landing/by-slug/<slug>.

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, AlertCircle, Home } from 'lucide-react';
import TenantPublicLanding from './TenantPublicLanding';

export default function PublicLandingBySlug() {
  const { slug } = useParams();
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    if (!slug) {
      setState({ status: 'not_found' });
      return undefined;
    }
    let cancelled = false;
    const backend = process.env.REACT_APP_BACKEND_URL || '';
    (async () => {
      try {
        const r = await fetch(`${backend}/api/public/company-landing/by-slug/${encodeURIComponent(slug)}`);
        if (!r.ok) throw new Error('bad status');
        const j = await r.json();
        if (cancelled) return;
        if (j.found) {
          setState({ status: 'ok', ...j });
          // Update document title voor SEO en browser tab.
          try {
            const name = j.company?.name || slug;
            document.title = `${name} — Beschikbare appartementen`;
          } catch { /* noop */ }
        } else {
          setState({ status: 'not_found' });
        }
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50"
        data-testid="public-landing-loading">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  if (state.status === 'not_found' || state.status === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center"
        data-testid="public-landing-not-found">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 mb-1">Bedrijf niet gevonden</h1>
        <p className="text-sm text-slate-500 max-w-sm">
          De landingspagina voor <span className="font-mono font-bold">{slug}</span> bestaat niet
          of is nog niet gepubliceerd.
        </p>
        <Link to="/" className="mt-6 inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition">
          <Home className="w-4 h-4" /> Terug naar startpagina
        </Link>
      </div>
    );
  }

  return (
    <TenantPublicLanding
      company={state.company}
      apartments={state.apartments || []}
      content={state.content || {}}
      editMode={false}
    />
  );
}
