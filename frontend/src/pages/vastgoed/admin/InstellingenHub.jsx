import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Crown, Paintbrush, Sparkles, Briefcase, Palette, Database,
  ChevronRight, Plug, Settings as Cog,
} from 'lucide-react';
import MijnAbonnement from './MijnAbonnement';
import MijnLanding from './MijnLanding';
import SetupWizard from './SetupWizard';
import BusinessInfo from './BusinessInfo';
import Branding from './Branding';
import BackupRestore from './BackupRestore';
import SettingsPage from './Settings';

// Volgorde exact zoals door gebruiker gevraagd. Elke entry rendert een
// bestaande, gepolijste pagina — geen herontwerp van de inhoud.
const SECTIONS = [
  {
    id: 'abonnement',
    label: 'Mijn abonnement',
    desc: 'Bekijk en wijzig je plan, betalingen en facturen.',
    icon: Crown,
    render: () => <MijnAbonnement />,
  },
  {
    id: 'landing',
    label: 'Mijn landing',
    desc: 'Pas je publieke landing-pagina en marketing-content aan.',
    icon: Paintbrush,
    render: () => <MijnLanding />,
  },
  {
    id: 'setup',
    label: 'Setup wizard',
    desc: 'Stapsgewijze configuratie voor nieuwe bedrijven.',
    icon: Sparkles,
    render: () => <SetupWizard />,
  },
  {
    id: 'bedrijf',
    label: 'Bedrijfsgegevens',
    desc: 'Naam, adres, KvK en contactgegevens van je bedrijf.',
    icon: Briefcase,
    render: () => <BusinessInfo />,
  },
  {
    id: 'branding',
    label: 'Branding',
    desc: 'Logo, kleuren en visuele identiteit.',
    icon: Palette,
    render: () => <Branding />,
  },
  {
    id: 'integraties',
    label: 'Integraties',
    desc: 'SMTP, Twilio, Uni5Pay, Shelly, Domein en Kiosk-PIN.',
    icon: Plug,
    // initialSection laat we open — SettingsPage heeft zijn eigen sub-nav.
    render: (extra) => <SettingsPage initialSection={extra?.integrationsSection || undefined} />,
  },
  {
    id: 'backup',
    label: 'Backup & herstel',
    desc: 'Maak veilige kopieën en herstel data wanneer nodig.',
    icon: Database,
    render: () => <BackupRestore />,
  },
];

export default function InstellingenHub({ initialSection, integrationsSection }) {
  const location = useLocation();

  // URL hash → sectie. /admin/instellingen#branding opent direct Branding.
  const hashSection = useMemo(() => {
    const h = (location.hash || '').replace('#', '').trim();
    return SECTIONS.find((s) => s.id === h)?.id || null;
  }, [location.hash]);

  // initialSection is een legacy alias (mapt op SettingsPage sectie-namen
  // zoals 'smtp'). Als er een match is in onze hoofd-secties pakken we
  // die, anders openen we Integraties met de juiste sub-sectie.
  const legacyMatch = useMemo(() => {
    if (!initialSection) return null;
    const direct = SECTIONS.find((s) => s.id === initialSection);
    if (direct) return { section: direct.id };
    // Integraties sub-sectie (smtp / twilio / mope / uni5pay / shelly / invoicing / domain / kiosk).
    const integrationIds = ['smtp', 'twilio', 'mope', 'uni5pay', 'shelly', 'invoicing', 'domain', 'kiosk'];
    if (integrationIds.includes(initialSection)) {
      return { section: 'integraties', integrationsSection: initialSection };
    }
    return null;
  }, [initialSection]);

  const [active, setActive] = useState(() =>
    hashSection || legacyMatch?.section || 'abonnement',
  );
  const [intSection, setIntSection] = useState(
    () => legacyMatch?.integrationsSection || integrationsSection || null,
  );

  useEffect(() => {
    if (hashSection) setActive(hashSection);
  }, [hashSection]);
  useEffect(() => {
    if (legacyMatch?.section) {
      setActive(legacyMatch.section);
      if (legacyMatch.integrationsSection) setIntSection(legacyMatch.integrationsSection);
    }
  }, [legacyMatch]);

  const handleSelect = useCallback((id) => {
    setActive(id);
    // Update hash zonder rerender storm / scroll-jump.
    if (typeof window !== 'undefined') {
      const next = `#${id}`;
      if (window.location.hash !== next) {
        window.history.replaceState(null, '', `${window.location.pathname}${next}`);
      }
    }
    // Reset integraties sub-sectie wanneer je naar een andere hoofd-tab
    // gaat, anders blijft een oude deep-link plakken.
    if (id !== 'integraties') setIntSection(null);
  }, []);

  const current = SECTIONS.find((s) => s.id === active) || SECTIONS[0];

  return (
    <div data-testid="instellingen-hub">
      {/* HEADER */}
      <div className="mb-6 flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FF8A3D] to-[#C74600] flex items-center justify-center shadow-[0_8px_18px_-6px_rgba(255,92,0,0.45)] shrink-0">
          <Cog className="w-5 h-5 text-white" strokeWidth={2.4} />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Instellingen</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Eén centrale plek voor alle account-, bedrijfs- en integratie-instellingen.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-6">
        {/* SUB-NAV — vertical list met categorieën */}
        <aside className="lg:sticky lg:top-4 self-start">
          <nav
            className="bg-white rounded-2xl border border-orange-100 p-2 space-y-0.5 shadow-[0_4px_18px_-12px_rgba(15,23,42,0.10)]"
            data-testid="instellingen-nav"
            aria-label="Instellingen categorieën"
          >
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const isActive = active === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => handleSelect(s.id)}
                  data-testid={`instellingen-tab-${s.id}`}
                  className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left ${
                    isActive
                      ? 'bg-gradient-to-r from-[#FF8A3D] to-[#FF5C00] text-white shadow-[0_10px_22px_-8px_rgba(255,92,0,0.55)]'
                      : 'text-slate-700 hover:bg-orange-50 hover:text-[#FF5C00]'
                  }`}
                >
                  <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                    isActive ? 'bg-white/20' : 'bg-orange-50 group-hover:bg-white'
                  }`}>
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[#FF5C00]'}`} strokeWidth={2.2} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate leading-tight">{s.label}</span>
                    <span className={`block text-[10px] font-medium truncate mt-0.5 ${
                      isActive ? 'text-white/80' : 'text-slate-400'
                    }`}>
                      {s.desc}
                    </span>
                  </span>
                  <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                    isActive ? 'text-white/80 translate-x-0.5' : 'text-slate-300'
                  }`} />
                </button>
              );
            })}
          </nav>
        </aside>

        {/* CONTENT — embed de bestaande pagina-component. */}
        <div className="min-w-0" data-testid={`instellingen-content-${current.id}`}>
          {current.render({ integrationsSection: intSection })}
        </div>
      </div>
    </div>
  );
}
