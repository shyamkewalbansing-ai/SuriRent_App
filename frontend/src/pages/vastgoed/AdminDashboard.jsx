import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Users, Receipt, LayoutDashboard, LogOut, Plus, Trash2, Pencil,
  X, Check, Loader2, Search, Home, Banknote, KeySquare, ChevronRight, Wallet,
  FileText, ShieldCheck, Wrench, FileSignature, Sparkles, Bell, Briefcase, Mail,
  CreditCard, Zap, Power, Menu, MoreHorizontal, MapPin, Crown, Paintbrush, Palette,
} from 'lucide-react';
import { api, formatError, fmtMoney, MONTHS_NL } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { EmailDialog, SendDialog } from '../../components/EmailDialog';
import Contracts from './admin/Contracts';
import Invoices from './admin/Invoices';
import Employees from './admin/Employees';
import Deposits from './admin/Deposits';
import Maintenance from './admin/Maintenance';
import Kasgeld from './admin/Kasgeld';
import AIChat from './admin/AIChat';
import Notifications from './admin/Notifications';
import Companies from './admin/Companies';
import SettingsPage from './admin/Settings';
import PaymentRequests from './admin/PaymentRequests';
import Locations from './admin/Locations';
import Subscriptions from './admin/Subscriptions';
import SaasSettings from './admin/SaasSettings';
import LandingEditor from './admin/LandingEditor';
import Branding from './admin/Branding';
import MyUrlCard from '../../components/MyUrlCard';
import MijnAbonnement from './admin/MijnAbonnement';
import TrialBanner from '../../components/TrialBanner';
import ImpersonationBanner from '../../components/ImpersonationBanner';

const BASE_TABS = [
  { id: 'overview', label: 'Overzicht', icon: LayoutDashboard },
  { id: 'ai', label: 'AI Assistent', icon: Sparkles },
  { id: 'locations', label: 'Locaties', icon: MapPin },
  { id: 'apartments', label: 'Appartementen', icon: Building2 },
  { id: 'tenants', label: 'Huurders', icon: Users },
  { id: 'contracts', label: 'Contracten', icon: FileSignature },
  { id: 'payments', label: 'Betalingen', icon: Receipt },
  { id: 'invoices', label: 'Facturen', icon: FileText },
  { id: 'paylinks', label: 'Online betalen', icon: CreditCard },
  { id: 'deposits', label: 'Borg', icon: ShieldCheck },
  { id: 'maintenance', label: 'Onderhoud', icon: Wrench },
  { id: 'kasgeld', label: 'Kasgeld', icon: Wallet },
  { id: 'employees', label: 'Werknemers', icon: Users },
  { id: 'notifications', label: 'Notificaties', icon: Bell },
  { id: 'mijn_abonnement', label: 'Mijn Abonnement', icon: Crown },
  { id: 'branding', label: 'Branding', icon: Palette },
  { id: 'settings', label: 'Instellingen', icon: KeySquare },
];
const SUPER_TABS = [
  { id: 'subscriptions', label: 'SaaS Beheer', icon: Crown },
  { id: 'companies', label: 'Bedrijven', icon: Briefcase },
  { id: 'landing_editor', label: 'Landing Editor', icon: Paintbrush },
  { id: 'saas_settings', label: 'SaaS Instellingen', icon: KeySquare },
];

function getTabsFor(user) {
  return user?.role === 'superadmin' ? SUPER_TABS : BASE_TABS;
}

