import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

const ACTIVE_COMPANY_KEY = 'active_company_id';

/**
 * Issue & store een long-lived device-bound QR token.
 * Wordt automatisch aangeroepen na elke succesvolle login (email/password + PIN).
 * Server slaat een bcrypt-hash op gekoppeld aan user_id; client behoudt het
 * raw token in localStorage (key `device_qr_token`).
 *
 * Met dit token kan de PWA later desktop sessies claimen via QR-scan,
 * ZONDER opnieuw in te hoeven loggen of PIN te tikken. Token is alleen
 * geldig voor QR-claim — kan niet voor andere API endpoints worden gebruikt.
 */
async function issueDeviceQrTokenSilently() {
  try {
    const { data } = await api.post('/auth/device-qr-token/issue');
    if (data?.device_qr_token) {
      localStorage.setItem('device_qr_token', data.device_qr_token);
    }
  } catch (err) {
    // Niet kritiek — als het uitgeven faalt blijft de gewone bearer flow werken.
    console.warn('Device QR token issue failed (non-fatal):', err);
  }
}


export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = not logged
  const [loading, setLoading] = useState(true);
  const [activeCompanyId, setActiveCompanyIdState] = useState(() => localStorage.getItem(ACTIVE_COMPANY_KEY) || null);
  const [activeCompany, setActiveCompanyMeta] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
      // Resolve active company meta from /me
      if (data?.active_company) {
        setActiveCompanyMeta(data.active_company);
      } else {
        setActiveCompanyMeta(null);
      }
      // Backfill device_qr_token voor gebruikers die al ingelogd waren VOOR
      // we deze feature toevoegden. Eenmalig: als er geen token in
      // localStorage staat én we hebben een geldige sessie → uitgeven.
      // Hiermee werkt QR scan ook voor bestaande PWA installs zonder dat
      // de gebruiker eerst hoeft uit-en-in te loggen.
      try {
        if (!localStorage.getItem('device_qr_token')) {
          issueDeviceQrTokenSilently();
        }
      } catch { /* ignore */ }
    } catch {
      setUser(null);
      setActiveCompanyMeta(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const setActiveCompany = useCallback((cid) => {
    if (cid) {
      localStorage.setItem(ACTIVE_COMPANY_KEY, cid);
    } else {
      localStorage.removeItem(ACTIVE_COMPANY_KEY);
    }
    setActiveCompanyIdState(cid);
    // Trigger /auth/me refresh to pull updated active_company meta
    refresh();
  }, [refresh]);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    if (data?.token) localStorage.setItem('admin_token', data.token);
    setUser(data.user);
    // Onthoud welke gebruiker hier inlogde, voor persoonlijke PIN-flow op PWA.
    try {
      if (data?.user?.email) {
        localStorage.setItem('device_user_email', data.user.email);
        localStorage.setItem('device_user_name', data.user.name || data.user.email.split('@')[0]);
      }
    } catch { /* ignore */ }
    // Kritiek voor PWA: bewaar de bedrijfs-slug zodat het volgende bezoek
    // direct naar de branded /<slug>/login kan redirecten (i.p.v. de
    // generieke /login). iOS PWA's hebben geïsoleerde localStorage van
    // Safari op iOS 16.4+, dus deze opslag binnen de PWA is essentieel.
    try {
      const slug = data?.company?.slug || data?.user?.company_slug;
      if (slug) {
        localStorage.setItem('pwa_company_slug', String(slug).toLowerCase());
      }
    } catch { /* ignore */ }
    // Issue long-lived device QR token zodat de PWA later QR sessies kan
    // claimen zonder opnieuw te hoeven inloggen. Server slaat hash op,
    // client slaat raw token op (90 dagen TTL).
    issueDeviceQrTokenSilently();
    // Clear any stale superadmin company selection
    if (data.user?.role !== 'superadmin') {
      localStorage.removeItem(ACTIVE_COMPANY_KEY);
      setActiveCompanyIdState(null);
    }
    setActiveCompanyMeta(data.company || null);
    return data;
  };

  const register = async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    if (data?.token) localStorage.setItem('admin_token', data.token);
    setUser(data.user);
    setActiveCompanyMeta(data.company || null);
    return data;
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch (err) { console.warn('Admin logout API failed (continuing client-side):', err); }
    localStorage.removeItem('admin_token');
    localStorage.removeItem('kiosk_token');
    localStorage.removeItem(ACTIVE_COMPANY_KEY);
    // PWA-state óók opruimen zodat een volgende gebruiker (bv. een
    // medewerker op een gedeeld toestel) niet automatisch wordt
    // doorgestuurd naar /admin via de bewaarde preferred role.
    try {
      localStorage.removeItem('pwa_preferred_role');
      localStorage.removeItem('kiosk_company');
    } catch { /* ignore */ }
    try {
      sessionStorage.removeItem('kiosk_emp_id');
      sessionStorage.removeItem('kiosk_emp_name');
      sessionStorage.removeItem('kiosk_emp_pin');
    } catch { /* ignore */ }
    setActiveCompanyIdState(null);
    setActiveCompanyMeta(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user, loading, login, register, logout, refresh,
      activeCompanyId, activeCompany, setActiveCompany,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
