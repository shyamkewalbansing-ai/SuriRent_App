import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useBrandedNavigate } from '../../lib/branded-nav';
import { useBadge } from '../../lib/pwa';
import { useAutoRefresh } from '../../lib/auto-refresh';
import {
  Building2, Users, Receipt, LayoutDashboard, LogOut, Plus, Trash2, Pencil,
  X, Check, Loader2, Search, Home, Banknote, KeySquare, ChevronRight, Wallet,
  FileText, ShieldCheck, Wrench, FileSignature, Bell, Briefcase, Mail,
  Zap, Power, Menu, MoreHorizontal, MapPin, Crown, Paintbrush, Palette,
  Gauge, Activity, Clock as ClockIcon, Monitor, QrCode, Printer,
  ReceiptText, UsersRound, Building, Calendar, Sparkles,
  AlertCircle, UserPlus, TrendingUp, ArrowUpRight, Package, Database,
  ScanLine,
} from 'lucide-react';
import { api, formatError, fmtMoney, MONTHS_NL, openAuthedPdf } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { resolveLogoUrl, readCachedBranding } from '../../lib/branding';
import { EmailDialog, SendDialog } from '../../components/EmailDialog';
import Contracts from './admin/Contracts';
import Invoices from './admin/Invoices';
import Payments from './admin/Payments';
import Employees from './admin/Employees';
import Deposits from './admin/Deposits';
import Maintenance from './admin/Maintenance';
import Kasgeld from './admin/Kasgeld';
import Notifications from './admin/Notifications';
import PaymentPlans from './admin/PaymentPlans';
import Companies from './admin/Companies';
import SettingsPage from './admin/Settings';
import Locations from './admin/Locations';
import Subscriptions from './admin/Subscriptions';
import SaasOverview from './admin/SaasOverview';
import SaasSettings from './admin/SaasSettings';
import LandingEditor from './admin/LiveLandingEditor';
import MijnLanding from './admin/MijnLanding';
import PlansAdmin from './admin/PlansAdmin';
import BackupRestore from './admin/BackupRestore';
import Branding from './admin/Branding';
import BusinessInfo from './admin/BusinessInfo';
import SetupWizard from './admin/SetupWizard';
import SetupWizardSheet from './admin/SetupWizardSheet';
import MyUrlCard from '../../components/MyUrlCard';
import MijnAbonnement from './admin/MijnAbonnement';
import TrialBanner from '../../components/TrialBanner';
import ImpersonationBanner from '../../components/ImpersonationBanner';
import LiveIndicator from '../../components/LiveIndicator';
import OverdueBell from '../../components/OverdueBell';
import PendingApprovalBell from '../../components/PendingApprovalBell';
import ApartmentsBell from '../../components/ApartmentsBell';
import QuickPayButton from '../../components/QuickPayButton';
import PhotoUpload from '../../components/PhotoUpload';
import { installPendingApprovalDingListener } from '../../lib/notify-sound';
import { useForegroundPendingNotify } from '../../lib/foreground-notify';
import { useMorningBriefing } from '../../lib/morning-briefing';
import MorningBriefingModal from '../../components/MorningBriefingModal';
import BillingBlockedScreen from '../../components/BillingBlockedScreen';

const BASE_TABS = [
  { id: 'overview', label: 'Overzicht', icon: LayoutDashboard },
  { id: 'locations', label: 'Locaties', icon: MapPin },
  { id: 'apartments', label: 'Appartementen', icon: Building2 },
  { id: 'tenants', label: 'Huurders', icon: Users },
  { id: 'contracts', label: 'Contracten', icon: FileSignature },
  { id: 'payments', label: 'Betalingen', icon: Receipt },
  { id: 'invoices', label: 'Facturen', icon: FileText },
  { id: 'payment_plans', label: 'Betalingsregelingen', icon: Calendar },
  { id: 'deposits', label: 'Borg', icon: ShieldCheck },
  { id: 'maintenance', label: 'Onderhoud', icon: Wrench },
  { id: 'kasgeld', label: 'Kasgeld', icon: Wallet },
  { id: 'employees', label: 'Werknemers', icon: Users },
  { id: 'notifications', label: 'Notificaties', icon: Bell },
  { id: 'mijn_abonnement', label: 'Mijn Abonnement', icon: Crown },
  { id: 'mijn_landing', label: 'Mijn Landing', icon: Paintbrush },
  { id: 'setup_wizard', label: 'Setup Wizard', icon: Sparkles },
  { id: 'business_info', label: 'Bedrijfsgegevens', icon: Briefcase },
  { id: 'branding', label: 'Branding', icon: Palette },
  { id: 'backup_restore', label: 'Backup & Herstel', icon: Database },
  { id: 'settings', label: 'Instellingen', icon: KeySquare },
];
const SUPER_TABS = [
  { id: 'saas_overview', label: 'SaaS Overzicht', icon: LayoutDashboard },
  { id: 'companies', label: 'Bedrijven', icon: Briefcase },
  { id: 'saas_pending', label: 'OCR-goedkeuring', icon: ScanLine },
  { id: 'saas_invoices', label: 'SaaS Facturen', icon: Receipt },
  { id: 'saas_payments', label: 'SaaS Betalingen', icon: Banknote },
  { id: 'plans', label: 'Pakketten', icon: Package },
  { id: 'landing_editor', label: 'Landing Editor', icon: Paintbrush },
  { id: 'saas_settings', label: 'SaaS Instellingen', icon: KeySquare },
];

function getTabsFor(user) {
  return user?.role === 'superadmin' ? SUPER_TABS : BASE_TABS;
}

// Sidebar sectie-groepering voor moderne layout: groepeert tabs onder
// duidelijke labels zodat de zijbalk niet als één lange lijst voelt.
const SIDEBAR_GROUPS = {
  hoofd: { label: 'Hoofd', ids: ['overview', 'locations', 'apartments', 'tenants', 'contracts'] },
  geld: { label: 'Financieel', ids: ['payments', 'invoices', 'payment_plans', 'deposits', 'kasgeld'] },
  ops: { label: 'Operaties', ids: ['maintenance', 'employees', 'notifications'] },
  account: { label: 'Account', ids: ['mijn_abonnement', 'mijn_landing', 'setup_wizard', 'business_info', 'branding', 'backup_restore', 'settings'] },
  // SaaS Superadmin groep — split per functie. Volgorde: overzicht, klanten,
  // dagelijkse acties (OCR + facturen/betalingen), instellingen.
  saas: { label: 'SaaS Beheer', ids: [
    'saas_overview', 'companies', 'saas_pending', 'saas_invoices', 'saas_payments',
    'plans', 'landing_editor', 'saas_settings',
  ] },
};
function groupTabs(tabs) {
  const byId = Object.fromEntries(tabs.map((t) => [t.id, t]));
  return Object.entries(SIDEBAR_GROUPS).map(([key, group]) => ({
    key, label: group.label,
    items: group.ids.map((id) => byId[id]).filter(Boolean),
  })).filter((g) => g.items.length > 0);
}

