import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useBadge } from '../../lib/pwa';
import { useAutoRefresh } from '../../lib/auto-refresh';
import {
  Building2, Users, Receipt, LayoutDashboard, LogOut, Plus, Trash2, Pencil,
  X, Check, Loader2, Search, Home, Banknote, KeySquare, ChevronRight, Wallet,
  FileText, ShieldCheck, Wrench, FileSignature, Bell, Briefcase, Mail,
  Zap, Power, Menu, MoreHorizontal, MapPin, Crown, Paintbrush, Palette,
  Gauge, Activity, Clock as ClockIcon, Monitor,
} from 'lucide-react';
import { api, formatError, fmtMoney, MONTHS_NL } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { EmailDialog, SendDialog } from '../../components/EmailDialog';
import Contracts from './admin/Contracts';
import Invoices from './admin/Invoices';
import Payments from './admin/Payments';
import Employees from './admin/Employees';
import Deposits from './admin/Deposits';
import Maintenance from './admin/Maintenance';
import Kasgeld from './admin/Kasgeld';
import Notifications from './admin/Notifications';
import Companies from './admin/Companies';
import SettingsPage from './admin/Settings';
import Locations from './admin/Locations';
import Subscriptions from './admin/Subscriptions';
import SaasSettings from './admin/SaasSettings';
import LandingEditor from './admin/LandingEditor';
import Branding from './admin/Branding';
import MyUrlCard from '../../components/MyUrlCard';
import MijnAbonnement from './admin/MijnAbonnement';
import TrialBanner from '../../components/TrialBanner';
import ImpersonationBanner from '../../components/ImpersonationBanner';
import LiveIndicator from '../../components/LiveIndicator';
import OverdueBell from '../../components/OverdueBell';
import ApartmentsBell from '../../components/ApartmentsBell';
import QuickPayButton from '../../components/QuickPayButton';

