import { useEffect, useState } from 'react';
import { useParams, Routes, Route, Navigate } from 'react-router-dom';
import { fetchBranding, applyBranding, setStoredSlug } from '../lib/branding';

/**
 * BrandedShell — wikkelt alle `/c/:slug/*` routes.
 * Detecteert de slug uit de URL, slaat hem op in localStorage, haalt branding
 * op en past de primary-color CSS-var toe vóórdat de children renderen.
 * Zo werkt elk bedrijf met zijn eigen visuele identiteit op zijn eigen pad.
 */
export default function BrandedShell({ children }) {
  const { slug } = useParams();
  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(true);

  useEffect(() => {
    if (!slug) { setReady(true); return; }
    let alive = true;
    (async () => {
      const data = await fetchBranding(slug);
      if (!alive) return;
      if (data) {
        applyBranding(data);
        setStoredSlug(slug);
        setValid(true);
      } else {
        setValid(false);
      }
      setReady(true);
    })();
    return () => { alive = false; };
  }, [slug]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-kiosk-cream">
        <div className="w-12 h-12 border-4 border-orange-200 border-t-kiosk-orange rounded-full animate-spin" />
      </div>
    );
  }
  if (!valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-8 text-center max-w-md">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Onbekend bedrijf</p>
          <h2 className="text-2xl font-black text-slate-900 mt-1 mb-2">404 — Bedrijf niet gevonden</h2>
          <p className="text-sm text-slate-500">
            De bedrijfscode <code className="bg-slate-100 px-1 rounded">{slug}</code> bestaat niet.
            Controleer de URL of vraag uw beheerder om de juiste link.
          </p>
        </div>
      </div>
    );
  }
  return children;
}

/**
 * BrandedRoutes — exposes per-company kiosk + login URLs.
 * Each company gets:
 *   /c/<slug>            → company-branded login
 *   /c/<slug>/login      → idem
 *   /c/<slug>/kiosk      → admin/reception kiosk
 *   /c/<slug>/kiosk/huurder → tenant kiosk
 *   /c/<slug>/kiosk/klant   → customer display
 *   /c/<slug>/huurder    → tenant portal login
 */
export function makeBrandedRoutes({ LoginPage, KioskLayout, TenantKioskLayout,
                                    CustomerDisplay, TenantLoginPage, TenantDashboard,
                                    AdminDashboard, Protected }) {
  return (
    <Route path="/c/:slug" element={<BrandedShell><BrandedInner
      LoginPage={LoginPage} KioskLayout={KioskLayout}
      TenantKioskLayout={TenantKioskLayout} CustomerDisplay={CustomerDisplay}
      TenantLoginPage={TenantLoginPage} TenantDashboard={TenantDashboard}
      AdminDashboard={AdminDashboard} Protected={Protected}
    /></BrandedShell>} />
  );
}

function BrandedInner({ LoginPage, KioskLayout, TenantKioskLayout, CustomerDisplay,
                        TenantLoginPage, TenantDashboard, AdminDashboard, Protected }) {
  return (
    <Routes>
      <Route path="" element={<LoginPage />} />
      <Route path="login" element={<LoginPage />} />
      <Route path="admin/*" element={<Protected><AdminDashboard /></Protected>} />
      <Route path="kiosk" element={<KioskLayout />} />
      <Route path="kiosk/huurder" element={<TenantKioskLayout />} />
      <Route path="kiosk/klant" element={<CustomerDisplay />} />
      <Route path="huurder" element={<TenantLoginPage />} />
      <Route path="huurder/portaal" element={<TenantDashboard />} />
      <Route path="*" element={<Navigate to="" replace />} />
    </Routes>
  );
}