function Sidebar({ active, onChange, onLogout, user, tabs, badgeCount, activeCompany }) {
  const groups = groupTabs(tabs);
  // Splits de bedrijfsnaam in 2 delen voor de "zwart + oranje" branding stijl.
  // Multi-woord namen: eerste woord zwart, rest oranje (bv. "GOPI APPARTEMENT'S").
  // Single-woord: split rond het midden (bv. "SuriRent" → "Suri" + "Rent").
  const fullName = activeCompany?.name
    || (user?.role === 'superadmin' ? 'Superadmin' : 'SuriRent');
  let nameA = fullName;
  let nameB = '';
  const spaceIdx = fullName.indexOf(' ');
  if (spaceIdx > 0) {
    nameA = fullName.slice(0, spaceIdx);
    nameB = fullName.slice(spaceIdx); // behoud spatie
  } else if (fullName.length >= 6) {
    const mid = Math.ceil(fullName.length / 2);
    nameA = fullName.slice(0, mid);
    nameB = fullName.slice(mid);
  }
  // Bedrijfslogo (uit Branding tab) overschrijft het standaard SuriRent-icoon
  // wanneer aanwezig. Live-update via branding-updated event uit Branding.jsx.
  const [logoUrl, setLogoUrl] = useState(() => {
    const cached = readCachedBranding();
    return cached?.logo_url || (activeCompany?.logo_url || '');
  });
  useEffect(() => {
    const refresh = () => {
      const cached = readCachedBranding();
      setLogoUrl(cached?.logo_url || activeCompany?.logo_url || '');
    };
    refresh();
    window.addEventListener('branding-updated', refresh);
    return () => window.removeEventListener('branding-updated', refresh);
  }, [activeCompany?.logo_url]);
  const resolvedLogo = resolveLogoUrl(logoUrl);
  return (
    <aside className="hidden md:flex flex-col w-56 lg:w-64 sticky top-0 h-screen bg-white border-r border-slate-100 shadow-[1px_0_3px_0_rgba(15,23,42,0.04)]"
      data-testid="sidebar">
      {/* HEADER — logo + bedrijfsnaam, vaste hoogte */}
      <div className="px-5 pt-6 pb-5 flex items-center gap-3 border-b border-slate-100">
        {resolvedLogo ? (
          <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 p-1.5 shadow-[0_8px_18px_-6px_rgba(15,23,42,0.10)] shrink-0 overflow-hidden"
            data-testid="sidebar-company-logo">
            <img src={resolvedLogo} alt={fullName}
              className="w-full h-full object-contain"
              onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          </div>
        ) : (
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] p-1.5 shadow-[0_8px_18px_-6px_rgba(255,92,0,0.45)] shrink-0">
            <img src="/kiosk-icons/mark-white.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-base font-black tracking-tight leading-tight truncate"
            data-testid="sidebar-company-name" title={fullName}>
            <span className="text-slate-900">{nameA}</span><span className="text-[#FF5C00]">{nameB}</span>
          </p>
          <p className="text-[9px] text-slate-500 font-bold tracking-[0.22em] uppercase">
            {user?.role === 'superadmin' ? 'Superadmin' : 'Beheer Suite'}
          </p>
        </div>
      </div>

      {/* NAV — gegroepeerd */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" data-testid="sidebar-nav">
        {groups.map((g) => (
          <div key={g.key}>
            <p className="px-3 mb-1.5 text-[9px] font-black tracking-[0.22em] uppercase text-slate-400">
              {g.label}
            </p>
            <div className="space-y-0.5">
              {g.items.map((t) => {
                const Icon = t.icon;
                const isActive = active === t.id;
                const showBadge = t.id === 'notifications' && badgeCount > 0;
                return (
                  <button key={t.id} onClick={() => onChange(t.id)}
                    data-testid={`tab-${t.id}`}
                    className={`group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                      isActive
                        ? 'bg-gradient-to-r from-[#FF8A3D] to-[#FF5C00] text-white shadow-[0_10px_22px_-8px_rgba(255,92,0,0.65)]'
                        : 'text-slate-600 hover:bg-orange-50 hover:text-[#FF5C00] hover:translate-x-0.5'
                    }`}>
                    {isActive && (
                      <span aria-hidden className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-6 rounded-full bg-white/80" />
                    )}
                    <span className="relative shrink-0">
                      <Icon className={`w-4 h-4 transition-transform ${isActive ? '' : 'group-hover:scale-110'}`} strokeWidth={isActive ? 2.4 : 2} />
                      {showBadge && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center ring-2 ring-white"
                          data-testid="sidebar-badge">
                          {badgeCount > 9 ? '9+' : badgeCount}
                        </span>
                      )}
                    </span>
                    <span className="truncate flex-1 text-left">{t.label}</span>
                    {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-80" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* FOOTER — user pill + logout */}
      <div className="border-t border-orange-100/60 px-3 py-3 bg-white/60 backdrop-blur-sm">
        <div className="flex items-center gap-2 px-3 py-2 mb-1 rounded-xl bg-orange-50/60">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#FF8A3D] to-[#C74600] text-white text-[11px] font-black flex items-center justify-center shrink-0">
            {(user?.name || user?.email || '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold text-slate-700 truncate leading-tight">{user?.name || 'Beheerder'}</p>
            <p className="text-[10px] text-slate-500 truncate leading-tight">{user?.email}</p>
          </div>
          <LiveIndicator compact />
        </div>
        <button onClick={onLogout} data-testid="logout-btn"
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all">
          <LogOut className="w-3.5 h-3.5" /> Uitloggen
        </button>
      </div>
    </aside>
  );
}

// Top 4 tabs always visible on the mobile bottom bar. The "Meer" button opens
// a full drawer that exposes every other tab. Superadmins keep "Bedrijven"
// on the bottom bar so they always have access to the company switcher.
const MOBILE_PRIMARY_IDS = ['payments', 'invoices', 'tenants', 'apartments'];

/**
 * Eigen iconenkeuze voor de mobiele bottom-tabbar — de sidebar/icoon op de
 * Admin-pagina blijft het BASE_TABS-icoon gebruiken, maar in de bottom-bar
 * tonen we duidelijker/POS-achtige icons (banknote i.p.v. receipt etc).
 */
const MOBILE_TAB_ICON_OVERRIDES = {
  payments: Banknote,
  invoices: ReceiptText,
  tenants: UsersRound,
  apartments: Building,
};
const MOBILE_SUPER_PRIMARY_IDS = ['saas_overview', 'companies', 'saas_pending', 'saas_invoices'];

function MobileHeader_REMOVED({ activeCompany, user, onOpenMenu }) {
  void activeCompany; void user; void onOpenMenu;
  return null;
}

function splitNameHalf(name) {
  // Splits de bedrijfsnaam visueel in twee delen: eerste helft zwart,
  // tweede helft oranje. Probeert eerst een spatie op/na het midden te
  // vinden zodat woorden niet midden in worden opgeknipt.
  if (!name) return ['', ''];
  const mid = Math.ceil(name.length / 2);
  let idx = name.indexOf(' ', mid);
  if (idx === -1) idx = name.lastIndexOf(' ', mid);
  if (idx === -1) return [name.slice(0, mid), name.slice(mid)];
  return [name.slice(0, idx), name.slice(idx + 1)];
}

function MobileTopLogo({ user, activeCompany }) {
  // Minimalistische topbar met SuriRent-stijl: oranje pill + huis-icoon links,
  // daarnaast bedrijfsnaam (donker) + "BEHEER · PRO" subtitel waarin "BEHEER"
  // navy is en het tweede deel (plan) in brand-oranje. Geen menu-knop, geen
  // Kiosk-knop, geen Live indicator — die zitten in de "+"-sheet.
  const fullName = activeCompany?.name || (user?.role === 'superadmin' ? 'Alle bedrijven' : 'SuriRent');
  const planLabel = user?.role === 'superadmin' ? 'Superadmin' : 'Beheer';
  const planSuffix = activeCompany?.plan ? String(activeCompany.plan).toUpperCase() : 'PRO';
  return (
    <header className="md:hidden sticky top-0 z-30 bg-[#F7F8FA]/85 backdrop-blur-md"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      data-testid="mobile-top-logo">
      <div className="px-4 md:px-8 py-3 md:py-4 landscape:py-1.5 flex items-center gap-3.5 md:gap-4 landscape:gap-2 max-w-4xl md:mx-auto md:w-full">
        <div className="w-14 h-14 md:w-14 md:h-14 landscape:w-9 landscape:h-9 rounded-2xl landscape:rounded-xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] p-2 md:p-2 landscape:p-1 shadow-[0_6px_14px_-4px_rgba(255,92,0,0.45)] shrink-0">
          <img src="/kiosk-icons/mark-white.png" alt="SuriRent" className="w-full h-full object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xl md:text-2xl landscape:text-sm font-black tracking-tight leading-tight truncate text-slate-900" data-testid="mobile-top-name">
            {fullName}
          </p>
          <p className="text-[11px] md:text-sm landscape:text-[10px] font-bold tracking-[0.14em] uppercase truncate mt-1 text-slate-400">
            {planLabel}<span className="text-slate-300"> · </span>{planSuffix}
          </p>
        </div>
        {user?.role !== 'superadmin' && (
          <div className="flex items-center gap-2 md:gap-3 landscape:gap-1.5 shrink-0">
            <PendingApprovalBell />
            <OverdueBell />
          </div>
        )}
      </div>
    </header>
  );
}

function MobileSheet({ open, onClose, active, onChange, onLogout, user, tabs, activeCompany, badgeCount }) {
  const navigate = useBrandedNavigate();
  if (!open) return null;
  return (
    <div className="md:hidden fixed inset-0 z-50" data-testid="mobile-sheet">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <aside
        className="absolute left-0 right-0 bottom-0 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[520px] md:w-[640px] bg-white rounded-t-3xl shadow-[0_-24px_60px_-12px_rgba(15,23,42,0.35)] flex flex-col animate-slide-up overflow-hidden"
        style={{ maxHeight: '85dvh' }}
      >
        {/* Handle / grip */}
        <div className="pt-2 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        {/* HEADER — company name + Live + Kiosk-shortcut + close */}
        <div className="px-5 md:px-6 pt-2 pb-3 md:pb-4 flex items-center gap-3 md:gap-4">
          <div className="w-11 h-11 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] p-1.5 md:p-2 shadow-md shrink-0">
            <img src="/kiosk-icons/mark-white.png" alt="SuriRent" className="w-full h-full object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-base md:text-xl font-black text-slate-900 leading-tight truncate">
                {activeCompany?.name || (user?.role === 'superadmin' ? 'Alle bedrijven' : 'SuriRent')}
              </p>
              <LiveIndicator compact />
            </div>
            <p className="text-[10px] md:text-xs text-[#FF5C00] font-bold tracking-[0.18em] uppercase truncate">
              {user?.role === 'superadmin' ? 'Superadmin' : 'Beheer'}{activeCompany?.plan ? ` · ${activeCompany.plan}` : ''}
            </p>
          </div>
          <button onClick={onClose} data-testid="mobile-sheet-close"
            className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center shrink-0">
            <X className="w-4 h-4 md:w-5 md:h-5 text-slate-600" />
          </button>
        </div>

        {/* QUICK-ACTIONS */}
        {user?.role !== 'superadmin' && (
          <div className="px-5 md:px-6 pb-3">
            <button
              onClick={async () => {
                try { localStorage.setItem('pwa_preferred_role', 'kiosk'); } catch { /* noop */ }
                // Vraag een kiosk-token aan via het admin-to-kiosk endpoint.
                // Admin behoudt zijn admin_token, krijgt apart kiosk_token erbij.
                try {
                  const activeCid = localStorage.getItem('active_company_id') || undefined;
                  const { data } = await api.post('/auth/admin-to-kiosk', activeCid ? { company_id: activeCid } : {});
                  if (data?.token) localStorage.setItem('kiosk_token', data.token);
                  if (data?.company) localStorage.setItem('kiosk_company', JSON.stringify(data.company));
                } catch (e) {
                  alert('Kon kiosk niet openen: ' + (e?.response?.data?.detail || e.message));
                  return;
                }
                onClose();
                navigate('/kiosk');
              }}
              data-testid="mobile-sheet-kiosk"
              className="w-full inline-flex items-center justify-center gap-2 h-11 md:h-13 md:py-3 rounded-2xl bg-gradient-to-br from-[#FF8A3D] to-[#FF5C00] text-white font-bold text-sm md:text-base shadow-[0_10px_24px_-8px_rgba(255,92,0,0.6)] active:scale-95 transition"
            >
              <Monitor className="w-4 h-4 md:w-5 md:h-5" /> Open Kiosk
            </button>
          </div>
        )}

        {/* TABS — alle modules in een grid */}
        <div className="flex-1 overflow-y-auto px-3 md:px-5 pb-2">
          <div className="grid grid-cols-3 md:grid-cols-4 gap-2 md:gap-3">
            {tabs.map((t) => {
              const Icon = t.icon;
              const isActive = active === t.id;
              const showBadge = t.id === 'notifications' && badgeCount > 0;
              return (
                <button
                  key={t.id}
                  onClick={() => { onChange(t.id); onClose(); }}
                  data-testid={`tab-sheet-${t.id}`}
                  className={`relative flex flex-col items-center justify-center gap-1.5 md:gap-2 py-4 md:py-5 rounded-2xl text-xs md:text-sm font-bold transition-all active:scale-95 ${
                    isActive
                      ? 'bg-gradient-to-br from-[#FF8A3D] to-[#FF5C00] text-white shadow-[0_8px_20px_-5px_rgba(255,92,0,0.55)]'
                      : 'bg-slate-50 text-slate-700 hover:bg-orange-50 hover:text-[#FF5C00]'
                  }`}
                >
                  <span className="relative">
                    <Icon className={`w-5 h-5 md:w-6 md:h-6 ${isActive ? '' : 'text-slate-500'}`} strokeWidth={isActive ? 2.4 : 2} />
                    {showBadge && (
                      <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center ring-2 ring-white">
                        {badgeCount > 9 ? '9+' : badgeCount}
                      </span>
                    )}
                  </span>
                  <span className="text-center leading-tight text-[11px] md:text-[13px]">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* FOOTER — email + logout */}
        <div className="border-t border-slate-100 px-5 pt-3 bg-white"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-xs text-slate-500 truncate">{user?.email}</p>
          </div>
          <button onClick={() => { onClose(); onLogout(); }} data-testid="mobile-sheet-logout"
            className="w-full flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50 transition-all">
            <LogOut className="w-4 h-4" /> Uitloggen
          </button>
        </div>
      </aside>
    </div>
  );
}

function MobileTabBar({ active, onChange, tabs, onOpenMenu, user, badgeCount }) {
  const primaryIds = user?.role === 'superadmin' ? MOBILE_SUPER_PRIMARY_IDS : MOBILE_PRIMARY_IDS;
  const primary = primaryIds
    .map((id) => tabs.find((t) => t.id === id))
    .filter(Boolean);
  // Splits in 2 links + 2 rechts (de "+" zit in het midden).
  const left = primary.slice(0, 2);
  const right = primary.slice(2, 4);

  const renderTab = (t) => {
    const Icon = MOBILE_TAB_ICON_OVERRIDES[t.id] || t.icon;
    const isActive = active === t.id;
    const showBadge = t.id === 'notifications' && badgeCount > 0;
    return (
      <button
        key={t.id}
        onClick={() => onChange(t.id)}
        data-testid={`tab-mobile-${t.id}`}
        className="relative flex flex-col items-center justify-end gap-1 landscape:gap-0.5 pt-2 md:pt-3 pb-1 md:pb-2 landscape:pt-1 landscape:pb-0.5 rounded-xl active:scale-95 transition-all"
      >
        {isActive && (
          <span
            aria-hidden
            className="absolute inset-x-2 top-1 bottom-1 rounded-xl bg-gradient-to-b from-orange-50 to-orange-100/70 shadow-[inset_0_0_0_1px_rgba(255,92,0,0.18)]"
          />
        )}
        <span className="relative">
          <Icon
            className={`transition-all ${isActive ? 'w-[26px] h-[26px] md:w-7 md:h-7 text-[#FF5C00]' : 'w-[24px] h-[24px] md:w-[26px] md:h-[26px] text-slate-500'}`}
            strokeWidth={isActive ? 2.4 : 2}
          />
          {showBadge && (
            <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center shadow-[0_2px_6px_-1px_rgba(239,68,68,0.55)] ring-2 ring-white">
              {badgeCount > 9 ? '9+' : badgeCount}
            </span>
          )}
        </span>
        <span
          className={`relative text-[10px] md:text-xs leading-tight tracking-wide truncate max-w-[68px] md:max-w-[100px] transition-all ${
            isActive ? 'font-black text-[#FF5C00]' : 'font-semibold text-slate-500'
          }`}
        >
          {t.label}
        </span>
      </button>
    );
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40"
      data-testid="mobile-tab-bar"
    >
      {/* Op iPad (md+) zwevende rounded bar i.p.v. fullwidth strip — geeft
          duidelijker visueel ruststation tussen content en navigatie. */}
      <div className="bg-white/95 backdrop-blur-xl border-t md:border md:border-orange-100 md:rounded-3xl border-slate-100 shadow-[0_-6px_22px_-12px_rgba(15,23,42,0.10)] md:shadow-[0_18px_36px_-12px_rgba(15,23,42,0.18)] md:mx-auto md:max-w-2xl md:mb-3 relative">
        {/* Brand accent line top-center */}
        <div aria-hidden className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-[3px] rounded-full bg-gradient-to-r from-[#FF8A3D] to-[#FF5C00] opacity-90 md:hidden" />

        <div
          className="grid grid-cols-5 gap-0.5 px-1.5 md:px-3 pt-3 md:pt-2 landscape:pt-1"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}
        >
        {left.map(renderTab)}

        {/* Center FAB — clean ronde + knop die uitsteekt boven de nav, met
            "Nieuw" label eronder zodat hij visueel meedoet met de andere
            tab-iconen + labels. Geen bol/uitsparing meer rondom. */}
        <div className="relative flex flex-col items-center justify-end pb-1">
          <button
            onClick={onOpenMenu}
            data-testid="mobile-fab-menu"
            aria-label="Open menu"
            className="relative -mt-6 md:-mt-8 landscape:-mt-3 w-14 h-14 md:w-16 md:h-16 landscape:w-10 landscape:h-10 rounded-full bg-gradient-to-br from-[#FF8A3D] to-[#FF5C00] text-white flex items-center justify-center shadow-[0_8px_18px_-4px_rgba(255,92,0,0.55)] active:scale-95 transition-all"
          >
            <Plus className="w-6 h-6 md:w-7 md:h-7 landscape:w-4 landscape:h-4" strokeWidth={2.8} />
            {badgeCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] md:min-w-[20px] h-[18px] md:h-5 px-1 rounded-full bg-red-500 text-white text-[10px] md:text-[11px] font-black flex items-center justify-center ring-2 ring-white"
                data-testid="mobile-fab-badge">
                {badgeCount > 9 ? '9+' : badgeCount}
              </span>
            )}
          </button>
          <span className="mt-1 text-[10px] md:text-xs font-semibold text-slate-500 tracking-wide leading-tight">
            Nieuw
          </span>
        </div>

        {right.map(renderTab)}
        </div>
      </div>
    </nav>
  );
}

function MobileTabBar_REMOVED({ active, onChange, tabs, onOpenMenu, user, badgeCount }) {
  void active; void onChange; void tabs; void onOpenMenu; void user; void badgeCount;
  return null;
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
function StatusDonut({ paid = 0, open = 0, overdue = 0 }) {
  // Renders a 3-segment donut chart (paid=green, open=orange, overdue=slate)
  // using a single SVG with stroke-dasharray. Radius 60, circumference 2πr ≈ 377.
  const total = paid + open + overdue;
  if (total === 0) {
    return (
      <div className="flex items-center justify-center w-40 h-40 rounded-full border-8 border-slate-100">
        <div className="text-center">
          <p className="text-2xl font-black text-slate-300">0</p>
          <p className="text-xs text-slate-400">Totaal</p>
        </div>
      </div>
    );
  }
  const C = 377;
  const paidLen = (paid / total) * C;
  const openLen = (open / total) * C;
  const overdueLen = (overdue / total) * C;
  return (
    <div className="relative w-40 h-40">
      <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
        <circle cx="70" cy="70" r="60" fill="none" stroke="#F3F4F6" strokeWidth="14" />
        {paid > 0 && (
          <circle cx="70" cy="70" r="60" fill="none" stroke="#10B981" strokeWidth="14"
            strokeDasharray={`${paidLen} ${C}`} strokeDashoffset="0" strokeLinecap="butt" />
        )}
        {open > 0 && (
          <circle cx="70" cy="70" r="60" fill="none" stroke="#FF5C00" strokeWidth="14"
            strokeDasharray={`${openLen} ${C}`} strokeDashoffset={`-${paidLen}`} strokeLinecap="butt" />
        )}
        {overdue > 0 && (
          <circle cx="70" cy="70" r="60" fill="none" stroke="#94A3B8" strokeWidth="14"
            strokeDasharray={`${overdueLen} ${C}`} strokeDashoffset={`-${paidLen + openLen}`} strokeLinecap="butt" />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <p className="text-3xl font-black text-slate-900" data-testid="status-donut-total">{total}</p>
          <p className="text-[11px] text-slate-500 font-semibold">Totaal</p>
        </div>
      </div>
    </div>
  );
}

function StatusLegendItem({ color, label, count, percent }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-1.5 inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-600">{label}</p>
        <p className="text-sm font-black text-slate-900 tracking-tight">
          {count} <span className="text-xs text-slate-400 font-semibold">({percent}%)</span>
        </p>
      </div>
    </div>
  );
}

function ActivityRow({ item }) {
  const isPayment = item.type === 'payment_received';
  const Icon = isPayment ? FileText : ClockIcon;
  const amountColor = isPayment ? 'text-emerald-600' : 'text-[#FF5C00]';
  let when = '—';
  try {
    const d = new Date(item.at);
    if (!isNaN(d.getTime())) {
      when = d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  } catch { /* ignore */ }
  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isPayment ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-[#FF5C00]'}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-900 truncate">{item.title}</p>
        <p className="text-xs text-slate-500 truncate">{item.subtitle}</p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-black tracking-tight ${amountColor}`}>{fmtMoney(item.amount || 0, item.currency || 'SRD')}</p>
        <p className="text-[11px] text-slate-400">{when}</p>
      </div>
    </div>
  );
}

// =====================================================================
// GlobalSearch — debounced cross-collection search for the Overview page.
// Searches huurders, appartementen en facturen (client-side fuzzy match)
// en navigeert bij klik direct naar de juiste tab.
// =====================================================================
function GlobalSearch({ variant = 'quick' }) {
  const [q, setQ] = useState('');
  const [data, setData] = useState({ tenants: [], apartments: [], invoices: [] });
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const compact = variant === 'topbar';

  // Lazy-load alle data één keer wanneer de gebruiker begint te typen.
  // Voor een SaaS van deze grootte (1-200 huurders) is dit ruim snel
  // genoeg en bespaart het multiple round-trips per keystroke.
  const loadAll = useCallback(async () => {
    if (loaded) return;
    try {
      const [t, a, i] = await Promise.all([
        api.get('/tenants'),
        api.get('/apartments'),
        api.get('/invoices'),
      ]);
      setData({ tenants: t.data || [], apartments: a.data || [], invoices: i.data || [] });
      setLoaded(true);
    } catch { /* keep empty — UI degrades gracefully */ }
  }, [loaded]);

  const norm = (s) => (s || '').toString().toLowerCase();
  const term = norm(q.trim());
  const results = term.length < 2 ? { tenants: [], apartments: [], invoices: [] } : {
    tenants: data.tenants.filter((t) =>
      norm(t.name).includes(term) || norm(t.phone).includes(term) || norm(t.email).includes(term),
    ).slice(0, 5),
    apartments: data.apartments.filter((a) =>
      norm(a.number).includes(term) || norm(a.address).includes(term),
    ).slice(0, 5),
    invoices: data.invoices.filter((i) =>
      norm(i.invoice_number).includes(term)
      || norm(i.tenant_name).includes(term)
      || norm(`${MONTHS_NL[(i.period_month || 1) - 1]} ${i.period_year}`).includes(term),
    ).slice(0, 5),
  };
  const totalResults = results.tenants.length + results.apartments.length + results.invoices.length;

  const go = (tab) => {
    setQ('');
    setOpen(false);
    window.dispatchEvent(new CustomEvent('go-tab', { detail: tab }));
  };

  return (
    <div className={compact ? 'relative w-72 xl:w-96' : 'relative'}>
      <div className={
        compact
          ? 'group flex items-center gap-2 h-10 px-3 rounded-full bg-white border border-slate-200 hover:border-[#FF5C00] focus-within:border-[#FF5C00] focus-within:ring-2 focus-within:ring-orange-100 shadow-sm transition-all'
          : 'group flex items-center gap-2.5 p-3 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100/60 border border-slate-200 hover:border-[#FF5C00] focus-within:border-[#FF5C00] focus-within:ring-2 focus-within:ring-orange-100 transition-all h-full'
      }>
        {compact ? (
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-white/80 flex items-center justify-center shrink-0">
            <Search className="w-5 h-5 text-[#FF5C00]" />
          </div>
        )}
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); loadAll(); }}
          onFocus={() => { setOpen(true); loadAll(); }}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          data-testid="overview-global-search"
          placeholder={compact ? 'Zoeken…' : 'Zoek huurder, appartement of factuur…'}
          className={
            compact
              ? 'flex-1 min-w-0 bg-transparent outline-none text-sm font-semibold text-slate-900 placeholder:text-slate-400'
              : 'flex-1 min-w-0 bg-transparent outline-none text-sm font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-semibold'
          }
        />
        {q && (
          <button onClick={() => setQ('')}
            data-testid="overview-search-clear"
            className="text-slate-400 hover:text-slate-700 shrink-0">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && term.length >= 2 && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 bg-white rounded-2xl border border-slate-200 shadow-[0_24px_48px_-12px_rgba(15,23,42,0.18)] overflow-hidden max-h-[420px] overflow-y-auto"
          data-testid="overview-search-results">
          {totalResults === 0 ? (
            <div className="p-5 text-center text-sm text-slate-400">
              Geen resultaten voor "<span className="font-bold text-slate-600">{q}</span>"
            </div>
          ) : (
            <>
              {results.tenants.length > 0 && (
                <div className="py-1.5">
                  <p className="px-4 pt-2 pb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Huurders</p>
                  {results.tenants.map((t) => (
                    <button key={t.id} onMouseDown={(e) => e.preventDefault()}
                      onClick={() => go('tenants')}
                      data-testid={`search-tenant-${t.id}`}
                      className="w-full text-left px-4 py-2.5 hover:bg-orange-50/60 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{t.name}</p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {t.phone || ''}{t.phone && t.email ? ' · ' : ''}{t.email || ''}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
              {results.apartments.length > 0 && (
                <div className="py-1.5 border-t border-slate-100">
                  <p className="px-4 pt-2 pb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Appartementen</p>
                  {results.apartments.map((a) => (
                    <button key={a.id} onMouseDown={(e) => e.preventDefault()}
                      onClick={() => go('apartments')}
                      data-testid={`search-apartment-${a.id}`}
                      className="w-full text-left px-4 py-2.5 hover:bg-orange-50/60 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-orange-100 text-[#FF5C00] flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{a.number}</p>
                        <p className="text-[11px] text-slate-500 truncate">{a.address || '—'}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
              {results.invoices.length > 0 && (
                <div className="py-1.5 border-t border-slate-100">
                  <p className="px-4 pt-2 pb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Facturen</p>
                  {results.invoices.map((i) => (
                    <button key={i.id} onMouseDown={(e) => e.preventDefault()}
                      onClick={() => go('invoices')}
                      data-testid={`search-invoice-${i.id}`}
                      className="w-full text-left px-4 py-2.5 hover:bg-orange-50/60 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-orange-100 text-[#FF5C00] flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">
                          {i.invoice_number || '#—'} · {MONTHS_NL[(i.period_month || 1) - 1]} {i.period_year}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {i.tenant_name || '—'} · {fmtMoney(i.amount, i.currency)}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// PaymentPlansList — toont ALLE actieve betalingsregelingen in een
// scrollable lijst op de Overzicht-pagina (vervangt het oude
// "Status Overzicht" blok). Klik op een regeling navigeert naar de
// Betalingsregelingen-tab.
// =====================================================================
function PaymentPlansList() {
  const [plans, setPlans] = useState(null);
  const reload = useCallback(() => {
    api.get('/payment-plans?status=active')
      .then((r) => setPlans(r.data || []))
      .catch(() => setPlans([]));
  }, []);
  useEffect(() => { reload(); }, [reload]);
  useAutoRefresh(reload, 15000);

  const go = () => window.dispatchEvent(new CustomEvent('go-tab', { detail: 'payment_plans' }));

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] p-4 lg:p-5 lg:col-span-2"
      data-testid="payment-plans-overview-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#FF5C00]" />
          <p className="text-[10px] lg:text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Actieve Betalingsregelingen
          </p>
          {plans && plans.length > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full bg-orange-100 text-[10px] font-black text-[#FF5C00]"
              data-testid="payment-plans-count">{plans.length}</span>
          )}
        </div>
        <button onClick={go} data-testid="payment-plans-view-all"
          className="text-xs font-bold text-[#FF5C00] hover:underline">
          Bekijk alle →
        </button>
      </div>

      {plans === null ? (
        <div className="py-10 text-center text-sm text-slate-400">
          <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin text-slate-300" />
          Regelingen laden…
        </div>
      ) : plans.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">
          <Calendar className="w-6 h-6 mx-auto mb-2 text-slate-300" />
          Geen actieve betalingsregelingen
        </div>
      ) : (
        <div className="max-h-[420px] overflow-y-auto -mx-2 px-2">
          {plans.map((p) => {
            const pct = p.total_amount > 0
              ? Math.min(100, Math.round((p.paid_amount / p.total_amount) * 100))
              : 0;
            const overdue = (p.overdue_count || 0) > 0;
            return (
              <button key={p.id} onClick={go}
                data-testid={`payment-plan-${p.id}`}
                className="w-full text-left p-3 rounded-xl hover:bg-orange-50/40 border border-transparent hover:border-orange-100 transition-all mb-1.5 last:mb-0">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    overdue ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-[#FF5C00]'
                  }`}>
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <p className="text-sm font-black text-slate-900 truncate">
                        {p.tenant_name || '—'}
                        {p.apartment_number && (
                          <span className="text-slate-400 font-bold"> · Appt. {p.apartment_number}</span>
                        )}
                      </p>
                      <p className="text-sm font-black text-slate-900 shrink-0">
                        {fmtMoney(p.remaining_amount, p.currency)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-slate-500 font-semibold">
                        {fmtMoney(p.paid_amount, p.currency)} / {fmtMoney(p.total_amount, p.currency)}
                      </span>
                      {overdue && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 font-bold">
                          <AlertCircle className="w-2.5 h-2.5" />
                          {p.overdue_count} achterstand
                        </span>
                      )}
                      {p.next_due_date && !overdue && (
                        <span className="text-slate-400 font-semibold">
                          Volgende: {new Date(p.next_due_date).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full transition-all ${
                        overdue ? 'bg-gradient-to-r from-red-400 to-red-600'
                          : 'bg-gradient-to-r from-[#F8C260] to-[#FF5C00]'
                      }`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Overview() {
  const [stats, setStats] = useState(null);
  const navigate = useBrandedNavigate();
  const reload = useCallback(() => {
    api.get('/admin/stats').then((r) => setStats(r.data)).catch(() => { /* keep last */ });
  }, []);
  useEffect(() => { reload(); }, [reload]);
  useAutoRefresh(reload, 10000);
  if (!stats) return <div className="text-slate-400 text-sm">Laden...</div>;

  const cards = [
    { label: 'Appartementen', value: stats.apartments_total, icon: Building2, accent: 'bg-orange-50 text-[#FF5C00]' },
    { label: 'Bezet', value: stats.apartments_occupied, icon: Home, accent: 'bg-emerald-50 text-emerald-600' },
    { label: 'Vacant', value: stats.apartments_vacant, icon: KeySquare, accent: 'bg-slate-100 text-slate-600' },
    { label: 'Huurders', value: stats.tenants_total, icon: Users, accent: 'bg-amber-50 text-amber-600' },
  ];

  const byCur = stats.month_payments_by_currency || {};
  const outstandingByCur = stats.outstanding_by_currency || {};
  // Pick the dominant currency to show as the primary "Inkomsten / Openstaand" hero number.
  // Falls back to SRD if there is no data yet.
  const primaryCur = Object.keys(byCur)[0] || Object.keys(outstandingByCur)[0] || 'SRD';
  const incomeTotal = byCur[primaryCur]?.total || 0;
  const incomeCount = byCur[primaryCur]?.count || 0;
  const outstandingTotal = outstandingByCur[primaryCur]?.total || 0;
  const outstandingCount = outstandingByCur[primaryCur]?.count || 0;

  const invStatus = stats.invoice_status || { paid: 0, open: 0, overdue: 0 };
  const invTotal = invStatus.paid + invStatus.open + invStatus.overdue;
  const pct = (n) => (invTotal === 0 ? 0 : Math.round((n / invTotal) * 100));

  const occupiedPct = stats.apartments_total === 0 ? 0
    : Math.round((stats.apartments_occupied / stats.apartments_total) * 100);
  const vacantCount = stats.apartments_vacant;

  const recent = stats.recent_activity || [];

  // ===== Desktop KPI tegels =====
  const overdueCount = stats.overdue_tenants_count || 0;
  const currentMonthOpenCount = stats.current_month_open_count || 0;
  const currentMonthOpenBy = stats.current_month_open_by_currency || {};
  const currentOpenTotal = currentMonthOpenBy[primaryCur] || 0;
  const cashByCur = stats.cash_balance_by_currency || {};

  const openKioskFn = async () => {
    try { localStorage.setItem('pwa_preferred_role', 'kiosk'); } catch { /* noop */ }
    try {
      const activeCid = localStorage.getItem('active_company_id') || undefined;
      const { data } = await api.post('/auth/admin-to-kiosk', activeCid ? { company_id: activeCid } : {});
      if (data?.token) localStorage.setItem('kiosk_token', data.token);
      if (data?.company) localStorage.setItem('kiosk_company', JSON.stringify(data.company));
    } catch (e) {
      alert('Kon kiosk niet openen: ' + (e?.response?.data?.detail || e.message));
      return;
    }
    navigate('/kiosk');
  };

  return (
    <div>
      <PageHeader title="Overzicht" subtitle="Snelle blik op uw vastgoedportefeuille" />

      {/* Mobile/tablet: combined "Portfolio in één oogopslag" card with 4 mini-stats */}
      <div className="lg:hidden bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] p-4 mb-4" data-testid="portfolio-card-mobile">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Portfolio in één oogopslag</p>
        <div className="grid grid-cols-4 divide-x divide-slate-100">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="px-1.5 first:pl-0 last:pr-0 text-center">
                <div className={`w-10 h-10 rounded-full ${c.accent} flex items-center justify-center mx-auto mb-2`}>
                  <Icon className="w-4 h-4" />
                </div>
                <p className="text-xl font-black text-slate-900 tracking-tight" data-testid={`stat-m-${c.label.toLowerCase()}`}>{c.value}</p>
                <p className="text-[10px] text-slate-500 font-semibold mt-0.5">{c.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ============================================================
          DESKTOP REDESIGN — Modern Professional · Luxe Gold/Oranje
          ============================================================
          Layout: Saldo's prominent bovenaan (luxe banking-stijl)
                  → KPI's eronder (4 tegels)
                  → Snelle acties (4 knoppen)
                  → Status overzicht + Activiteiten (bestaand)
      */}
      <div className="hidden lg:block">
        {/* ============ HERO · Kas Saldo Banking-stijl ============ */}
        <div
          className="relative overflow-hidden rounded-3xl mb-5 p-7 text-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.55)]"
          style={{
            background:
              'radial-gradient(circle at 0% 0%, #2A1A0A 0%, #1A1208 35%, #0B0805 100%)',
          }}
          data-testid="hero-cash-balance"
        >
          {/* Luxe achtergrondaccenten — goud glow */}
          <div className="pointer-events-none absolute -top-32 -right-24 w-[28rem] h-[28rem] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(255,176,99,0.32) 0%, rgba(255,92,0,0.08) 40%, transparent 70%)' }} />
          <div className="pointer-events-none absolute -bottom-24 -left-24 w-[22rem] h-[22rem] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(212,160,55,0.18) 0%, transparent 65%)' }} />
          {/* Subtiele grid noise overlay */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }} />

          <div className="relative flex items-start justify-between gap-6 mb-6">
            <div>
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #F8C260 0%, #D4A037 60%, #8B6914 100%)' }}>
                  <Wallet className="w-4.5 h-4.5 text-[#1A1208]" />
                </span>
                <p className="text-[10px] font-black uppercase tracking-[0.22em]"
                  style={{ color: '#F0C97A' }}>
                  Kas saldo
                </p>
              </div>
              <h2 className="text-3xl font-black tracking-tight leading-tight"
                style={{
                  background: 'linear-gradient(90deg, #FFF6D6 0%, #F8C260 60%, #D4A037 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>
                Totaal beschikbaar
              </h2>
              <p className="text-xs text-white/50 font-semibold mt-1">
                Live overzicht per valuta · Bron: Kasgeld
              </p>
            </div>
            <button onClick={() => window.dispatchEvent(new CustomEvent('go-tab', { detail: 'kasgeld' }))}
              data-testid="hero-cash-cta"
              className="group inline-flex items-center gap-2 px-4 h-10 rounded-full text-xs font-black tracking-wider uppercase transition-all border"
              style={{
                background: 'linear-gradient(135deg, rgba(248,194,96,0.18) 0%, rgba(212,160,55,0.08) 100%)',
                borderColor: 'rgba(248,194,96,0.35)',
                color: '#F8C260',
              }}>
              Beheer kasgeld
              <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </div>

          {/* 3 Currency tiles — banking style */}
          <div className="relative grid grid-cols-3 gap-4">
            {[
              { cur: 'SRD', label: 'Surinaamse Dollar', symbol: 'SRD' },
              { cur: 'EUR', label: 'Euro', symbol: '€' },
              { cur: 'USD', label: 'US Dollar', symbol: '$' },
            ].map(({ cur, label, symbol }) => {
              const v = cashByCur[cur] || 0;
              const positive = v >= 0;
              return (
                <div key={cur}
                  className="relative rounded-2xl p-4 overflow-hidden backdrop-blur-sm"
                  style={{
                    background: 'linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.015) 100%)',
                    border: '1px solid rgba(248,194,96,0.18)',
                  }}
                  data-testid={`hero-cash-tile-${cur.toLowerCase()}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black tracking-[0.18em] uppercase"
                        style={{ color: '#F0C97A' }}>{cur}</span>
                      <span className="text-[10px] text-white/40 font-semibold">{label}</span>
                    </div>
                    <span className="inline-flex w-6 h-6 rounded-full items-center justify-center"
                      style={{ background: 'rgba(248,194,96,0.12)' }}>
                      <TrendingUp className="w-3 h-3" style={{ color: positive ? '#86EFAC' : '#FCA5A5' }} />
                    </span>
                  </div>
                  <p className="text-3xl font-black tracking-tight leading-none text-white"
                    data-testid={`kpi-cash-${cur.toLowerCase()}`}>
                    <span className="text-base font-bold opacity-60 mr-1">{symbol === 'SRD' ? '' : symbol}</span>
                    {Math.round(v).toLocaleString('nl-NL')}
                  </p>
                  <div className="mt-3 h-px w-full"
                    style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(248,194,96,0.4) 50%, transparent 100%)' }} />
                  <p className="text-[10px] text-white/40 font-semibold mt-1.5">Beschikbaar saldo</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ============ KPI rij — 4 tegels ============ */}
        <div className="grid grid-cols-4 gap-4 mb-5">
          {/* Appartementen */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] p-5 relative overflow-hidden hover:border-orange-200 transition-colors">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-orange-100/40 to-transparent rounded-full -translate-y-6 translate-x-6 pointer-events-none" />
            <div className="flex items-start gap-3 relative">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-100 to-orange-50 flex items-center justify-center shrink-0 shadow-inner">
                <Building2 className="w-5 h-5 text-[#FF5C00]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Appartementen</p>
                <p className="text-3xl font-black text-slate-900 tracking-tight leading-none mt-1" data-testid="kpi-apartments">
                  {stats.apartments_total}
                </p>
                <p className="text-[11px] text-slate-500 font-semibold mt-1.5">
                  <span className="text-emerald-600">{stats.apartments_occupied} bezet</span>
                  {vacantCount > 0 && <span className="text-slate-400"> · {vacantCount} vacant</span>}
                </p>
              </div>
            </div>
            <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#F8C260] to-[#FF5C00] transition-all" style={{ width: `${occupiedPct}%` }} />
            </div>
            <p className="text-[10px] text-slate-400 font-bold mt-1.5">{occupiedPct}% bezetting</p>
          </div>

          {/* Actieve huurders */}
          <button onClick={() => window.dispatchEvent(new CustomEvent('go-tab', { detail: 'tenants' }))}
            data-testid="kpi-tenants-cta"
            className="text-left bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] p-5 relative overflow-hidden hover:border-amber-200 transition-colors">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-amber-100/40 to-transparent rounded-full -translate-y-6 translate-x-6 pointer-events-none" />
            <div className="flex items-start gap-3 relative">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 flex items-center justify-center shrink-0 shadow-inner">
                <Users className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Actieve huurders</p>
                <p className="text-3xl font-black text-slate-900 tracking-tight leading-none mt-1" data-testid="kpi-tenants">
                  {stats.tenants_total}
                </p>
                <p className="text-[11px] text-slate-500 font-semibold mt-1.5">
                  In {stats.apartments_occupied} {stats.apartments_occupied === 1 ? 'eenheid' : 'eenheden'}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-[#FF5C00] font-bold">Bekijk alle huurders →</p>
          </button>

          {/* Openstaand lopende maand */}
          <button onClick={() => window.dispatchEvent(new CustomEvent('go-tab', { detail: 'invoices' }))}
            data-testid="kpi-current-open"
            className="text-left bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] p-5 relative overflow-hidden hover:border-orange-200 transition-colors">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-orange-100/40 to-transparent rounded-full -translate-y-6 translate-x-6 pointer-events-none" />
            <div className="flex items-start gap-3 relative">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-100 to-orange-50 flex items-center justify-center shrink-0 shadow-inner">
                <Receipt className="w-5 h-5 text-[#FF5C00]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Open · lopende maand</p>
                <p className="text-3xl font-black text-[#FF5C00] tracking-tight leading-none mt-1">
                  {currentMonthOpenCount}
                </p>
                <p className="text-[11px] text-slate-500 font-semibold mt-1.5 truncate">
                  {currentOpenTotal > 0 ? fmtMoney(currentOpenTotal, primaryCur) : 'Nog te innen'}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-[#FF5C00] font-bold">Bekijk facturen →</p>
          </button>

          {/* Huurders met achterstand */}
          <button onClick={() => window.dispatchEvent(new CustomEvent('go-tab', { detail: 'invoices' }))}
            data-testid="kpi-overdue"
            className={`text-left rounded-2xl p-5 relative overflow-hidden transition-shadow ${
              overdueCount > 0
                ? 'bg-gradient-to-br from-red-500 via-red-600 to-red-700 text-white border border-red-700 hover:shadow-[0_12px_28px_-8px_rgba(220,38,38,0.5)]'
                : 'bg-white border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] hover:border-emerald-200'
            }`}>
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-white/10 to-transparent rounded-full -translate-y-6 translate-x-6 pointer-events-none" />
            <div className="flex items-start gap-3 relative">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${
                overdueCount > 0 ? 'bg-white/20' : 'bg-gradient-to-br from-emerald-100 to-emerald-50'
              }`}>
                <AlertCircle className={`w-5 h-5 ${overdueCount > 0 ? 'text-white' : 'text-emerald-600'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-[10px] font-black uppercase tracking-widest ${overdueCount > 0 ? 'text-white/80' : 'text-slate-400'}`}>
                  Achterstand
                </p>
                <p className={`text-3xl font-black tracking-tight leading-none mt-1 ${overdueCount > 0 ? 'text-white' : 'text-slate-900'}`}>
                  {overdueCount}
                </p>
                <p className={`text-[11px] font-semibold mt-1.5 ${overdueCount > 0 ? 'text-white/90' : 'text-emerald-600'}`}>
                  {overdueCount > 0
                    ? `Huurder${overdueCount === 1 ? '' : 's'} te laat`
                    : 'Alles op tijd ✓'}
                </p>
              </div>
            </div>
            <p className={`mt-3 text-[11px] font-bold ${overdueCount > 0 ? 'text-white' : 'text-emerald-600'}`}>
              {overdueCount > 0 ? 'Direct opvolgen →' : 'Geen actie nodig'}
            </p>
          </button>
        </div>

        {/* ============ Snelle acties — 4 knoppen ============ */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] p-3.5 mb-5">
          <div className="flex items-center justify-between mb-2.5 px-1.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Snelle acties</p>
            <span className="text-[10px] text-slate-400 font-semibold">Klik om naar de sectie te springen</span>
          </div>
          <div className="grid grid-cols-4 gap-2.5">
            <button onClick={() => window.dispatchEvent(new CustomEvent('go-tab', { detail: 'invoices' }))}
              data-testid="quick-new-invoice"
              className="group flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-orange-50 to-orange-100/40 hover:from-orange-100 hover:to-orange-200/60 border border-orange-100 hover:border-orange-300 transition-all">
              <div className="w-10 h-10 rounded-lg bg-white/80 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <FileText className="w-5 h-5 text-[#FF5C00]" />
              </div>
              <div className="text-left">
                <p className="text-sm font-black text-slate-900">Nieuwe factuur</p>
                <p className="text-[10px] text-slate-500 font-semibold">Huurfactuur aanmaken</p>
              </div>
            </button>
            <button onClick={() => window.dispatchEvent(new CustomEvent('go-tab', { detail: 'tenants' }))}
              data-testid="quick-new-tenant"
              className="group flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/40 hover:from-amber-100 hover:to-amber-200/60 border border-amber-100 hover:border-amber-300 transition-all">
              <div className="w-10 h-10 rounded-lg bg-white/80 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <UserPlus className="w-5 h-5 text-amber-600" />
              </div>
              <div className="text-left">
                <p className="text-sm font-black text-slate-900">Nieuwe huurder</p>
                <p className="text-[10px] text-slate-500 font-semibold">Huurder toevoegen</p>
              </div>
            </button>
            <button onClick={() => window.dispatchEvent(new CustomEvent('go-tab', { detail: 'payments' }))}
              data-testid="quick-new-payment"
              className="group flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/40 hover:from-emerald-100 hover:to-emerald-200/60 border border-emerald-100 hover:border-emerald-300 transition-all">
              <div className="w-10 h-10 rounded-lg bg-white/80 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Banknote className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="text-left">
                <p className="text-sm font-black text-slate-900">Nieuwe betaling</p>
                <p className="text-[10px] text-slate-500 font-semibold">Kwitantie boeken</p>
              </div>
            </button>
            <button onClick={openKioskFn}
              data-testid="quick-kiosk-desktop"
              className="group flex items-center gap-3 p-3 rounded-xl text-white hover:shadow-[0_10px_24px_-8px_rgba(255,92,0,0.5)] transition-shadow border border-orange-600"
              style={{ background: 'linear-gradient(135deg, #FF8A3D 0%, #FF5C00 55%, #C74600 100%)' }}>
              <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <p className="text-sm font-black">Open Kiosk</p>
                <p className="text-[10px] text-white/80 font-semibold">Selfservice terminal</p>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* MOBIEL/TABLET — bestaande hero behouden + verborgen op lg */}
      <div className="lg:hidden">
        {/* Inkomsten + Openstaand — strakke witte card */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] p-4 mb-4 grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5 text-[#FF5C00]" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Inkomsten deze maand</p>
              <p className="text-xl font-black text-slate-900 tracking-tight mt-0.5 truncate" data-testid="income-total">
                {fmtMoney(incomeTotal, primaryCur)}
              </p>
              <p className="text-[11px] text-slate-400 font-semibold mt-0.5">{incomeCount} betalingen</p>
            </div>
          </div>
          <button onClick={() => window.dispatchEvent(new CustomEvent('go-tab', { detail: 'invoices' }))}
            data-testid="outstanding-cta"
            className="flex flex-col gap-2 text-left hover:opacity-90 transition-opacity group min-w-0 border-l border-slate-100 pl-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
              <Gauge className="w-5 h-5 text-[#FF5C00]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Openstaand saldo</p>
                <ChevronRight className="w-4 h-4 text-[#FF5C00] shrink-0" />
              </div>
              <p className={`text-xl font-black tracking-tight mt-0.5 truncate ${outstandingTotal > 0 ? 'text-[#FF5C00]' : 'text-slate-900'}`} data-testid="outstanding-total">
                {fmtMoney(outstandingTotal, primaryCur)}
              </p>
              <p className="text-[11px] text-slate-400 font-semibold mt-0.5">{outstandingCount} openstaand</p>
            </div>
          </button>
        </div>
      </div>

      {/* Betalingsregelingen + Laatste activiteiten — 2 koloms op desktop.
          Status Overzicht (donut + huurstatus) is vervangen door een
          scrollable lijst van actieve betalingsregelingen. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5 mb-4 lg:mb-5">
        <PaymentPlansList />

        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] p-4 lg:p-5" data-testid="recent-activity-card">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] lg:text-[11px] font-bold uppercase tracking-widest text-slate-400">Laatste Activiteiten</p>
            <button onClick={() => window.dispatchEvent(new CustomEvent('go-tab', { detail: 'payments' }))}
              data-testid="recent-view-all"
              className="text-xs font-bold text-[#FF5C00] hover:underline">Bekijk alles</button>
          </div>
          {recent.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              <Activity className="w-6 h-6 mx-auto mb-2 text-slate-300" />
              Nog geen activiteit
            </div>
          ) : (
            <div>
              {recent.map((item, idx) => <ActivityRow key={idx} item={item} />)}
            </div>
          )}
        </div>
      </div>

      {/* CTA's onderaan — alleen op mobiel/tablet (desktop heeft Quick Actions bar) */}
      <div className="grid sm:grid-cols-2 gap-3 lg:hidden">
        <button onClick={async () => {
            try { localStorage.setItem('pwa_preferred_role', 'kiosk'); } catch { /* noop */ }
            try {
              const activeCid = localStorage.getItem('active_company_id') || undefined;
              const { data } = await api.post('/auth/admin-to-kiosk', activeCid ? { company_id: activeCid } : {});
              if (data?.token) localStorage.setItem('kiosk_token', data.token);
              if (data?.company) localStorage.setItem('kiosk_company', JSON.stringify(data.company));
            } catch (e) {
              alert('Kon kiosk niet openen: ' + (e?.response?.data?.detail || e.message));
              return;
            }
            navigate('/kiosk');
          }} data-testid="quick-kiosk"
          className="bg-gradient-to-br from-[#FF8A3D] via-[#FF5C00] to-[#C74600] rounded-2xl p-5 text-white text-left hover:shadow-[0_18px_36px_-12px_rgba(255,92,0,0.45)] transition-shadow flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-base font-black">Open Kiosk</p>
            <p className="text-xs text-white/80">Selfservice terminal voor huurders</p>
          </div>
          <ChevronRight className="w-5 h-5 shrink-0" />
        </button>
        <button onClick={() => window.dispatchEvent(new CustomEvent('go-tab', { detail: 'payments' }))}
          data-testid="quick-payments"
          className="bg-white border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] rounded-2xl p-5 text-left hover:border-slate-200 transition-colors flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
            <Receipt className="w-5 h-5 text-[#FF5C00]" />
          </div>
          <div className="flex-1">
            <p className="text-base font-black text-slate-900">Betalingen bekijken</p>
            <p className="text-xs text-slate-500">Alle kwitanties en transacties</p>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-300" />
        </button>
      </div>
    </div>
  );
}

// ============== Apartments ==============
function ApartmentForm({ initial, onCancel, onSaved }) {
  const [data, setData] = useState(initial || { number: '', address: '', rent_amount: 0, currency: 'SRD', description: '', location_id: '', photo_url: '' });
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
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4 modal-sheet-auto" data-testid="apartment-modal">
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
          <PhotoUpload
            value={data.photo_url}
            onChange={(url) => setData({ ...data, photo_url: url })}
            label="Foto van het appartement"
            testId="apt-photo"
          />
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
  const [plateFor, setPlateFor] = useState(null);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const [a, t] = await Promise.all([api.get('/apartments'), api.get('/tenants')]);
    setItems(a.data); setTenants(t.data);
  }, []);
  useEffect(() => { load(); }, [load]);
  // Stille polling — lijst wordt in place vervangen, geen scroll-reset.
  useAutoRefresh(load, { interval: 15000, enabled: !creating && !editing && !assignFor && !shellyFor && !plateFor });

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

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.length === 0 && (
          <div className="col-span-full bg-white rounded-2xl border border-dashed border-slate-200 p-10 text-center">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-semibold">Nog geen appartementen.</p>
            <p className="text-sm text-slate-400 mt-1">Voeg uw eerste appartement toe.</p>
          </div>
        )}
        {filtered.map((a) => (
          <div key={a.id} data-testid={`apt-card-${a.id}`}
            className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] overflow-hidden hover:border-slate-200 transition-colors flex flex-col">
            {a.photo_url && (
              <div className="relative w-full h-32 bg-slate-100 shrink-0">
                <img src={a.photo_url} alt={a.number} className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }} />
                <span className={`absolute top-2 right-2 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ring-2 ring-white ${
                  a.status === 'occupied' ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-white'
                }`}>
                  {a.status === 'occupied' ? 'Bezet' : 'Vacant'}
                </span>
              </div>
            )}
            <div className="p-4 flex-1 flex flex-col">
            <div className="flex items-start justify-between mb-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#FF5C00]">Appt. {a.number}</p>
                <p className="text-sm font-semibold text-slate-900 mt-0.5 truncate">{a.address || '—'}</p>
              </div>
              {!a.photo_url && (
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${
                  a.status === 'occupied' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {a.status === 'occupied' ? 'Bezet' : 'Vacant'}
                </span>
              )}
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Maandhuur</p>
              <p className="text-xl font-black text-slate-900 tracking-tight mt-0.5">{fmtMoney(a.rent_amount, a.currency)}</p>
            </div>
            {a.tenant_name ? (
              <div className="flex items-center justify-between bg-slate-50 rounded-xl p-3 mb-3 border border-slate-100">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Huurder</p>
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
              <a href={`${process.env.REACT_APP_BACKEND_URL}/api/apartments/${a.id}/kiosk-sticker.pdf`}
                target="_blank" rel="noreferrer"
                data-testid={`apt-qr-${a.id}`}
                title="Standaard QR-sticker (oranje) voor naast de voordeur"
                className="w-10 h-10 rounded-xl bg-orange-50 hover:bg-orange-100 text-[#FF5C00] flex items-center justify-center">
                <QrCode className="w-4 h-4" />
              </a>
              {a.tenant_id && (
                <button type="button" onClick={() => setPlateFor(a)}
                  data-testid={`apt-plate-${a.id}`}
                  title="Luxe gouden plaat per huurder (kies formaat)"
                  className="w-10 h-10 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 flex items-center justify-center">
                  <span className="text-base font-black">★</span>
                </button>
              )}
              <button onClick={() => setShellyFor(a)} data-testid={`apt-shelly-${a.id}`}
                title={a.shelly?.device_id ? `Stroom: ${a.shelly.label || a.shelly.device_id}` : 'Stroom koppelen'}
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  a.shelly?.device_id
                    ? 'bg-orange-50 text-[#FF5C00] hover:bg-orange-100'
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
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <ApartmentForm initial={editing} onCancel={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); load(); }} />
      )}

      {assignFor && (
        <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4">
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
      {plateFor && (
        <PlateSizeModal apt={plateFor} onClose={() => setPlateFor(null)} />
      )}
    </div>
  );
}

function PlateSizeModal({ apt, onClose }) {
  const tenantId = apt.tenant_id;
  const base = process.env.REACT_APP_BACKEND_URL;
  const SIZES = [
    { id: 'small',  label: 'Klein',   sub: '200 × 133 mm',  hint: 'A5-landschap, voor sticker' },
    { id: 'medium', label: 'Normaal', sub: '300 × 200 mm',  hint: 'A4-landschap, standaard' },
    { id: 'large',  label: 'Groot',   sub: '400 × 267 mm',  hint: 'A3-landschap, voordeur-plaat' },
  ];
  const open = (size) => {
    window.open(
      `${base}/api/tenants/${tenantId}/qr-plate.pdf?size=${size}`,
      '_blank', 'noopener,noreferrer'
    );
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose} data-testid="plate-size-modal">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Gouden plaat formaat</h3>
            <p className="text-xs text-slate-500 mt-0.5">Huis {apt.number} — kies een afdrukformaat</p>
          </div>
          <button onClick={onClose} data-testid="plate-size-close"
            className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 font-bold">
            ✕
          </button>
        </div>
        <div className="space-y-2">
          {SIZES.map((s) => (
            <button key={s.id} type="button" onClick={() => open(s.id)}
              data-testid={`plate-size-${s.id}`}
              className="w-full text-left p-3 rounded-xl border-2 border-slate-200 hover:border-amber-500 hover:bg-amber-50 transition flex items-center justify-between gap-3">
              <div>
                <div className="font-extrabold text-slate-900 text-sm">{s.label}</div>
                <div className="text-[11px] text-slate-500">{s.hint}</div>
              </div>
              <div className="text-xs font-mono font-bold text-amber-700">{s.sub}</div>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
          Elke download opent in een nieuw tabblad. De PDF heeft exact 3:2 verhouding voor optimaal afdrukken zonder vervorming.
        </p>
      </div>
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
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4 modal-sheet-auto">
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
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4 modal-sheet-auto" data-testid="tenant-modal">
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
  const [savedPin, setSavedPin] = useState(null);
  const kioskUrl = (() => {
    try {
      const slug = localStorage.getItem('pwa_company_slug') || '';
      const origin = window.location.origin;
      return slug ? `${origin}/kiosk/huurder?c=${slug}` : `${origin}/kiosk/huurder`;
    } catch { return '/kiosk/huurder'; }
  })();
  const save = async () => {
    setErr('');
    if (!/^\d{4}$/.test(pin)) { setErr('PIN moet 4 cijfers zijn'); return; }
    if (pin !== confirm) { setErr('PINs komen niet overeen'); return; }
    setLoading(true);
    try {
      await api.post('/auth/tenant-set-pin', { tenant_id: tenant.id, pin });
      setSavedPin(pin);
    } catch (e) { setErr(formatError(e)); }
    finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4 modal-sheet-auto" data-testid="tenant-pin-modal">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 sm:p-8 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-black text-slate-900">
            {savedPin ? 'PIN ingesteld' : `Portal PIN voor ${tenant.name}`}
          </h3>
          <button onClick={onCancel} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        {!savedPin ? (
          <>
            <p className="text-sm text-slate-500 mb-4">
              Stel een 4-cijferige PIN in. <b>{tenant.name}</b> kan hiermee inloggen op de Huurder Kiosk
              (<code className="bg-slate-100 px-1 rounded text-xs">/kiosk/huurder</code>) of het huurderportaal
              (<code className="bg-slate-100 px-1 rounded text-xs">/huurder</code>).
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
          </>
        ) : (
          <>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 text-center">
              <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-900">PIN <span className="font-black text-[#FF5C00]">{savedPin}</span> is ingesteld voor {tenant.name}.</p>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Huurder kan nu inloggen via</p>
            <div className="bg-slate-50 rounded-xl p-3 mb-3 flex items-center gap-2 break-all">
              <code className="text-xs text-slate-700 flex-1">{kioskUrl}</code>
              <button onClick={() => { try { navigator.clipboard.writeText(kioskUrl); } catch { /* ignore */ } }}
                data-testid="tenant-pin-copy-link"
                className="text-xs font-bold text-[#FF5C00] hover:underline shrink-0">Kopieer</button>
            </div>
            <div className="flex gap-2">
              <a href={kioskUrl} target="_blank" rel="noreferrer"
                data-testid="tenant-pin-open-kiosk"
                className="flex-1 h-11 rounded-xl bg-[#FF5C00] hover:bg-[#E05200] text-white font-bold inline-flex items-center justify-center gap-2 text-sm">
                Open Huurder Kiosk
              </a>
              <button onClick={onSaved} className="flex-1 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm">
                Sluiten
              </button>
            </div>
          </>
        )}
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
  // Stille polling — lijst wordt in place vervangen, geen scroll-reset.
  useAutoRefresh(load, { interval: 15000, enabled: !creating && !editing && !pinFor });
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
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06)] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-semibold">Geen huurders gevonden.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50/70 text-left">
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="px-5 py-3">Naam</th>
                <th className="px-5 py-3 hidden md:table-cell">Contact</th>
                <th className="px-5 py-3">Appartement</th>
                <th className="px-5 py-3 hidden md:table-cell">Maandhuur</th>
                <th className="px-5 py-3 text-right">Acties</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} data-testid={`tenant-row-${t.id}`} className="border-t border-slate-100 hover:bg-slate-50/60">
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
                  <td className="px-5 py-4 hidden md:table-cell text-slate-900 font-bold">
                    {t.rent_amount ? fmtMoney(t.rent_amount, t.currency) : '—'}
                  </td>
                  <td className="px-5 py-4 text-right space-x-1">
                    <button onClick={() => setPinFor(t)} data-testid={`tenant-pin-${t.id}`}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-orange-50 hover:bg-orange-100 text-[#FF5C00]" title="Portal PIN instellen">
                      <KeySquare className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => openAuthedPdf(`/tenants/${t.id}/portal-poster.pdf`, { filename: `huurportaal-${t.name || t.id}.pdf` })}
                      data-testid={`tenant-poster-${t.id}`}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700" title="Print A6 huurportaal-poster">
                      <Printer className="w-3.5 h-3.5" />
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


// ============== Settings (kiosk PIN) ==============
function Settings() {
  // Replaced by `SettingsPage` from ./admin/Settings.jsx — kept as a no-op for safety.
  return null;
}

function DesktopTopBar({ user, activeCompany, tab, tabs }) {
  // Moderne desktop topbar — toont de actieve tab als "page title" links
  // (vervangt de oude H1 in de content) + Live + actie-iconen rechts.
  if (user?.role === 'superadmin') return null;
  const current = tabs.find((t) => t.id === tab);
  return (
    <div className="hidden md:flex items-center justify-between gap-4 px-6 lg:px-8 pt-5 lg:pt-6 pb-2 sticky top-0 z-20 bg-[#F7F8FA]/90 backdrop-blur-md"
      data-testid="desktop-top-bar">
      <div className="min-w-0 flex items-center gap-3">
        {current?.icon && (
          <div className="w-9 h-9 rounded-xl bg-white border border-orange-100 flex items-center justify-center text-[#FF5C00] shadow-sm shrink-0">
            <current.icon className="w-4 h-4" strokeWidth={2.4} />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-slate-400">
            {activeCompany?.name || 'SuriRent'}
          </p>
          <p className="text-xl font-black tracking-tight text-slate-900 leading-tight truncate">
            {current?.label || 'Dashboard'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <GlobalSearch variant="topbar" />
        <ApartmentsBell />
        <PendingApprovalBell />
        <OverdueBell />
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { user, logout, activeCompany } = useAuth();
  const tabs = getTabsFor(user);
  // BILLING BLOCKED — als de backend ons een 402 stuurt, tonen we een
  // full-screen blok scherm. State wordt gevoed door de api.js interceptor
  // (custom event 'billing-blocked') en localStorage zodat de status
  // persists over re-renders.
  const [billingBlocked, setBillingBlocked] = useState(() => {
    try {
      const status = localStorage.getItem('billing_blocked_status');
      if (status && user?.role !== 'superadmin') {
        return {
          status,
          message: localStorage.getItem('billing_blocked_message') || '',
        };
      }
    } catch { /* ignore */ }
    return null;
  });
  useEffect(() => {
    const onBlocked = (e) => {
      if (user?.role === 'superadmin') return;
      setBillingBlocked({
        status: e?.detail?.billing_status || 'cancelled',
        message: e?.detail?.message || '',
      });
    };
    window.addEventListener('billing-blocked', onBlocked);
    return () => window.removeEventListener('billing-blocked', onBlocked);
  }, [user?.role]);
  // Clear blok bij superadmin / impersonatie zodat zij niet vastlopen.
  useEffect(() => {
    if (user?.role === 'superadmin' || user?.original_user_id) {
      try {
        localStorage.removeItem('billing_blocked_status');
        localStorage.removeItem('billing_blocked_message');
      } catch { /* ignore */ }
      setBillingBlocked(null);
    }
  }, [user?.role, user?.original_user_id]);
  // Mobiel landt direct op Betalingen (geen Overzicht meer) — tablet/desktop
  // blijft op Overzicht starten. We detecteren op basis van window-breedte
  // bij eerste render zodat de PWA-launch direct in de juiste tab opent.
  const [tab, setTab] = useState(() => {
    if (user?.role === 'superadmin') return 'saas_overview';
    try {
      if (typeof window !== 'undefined' && window.innerWidth < 768) return 'payments';
    } catch { /* SSR-safe noop */ }
    return 'overview';
  });
  // Filter de Overzicht-tab uit voor mobile MobileSheet zodat hij ook niet
  // in het "+"-menu opduikt. Desktop sidebar laat hem wel staan.
  const sheetTabs = tabs.filter((t) => t.id !== 'overview');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState(null);
  // Auto-open Setup Wizard als bottom-sheet / modal voor nieuwe bedrijven.
  // Activatie: setup-status laat zien dat <2 van de 5 stappen klaar zijn EN
  // de admin heeft de wizard nog niet bewust gesloten voor dit bedrijf.
  const [wizardOpen, setWizardOpen] = useState(false);
  const navigate = useBrandedNavigate();
  const location = useLocation();
  const { count: badgeCount } = useBadge();

  // Activeer de "ding-ding" sound bij binnenkomende pending-approval pushes.
  // Idempotent — meerdere mounts registreren maar één listener.
  useEffect(() => { installPendingApprovalDingListener(); }, []);

  // Foreground polling voor pending payments — werkt OOK in iOS PWA
  // Guided Access mode waar system-push geblokkeerd is. Pollt elke 5s,
  // toast + ding-ding bij elke nieuwe pending betaling.
  useForegroundPendingNotify({ enabled: true });

  // Dagelijkse briefing — toont 1× per dag tussen 06:00-12:00 een modal
  // met overdue overzicht + nieuwe activiteit van vandaag.
  const { briefing, dismiss: dismissBriefing } = useMorningBriefing({ enabled: true });

  // URL → tab sync. Bij paden zoals /admin/invoices, /admin/payments etc.
  // wordt de tab automatisch ingesteld. Belangrijk voor:
  //  • Notification click handlers in de service worker (sw.js navigeert
  //    naar /admin/invoices of /admin/notifications)
  //  • Bookmarks / shared links
  useEffect(() => {
    const path = location.pathname.replace(/\/+$/, '');
    const seg = path.split('/').filter(Boolean);
    if (seg[0] === 'admin' && seg[1]) {
      const wanted = seg[1];
      if (tabs.find((t) => t.id === wanted) && wanted !== tab) {
        setTab(wanted);
      }
    }
  }, [location.pathname, tabs, tab]);

  // tab → URL sync (zonder rerender storm). Update browser URL bij tab wissel.
  const handleSetTab = (id) => {
    setTab(id);
    const target = `/admin/${id}`;
    if (location.pathname !== target) {
      navigate(target, { replace: false });
    }
  };
  useEffect(() => { /* document.title centraal beheerd via usePwaManifest() */ }, []);
  useEffect(() => {
    const handler = (e) => {
      const id = e.detail;
      setTab(id);
      const target = `/admin/${id}`;
      if (window.location.pathname !== target) navigate(target);
    };
    window.addEventListener('go-tab', handler);
    return () => window.removeEventListener('go-tab', handler);
  }, [navigate]);
  // Android PWA: zorg dat de status-bar wit is (matcht de witte admin
  // mobile-header). Op iOS doet status-bar-style `black-translucent` zijn
  // werk en lift hier mee. Bij unmount zet niets terug — KioskLayout
  // overschrijft 'm zelf.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]:not([media])')
      || document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#ffffff');
  }, []);

  // Auto-open de Setup Wizard sheet voor nieuwe bedrijven. Draait alleen
  // voor gewone admins (niet superadmin) en alleen wanneer de admin de
  // wizard nog niet eerder bewust gesloten heeft voor dit bedrijf.
  useEffect(() => {
    if (!user || user.role === 'superadmin') return;
    const cid = user.company_id;
    if (!cid) return;
    let cancelled = false;
    (async () => {
      try {
        const dismissedKey = `setup_wizard_dismissed_${cid}`;
        if (localStorage.getItem(dismissedKey) === '1') return;
        const { data } = await api.get('/companies/me/setup-status');
        // Open de wizard alleen als de basis-setup nog niet (vrijwel) klaar is.
        // 2 of meer van de 5 stappen klaar → admin heeft al actief data toegevoegd.
        const completed = data?.completed ?? 0;
        if (cancelled) return;
        if (completed < 2) {
          setWizardOpen(true);
        }
      } catch { /* network hiccup — laat wizard met rust */ }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const doLogout = async () => {
    const wasDemo = (() => { try { return localStorage.getItem('is_demo_session') === '1'; } catch { return false; } })();
    if (wasDemo) {
      // Voor demo-gebruikers: navigeer eerst naar marketing landing
      // (via hard nav, anders fired <Protected> nog een <Navigate to="/demo/login"/>
      // omdat user pas null wordt NA de logout() call). Hard nav reset
      // sowieso de app state — schoner einde van demo-sessie.
      await logout();
      window.location.replace('/');
      return;
    }
    await logout();
    navigate('/login');
  };

  // Toon billing-blocked vol-scherm vóór ALLE andere UI. Voorkomt dat de
  // gebruiker iets ziet/aanraakt van een omgeving waar hij geen toegang
  // meer toe heeft. Superadmin + impersonators worden hierboven al
  // uitgesloten.
  if (billingBlocked && user && user.role !== 'superadmin' && !user.original_user_id) {
    return <BillingBlockedScreen status={billingBlocked.status} message={billingBlocked.message} />;
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex">
      <Sidebar active={tab} onChange={handleSetTab} onLogout={doLogout}
        user={user} tabs={tabs} badgeCount={badgeCount} activeCompany={activeCompany} />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileTopLogo user={user} activeCompany={activeCompany} />
        <DesktopTopBar user={user} activeCompany={activeCompany} tab={tab} tabs={tabs} />
        <ImpersonationBanner />
        <TrialBanner />
        <main className="flex-1 p-5 md:px-6 md:py-5 lg:px-8 lg:pt-3 pb-32 md:pb-8 w-full">
          {tab === 'companies' && <Companies />}
          {tab === 'subscriptions' && <Subscriptions />}
          {tab === 'saas_overview' && <SaasOverview />}
          {tab === 'saas_pending' && <Subscriptions viewMode="pending" />}
          {tab === 'saas_invoices' && <Subscriptions viewMode="invoices" />}
          {tab === 'saas_payments' && <Subscriptions viewMode="payments" />}
          {tab === 'plans' && <PlansAdmin />}
          {tab === 'saas_settings' && <SaasSettings />}
          {tab === 'landing_editor' && <LandingEditor />}
          {tab === 'setup_wizard' && (
            <SetupWizard onJumpTo={(target) => {
              if (target?.section) setSettingsSection(target.section);
              if (target?.tab) setTab(target.tab);
            }} />
          )}
          {tab === 'business_info' && <BusinessInfo />}
          {tab === 'branding' && <Branding />}
          {tab === 'overview' && <Overview />}
          {tab === 'locations' && <Locations />}
          {tab === 'apartments' && <Apartments />}
          {tab === 'tenants' && <Tenants />}
          {tab === 'contracts' && <Contracts />}
          {tab === 'payments' && <Payments />}
          {tab === 'invoices' && <Invoices />}
          {tab === 'payment_plans' && <PaymentPlans />}
          {tab === 'deposits' && <Deposits />}
          {tab === 'maintenance' && <Maintenance />}
          {tab === 'kasgeld' && <Kasgeld />}
          {tab === 'employees' && <Employees />}
          {tab === 'notifications' && <Notifications />}
          {tab === 'mijn_abonnement' && <MijnAbonnement />}
          {tab === 'mijn_landing' && <MijnLanding />}
          {tab === 'backup_restore' && <BackupRestore />}
          {tab === 'settings' && <SettingsPage initialSection={settingsSection} />}
        </main>
      </div>
      <MobileTabBar active={tab} onChange={handleSetTab} tabs={tabs} user={user}
        onOpenMenu={() => setDrawerOpen(true)} badgeCount={badgeCount} />
      <MobileSheet open={drawerOpen} onClose={() => setDrawerOpen(false)}
        active={tab} onChange={handleSetTab} onLogout={doLogout}
        user={user} tabs={sheetTabs} activeCompany={activeCompany} badgeCount={badgeCount} />
      <MorningBriefingModal briefing={briefing} onClose={dismissBriefing} />
      <SetupWizardSheet
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        companyId={user?.company_id}
      />
    </div>
  );
}