function Sidebar({ active, onChange, onLogout, user, activeCompany, tabs }) {
  return (
    <aside className="hidden md:flex flex-col w-64 bg-white border-r border-orange-100 p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] p-1.5 shadow-[0_8px_20px_-5px_rgba(255,92,0,0.55)]">
          <img src="/kiosk-icons/kiosk-512.png" alt="SuriRent" className="w-full h-full object-contain" />
        </div>
        <div>
          <p className="text-base font-black text-slate-900 tracking-tight">SuriRent</p>
          <p className="text-[10px] text-[#FF5C00] font-bold tracking-[0.2em] uppercase">Beheer</p>
        </div>
      </div>

      <div data-testid="active-company-badge"
        className={`rounded-xl px-3 py-2.5 mb-6 border ${user?.role === 'superadmin' ? 'bg-amber-50 border-amber-200' : 'bg-orange-50 border-orange-100'}`}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          {user?.role === 'superadmin' ? 'Actief bedrijf' : 'Bedrijf'}
        </p>
        <p className="text-sm font-black text-slate-900 truncate" data-testid="active-company-name">
          {activeCompany?.name || (user?.role === 'superadmin' ? 'Alle bedrijven' : '—')}
        </p>
        {activeCompany?.plan && (
          <p className="text-[10px] text-slate-500 mt-0.5">/{activeCompany.slug} • {activeCompany.plan}</p>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.id;
          return (
            <button key={t.id} onClick={() => onChange(t.id)}
              data-testid={`tab-${t.id}`}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                isActive ? 'bg-[#FF5C00] text-white shadow-[0_8px_20px_-5px_rgba(255,92,0,0.55)]'
                  : 'text-slate-600 hover:bg-orange-50 hover:text-[#FF5C00]'
              }`}>
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-orange-100 pt-4 mt-4 space-y-2">
        <p className="text-xs text-slate-500 px-3 truncate">{user?.email}</p>
        <button onClick={onLogout} data-testid="logout-btn"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all">
          <LogOut className="w-4 h-4" /> Uitloggen
        </button>
      </div>
    </aside>
  );
}

// Top 4 tabs always visible on the mobile bottom bar. The "Meer" button opens
// a full drawer that exposes every other tab. Superadmins keep "Bedrijven"
// on the bottom bar so they always have access to the company switcher.
const MOBILE_PRIMARY_IDS = ['overview', 'apartments', 'tenants', 'payments'];
const MOBILE_SUPER_PRIMARY_IDS = ['companies', 'overview', 'apartments', 'tenants'];

function MobileHeader({ activeCompany, user, onOpenMenu }) {
  return (
    <header className="md:hidden sticky top-0 z-30 bg-white border-b border-orange-100"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex items-center gap-3 px-4 h-14">
        <button onClick={onOpenMenu} data-testid="mobile-menu-btn"
          className="w-10 h-10 -ml-2 rounded-xl flex items-center justify-center hover:bg-orange-50">
          <Menu className="w-6 h-6 text-slate-700" />
        </button>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] p-1">
          <img src="/kiosk-icons/kiosk-512.png" alt="SuriRent" className="w-full h-full object-contain" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-slate-900 leading-tight truncate">
            {activeCompany?.name || (user?.role === 'superadmin' ? 'Alle bedrijven' : 'SuriRent')}
          </p>
          <p className="text-[10px] text-[#FF5C00] font-bold tracking-wider uppercase truncate">
            {user?.role === 'superadmin' ? 'Superadmin' : 'Beheer'}{activeCompany?.plan ? ` · ${activeCompany.plan}` : ''}
          </p>
        </div>
      </div>
    </header>
  );
}

function MobileDrawer({ open, onClose, active, onChange, onLogout, user, activeCompany, tabs }) {
  if (!open) return null;
  return (
    <div className="md:hidden fixed inset-0 z-50" data-testid="mobile-drawer">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85%] bg-white shadow-2xl flex flex-col animate-slide-in"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] p-1.5">
              <img src="/kiosk-icons/kiosk-512.png" alt="SuriRent" className="w-full h-full object-contain" />
            </div>
            <div>
              <p className="text-base font-black text-slate-900 leading-tight">SuriRent</p>
              <p className="text-[10px] text-[#FF5C00] font-bold tracking-[0.2em] uppercase">Beheer</p>
            </div>
          </div>
          <button onClick={onClose} data-testid="mobile-drawer-close"
            className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className={`mx-5 my-3 rounded-xl px-3 py-2.5 border ${user?.role === 'superadmin' ? 'bg-amber-50 border-amber-200' : 'bg-orange-50 border-orange-100'}`}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {user?.role === 'superadmin' ? 'Actief bedrijf' : 'Bedrijf'}
          </p>
          <p className="text-sm font-black text-slate-900 truncate">
            {activeCompany?.name || (user?.role === 'superadmin' ? 'Alle bedrijven' : '—')}
          </p>
          {activeCompany?.plan && (
            <p className="text-[10px] text-slate-500 mt-0.5">/{activeCompany.slug} • {activeCompany.plan}</p>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = active === t.id;
            return (
              <button key={t.id}
                onClick={() => { onChange(t.id); onClose(); }}
                data-testid={`tab-drawer-${t.id}`}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-all ${
                  isActive ? 'bg-[#FF5C00] text-white shadow-[0_8px_20px_-5px_rgba(255,92,0,0.55)]'
                    : 'text-slate-700 hover:bg-orange-50 hover:text-[#FF5C00]'
                }`}>
                <Icon className="w-5 h-5" /> {t.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-orange-100 px-5 py-4 space-y-2"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}>
          <p className="text-xs text-slate-500 truncate">{user?.email}</p>
          <button onClick={() => { onClose(); onLogout(); }} data-testid="mobile-drawer-logout"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 transition-all">
            <LogOut className="w-4 h-4" /> Uitloggen
          </button>
        </div>
      </aside>
    </div>
  );
}

function MobileTabBar({ active, onChange, tabs, onOpenMenu, user }) {
  const primaryIds = user?.role === 'superadmin' ? MOBILE_SUPER_PRIMARY_IDS : MOBILE_PRIMARY_IDS;
  const primary = primaryIds
    .map((id) => tabs.find((t) => t.id === id))
    .filter(Boolean);
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-orange-100"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="grid grid-cols-5">
        {primary.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.id;
          return (
            <button key={t.id} onClick={() => onChange(t.id)} data-testid={`tab-mobile-${t.id}`}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-bold uppercase tracking-wider ${
                isActive ? 'text-[#FF5C00]' : 'text-slate-400'
              }`}>
              <Icon className="w-5 h-5" /> <span className="truncate max-w-[64px]">{t.label}</span>
            </button>
          );
        })}
        <button onClick={onOpenMenu} data-testid="tab-mobile-more"
          className="flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-[#FF5C00]">
          <MoreHorizontal className="w-5 h-5" /> Meer
        </button>
      </div>
    </nav>
  );
}

function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ============== Overview ==============
function Overview() {
  const [stats, setStats] = useState(null);
  const navigate = useNavigate();
  useEffect(() => {
    api.get('/admin/stats').then((r) => setStats(r.data)).catch(() => setStats(null));
  }, []);
  if (!stats) return <div className="text-slate-400 text-sm">Laden...</div>;

  const cards = [
    { label: 'Appartementen', value: stats.apartments_total, icon: Building2, accent: 'bg-orange-50 text-[#FF5C00]' },
    { label: 'Bezet', value: stats.apartments_occupied, icon: Home, accent: 'bg-emerald-50 text-emerald-600' },
    { label: 'Vacant', value: stats.apartments_vacant, icon: KeySquare, accent: 'bg-slate-50 text-slate-600' },
    { label: 'Huurders', value: stats.tenants_total, icon: Users, accent: 'bg-amber-50 text-amber-600' },
  ];

  const byCur = stats.month_payments_by_currency || {};

  return (
    <div>
      <PageHeader title="Overzicht" subtitle="Snelle blik op uw vastgoedportefeuille" />
      <div className="mb-6">
        <MyUrlCard compact />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="bg-white rounded-2xl border border-orange-100 p-5 hover:border-[#FF5C00]/30 transition-colors">
              <div className={`w-10 h-10 rounded-xl ${c.accent} flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-3xl font-black text-slate-900 tracking-tight">{c.value}</p>
              <p className="text-xs text-slate-500 font-semibold mt-1">{c.label}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-orange-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Wallet className="w-5 h-5 text-[#FF5C00]" />
          <h3 className="text-lg font-black text-slate-900">Inkomsten deze maand</h3>
        </div>
        {Object.keys(byCur).length === 0 ? (
          <p className="text-sm text-slate-400">Nog geen betalingen deze maand.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {['SRD', 'USD', 'EUR'].map((cur) => {
              const data = byCur[cur];
              return (
                <div key={cur} className="bg-gradient-to-br from-[#FFF7F0] to-[#FFEAD3] border border-orange-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-[#FF5C00] uppercase tracking-widest">{cur}</p>
                  <p className="text-2xl font-black text-slate-900 tracking-tight mt-1">
                    {fmtMoney(data?.total || 0, cur)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{data?.count || 0} betalingen</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-8 grid sm:grid-cols-2 gap-4">
        <button onClick={() => navigate('/kiosk')} data-testid="quick-kiosk"
          className="bg-gradient-to-br from-[#FF8A3D] via-[#FF5C00] to-[#C74600] rounded-2xl p-6 text-white text-left hover:shadow-[0_20px_40px_-10px_rgba(255,92,0,0.5)] transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <Building2 className="w-7 h-7" />
            <ChevronRight className="w-5 h-5" />
          </div>
          <p className="text-lg font-black">Open Kiosk</p>
          <p className="text-sm text-white/80 mt-1">Selfservice terminal voor huurders</p>
        </button>
        <button onClick={() => window.dispatchEvent(new CustomEvent('go-tab', { detail: 'payments' }))}
          data-testid="quick-payments"
          className="bg-white border border-orange-100 rounded-2xl p-6 text-left hover:border-[#FF5C00]/30 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-[#FF5C00]" />
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300" />
          </div>
          <p className="text-lg font-black text-slate-900">Betalingen bekijken</p>
          <p className="text-sm text-slate-500 mt-1">Alle kwitanties en transacties</p>
        </button>
      </div>
    </div>
  );
}

// ============== Apartments ==============
function ApartmentForm({ initial, onCancel, onSaved }) {
  const [data, setData] = useState(initial || { number: '', address: '', rent_amount: 0, currency: 'SRD', description: '', location_id: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [locations, setLocations] = useState([]);
  useEffect(() => {
    api.get('/locations').then((r) => setLocations(r.data)).catch(() => setLocations([]));
  }, []);

  const save = async () => {
    setLoading(true); setError('');
    try {
      const payload = {
        ...data,
        rent_amount: parseFloat(data.rent_amount) || 0,
        location_id: data.location_id || null,
      };
      if (initial?.id) {
        const { data: r } = await api.put(`/apartments/${initial.id}`, payload);
        onSaved(r);
      } else {
        const { data: r } = await api.post('/apartments', payload);
        onSaved(r);
      }
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" data-testid="apartment-modal">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-black text-slate-900">{initial ? 'Appartement bewerken' : 'Nieuw appartement'}</h3>
          <button onClick={onCancel} className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        {error && <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Nummer / Naam *</label>
            <input value={data.number} onChange={(e) => setData({ ...data, number: e.target.value })}
              data-testid="apt-number" required
              className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Adres</label>
            <input value={data.address} onChange={(e) => setData({ ...data, address: e.target.value })}
              data-testid="apt-address"
              className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Maandhuur *</label>
              <input type="number" step="0.01" value={data.rent_amount} onChange={(e) => setData({ ...data, rent_amount: e.target.value })}
                data-testid="apt-rent" required
                className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Valuta</label>
              <select value={data.currency} onChange={(e) => setData({ ...data, currency: e.target.value })}
                data-testid="apt-currency"
                className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
                <option value="SRD">SRD</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Locatie</label>
            <select value={data.location_id || ''} onChange={(e) => setData({ ...data, location_id: e.target.value })}
              data-testid="apt-location"
              className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
              <option value="">— Geen locatie —</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}{loc.address ? ` · ${loc.address}` : ''}</option>
              ))}
            </select>
            {locations.length === 0 && (
              <p className="text-[11px] text-slate-400 mt-1">Maak eerst locaties aan in de tab "Locaties" om appartementen te groeperen.</p>
            )}
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Beschrijving</label>
            <textarea value={data.description} onChange={(e) => setData({ ...data, description: e.target.value })}
              data-testid="apt-description" rows={2}
              className="w-full mt-1 px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none resize-none" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="flex-1 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Annuleren</button>
          <button onClick={save} disabled={loading || !data.number || !data.rent_amount}
            data-testid="apt-save"
            className="flex-1 h-12 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Opslaan
          </button>
        </div>
      </div>
    </div>
  );
}

function Apartments() {
  const [items, setItems] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [assignFor, setAssignFor] = useState(null);
  const [shellyFor, setShellyFor] = useState(null);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const [a, t] = await Promise.all([api.get('/apartments'), api.get('/tenants')]);
    setItems(a.data); setTenants(t.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const del = async (id) => {
    if (!window.confirm('Appartement verwijderen?')) return;
    await api.delete(`/apartments/${id}`);
    load();
  };
  const assign = async (tid) => {
    await api.post(`/apartments/${assignFor.id}/assign-tenant`, { tenant_id: tid });
    setAssignFor(null); load();
  };
  const removeT = async (id) => {
    if (!window.confirm('Huurder loskoppelen?')) return;
    await api.post(`/apartments/${id}/remove-tenant`);
    load();
  };

  const filtered = items.filter((a) => !q || a.number.toLowerCase().includes(q.toLowerCase()) || (a.tenant_name || '').toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Appartementen"
        subtitle={`${items.length} appartementen, ${items.filter((a) => a.status === 'occupied').length} bezet`}
        action={
          <button onClick={() => setCreating(true)} data-testid="apt-new-btn"
            className="inline-flex items-center gap-2 px-5 py-3 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-xl shadow-[0_10px_25px_-5px_rgba(255,92,0,0.5)]">
            <Plus className="w-4 h-4" /> Nieuw appartement
          </button>
        }
      />
      <div className="mb-4 relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek op nummer of huurder"
          data-testid="apt-search"
          className="w-full h-12 pl-11 pr-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white" />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 && (
          <div className="col-span-full bg-white rounded-2xl border-2 border-dashed border-orange-200 p-10 text-center">
            <Building2 className="w-10 h-10 text-orange-300 mx-auto mb-3" />
            <p className="text-slate-500 font-semibold">Nog geen appartementen.</p>
            <p className="text-sm text-slate-400 mt-1">Voeg uw eerste appartement toe.</p>
          </div>
        )}
        {filtered.map((a) => (
          <div key={a.id} data-testid={`apt-card-${a.id}`}
            className="bg-white rounded-2xl border border-orange-100 p-5 hover:border-[#FF5C00]/30 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-[#FF5C00]">Appt. {a.number}</p>
                <p className="text-sm text-slate-500 mt-0.5 truncate">{a.address || '—'}</p>
              </div>
              <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${
                a.status === 'occupied' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {a.status === 'occupied' ? 'Bezet' : 'Vacant'}
              </span>
            </div>
            <div className="bg-gradient-to-r from-[#FFF4EC] to-[#FFE6D3] border border-[#FF5C00]/20 rounded-xl p-3 mb-3">
              <p className="text-xs font-bold text-[#C74600]">Maandhuur</p>
              <p className="text-xl font-black text-slate-900 tracking-tight">{fmtMoney(a.rent_amount, a.currency)}</p>
            </div>
            {a.tenant_name ? (
              <div className="flex items-center justify-between bg-slate-50 rounded-xl p-3 mb-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Huurder</p>
                  <p className="text-sm font-bold text-slate-900 truncate">{a.tenant_name}</p>
                </div>
                <button onClick={() => removeT(a.id)} data-testid={`apt-remove-tenant-${a.id}`}
                  className="text-xs font-bold text-red-500 hover:text-red-700">Loskoppelen</button>
              </div>
            ) : (
              <button onClick={() => setAssignFor(a)} data-testid={`apt-assign-${a.id}`}
                className="w-full mb-3 py-2.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-[#FF5C00] font-bold text-sm">
                Huurder toewijzen
              </button>
            )}
            <div className="flex gap-2">
              <button onClick={() => setEditing(a)} data-testid={`apt-edit-${a.id}`}
                className="flex-1 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center gap-1.5">
                <Pencil className="w-3.5 h-3.5" /> Bewerk
              </button>
              <button onClick={() => setShellyFor(a)} data-testid={`apt-shelly-${a.id}`}
                title={a.shelly?.device_id ? `Stroom: ${a.shelly.label || a.shelly.device_id}` : 'Stroom koppelen'}
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  a.shelly?.device_id
                    ? 'bg-[#FFE6D3] text-[#C74600] hover:bg-[#FFD0AA]'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-500'
                }`}>
                <Zap className="w-4 h-4" />
              </button>
              <button onClick={() => del(a.id)} data-testid={`apt-delete-${a.id}`}
                className="w-10 h-10 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <ApartmentForm initial={editing} onCancel={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); load(); }} />
      )}

      {assignFor && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-black text-slate-900">Huurder toewijzen aan {assignFor.number}</h3>
              <button onClick={() => setAssignFor(null)} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2 max-h-96 overflow-auto">
              {tenants.length === 0 && <p className="text-sm text-slate-400">Geen huurders. Maak eerst een huurder aan.</p>}
              {tenants.map((t) => (
                <button key={t.id} onClick={() => assign(t.id)} data-testid={`assign-${t.id}`}
                  className="w-full flex items-center justify-between p-3 rounded-xl border-2 border-slate-100 hover:border-[#FF5C00] hover:bg-orange-50">
                  <div className="text-left">
                    <p className="font-bold text-slate-900">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.apartment_number ? `Nu in ${t.apartment_number}` : 'Geen appartement'}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {shellyFor && (
        <ShellyControlModal apt={shellyFor} onClose={() => setShellyFor(null)}
          onChanged={() => { setShellyFor(null); load(); }} />
      )}
    </div>
  );
}

function ShellyControlModal({ apt, onClose, onChanged }) {
  const [binding, setBinding] = useState(apt.shelly || { device_id: '', channel: 0, label: '' });
  const [devices, setDevices] = useState(null);  // null = not loaded yet
  const [devicesError, setDevicesError] = useState('');
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isBound = !!(apt.shelly?.device_id);

  const loadStatus = useCallback(async () => {
    if (!isBound) return;
    setStatusError('');
    try {
      const { data } = await api.get(`/shelly/apartment/${apt.id}/status`);
      setStatus(data);
    } catch (e) {
      setStatusError(formatError(e));
    }
  }, [apt.id, isBound]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const loadDevices = async () => {
    setDevicesError(''); setDevices([]);
    try {
      const { data } = await api.get('/shelly/devices');
      setDevices(data);
    } catch (e) {
      setDevicesError(formatError(e));
      setDevices([]);
    }
  };

  const save = async () => {
    setBusy(true); setError('');
    try {
      await api.put(`/apartments/${apt.id}/shelly`, {
        device_id: binding.device_id || '',
        channel: Number(binding.channel) || 0,
        label: binding.label || '',
      });
      onChanged();
    } catch (e) {
      setError(formatError(e));
    } finally { setBusy(false); }
  };

  const unbind = async () => {
    if (!window.confirm('Shelly apparaat ontkoppelen van dit appartement?')) return;
    setBusy(true); setError('');
    try {
      await api.put(`/apartments/${apt.id}/shelly`, { device_id: '' });
      onChanged();
    } catch (e) {
      setError(formatError(e));
    } finally { setBusy(false); }
  };

  const control = async (turn) => {
    setBusy(true); setError('');
    try {
      await api.post(`/shelly/apartment/${apt.id}/control`, { turn });
      await loadStatus();
    } catch (e) {
      setError(formatError(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 animate-slide-up" data-testid="shelly-modal">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-[#FF5C00]">Stroom · Appt. {apt.number}</p>
            <h3 className="text-xl font-black text-slate-900 mt-0.5">Shelly apparaat</h3>
          </div>
          <button onClick={onClose} data-testid="shelly-close"
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        {isBound && (
          <div className="mb-5 rounded-2xl border-2 border-[#FFE6D3] bg-gradient-to-br from-[#FFF4EC] to-[#FFE6D3]/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#C74600]">Apparaat</p>
                <p className="font-bold text-slate-900 truncate">{apt.shelly.label || apt.shelly.device_id}</p>
                <p className="text-xs text-slate-500">ID: {apt.shelly.device_id} · kanaal {apt.shelly.channel ?? 0}</p>
              </div>
              {status?.online != null && (
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${
                  status.online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                }`}>{status.online ? 'Online' : 'Offline'}</span>
              )}
            </div>
            {statusError && <p className="text-xs text-red-500 mb-2" data-testid="shelly-status-error">{statusError}</p>}
            {status && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded-xl bg-white/80 p-2 text-center">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Status</p>
                  <p className={`text-sm font-black ${status.ison ? 'text-emerald-600' : 'text-slate-500'}`}>{status.ison ? 'AAN' : 'UIT'}</p>
                </div>
                <div className="rounded-xl bg-white/80 p-2 text-center">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Vermogen</p>
                  <p className="text-sm font-black text-slate-900">{Math.round(status.power_w || 0)} W</p>
                </div>
                <div className="rounded-xl bg-white/80 p-2 text-center">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Verbruik</p>
                  <p className="text-sm font-black text-slate-900">{((status.energy_wh || 0) / 1000).toFixed(1)} kWh</p>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => control('on')} disabled={busy} data-testid="shelly-on"
                className="flex-1 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm flex items-center justify-center gap-1.5 disabled:opacity-50">
                <Power className="w-4 h-4" /> AAN
              </button>
              <button onClick={() => control('off')} disabled={busy} data-testid="shelly-off"
                className="flex-1 h-11 rounded-xl bg-red-500 hover:bg-red-600 text-white font-black text-sm flex items-center justify-center gap-1.5 disabled:opacity-50">
                <Power className="w-4 h-4" /> UIT
              </button>
              <button onClick={loadStatus} disabled={busy} data-testid="shelly-refresh"
                className="px-3 h-11 rounded-xl bg-white hover:bg-slate-50 border-2 border-slate-200 text-slate-700 font-bold text-xs">
                ↻
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Device ID</label>
            <div className="flex gap-2">
              <input value={binding.device_id || ''} onChange={(e) => setBinding({ ...binding, device_id: e.target.value })}
                placeholder="bv. 8caab50a1234"
                data-testid="shelly-device-id"
                className="flex-1 h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none font-mono text-sm" />
              <button type="button" onClick={loadDevices} data-testid="shelly-load-devices"
                className="px-3 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs whitespace-nowrap">
                Cloud lijst
              </button>
            </div>
            {devicesError && <p className="text-xs text-red-500 mt-1" data-testid="shelly-devices-error">{devicesError}</p>}
            {devices && devices.length > 0 && (
              <div className="mt-2 max-h-32 overflow-auto rounded-xl border-2 border-slate-100">
                {devices.map((d) => (
                  <button key={d.device_id} type="button"
                    onClick={() => setBinding({ ...binding, device_id: d.device_id, label: d.name || binding.label })}
                    data-testid={`shelly-pick-${d.device_id}`}
                    className="w-full flex items-center justify-between p-2.5 hover:bg-orange-50 border-b border-slate-100 last:border-0">
                    <div className="text-left min-w-0">
                      <p className="font-bold text-slate-900 text-sm truncate">{d.name || d.device_id}</p>
                      <p className="text-[10px] text-slate-500 font-mono truncate">{d.device_id}</p>
                    </div>
                    {d.online != null && (
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${d.online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {d.online ? 'on' : 'off'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {devices && devices.length === 0 && !devicesError && (
              <p className="text-xs text-slate-500 mt-1">Geen apparaten gevonden of nog niet geladen.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Kanaal</label>
              <input type="number" min={0} max={3} value={binding.channel ?? 0}
                onChange={(e) => setBinding({ ...binding, channel: e.target.value })}
                data-testid="shelly-channel"
                className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Label</label>
              <input value={binding.label || ''} onChange={(e) => setBinding({ ...binding, label: e.target.value })}
                placeholder="bv. Hoofdmeter"
                data-testid="shelly-label"
                className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 mb-3" data-testid="shelly-error">{error}</p>}

        <div className="flex gap-2">
          {isBound && (
            <button onClick={unbind} disabled={busy} data-testid="shelly-unbind"
              className="px-4 h-11 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-bold text-sm disabled:opacity-50">
              Ontkoppelen
            </button>
          )}
          <button onClick={onClose} disabled={busy}
            className="flex-1 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm">
            Annuleer
          </button>
          <button onClick={save} disabled={busy || !(binding.device_id || '').trim()} data-testid="shelly-save"
            className="flex-1 h-11 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-black text-sm flex items-center justify-center gap-1.5 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Opslaan
          </button>
        </div>
      </div>
    </div>
  );
}
function TenantForm({ initial, apartments, onCancel, onSaved }) {
  const [data, setData] = useState(initial || { name: '', phone: '', email: '', apartment_id: '', internet_amount: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setLoading(true); setError('');
    try {
      const payload = {
        ...data,
        apartment_id: data.apartment_id || null,
        internet_amount: parseFloat(data.internet_amount) || 0,
      };
      if (initial?.id) {
        const { data: r } = await api.put(`/tenants/${initial.id}`, payload);
        onSaved(r);
      } else {
        const { data: r } = await api.post('/tenants', payload);
        onSaved(r);
      }
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" data-testid="tenant-modal">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-black text-slate-900">{initial ? 'Huurder bewerken' : 'Nieuwe huurder'}</h3>
          <button onClick={onCancel} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        {error && <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Naam *</label>
            <input value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} data-testid="tenant-name" required
              className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Telefoon</label>
              <input value={data.phone} onChange={(e) => setData({ ...data, phone: e.target.value })} data-testid="tenant-phone"
                className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">E-mail</label>
              <input type="email" value={data.email} onChange={(e) => setData({ ...data, email: e.target.value })} data-testid="tenant-email"
                className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Appartement</label>
            <select value={data.apartment_id || ''} onChange={(e) => setData({ ...data, apartment_id: e.target.value })}
              data-testid="tenant-apartment"
              className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
              <option value="">— Geen —</option>
              {apartments.map((a) => (
                <option key={a.id} value={a.id} disabled={a.tenant_id && a.tenant_id !== initial?.id}>
                  {a.number}{a.tenant_name ? ` (bezet door ${a.tenant_name})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Internet per maand (SRD)</label>
            <input type="number" step="0.01" min="0"
              value={data.internet_amount ?? 0}
              onChange={(e) => setData({ ...data, internet_amount: e.target.value })}
              data-testid="tenant-internet"
              className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            <p className="text-[11px] text-slate-400 mt-1">Vast maandelijks bedrag dat in de kiosk als regelpost "Internet" verschijnt. 0 = niet tonen.</p>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="flex-1 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Annuleren</button>
          <button onClick={save} disabled={loading || !data.name} data-testid="tenant-save"
            className="flex-1 h-12 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Opslaan
          </button>
        </div>
      </div>
    </div>
  );
}

function TenantPinModal({ tenant, onCancel, onSaved }) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setErr('');
    if (!/^\d{4}$/.test(pin)) { setErr('PIN moet 4 cijfers zijn'); return; }
    if (pin !== confirm) { setErr('PINs komen niet overeen'); return; }
    setLoading(true);
    try {
      await api.post('/auth/tenant-set-pin', { tenant_id: tenant.id, pin });
      onSaved();
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" data-testid="tenant-pin-modal">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-black text-slate-900">Portal PIN voor {tenant.name}</h3>
          <button onClick={onCancel} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Stel een 4-cijferige PIN in zodat deze huurder kan inloggen op <code className="bg-slate-100 px-1 rounded text-xs">/huurder</code>
        </p>
        {err && <div className="mb-3 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">{err}</div>}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Nieuwe PIN</label>
            <input type="password" inputMode="numeric" maxLength={4} value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              data-testid="tenant-pin-new"
              className="w-full mt-1 h-14 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none text-2xl tracking-[0.5em] text-center font-bold" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Bevestig</label>
            <input type="password" inputMode="numeric" maxLength={4} value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
              data-testid="tenant-pin-confirm"
              className="w-full mt-1 h-14 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none text-2xl tracking-[0.5em] text-center font-bold" />
          </div>
        </div>
        <button onClick={save} disabled={loading || !pin || !confirm} data-testid="tenant-pin-save"
          className="w-full mt-5 h-12 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          PIN opslaan
        </button>
      </div>
    </div>
  );
}

function Tenants() {
  const [items, setItems] = useState([]);
  const [apts, setApts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [pinFor, setPinFor] = useState(null);
  const [q, setQ] = useState('');
  const load = useCallback(async () => {
    const [t, a] = await Promise.all([api.get('/tenants'), api.get('/apartments')]);
    setItems(t.data); setApts(a.data);
  }, []);
  useEffect(() => { load(); }, [load]);
  const del = async (id) => {
    if (!window.confirm('Huurder verwijderen?')) return;
    await api.delete(`/tenants/${id}`);
    load();
  };
  const filtered = items.filter((t) => !q || t.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader title="Huurders" subtitle={`${items.length} huurders geregistreerd`}
        action={
          <button onClick={() => setCreating(true)} data-testid="tenant-new-btn"
            className="inline-flex items-center gap-2 px-5 py-3 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-xl shadow-[0_10px_25px_-5px_rgba(255,92,0,0.5)]">
            <Plus className="w-4 h-4" /> Nieuwe huurder
          </button>
        }
      />
      <div className="mb-4 relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek op naam" data-testid="tenant-search"
          className="w-full h-12 pl-11 pr-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white" />
      </div>
      <div className="bg-white rounded-2xl border border-orange-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Users className="w-10 h-10 text-orange-300 mx-auto mb-3" />
            <p className="text-slate-500 font-semibold">Geen huurders gevonden.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-orange-50/50 text-left">
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                <th className="px-5 py-3">Naam</th>
                <th className="px-5 py-3 hidden md:table-cell">Contact</th>
                <th className="px-5 py-3">Appartement</th>
                <th className="px-5 py-3 hidden md:table-cell">Maandhuur</th>
                <th className="px-5 py-3 text-right">Acties</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} data-testid={`tenant-row-${t.id}`} className="border-t border-orange-50 hover:bg-orange-50/30">
                  <td className="px-5 py-4 font-bold text-slate-900">{t.name}</td>
                  <td className="px-5 py-4 hidden md:table-cell text-slate-500">
                    <p>{t.phone || '—'}</p>
                    <p className="text-xs">{t.email || ''}</p>
                  </td>
                  <td className="px-5 py-4">
                    {t.apartment_number ? (
                      <span className="inline-block px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">Appt. {t.apartment_number}</span>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell text-slate-700 font-semibold">
                    {t.rent_amount ? fmtMoney(t.rent_amount, t.currency) : '—'}
                  </td>
                  <td className="px-5 py-4 text-right space-x-1">
                    <button onClick={() => setPinFor(t)} data-testid={`tenant-pin-${t.id}`}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-orange-50 hover:bg-orange-100 text-[#FF5C00]" title="Portal PIN instellen">
                      <KeySquare className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setEditing(t)} data-testid={`tenant-edit-${t.id}`}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => del(t.id)} data-testid={`tenant-delete-${t.id}`}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {(editing || creating) && (
        <TenantForm initial={editing} apartments={apts}
          onCancel={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); load(); }} />
      )}
      {pinFor && <TenantPinModal tenant={pinFor}
        onCancel={() => setPinFor(null)} onSaved={() => setPinFor(null)} />}
    </div>
  );
}

// ============== Payments ==============
function PaymentForm({ tenants, onCancel, onSaved }) {
  const [data, setData] = useState({
    tenant_id: '', amount: 0, currency: 'SRD', method: 'contant', category: 'huur',
    period_month: new Date().getMonth() + 1, period_year: new Date().getFullYear(), note: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-fill rent when tenant selected
  useEffect(() => {
    if (data.tenant_id) {
      const t = tenants.find((x) => x.id === data.tenant_id);
      if (t && t.rent_amount && data.category === 'huur') {
        setData((d) => ({ ...d, amount: t.rent_amount, currency: t.currency || 'SRD' }));
      }
    }
  }, [data.tenant_id, data.category, tenants]);

  const save = async () => {
    setLoading(true); setError('');
    try {
      const payload = {
        ...data,
        amount: parseFloat(data.amount),
        period_month: data.category === 'huur' ? parseInt(data.period_month) : null,
        period_year: data.category === 'huur' ? parseInt(data.period_year) : null,
      };
      const { data: r } = await api.post('/payments', payload);
      onSaved(r);
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" data-testid="payment-modal">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 animate-slide-up max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-black text-slate-900">Nieuwe betaling</h3>
          <button onClick={onCancel} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        {error && <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Huurder *</label>
            <select value={data.tenant_id} onChange={(e) => setData({ ...data, tenant_id: e.target.value })} data-testid="pay-tenant" required
              className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
              <option value="">— Kies huurder —</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.apartment_number ? ` (Appt. ${t.apartment_number})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Categorie</label>
              <select value={data.category} onChange={(e) => setData({ ...data, category: e.target.value })} data-testid="pay-category"
                className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
                <option value="huur">Huur</option>
                <option value="servicekosten">Servicekosten</option>
                <option value="borg">Borg</option>
                <option value="boete">Boete</option>
                <option value="overig">Overig</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Betaalwijze</label>
              <select value={data.method} onChange={(e) => setData({ ...data, method: e.target.value })} data-testid="pay-method"
                className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
                <option value="contant">Contant</option>
                <option value="bank">Bank</option>
                <option value="mope">Mope</option>
                <option value="sumup">SumUp</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Bedrag *</label>
              <input type="number" step="0.01" value={data.amount} onChange={(e) => setData({ ...data, amount: e.target.value })} required
                data-testid="pay-amount"
                className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Valuta</label>
              <select value={data.currency} onChange={(e) => setData({ ...data, currency: e.target.value })} data-testid="pay-currency"
                className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
                <option value="SRD">SRD</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>
          {data.category === 'huur' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Maand</label>
                <select value={data.period_month} onChange={(e) => setData({ ...data, period_month: e.target.value })}
                  data-testid="pay-month"
                  className="w-full mt-1 h-12 px-3 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none bg-white">
                  {MONTHS_NL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Jaar</label>
                <input type="number" value={data.period_year} onChange={(e) => setData({ ...data, period_year: e.target.value })}
                  data-testid="pay-year"
                  className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Notitie</label>
            <input value={data.note} onChange={(e) => setData({ ...data, note: e.target.value })} data-testid="pay-note"
              className="w-full mt-1 h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-[#FF5C00] outline-none" />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="flex-1 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">Annuleren</button>
          <button onClick={save} disabled={loading || !data.tenant_id || !data.amount}
            data-testid="pay-save"
            className="flex-1 h-12 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
            Registreer betaling
          </button>
        </div>
      </div>
    </div>
  );
}

function Payments() {
  const [items, setItems] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [creating, setCreating] = useState(false);
  const [emailingPayment, setEmailingPayment] = useState(null);
  const load = useCallback(async () => {
    const [p, t] = await Promise.all([api.get('/payments'), api.get('/tenants')]);
    setItems(p.data); setTenants(t.data);
  }, []);
  useEffect(() => { load(); }, [load]);
  const apiBase = `${process.env.REACT_APP_BACKEND_URL}/api`;
  const tenantByPayment = (p) => tenants.find((t) => t.id === p.tenant_id);
  return (
    <div>
      <PageHeader title="Betalingen" subtitle={`${items.length} kwitanties geregistreerd`}
        action={
          <button onClick={() => setCreating(true)} data-testid="payment-new-btn"
            className="inline-flex items-center gap-2 px-5 py-3 bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold rounded-xl shadow-[0_10px_25px_-5px_rgba(255,92,0,0.5)]">
            <Plus className="w-4 h-4" /> Nieuwe betaling
          </button>
        }
      />
      <div className="bg-white rounded-2xl border border-orange-100 overflow-hidden">
        {items.length === 0 ? (
          <div className="p-10 text-center">
            <Receipt className="w-10 h-10 text-orange-300 mx-auto mb-3" />
            <p className="text-slate-500 font-semibold">Nog geen betalingen.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-orange-50/50 text-left">
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                <th className="px-5 py-3">Kwitantie</th>
                <th className="px-5 py-3">Datum</th>
                <th className="px-5 py-3">Huurder</th>
                <th className="px-5 py-3 hidden md:table-cell">Categorie</th>
                <th className="px-5 py-3 hidden md:table-cell">Methode</th>
                <th className="px-5 py-3 text-right">Bedrag</th>
                <th className="px-5 py-3 text-right">PDF</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} data-testid={`payment-row-${p.id}`} className="border-t border-orange-50 hover:bg-orange-50/30">
                  <td className="px-5 py-3 font-mono text-xs font-bold text-slate-900">{p.receipt_number}</td>
                  <td className="px-5 py-3 text-slate-500 text-xs">{new Date(p.paid_at).toLocaleDateString('nl-NL')}</td>
                  <td className="px-5 py-3 font-semibold text-slate-900">
                    {p.tenant_name || '—'}
                    {p.apartment_number && <span className="block text-xs text-slate-400">Appt. {p.apartment_number}</span>}
                  </td>
                  <td className="px-5 py-3 hidden md:table-cell">
                    <span className="inline-block px-2 py-0.5 rounded-full bg-orange-100 text-[#FF5C00] text-xs font-bold uppercase">{p.category}</span>
                  </td>
                  <td className="px-5 py-3 hidden md:table-cell text-slate-500 capitalize">{p.method}</td>
                  <td className="px-5 py-3 text-right font-black text-slate-900">{fmtMoney(p.amount, p.currency)}</td>
                  <td className="px-5 py-3 text-right">
                    <a href={`${apiBase}/payments/${p.id}/pdf`} target="_blank" rel="noreferrer"
                      data-testid={`payment-pdf-${p.id}`}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 mr-1" title="Kwitantie PDF">
                      <FileText className="w-3.5 h-3.5" />
                    </a>
                    <button onClick={() => setEmailingPayment(p)}
                      data-testid={`payment-email-${p.id}`}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 mr-1" title="Verstuur via e-mail">
                      <Mail className="w-3.5 h-3.5" />
                    </button>
                    <a href={`${apiBase}/payments/${p.id}/secure-pdf`} target="_blank" rel="noreferrer"
                      data-testid={`payment-secure-pdf-${p.id}`}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-orange-50 hover:bg-orange-100 text-[#FF5C00]" title="Beveiligde PDF met QR verificatie">
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {creating && <PaymentForm tenants={tenants} onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {emailingPayment && (
        <SendDialog
          documentType="payment"
          documentId={emailingPayment.id}
          documentLabel="kwitantie"
          title={`Kwitantie ${emailingPayment.receipt_number} verzenden`}
          tenantEmail={tenantByPayment(emailingPayment)?.email || ''}
          tenantPhone={tenantByPayment(emailingPayment)?.phone || ''}
          tenantName={emailingPayment.tenant_name || tenantByPayment(emailingPayment)?.name}
          onClose={() => setEmailingPayment(null)} />
      )}
    </div>
  );
}

// ============== Settings (kiosk PIN) ==============
function Settings() {
  // Replaced by `SettingsPage` from ./admin/Settings.jsx — kept as a no-op for safety.
  return null;
}

export default function AdminDashboard() {
  const { user, logout, activeCompany } = useAuth();
  const tabs = getTabsFor(user);
  const [tab, setTab] = useState(() => (user?.role === 'superadmin' ? 'subscriptions' : 'overview'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { document.title = 'SuriRent - Beheer'; }, []);
  useEffect(() => {
    const handler = (e) => setTab(e.detail);
    window.addEventListener('go-tab', handler);
    return () => window.removeEventListener('go-tab', handler);
  }, []);
  const doLogout = async () => { await logout(); navigate('/login'); };
  return (
    <div className="min-h-screen bg-[#FFF7F0] flex">
      <Sidebar active={tab} onChange={setTab} onLogout={doLogout} user={user} activeCompany={activeCompany} tabs={tabs} />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileHeader activeCompany={activeCompany} user={user} onOpenMenu={() => setDrawerOpen(true)} />
        <ImpersonationBanner />
        <TrialBanner />
        <main className="flex-1 p-5 md:p-8 pb-24 md:pb-8 max-w-7xl w-full">
          {tab === 'companies' && <Companies />}
          {tab === 'subscriptions' && <Subscriptions />}
          {tab === 'saas_settings' && <SaasSettings />}
          {tab === 'landing_editor' && <LandingEditor />}
          {tab === 'branding' && <Branding />}
          {tab === 'overview' && <Overview />}
          {tab === 'ai' && <AIChat />}
          {tab === 'locations' && <Locations />}
          {tab === 'apartments' && <Apartments />}
          {tab === 'tenants' && <Tenants />}
          {tab === 'contracts' && <Contracts />}
          {tab === 'payments' && <Payments />}
          {tab === 'invoices' && <Invoices />}
          {tab === 'paylinks' && <PaymentRequests />}
          {tab === 'deposits' && <Deposits />}
          {tab === 'maintenance' && <Maintenance />}
          {tab === 'kasgeld' && <Kasgeld />}
          {tab === 'employees' && <Employees />}
          {tab === 'notifications' && <Notifications />}
          {tab === 'mijn_abonnement' && <MijnAbonnement />}
          {tab === 'settings' && <SettingsPage />}
        </main>
      </div>
      <MobileTabBar active={tab} onChange={setTab} tabs={tabs} user={user}
        onOpenMenu={() => setDrawerOpen(true)} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}
        active={tab} onChange={setTab} onLogout={doLogout}
        user={user} activeCompany={activeCompany} tabs={tabs} />
    </div>
  );
}
