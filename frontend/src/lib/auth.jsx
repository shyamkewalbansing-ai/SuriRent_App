import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

const ACTIVE_COMPANY_KEY = 'active_company_id';

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