const BASE_TABS = [
  { id: 'overview', label: 'Overzicht', icon: LayoutDashboard },
  { id: 'locations', label: 'Locaties', icon: MapPin },
  { id: 'apartments', label: 'Appartementen', icon: Building2 },
  { id: 'tenants', label: 'Huurders', icon: Users },
  { id: 'contracts', label: 'Contracten', icon: FileSignature },
  { id: 'payments', label: 'Betalingen', icon: Receipt },
  { id: 'invoices', label: 'Facturen', icon: FileText },
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

function Sidebar({ active, onChange, onLogout, user, tabs, badgeCount }) {
  return (
    <aside className="hidden xl:flex flex-col w-64 bg-white border-r border-orange-100 p-5">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] p-1.5 shadow-[0_8px_20px_-5px_rgba(255,92,0,0.55)]">
          <img src="/kiosk-icons/kiosk-512.png" alt="SuriRent" className="w-full h-full object-contain" />
        </div>
        <div>
          <p className="text-base font-black text-slate-900 tracking-tight">SuriRent</p>
          <p className="text-[10px] text-[#FF5C00] font-bold tracking-[0.2em] uppercase">Beheer</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.id;
          const showBadge = t.id === 'notifications' && badgeCount > 0;
          return (
            <button key={t.id} onClick={() => onChange(t.id)}
              data-testid={`tab-${t.id}`}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                isActive ? 'bg-[#FF5C00] text-white shadow-[0_8px_20px_-5px_rgba(255,92,0,0.55)]'
                  : 'text-slate-600 hover:bg-orange-50 hover:text-[#FF5C00]'
              }`}>
              <span className="relative shrink-0">
                <Icon className="w-4 h-4" />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center"
                    data-testid="sidebar-badge">
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </span>
                )}
              </span>
              {t.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-orange-100 pt-3 mt-3 space-y-1">
        <div className="flex items-center justify-between gap-2 px-3">
          <p className="text-xs text-slate-500 truncate">{user?.email}</p>
          <LiveIndicator compact />
        </div>
        <button onClick={onLogout} data-testid="logout-btn"
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all">
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
  // Minimalistische topbar: brand-logo links + bedrijfsnaam + notificatie-bell
  // rechtsboven (achterstanden). Geen menu-knop, geen Kiosk-knop, geen Live
  // indicator — die zitten in de "+"-sheet. In landscape (telefoon zijwaarts)
  // schalen we de top bar omlaag zodat er voldoende ruimte voor content blijft.
  const fullName = activeCompany?.name || (user?.role === 'superadmin' ? 'Alle bedrijven' : 'SuriRent');
  const [namePart1, namePart2] = splitNameHalf(fullName);
  return (
    <header className="xl:hidden sticky top-0 z-30 bg-[#FFF7F0]/85 backdrop-blur-md"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      data-testid="mobile-top-logo">
      <div className="px-4 py-3 landscape:py-1.5 flex items-center gap-3 landscape:gap-2">
        <div className="w-12 h-12 landscape:w-9 landscape:h-9 rounded-2xl landscape:rounded-xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] p-1.5 landscape:p-1 shadow-[0_10px_22px_-6px_rgba(255,92,0,0.55)] shrink-0">
          <img src="/kiosk-icons/kiosk-512.png" alt="SuriRent" className="w-full h-full object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg landscape:text-sm font-black tracking-tight leading-tight truncate" data-testid="mobile-top-name">
            <span className="text-slate-900">{namePart1}</span>
            {namePart2 && (
              <>
                {namePart1 ? ' ' : ''}
                <span className="text-[#FF5C00]">{namePart2}</span>
              </>
            )}
          </p>
          <p className="text-[10px] landscape:text-[9px] text-slate-400 font-bold tracking-[0.18em] uppercase truncate">
            {user?.role === 'superadmin' ? 'Superadmin' : 'Beheer'}{activeCompany?.plan ? ` · ${activeCompany.plan}` : ''}
          </p>
        </div>
        {/* Rechtsboven — kleine bel-achtige actie-iconen.
            Alleen voor admin/owner (superadmin krijgt geen bedrijfsspecifieke data). */}
        {user?.role !== 'superadmin' && (
          <div className="flex items-center gap-2 landscape:gap-1.5 shrink-0">
            <QuickPayButton />
            <ApartmentsBell />
            <OverdueBell />
          </div>
        )}
      </div>
    </header>
  );
}

function MobileSheet({ open, onClose, active, onChange, onLogout, user, tabs, activeCompany, badgeCount }) {
  const navigate = useNavigate();
  if (!open) return null;
  return (
    <div className="xl:hidden fixed inset-0 z-50" data-testid="mobile-sheet">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <aside
        className="absolute left-0 right-0 bottom-0 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[480px] bg-white rounded-t-3xl shadow-[0_-24px_60px_-12px_rgba(15,23,42,0.35)] flex flex-col animate-slide-up overflow-hidden"
        style={{ maxHeight: '85dvh' }}
      >
        {/* Handle / grip */}
        <div className="pt-2 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        {/* HEADER — company name + Live + Kiosk-shortcut + close */}
        <div className="px-5 pt-2 pb-3 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] p-1.5 shadow-md shrink-0">
            <img src="/kiosk-icons/kiosk-512.png" alt="SuriRent" className="w-full h-full object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-base font-black text-slate-900 leading-tight truncate">
                {activeCompany?.name || (user?.role === 'superadmin' ? 'Alle bedrijven' : 'SuriRent')}
              </p>
              <LiveIndicator compact />
            </div>
            <p className="text-[10px] text-[#FF5C00] font-bold tracking-[0.18em] uppercase truncate">
              {user?.role === 'superadmin' ? 'Superadmin' : 'Beheer'}{activeCompany?.plan ? ` · ${activeCompany.plan}` : ''}
            </p>
          </div>
          <button onClick={onClose} data-testid="mobile-sheet-close"
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center shrink-0">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        {/* QUICK-ACTIONS */}
        {user?.role !== 'superadmin' && (
          <div className="px-5 pb-3">
            <button
              onClick={() => {
                try { localStorage.setItem('pwa_preferred_role', 'kiosk'); } catch { /* noop */ }
                onClose();
                navigate('/kiosk');
              }}
              data-testid="mobile-sheet-kiosk"
              className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-2xl bg-gradient-to-br from-[#FF8A3D] to-[#FF5C00] text-white font-bold text-sm shadow-[0_10px_24px_-8px_rgba(255,92,0,0.6)] active:scale-95 transition"
            >
              <Monitor className="w-4 h-4" /> Open Kiosk
            </button>
          </div>
        )}

        {/* TABS — alle modules in een grid */}
        <div className="flex-1 overflow-y-auto px-3 pb-2">
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {tabs.map((t) => {
              const Icon = t.icon;
              const isActive = active === t.id;
              const showBadge = t.id === 'notifications' && badgeCount > 0;
              return (
                <button
                  key={t.id}
                  onClick={() => { onChange(t.id); onClose(); }}
                  data-testid={`tab-sheet-${t.id}`}
                  className={`relative flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl text-xs font-bold transition-all active:scale-95 ${
                    isActive
                      ? 'bg-gradient-to-br from-[#FF8A3D] to-[#FF5C00] text-white shadow-[0_8px_20px_-5px_rgba(255,92,0,0.55)]'
                      : 'bg-slate-50 text-slate-700 hover:bg-orange-50 hover:text-[#FF5C00]'
                  }`}
                >
                  <span className="relative">
                    <Icon className={`w-5 h-5 ${isActive ? '' : 'text-slate-500'}`} strokeWidth={isActive ? 2.4 : 2} />
                    {showBadge && (
                      <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center ring-2 ring-white">
                        {badgeCount > 9 ? '9+' : badgeCount}
                      </span>
                    )}
                  </span>
                  <span className="text-center leading-tight text-[11px]">{t.label}</span>
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
    const Icon = t.icon;
    const isActive = active === t.id;
    const showBadge = t.id === 'notifications' && badgeCount > 0;
    return (
      <button
        key={t.id}
        onClick={() => onChange(t.id)}
        data-testid={`tab-mobile-${t.id}`}
        className="relative flex flex-col items-center justify-end gap-1 landscape:gap-0.5 pt-2 pb-1 landscape:pt-1 landscape:pb-0.5 rounded-xl active:scale-95 transition-all"
      >
        {isActive && (
          <span
            aria-hidden
            className="absolute inset-x-2 top-1 bottom-1 rounded-xl bg-gradient-to-b from-orange-50 to-orange-100/70 shadow-[inset_0_0_0_1px_rgba(255,92,0,0.18)]"
          />
        )}
        <span className="relative">
          <Icon
            className={`transition-all ${isActive ? 'w-[22px] h-[22px] text-[#FF5C00]' : 'w-[20px] h-[20px] text-slate-500'}`}
            strokeWidth={isActive ? 2.4 : 2}
          />
          {showBadge && (
            <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center shadow-[0_2px_6px_-1px_rgba(239,68,68,0.55)] ring-2 ring-white">
              {badgeCount > 9 ? '9+' : badgeCount}
            </span>
          )}
        </span>
        <span
          className={`relative text-[10px] leading-tight tracking-wide truncate max-w-[68px] transition-all ${
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
      className="xl:hidden fixed bottom-0 inset-x-0 z-40 bg-white/90 backdrop-blur-xl border-t border-orange-100/70 shadow-[0_-12px_36px_-12px_rgba(15,23,42,0.18)]"
      data-testid="mobile-tab-bar"
    >
      {/* Brand accent line top-center */}
      <div aria-hidden className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-[3px] rounded-full bg-gradient-to-r from-[#FF8A3D] to-[#FF5C00] opacity-90" />

      <div
        className="grid grid-cols-5 gap-0.5 px-1.5 pt-3 landscape:pt-1"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}
      >
        {left.map(renderTab)}

        {/* Center FAB — opent het volledige menu. Compact (44×44), oranje
            gradient, met witte ring zodat hij visueel "drijft" boven de bar. */}
        <div className="flex items-end justify-center pb-0.5">
          <button
            onClick={onOpenMenu}
            data-testid="mobile-fab-menu"
            aria-label="Open menu"
            className="relative -mt-4 landscape:-mt-2 w-11 h-11 landscape:w-9 landscape:h-9 rounded-full bg-gradient-to-br from-[#FF8A3D] to-[#FF5C00] text-white flex items-center justify-center shadow-[0_8px_20px_-6px_rgba(255,92,0,0.65)] ring-[3px] ring-white active:scale-95 transition-all"
          >
            <Plus className="w-5 h-5 landscape:w-4 landscape:h-4" strokeWidth={2.8} />
            {badgeCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center ring-2 ring-white"
                data-testid="mobile-fab-badge">
                {badgeCount > 9 ? '9+' : badgeCount}
              </span>
            )}
          </button>
        </div>

        {right.map(renderTab)}
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

function Overview() {
  const [stats, setStats] = useState(null);
  const navigate = useNavigate();
  const reload = useCallback(() => {
    api.get('/admin/stats').then((r) => setStats(r.data)).catch(() => { /* keep last */ });
  }, []);
  useEffect(() => { reload(); }, [reload]);
  useAutoRefresh(reload, 10000);
  if (!stats) return <div className="text-slate-400 text-sm">Laden...</div>;

  const cards = [
    { label: 'Appartementen', value: stats.apartments_total, icon: Building2, accent: 'bg-orange-50 text-[#FF5C00]' },
    { label: 'Bezet', value: stats.apartments_occupied, icon: Home, accent: 'bg-emerald-50 text-emerald-600' },
    { label: 'Vacant', value: stats.apartments_vacant, icon: KeySquare, accent: 'bg-slate-50 text-slate-600' },
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

  return (
    <div>
      <PageHeader title="Overzicht" subtitle="Snelle blik op uw vastgoedportefeuille" />

      {/* Mobile/tablet: combined "Portfolio in één oogopslag" card with 4 mini-stats */}
      <div className="lg:hidden bg-white rounded-2xl border border-orange-100 p-5 mb-5" data-testid="portfolio-card-mobile">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-4">Portfolio in één oogopslag</p>
        <div className="grid grid-cols-4 divide-x divide-slate-100">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="px-2 first:pl-0 last:pr-0 text-center">
                <div className={`w-12 h-12 rounded-full ${c.accent} flex items-center justify-center mx-auto mb-3`}>
                  <Icon className="w-5 h-5" />
                </div>
                <p className="text-2xl font-black text-slate-900 tracking-tight" data-testid={`stat-m-${c.label.toLowerCase()}`}>{c.value}</p>
                <p className="text-[11px] text-slate-500 font-semibold mt-1">{c.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Desktop: 4 separate stat-kaarten */}
      <div className="hidden lg:grid grid-cols-4 gap-4 mb-6">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="bg-white rounded-2xl border border-orange-100 p-6 hover:border-[#FF5C00]/30 transition-colors">
              <div className={`w-11 h-11 rounded-xl ${c.accent} flex items-center justify-center mb-4`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-4xl font-black text-slate-900 tracking-tight" data-testid={`stat-${c.label.toLowerCase()}`}>{c.value}</p>
              <p className="text-sm text-slate-500 font-semibold mt-1">{c.label}</p>
            </div>
          );
        })}
      </div>

      {/* Inkomsten + Openstaand — oranje getinte hero op mobile, wit op desktop */}
      <div className="rounded-2xl border border-orange-200 lg:border-orange-100 p-5 lg:p-6 mb-5 lg:mb-6 grid grid-cols-2 gap-3 lg:gap-6 bg-gradient-to-br from-orange-50 to-orange-100/40 lg:from-white lg:to-white lg:bg-white">
        <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-4 min-w-0">
          <div className="w-10 h-10 lg:w-14 lg:h-14 rounded-xl lg:rounded-2xl bg-white lg:bg-orange-50 flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5 lg:w-7 lg:h-7 text-[#FF5C00]" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] lg:text-[11px] font-bold uppercase tracking-widest text-slate-500">Inkomsten deze maand</p>
            <p className="text-xl lg:text-3xl font-black text-slate-900 tracking-tight mt-1 truncate" data-testid="income-total">
              {fmtMoney(incomeTotal, primaryCur)}
            </p>
            <p className="text-[11px] lg:text-xs text-slate-500 lg:text-slate-400 mt-1">{incomeCount} betalingen</p>
          </div>
        </div>
        <button onClick={() => window.dispatchEvent(new CustomEvent('go-tab', { detail: 'invoices' }))}
          data-testid="outstanding-cta"
          className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-4 text-left hover:opacity-90 transition-opacity group min-w-0">
          <div className="w-10 h-10 lg:w-14 lg:h-14 rounded-xl lg:rounded-2xl bg-white lg:bg-orange-50 flex items-center justify-center shrink-0">
            <Gauge className="w-5 h-5 lg:w-7 lg:h-7 text-[#FF5C00]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] lg:text-[11px] font-bold uppercase tracking-widest text-slate-500">Openstaand saldo</p>
              <ChevronRight className="lg:hidden w-4 h-4 text-[#FF5C00] shrink-0" />
            </div>
            <p className="text-xl lg:text-3xl font-black text-[#FF5C00] tracking-tight mt-1 truncate" data-testid="outstanding-total">
              {fmtMoney(outstandingTotal, primaryCur)}
            </p>
            <p className="text-[11px] lg:text-xs text-slate-500 lg:text-slate-400 mt-1">{outstandingCount} openstaand</p>
          </div>
          <ChevronRight className="hidden lg:block w-5 h-5 text-slate-300 group-hover:text-[#FF5C00] transition-colors shrink-0" />
        </button>
      </div>

      {/* Status overzicht + Laatste activiteiten — 2 koloms op desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6 mb-5 lg:mb-6">
        <div className="bg-white rounded-2xl border border-orange-100 p-5 lg:p-6 lg:col-span-2" data-testid="status-overview-card">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Status Overzicht</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 lg:gap-6">
            {/* Donut: Betalingsstatus */}
            <div>
              <p className="text-sm font-bold text-slate-900 mb-3">Betalingsstatus</p>
              <div className="flex items-center gap-4 lg:gap-5">
                <StatusDonut paid={invStatus.paid} open={invStatus.open} overdue={invStatus.overdue} />
                <div className="space-y-3">
                  <StatusLegendItem color="#10B981" label="Betaald" count={invStatus.paid} percent={pct(invStatus.paid)} />
                  <StatusLegendItem color="#FF5C00" label="Openstaand" count={invStatus.open} percent={pct(invStatus.open)} />
                  <StatusLegendItem color="#94A3B8" label="Achterstand" count={invStatus.overdue} percent={pct(invStatus.overdue)} />
                </div>
              </div>
            </div>
            {/* Huurstatus: bezet/totaal + vacancy card */}
            <div>
              <p className="text-sm font-bold text-slate-900 mb-3">Huurstatus</p>
              <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden mb-2">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${occupiedPct}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs mb-5">
                <span className="text-slate-600 font-semibold">{stats.apartments_occupied} van {stats.apartments_total} bezet</span>
                <span className="text-emerald-600 font-black">{occupiedPct}%</span>
              </div>
              <div className={`rounded-xl border p-4 ${vacantCount === 0 ? 'bg-emerald-50/60 border-emerald-200' : 'bg-amber-50/60 border-amber-200'}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${vacantCount === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    <Home className="w-4 h-4" />
                  </div>
                  <div>
                    <p className={`text-sm font-black ${vacantCount === 0 ? 'text-emerald-800' : 'text-amber-800'}`}>
                      {vacantCount === 0 ? 'Geen vacancies' : `${vacantCount} vacant${vacantCount === 1 ? '' : 'e'}`}
                    </p>
                    <p className={`text-xs ${vacantCount === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {vacantCount === 0 ? 'Alle eenheden zijn bezet.' : 'Eenheden beschikbaar voor verhuur.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-orange-100 p-5 lg:p-6" data-testid="recent-activity-card">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Laatste Activiteiten</p>
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

      {/* CTA's onderaan */}
      <div className="grid sm:grid-cols-2 gap-4">
        <button onClick={() => navigate('/kiosk')} data-testid="quick-kiosk"
          className="bg-gradient-to-br from-[#FF8A3D] via-[#FF5C00] to-[#C74600] rounded-2xl p-6 text-white text-left hover:shadow-[0_20px_40px_-10px_rgba(255,92,0,0.5)] transition-shadow flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <p className="text-lg font-black">Open Kiosk</p>
            <p className="text-sm text-white/80">Selfservice terminal voor huurders</p>
          </div>
          <ChevronRight className="w-5 h-5 shrink-0" />
        </button>
        <button onClick={() => window.dispatchEvent(new CustomEvent('go-tab', { detail: 'payments' }))}
          data-testid="quick-payments"
          className="bg-white border border-orange-100 rounded-2xl p-6 text-left hover:border-[#FF5C00]/30 transition-colors flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
            <Receipt className="w-5 h-5 text-[#FF5C00]" />
          </div>
          <div className="flex-1">
            <p className="text-lg font-black text-slate-900">Betalingen bekijken</p>
            <p className="text-sm text-slate-500">Alle kwitanties en transacties</p>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-300" />
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
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4" data-testid="apartment-modal">
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
  // Stille polling — lijst wordt in place vervangen, geen scroll-reset.
  useAutoRefresh(load, { interval: 15000, enabled: !creating && !editing && !assignFor && !shellyFor });

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
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4">
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
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4" data-testid="tenant-modal">
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
    <div className="fixed inset-0 z-50 bg-white/30 backdrop-blur-md flex items-center justify-center p-4" data-testid="tenant-pin-modal">
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


// ============== Settings (kiosk PIN) ==============
function Settings() {
  // Replaced by `SettingsPage` from ./admin/Settings.jsx — kept as a no-op for safety.
  return null;
}

function DesktopTopBar({ user, activeCompany }) {
  // Desktop topbar — alleen voor admin/owner: rechts uitgelijnd met de
  // actie-iconen (Snel-betaling, Appartementen, Achterstanden) plus de
  // Live indicator. Logo + naam staan al in de Sidebar.
  if (user?.role === 'superadmin') return null;
  return (
    <div className="hidden xl:flex items-center justify-end gap-3 px-8 pt-5 pb-2" data-testid="desktop-top-bar">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-orange-100">
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-slate-500">
          {activeCompany?.name || 'SuriRent'}
        </span>
        <LiveIndicator compact />
      </div>
      <QuickPayButton />
      <ApartmentsBell />
      <OverdueBell />
    </div>
  );
}

export default function AdminDashboard() {
  const { user, logout, activeCompany } = useAuth();
  const tabs = getTabsFor(user);
  const [tab, setTab] = useState(() => (user?.role === 'superadmin' ? 'subscriptions' : 'overview'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { count: badgeCount } = useBadge();

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
  useEffect(() => { document.title = 'SuriRent - Beheer'; }, []);
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
  const doLogout = async () => { await logout(); navigate('/login'); };

  return (
    <div className="min-h-screen bg-[#FFF7F0] flex">
      <Sidebar active={tab} onChange={handleSetTab} onLogout={doLogout}
        user={user} tabs={tabs} badgeCount={badgeCount} />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileTopLogo user={user} activeCompany={activeCompany} />
        <DesktopTopBar user={user} activeCompany={activeCompany} />
        <ImpersonationBanner />
        <TrialBanner />
        <main className="flex-1 p-5 xl:p-8 xl:pt-3 pb-32 xl:pb-8 w-full">
          {tab === 'companies' && <Companies />}
          {tab === 'subscriptions' && <Subscriptions />}
          {tab === 'saas_settings' && <SaasSettings />}
          {tab === 'landing_editor' && <LandingEditor />}
          {tab === 'branding' && <Branding />}
          {tab === 'overview' && <Overview />}
          {tab === 'locations' && <Locations />}
          {tab === 'apartments' && <Apartments />}
          {tab === 'tenants' && <Tenants />}
          {tab === 'contracts' && <Contracts />}
          {tab === 'payments' && <Payments />}
          {tab === 'invoices' && <Invoices />}
          {tab === 'deposits' && <Deposits />}
          {tab === 'maintenance' && <Maintenance />}
          {tab === 'kasgeld' && <Kasgeld />}
          {tab === 'employees' && <Employees />}
          {tab === 'notifications' && <Notifications />}
          {tab === 'mijn_abonnement' && <MijnAbonnement />}
          {tab === 'settings' && <SettingsPage />}
        </main>
      </div>
      <MobileTabBar active={tab} onChange={handleSetTab} tabs={tabs} user={user}
        onOpenMenu={() => setDrawerOpen(true)} badgeCount={badgeCount} />
      <MobileSheet open={drawerOpen} onClose={() => setDrawerOpen(false)}
        active={tab} onChange={handleSetTab} onLogout={doLogout}
        user={user} tabs={tabs} activeCompany={activeCompany} badgeCount={badgeCount} />
    </div>
  );
}
